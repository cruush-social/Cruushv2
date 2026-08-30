import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getCruushPlusPlan } from "../billing.js";
import {
  createInHouseCryptoPaymentIntent,
  getCryptoProcessorStatus,
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
import { describeWatcherStatus } from "../crypto-watcher-runtime.js";

const paymentIntentPayloadSchema = z.object({
  planId: z.string().min(1),
  idempotencyKey: z.string().trim().min(8).max(128),
  rail: z.enum(["usdc_arbitrum", "pyusd_arbitrum", "pyusd_ethereum", "usdc_base"]).default("usdc_arbitrum")
}).strict();

const paymentIntentParamsSchema = z.object({
  intentId: z.uuid()
}).strict();

// Support lookup accepts exactly one handle at a time, and each is shaped, so
// a free-text search can never reach the database.
const supportLookupSchema = z.union([
  z.object({ intentId: z.uuid() }).strict(),
  z.object({ userId: z.uuid() }).strict(),
  z.object({ address: z.string().regex(/^0x[0-9a-fA-F]{40}$/) }).strict(),
  z.object({ transactionHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) }).strict()
]);

export async function registerCryptoPaymentRoutes(app: FastifyInstance) {
  app.get("/api/crypto/status", async (request, reply) => {
    await getAuthenticatedUserId(request);

    return reply.send({
      data: getCryptoProcessorStatus(app.config)
    });
  });

  app.post("/api/crypto/payment-intents", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const payload = paymentIntentPayloadSchema.parse(request.body);

    // The plan price is always derived on the server. A client-supplied amount is never trusted.
    const plan = getCruushPlusPlan(payload.planId);
    const intent = await createInHouseCryptoPaymentIntent(app.db, app.config, {
      userId,
      planId: plan.id,
      amountUsdCents: plan.amountCents,
      idempotencyKey: payload.idempotencyKey,
      rail: payload.rail as CryptoPaymentRailId,
      metadata: { source: "store" }
    });

    return reply.code(201).send({ data: await withCryptoPaymentDisplay(intent) });
  });

  app.get("/api/crypto/payment-intents/:intentId", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
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
}
