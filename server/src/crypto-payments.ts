import { createHash } from "node:crypto";
import QRCode from "qrcode";
import type { AppConfig } from "./config.js";
import type { DbClient } from "./db.js";
import { runTransaction } from "./db.js";
import { ApiError } from "./errors.js";
import {
  deriveCryptoReceivingAddress,
  fingerprintCryptoWalletXpub,
  isValidCryptoWalletXpub,
  quoteUsdCentsAsStablecoinAtomic
} from "./crypto-wallet.js";

/**
 * The receiving rails. Every value here is fixed server-side; a client may name
 * a rail and nothing else.
 *
 * Token addresses verified 2026-08-30 against the issuers' own documentation:
 * - USDC on Base 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913, from Circle's
 *   contract-address list (developers.circle.com/stablecoins/usdc-contract-addresses).
 * - PYUSD on Ethereum 0x6c3ea9036406852006290770BEdFcAbA0e23A0e8, from PayPal
 *   and Etherscan's verified token page. Issued by Paxos Trust Company.
 * Both tokens use 6 decimals, which is what quoteUsdCentsAsStablecoinAtomic
 * assumes; `decimals` is recorded here so that assumption is checkable rather
 * than implicit.
 *
 * confirmationTarget is per rail because the two chains produce blocks at very
 * different rates, so one shared number would mean two different waits:
 * - Base builds an L2 block roughly every 2 seconds. Base's own finality
 *   documentation puts reorg probability at "near 0%" once a transaction is in
 *   an L2 block, and "effectively 0%" once the batch reaches L1 about 2 minutes
 *   later. 30 blocks is about 60 seconds: comfortably past the near-zero point
 *   and heading toward L1 batch inclusion, without making a member wait minutes.
 * - Ethereum produces a block roughly every 12 seconds and finalises after 2
 *   epochs (64 blocks, about 12.8 minutes). 12 blocks is about 2.4 minutes,
 *   the common exchange-grade bar for stablecoin credit.
 * Granting cruush+ is a one-way door: there is no revoke path if a transfer is
 * later reorganized away, which is why neither number is 1.
 */
export const CRYPTO_PAYMENT_RAILS = {
  // Arbitrum first: it is the only network Cash App, Venmo, and PayPal can all
  // send to, and its fees are negligible. Collecting a payment costs two
  // transactions per order (fund the derived address with gas, then sweep it to
  // the treasury), so a mainnet rail charges a fee on every sale forever.
  // Arbitrum One produces a block roughly every 0.25 seconds, so 240 blocks is
  // about a minute of protection, matching what 30 blocks buys on Base.
  usdc_arbitrum: {
    asset: "USDC",
    network: "arbitrum",
    chainId: 42161,
    // Circle's published native USDC on Arbitrum.
    tokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    decimals: 6,
    confirmationTarget: 240
  },
  pyusd_arbitrum: {
    asset: "PYUSD",
    network: "arbitrum",
    chainId: 42161,
    // Paxos' published PYUSD on Arbitrum. Paxos issues PYUSD, and PayPal
    // confirmed the Arbitrum deployment on 2025-07-17.
    tokenAddress: "0x46850aD61C2B7d64d08c9C754F45254596696984",
    decimals: 6,
    confirmationTarget: 240
  },
  // Ethereum mainnet stays as the fallback for anyone whose app will not offer
  // Arbitrum. Reach is identical; the fees are not.
  pyusd_ethereum: {
    asset: "PYUSD",
    network: "ethereum",
    chainId: 1,
    tokenAddress: "0x6c3ea9036406852006290770BEdFcAbA0e23A0e8",
    decimals: 6,
    confirmationTarget: 12
  },
  // Base reaches none of Cash App, Venmo, or PayPal. Kept because it is built
  // and costs nothing to leave in, but it is last for a reason.
  usdc_base: {
    asset: "USDC",
    network: "base",
    chainId: 8453,
    tokenAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    decimals: 6,
    confirmationTarget: 30
  }
} as const;
export type CryptoPaymentRailId = keyof typeof CRYPTO_PAYMENT_RAILS;
export type CryptoPaymentAsset = typeof CRYPTO_PAYMENT_RAILS[CryptoPaymentRailId]["asset"];
export type CryptoPaymentNetwork = typeof CRYPTO_PAYMENT_RAILS[CryptoPaymentRailId]["network"];
export const CRYPTO_PAYMENT_ASSET = "USDC" as const;
export const CRYPTO_PAYMENT_NETWORK = "arbitrum" as const;

function cryptoRail(id: CryptoPaymentRailId) { return CRYPTO_PAYMENT_RAILS[id]; }
function railFor(asset: CryptoPaymentAsset, network: CryptoPaymentNetwork): CryptoPaymentRailId {
  const entry = (Object.entries(CRYPTO_PAYMENT_RAILS) as [CryptoPaymentRailId, typeof CRYPTO_PAYMENT_RAILS[CryptoPaymentRailId]][])
    .find(([, rail]) => rail.asset === asset && rail.network === network);
  if (!entry) throw new Error("Unsupported crypto payment rail.");
  return entry[0];
}

export const CRYPTO_PAYMENT_STATUSES = [
  "pending",
  "awaiting_payment",
  "confirming",
  "paid",
  "expired",
  "failed",
  "cancelled",
  "refunded"
] as const;
export type CryptoPaymentStatus = typeof CRYPTO_PAYMENT_STATUSES[number];

export type CryptoPaymentIntentRow = {
  id: string;
  user_id: string;
  plan_id: string;
  processor: "in_house";
  asset: CryptoPaymentAsset;
  network: CryptoPaymentNetwork;
  amount_usd_cents: number | string;
  quoted_amount_atomic?: string | null;
  derivation_index: number | string;
  wallet_xpub_fingerprint: string;
  payment_address?: string | null;
  status: CryptoPaymentStatus;
  idempotency_key: string;
  metadata: Record<string, unknown>;
  expires_at: string | Date;
  created_at: string | Date;
  updated_at: string | Date;
  paid_at?: string | Date | null;
};

export type CryptoPaymentIntent = {
  id: string;
  userId: string;
  planId: string;
  asset: CryptoPaymentAsset;
  network: CryptoPaymentNetwork;
  rail: CryptoPaymentRailId;
  chainId: number;
  tokenAddress: string;
  amountUsdCents: number;
  quotedAmountAtomic: string | null;
  paymentAddress: string | null;
  status: CryptoPaymentStatus;
  expiresAt: string | Date;
  createdAt: string | Date;
  updatedAt: string | Date;
  paidAt: string | Date | null;
};

export type CryptoPaymentEventInput = {
  externalEventId: string;
  eventType: string;
  payloadBytes: Buffer;
  payload: Record<string, unknown>;
};

// cruush does not offer refunds on cruush+, which is a digital good delivered
// immediately. The 'refunded' status below is therefore NOT a product feature
// and no code path reaches it: it stays only so that a refund an operator makes
// by hand, for whatever exceptional reason, can be recorded truthfully instead
// of leaving the ledger disagreeing with reality. Do not build a refund flow
// onto it without Julien saying so.
const allowedStatusTransitions: Record<CryptoPaymentStatus, readonly CryptoPaymentStatus[]> = {
  pending: ["pending", "awaiting_payment", "failed", "cancelled"],
  awaiting_payment: ["awaiting_payment", "confirming", "expired", "failed", "cancelled"],
  confirming: ["confirming", "paid", "failed"],
  paid: ["paid", "refunded"],
  expired: ["expired"],
  failed: ["failed"],
  cancelled: ["cancelled"],
  refunded: ["refunded"]
};

function numericDerivationIndex(value: number | string) {
  const index = Number(value);
  if (!Number.isSafeInteger(index) || index < 1 || index >= 2 ** 31) {
    throw new Error("Crypto payment intent has an invalid wallet derivation index.");
  }

  return index;
}

export function mapCryptoPaymentIntent(row: CryptoPaymentIntentRow): CryptoPaymentIntent {
  return {
    id: row.id,
    userId: row.user_id,
    planId: row.plan_id,
    asset: row.asset,
    network: row.network,
    rail: railFor(row.asset, row.network),
    chainId: cryptoRail(railFor(row.asset, row.network)).chainId,
    tokenAddress: cryptoRail(railFor(row.asset, row.network)).tokenAddress,
    amountUsdCents: Number(row.amount_usd_cents),
    quotedAmountAtomic: row.quoted_amount_atomic ?? null,
    paymentAddress: row.payment_address ?? null,
    status: row.status,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    paidAt: row.paid_at ?? null
  };
}

// ERC-681 (https://eips.ethereum.org/EIPS/eip-681, Final): ethereum:<token>@<chainId>/transfer?address=<to>&uint256=<atomicAmount>
export function buildCryptoPaymentUri(
  intent: Pick<CryptoPaymentIntent, "tokenAddress" | "chainId" | "paymentAddress" | "quotedAmountAtomic">
): string | null {
  if (!intent.paymentAddress || !intent.quotedAmountAtomic) {
    return null;
  }

  const params = new URLSearchParams({
    address: intent.paymentAddress,
    uint256: intent.quotedAmountAtomic
  });

  return `ethereum:${intent.tokenAddress}@${intent.chainId}/transfer?${params.toString()}`;
}

export async function withCryptoPaymentDisplay(intent: CryptoPaymentIntent) {
  const paymentUri = buildCryptoPaymentUri(intent);

  return {
    ...intent,
    paymentUri,
    qrCodeDataUrl: paymentUri
      ? await QRCode.toDataURL(paymentUri, { errorCorrectionLevel: "M", margin: 2, width: 256 })
      : null
  };
}

export function canTransitionCryptoPaymentStatus(
  from: CryptoPaymentStatus,
  to: CryptoPaymentStatus
) {
  return allowedStatusTransitions[from].includes(to);
}

export function assertCryptoPaymentStatusTransition(
  from: CryptoPaymentStatus,
  to: CryptoPaymentStatus
) {
  if (!canTransitionCryptoPaymentStatus(from, to)) {
    throw new ApiError(
      409,
      "VALIDATION_ERROR",
      `Crypto payment status cannot move from ${from} to ${to}.`
    );
  }
}

export function hashCryptoPaymentEventPayload(payloadBytes: Buffer) {
  return createHash("sha256").update(payloadBytes).digest("hex");
}

export function getCryptoProcessorStatus(config: AppConfig) {
  const enabled = config.CRYPTO_PROCESSOR_ENABLED === true;
  const walletConfigured = isValidCryptoWalletXpub(config.CRYPTO_PROCESSOR_WALLET_XPUB ?? "");

  return {
    ready: enabled && walletConfigured,
    asset: CRYPTO_PAYMENT_ASSET,
    network: CRYPTO_PAYMENT_NETWORK,
    rails: (Object.entries(CRYPTO_PAYMENT_RAILS) as [CryptoPaymentRailId, typeof CRYPTO_PAYMENT_RAILS[CryptoPaymentRailId]][]).map(([id, rail]) => ({ id, ...rail })),
    confirmationTarget: config.CRYPTO_PROCESSOR_CONFIRMATION_TARGET ?? 1
  };
}

export function assertCryptoProcessorReady(config: AppConfig) {
  if (config.CRYPTO_PROCESSOR_ENABLED !== true) {
    throw new ApiError(503, "CRYPTO_PROCESSOR_NOT_READY", "Crypto payments are not enabled.");
  }

  const receiveChainXpub = config.CRYPTO_PROCESSOR_WALLET_XPUB ?? "";
  if (!isValidCryptoWalletXpub(receiveChainXpub)) {
    throw new ApiError(503, "CRYPTO_PROCESSOR_NOT_READY", "Crypto wallet setup is not ready.");
  }

  return {
    receiveChainXpub,
    confirmationTarget: config.CRYPTO_PROCESSOR_CONFIRMATION_TARGET ?? 1,
    intentTtlMinutes: config.CRYPTO_PROCESSOR_INTENT_TTL_MINUTES ?? 30
  };
}

function assertIdempotentReservationMatches(
  row: CryptoPaymentIntentRow,
  input: { planId: string; amountUsdCents: number; walletXpubFingerprint: string; rail: CryptoPaymentRailId }
) {
  const rail = cryptoRail(input.rail);
  if (
    row.plan_id !== input.planId ||
    Number(row.amount_usd_cents) !== input.amountUsdCents ||
    row.asset !== rail.asset ||
    row.network !== rail.network ||
    row.wallet_xpub_fingerprint !== input.walletXpubFingerprint
  ) {
    throw new ApiError(
      409,
      "VALIDATION_ERROR",
      "That idempotency key is already assigned to another crypto payment."
    );
  }
}

async function reserveCryptoPaymentIntent(
  db: DbClient,
  input: {
    userId: string;
    planId: string;
    amountUsdCents: number;
    idempotencyKey: string;
    walletXpubFingerprint: string;
    intentTtlMinutes: number;
    metadata?: Record<string, unknown>;
    rail: CryptoPaymentRailId;
  }
) {
  const result = await db.query<CryptoPaymentIntentRow>(
    `insert into crypto_payment_intents (
       user_id,
       plan_id,
       processor,
       asset,
       network,
       amount_usd_cents,
       wallet_xpub_fingerprint,
       status,
       idempotency_key,
       metadata,
       expires_at
     ) values (
       $1,
       $2,
       'in_house',
       $3,
       $4,
       $5,
       $6,
       'pending',
       $7,
       $8::jsonb,
       now() + ($9::integer * interval '1 minute')
     )
     on conflict (user_id, idempotency_key) do update
       set updated_at = crypto_payment_intents.updated_at
     returning *`,
    [
      input.userId,
      input.planId,
      cryptoRail(input.rail).asset,
      cryptoRail(input.rail).network,
      input.amountUsdCents,
      input.walletXpubFingerprint,
      input.idempotencyKey,
      JSON.stringify(input.metadata ?? {}),
      input.intentTtlMinutes
    ]
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("Crypto payment intent reservation returned no row.");
  }

  return row;
}

export async function createInHouseCryptoPaymentIntent(
  db: DbClient,
  config: AppConfig,
  input: {
    userId: string;
    planId: string;
    amountUsdCents: number;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
    rail?: CryptoPaymentRailId;
  }
) {
  const wallet = assertCryptoProcessorReady(config);
  const walletXpubFingerprint = fingerprintCryptoWalletXpub(wallet.receiveChainXpub);
  const rail = input.rail ?? "usdc_arbitrum";

  return runTransaction(db, async (client) => {
    const reserved = await reserveCryptoPaymentIntent(client, {
      ...input,
      walletXpubFingerprint,
      intentTtlMinutes: wallet.intentTtlMinutes,
      rail
    });

    assertIdempotentReservationMatches(reserved, {
      planId: input.planId,
      amountUsdCents: input.amountUsdCents,
      walletXpubFingerprint,
      rail
    });

    if (reserved.payment_address) {
      return mapCryptoPaymentIntent(reserved);
    }

    if (reserved.status !== "pending") {
      throw new Error("Crypto payment intent has no address after leaving pending status.");
    }

    const paymentAddress = deriveCryptoReceivingAddress(
      wallet.receiveChainXpub,
      numericDerivationIndex(reserved.derivation_index)
    );
    const quotedAmountAtomic = quoteUsdCentsAsStablecoinAtomic(input.amountUsdCents);
    const updated = await client.query<CryptoPaymentIntentRow>(
      `update crypto_payment_intents
       set payment_address = $2,
           quoted_amount_atomic = $3,
           status = 'awaiting_payment',
           updated_at = now()
       where id = $1
         and status = 'pending'
         and payment_address is null
       returning *`,
      [reserved.id, paymentAddress, quotedAmountAtomic]
    );

    const row = updated.rows[0];
    if (!row) {
      throw new Error("Crypto payment intent address allocation returned no row.");
    }

    return mapCryptoPaymentIntent(row);
  });
}

export async function recordCryptoPaymentEvent(db: DbClient, input: CryptoPaymentEventInput) {
  const result = await db.query<{ id: string }>(
    `insert into crypto_payment_events (
       source,
       external_event_id,
       event_type,
       payload,
       payload_sha256
     ) values ('base', $1, $2, $3::jsonb, $4)
     on conflict (source, external_event_id) do nothing
     returning id::text as id`,
    [
      input.externalEventId,
      input.eventType,
      JSON.stringify(input.payload),
      hashCryptoPaymentEventPayload(input.payloadBytes)
    ]
  );

  return {
    inserted: result.rows.length > 0,
    eventId: result.rows[0]?.id ?? null
  };
}

export async function loadCryptoPaymentIntent(db: DbClient, userId: string, intentId: string) {
  const result = await db.query<CryptoPaymentIntentRow>(
    `select * from crypto_payment_intents where id = $1 and user_id = $2`,
    [intentId, userId]
  );

  const row = result.rows[0];
  if (!row) {
    throw new ApiError(404, "CRYPTO_PAYMENT_NOT_FOUND", "That crypto payment was not found.");
  }

  return mapCryptoPaymentIntent(row);
}
