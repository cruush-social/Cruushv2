import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getCruushPlusPlan } from "../billing.js";
import type { AppConfig } from "../config.js";
import {
  CRYPTO_PAYMENT_RAILS,
  createInHouseCryptoPaymentIntent,
  getCryptoPaymentRailRpcEndpoint,
  getCryptoProcessorStatus,
  loadCurrentOpenCryptoPaymentIntent,
  loadCryptoPaymentIntent,
  withCryptoPaymentDisplay,
  type CryptoPaymentRailId
} from "../crypto-payments.js";
import { getActiveAccountUserId, getAuthenticatedUserId } from "../request-auth.js";
import { getModeratorUser } from "../moderator-auth.js";
import {
  findCryptoPaymentsByAddress,
  findCryptoPaymentsByIntentId,
  findCryptoPaymentsByTransactionHash,
  findCryptoPaymentsByUserId,
  findCryptoReconciliationExceptions
} from "../crypto-reconciliation.js";
import {
  createCryptoReceiptSource,
  describeWatcherStatus,
  readVerifiedCryptoPaymentRailHead,
  type CryptoPaymentRailHeadReader
} from "../crypto-watcher-runtime.js";
import { ingestCryptoPaymentReceipt } from "../crypto-watcher.js";

const paymentIntentPayloadSchema = z.object({
  planId: z.string().min(1),
  idempotencyKey: z.string().trim().min(8).max(128),
  rail: z.enum(["usdc_arbitrum", "pyusd_arbitrum", "pyusd_ethereum", "usdc_base"]).default("usdc_arbitrum")
}).strict();

const paymentIntentParamsSchema = z.object({
  intentId: z.uuid()
}).strict();

export const CRYPTO_PAYMENT_INTENT_CREATE_RATE_LIMIT = {
  max: 5,
  windowMs: 60_000
} as const;

export const CRYPTO_PAYMENT_INTENT_READ_RATE_LIMIT = {
  max: 30,
  windowMs: 60_000
} as const;

const SUPPORTED_CHAIN_BOOTSTRAP_RAILS = [
  "pyusd_ethereum",
  "usdc_base",
  "usdc_arbitrum"
] as const satisfies readonly CryptoPaymentRailId[];

const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n;

function assertWatchStartBlock(value: bigint) {
  if (value < 0n || value > MAX_POSTGRES_BIGINT) {
    throw new Error("Crypto payment intent has an invalid watch-start block.");
  }

  return value;
}

/**
 * Resolves every secondary-chain origin while the address is still private.
 * Every configured chain must identify itself and provide a current head. A
 * global cursor can be stale after a long idle period, so it is never used as
 * a new address's origin. An unconfigured chain remains unwatchable and uses
 * zero so a later configuration can conservatively catch up from the beginning.
 */
export async function resolvePrePublicationWatchStartBlocks(
  config: AppConfig,
  intendedRail: CryptoPaymentRailId,
  readRailHead: CryptoPaymentRailHeadReader
) {
  const intendedChainId = CRYPTO_PAYMENT_RAILS[intendedRail].chainId;
  const secondaryRails = SUPPORTED_CHAIN_BOOTSTRAP_RAILS.filter(
    (rail) => CRYPTO_PAYMENT_RAILS[rail].chainId !== intendedChainId
  );
  const entries = await Promise.all(secondaryRails.map(async (rail) => {
    const chainId = CRYPTO_PAYMENT_RAILS[rail].chainId;

    if (getCryptoPaymentRailRpcEndpoint(config, rail).trim().length === 0) {
      return [chainId, 0n] as const;
    }

    return [chainId, assertWatchStartBlock(await readRailHead(config, rail))] as const;
  }));

  return Object.fromEntries(entries) as Partial<Record<number, bigint>>;
}

async function assertCryptoPaymentIntentReadRateLimit(app: FastifyInstance, userId: string) {
  await app.rateLimiter.assert({
    key: `crypto-payment-intents:read:${userId}`,
    ...CRYPTO_PAYMENT_INTENT_READ_RATE_LIMIT,
    message: "Too many crypto payment status checks. Try again shortly."
  });
}

// Support lookup accepts exactly one handle at a time, and each is shaped, so
// a free-text search can never reach the database.
const supportLookupSchema = z.union([
  z.object({ intentId: z.uuid() }).strict(),
  z.object({ userId: z.uuid() }).strict(),
  z.object({ address: z.string().regex(/^0x[0-9a-fA-F]{40}$/) }).strict(),
  z.object({ transactionHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) }).strict()
]);

const supportReceiptSchema = z.object({
  intentId: z.uuid(),
  transactionHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  chainId: z.union([z.literal(1), z.literal(42161), z.literal(8453)])
}).strict();

export const CRYPTO_SUPPORT_RECEIPT_RATE_LIMIT = {
  max: 10,
  windowMs: 60 * 60_000
} as const;

export async function registerCryptoPaymentRoutes(
  app: FastifyInstance,
  deps: {
    readRailHead?: CryptoPaymentRailHeadReader;
    createReceiptSource?: typeof createCryptoReceiptSource;
    ingestReceipt?: typeof ingestCryptoPaymentReceipt;
  } = {}
) {
  app.get("/api/crypto/status", async (request, reply) => {
    await getAuthenticatedUserId(request);

    return reply.send({
      data: getCryptoProcessorStatus(app.config)
    });
  });

  app.post("/api/crypto/payment-intents", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    await app.rateLimiter.assert({
      key: `crypto-payment-intents:create:${userId}`,
      ...CRYPTO_PAYMENT_INTENT_CREATE_RATE_LIMIT,
      message: "Too many crypto payment attempts. Try again shortly."
    });
    const payload = paymentIntentPayloadSchema.parse(request.body);

    // The plan price is always derived on the server. A client-supplied amount is never trusted.
    const plan = getCruushPlusPlan(payload.planId);
    const rail = payload.rail as CryptoPaymentRailId;
    const readRailHead = deps.readRailHead ?? readVerifiedCryptoPaymentRailHead;
    const watchStartBlock = assertWatchStartBlock(await readRailHead(app.config, rail));
    const watchStartBlocksByChain = await resolvePrePublicationWatchStartBlocks(
      app.config,
      rail,
      readRailHead
    );
    const intent = await createInHouseCryptoPaymentIntent(app.db, app.config, {
      userId,
      planId: plan.id,
      amountUsdCents: plan.amountCents,
      idempotencyKey: payload.idempotencyKey,
      rail,
      watchStartBlock,
      watchStartBlocksByChain,
      metadata: { source: "store" }
    });

    return reply.code(201).send({ data: await withCryptoPaymentDisplay(intent) });
  });

  app.get("/api/crypto/payment-intents/current", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    await assertCryptoPaymentIntentReadRateLimit(app, userId);
    const intent = await loadCurrentOpenCryptoPaymentIntent(app.db, userId);

    return reply.send({
      data: intent ? await withCryptoPaymentDisplay(intent) : null
    });
  });

  app.get("/api/crypto/payment-intents/:intentId", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    await assertCryptoPaymentIntentReadRateLimit(app, userId);
    const { intentId } = paymentIntentParamsSchema.parse(request.params);
    const intent = await loadCryptoPaymentIntent(app.db, userId, intentId);

    return reply.send({
      data: await withCryptoPaymentDisplay(intent)
    });
  });

  // Support lookup. Moderator only, read-only, and deliberately usable by the
  // two things a member can actually produce: an address and a transaction
  // hash.
  app.get("/api/crypto/support/payments", async (request, reply) => {
    await getModeratorUser(request);
    const query = supportLookupSchema.parse(request.query);

    if ("intentId" in query) {
      return reply.send({ data: await findCryptoPaymentsByIntentId(app.db, query.intentId) });
    }
    if ("userId" in query) {
      return reply.send({ data: await findCryptoPaymentsByUserId(app.db, query.userId) });
    }
    if ("address" in query) {
      return reply.send({ data: await findCryptoPaymentsByAddress(app.db, query.address) });
    }

    return reply.send({ data: await findCryptoPaymentsByTransactionHash(app.db, query.transactionHash) });
  });

  // Everything that does not add up, plus whether the watcher is actually
  // running. Read this before the first customer payment, and after any
  // incident.
  app.get("/api/crypto/support/reconciliation", async (request, reply) => {
    await getModeratorUser(request);

    return reply.send({
      data: {
        watcher: describeWatcherStatus(app.config),
        exceptions: await findCryptoReconciliationExceptions(app.db)
      }
    });
  });

  app.post("/api/crypto/support/payment-receipts", async (request, reply) => {
    const moderator = await getModeratorUser(request);
    await app.rateLimiter.assert({
      key: `crypto-support-receipt:${moderator.userId}`,
      ...CRYPTO_SUPPORT_RECEIPT_RATE_LIMIT,
      message: "Too many crypto receipt recovery attempts. Try again later."
    });
    const payload = supportReceiptSchema.parse(request.body);
    const sourceFactory = deps.createReceiptSource ?? createCryptoReceiptSource;
    const source = sourceFactory(app.config, payload.chainId);
    const ingestReceipt = deps.ingestReceipt ?? ingestCryptoPaymentReceipt;
    const result = await ingestReceipt(app, source, payload);
    return reply.send({ data: result });
  });
}
