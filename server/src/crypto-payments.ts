import { createHash } from "node:crypto";
import QRCode from "qrcode";
import type { AppConfig } from "./config.js";
import type { DbClient } from "./db.js";
import { runTransaction } from "./db.js";
import { ApiError } from "./errors.js";
import {
  assertCryptoPlanCanReserve,
  getCruushPlusPlan,
  lockCryptoPurchaseUser
} from "./billing.js";
import {
  deriveCryptoReceivingAddress,
  fingerprintCryptoWalletXpub,
  isValidCryptoWalletXpub,
  quoteUsdCentsAsStablecoinAtomic
} from "./crypto-wallet.js";
import { getPingPack } from "./ping-packs.js";

/**
 * The receiving rails. Every value here is fixed server-side; a client may name
 * a rail and nothing else.
 *
 * Token addresses verified 2026-09-02 against the issuers' own documentation:
 * - USDC on Arbitrum 0xaf88d065e77c8cC2239327C5EDb3A432268e5831 and Base
 *   0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913, from Circle's
 *   contract-address list (developers.circle.com/stablecoins/usdc-contract-addresses).
 * - PYUSD on Arbitrum 0x46850aD61C2B7d64d08c9C754F45254596696984 and Ethereum
 *   0x6c3ea9036406852006290770BEdFcAbA0e23A0e8, from Paxos' mainnet list.
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
export const CRYPTO_OPEN_INTENT_LIMIT_PER_USER = 1;
const CRYPTO_PAYMENT_CHAIN_IDS = Array.from(new Set(
  (Object.values(CRYPTO_PAYMENT_RAILS) as (typeof CRYPTO_PAYMENT_RAILS)[CryptoPaymentRailId][])
    .map((rail) => rail.chainId)
)).sort((left, right) => left - right);

function cryptoRail(id: CryptoPaymentRailId) { return CRYPTO_PAYMENT_RAILS[id]; }

export function getCryptoPaymentRailRpcEndpoint(
  config: AppConfig,
  railId: CryptoPaymentRailId
) {
  return getCryptoPaymentChainRpcEndpoint(config, cryptoRail(railId).chainId);
}

export function getCryptoPaymentChainRpcEndpoint(config: AppConfig, chainId: number) {
  switch (chainId) {
    case 42161:
      return config.CRYPTO_PROCESSOR_ARBITRUM_RPC_URL ?? "";
    case 8453:
      return config.CRYPTO_PROCESSOR_BASE_RPC_URL ?? "";
    case 1:
      return config.CRYPTO_PROCESSOR_ETHEREUM_RPC_URL ?? "";
    default:
      return "";
  }
}

export function getCryptoPaymentRailIdForChainId(chainId: number): CryptoPaymentRailId {
  const entry = (Object.entries(CRYPTO_PAYMENT_RAILS) as [
    CryptoPaymentRailId,
    typeof CRYPTO_PAYMENT_RAILS[CryptoPaymentRailId]
  ][]).find(([, rail]) => rail.chainId === chainId);
  if (!entry) {
    throw new ApiError(400, "VALIDATION_ERROR", "Unsupported crypto payment chain.");
  }
  return entry[0];
}

export function isCryptoPaymentRailReady(config: AppConfig, railId: CryptoPaymentRailId) {
  return config.CRYPTO_PROCESSOR_ENABLED === true
    && isValidCryptoWalletXpub(config.CRYPTO_PROCESSOR_WALLET_XPUB ?? "")
    && config.CRYPTO_PROCESSOR_WATCHER_ENABLED === true
    && getCryptoPaymentRailRpcEndpoint(config, railId).trim().length > 0;
}

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
export type CryptoPaymentProductType = "cruush_plus" | "ping_pack";

export type CryptoPaymentIntentRow = {
  id: string;
  user_id: string;
  plan_id: string;
  product_type?: CryptoPaymentProductType;
  processor: "in_house";
  asset: CryptoPaymentAsset;
  network: CryptoPaymentNetwork;
  amount_usd_cents: number | string;
  quoted_amount_atomic?: string | null;
  derivation_index: number | string;
  wallet_xpub_fingerprint: string;
  payment_address?: string | null;
  watch_start_block?: number | string | null;
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
  productType: CryptoPaymentProductType;
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

// cruush does not offer a generic voluntary refund flow for cruush+. The
// 'refunded' state remains so exceptional or legally required outcomes and
// forced reversals can be recorded truthfully instead of leaving the ledger
// inconsistent. Do not add refund-offering product behavior without Julien
// naming that scope.
const allowedStatusTransitions: Record<CryptoPaymentStatus, readonly CryptoPaymentStatus[]> = {
  pending: ["pending", "awaiting_payment", "failed", "cancelled"],
  awaiting_payment: ["awaiting_payment", "confirming", "expired", "failed", "cancelled"],
  confirming: ["confirming", "paid", "failed"],
  paid: ["paid", "refunded"],
  // The watcher alone may take expired -> paid, and only after its locked
  // evidence query proves the exact-rail transfer was mined by expires_at.
  expired: ["expired", "paid"],
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
    productType: row.product_type ?? "cruush_plus",
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

export const CRYPTO_PAYMENT_QR_CACHE_MAX_ENTRIES = 256;

export type CryptoPaymentQrCodeCache = {
  get(paymentUri: string): Promise<string>;
  readonly size: number;
};

export function createBoundedCryptoPaymentQrCodeCache(
  maxEntries: number,
  encode: (paymentUri: string) => Promise<string>
): CryptoPaymentQrCodeCache {
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) {
    throw new Error("Crypto payment QR cache size must be a positive safe integer.");
  }

  const entries = new Map<string, Promise<string>>();

  return {
    get(paymentUri) {
      const existing = entries.get(paymentUri);
      if (existing) {
        entries.delete(paymentUri);
        entries.set(paymentUri, existing);
        return existing;
      }

      let cached!: Promise<string>;
      cached = Promise.resolve()
        .then(() => encode(paymentUri))
        .catch((error) => {
          if (entries.get(paymentUri) === cached) {
            entries.delete(paymentUri);
          }
          throw error;
        });
      entries.set(paymentUri, cached);

      while (entries.size > maxEntries) {
        const oldestPaymentUri = entries.keys().next().value;
        if (oldestPaymentUri === undefined) {
          break;
        }
        entries.delete(oldestPaymentUri);
      }

      return cached;
    },
    get size() {
      return entries.size;
    }
  };
}

const cryptoPaymentQrCodeCache = createBoundedCryptoPaymentQrCodeCache(
  CRYPTO_PAYMENT_QR_CACHE_MAX_ENTRIES,
  (paymentUri) => QRCode.toDataURL(paymentUri, { errorCorrectionLevel: "M", margin: 2, width: 256 })
);

export async function withCryptoPaymentDisplay(
  intent: CryptoPaymentIntent,
  qrCodeCache: Pick<CryptoPaymentQrCodeCache, "get"> = cryptoPaymentQrCodeCache
) {
  const paymentOpen = intent.status === "awaiting_payment" || intent.status === "confirming";
  const paymentUri = paymentOpen
    ? buildCryptoPaymentUri(intent)
    : null;

  return {
    ...intent,
    paymentAddress: paymentOpen ? intent.paymentAddress : null,
    paymentUri,
    qrCodeDataUrl: paymentUri
      ? await qrCodeCache.get(paymentUri)
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
  const rails = (Object.entries(CRYPTO_PAYMENT_RAILS) as [
    CryptoPaymentRailId,
    typeof CRYPTO_PAYMENT_RAILS[CryptoPaymentRailId]
  ][]).map(([id, rail]) => ({
    id,
    ...rail,
    ready: isCryptoPaymentRailReady(config, id)
  }));

  return {
    ready: rails.some((rail) => rail.ready),
    asset: CRYPTO_PAYMENT_ASSET,
    network: CRYPTO_PAYMENT_NETWORK,
    rails,
    confirmationTarget: config.CRYPTO_PROCESSOR_CONFIRMATION_TARGET ?? 1
  };
}

export function assertCryptoProcessorReady(config: AppConfig, railId: CryptoPaymentRailId) {
  if (config.CRYPTO_PROCESSOR_ENABLED !== true) {
    throw new ApiError(503, "CRYPTO_PROCESSOR_NOT_READY", "Crypto payments are not enabled.");
  }

  const receiveChainXpub = config.CRYPTO_PROCESSOR_WALLET_XPUB ?? "";
  if (!isValidCryptoWalletXpub(receiveChainXpub)) {
    throw new ApiError(503, "CRYPTO_PROCESSOR_NOT_READY", "Crypto wallet setup is not ready.");
  }

  if (config.CRYPTO_PROCESSOR_WATCHER_ENABLED !== true) {
    throw new ApiError(503, "CRYPTO_PROCESSOR_NOT_READY", "Crypto payment monitoring is not ready.");
  }

  if (getCryptoPaymentRailRpcEndpoint(config, railId).trim().length === 0) {
    throw new ApiError(503, "CRYPTO_PROCESSOR_NOT_READY", "That crypto payment method is not available.");
  }

  return {
    receiveChainXpub,
    confirmationTarget: config.CRYPTO_PROCESSOR_CONFIRMATION_TARGET ?? 1,
    intentTtlMinutes: config.CRYPTO_PROCESSOR_INTENT_TTL_MINUTES ?? 30
  };
}

function assertIdempotentReservationMatches(
  row: CryptoPaymentIntentRow,
  input: {
    planId: string;
    productType: CryptoPaymentProductType;
    amountUsdCents: number;
    walletXpubFingerprint: string;
    rail: CryptoPaymentRailId;
  }
) {
  const rail = cryptoRail(input.rail);
  if (
    row.plan_id !== input.planId ||
    (row.product_type ?? "cruush_plus") !== input.productType ||
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
    productType: CryptoPaymentProductType;
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
       product_type,
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
       $3,
       'in_house',
       $4,
       $5,
       $6,
       $7,
       'pending',
       $8,
       $9::jsonb,
       now() + ($10::integer * interval '1 minute')
     )
     on conflict (user_id, idempotency_key) do update
       set updated_at = crypto_payment_intents.updated_at
     returning *`,
    [
      input.userId,
      input.planId,
      input.productType,
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

async function loadIdempotentCryptoPaymentIntent(
  db: DbClient,
  userId: string,
  idempotencyKey: string
) {
  const result = await db.query<CryptoPaymentIntentRow>(
    `select *
     from crypto_payment_intents
     where user_id = $1
       and idempotency_key = $2
     limit 1
     for update`,
    [userId, idempotencyKey]
  );

  return result.rows[0] ?? null;
}

async function loadCompatibleOpenCryptoPaymentIntent(
  db: DbClient,
  input: {
    userId: string;
    planId: string;
    productType: CryptoPaymentProductType;
    amountUsdCents: number;
    walletXpubFingerprint: string;
    rail: CryptoPaymentRailId;
  }
) {
  const rail = cryptoRail(input.rail);
  const result = await db.query<CryptoPaymentIntentRow>(
    `select *
     from crypto_payment_intents
     where user_id = $1
       and plan_id = $2
       and product_type = $3
       and amount_usd_cents = $4
       and wallet_xpub_fingerprint = $5
       and asset = $6
       and network = $7
       and (
         status = 'confirming'
         or (
           status in ('pending', 'awaiting_payment')
           and expires_at > now()
         )
       )
     order by created_at desc
     limit 1
     for update`,
    [
      input.userId,
      input.planId,
      input.productType,
      input.amountUsdCents,
      input.walletXpubFingerprint,
      rail.asset,
      rail.network
    ]
  );

  return result.rows[0] ?? null;
}

async function hasCruushPlusLifetimeAccess(db: DbClient, userId: string) {
  const result = await db.query<{ has_lifetime_access: boolean }>(
    `select exists (
       select 1
       from cruush_plus_lifetime_access
       where user_id = $1
     ) as has_lifetime_access`,
    [userId]
  );

  return result.rows[0]?.has_lifetime_access === true;
}

async function assertLifetimeCryptoPurchaseAvailable(db: DbClient, userId: string) {
  const result = await db.query<{ unavailable: boolean }>(
    `select (
       exists (
         select 1
         from cruush_plus_lifetime_access
         where user_id = $1
       )
       or exists (
         select 1
         from crypto_payment_intents
         where user_id = $1
           and product_type = 'cruush_plus'
           and plan_id in ('lifetime_founder', 'plus_lifetime')
           and (
             status in ('confirming', 'paid', 'refunded')
             or (
               status in ('pending', 'awaiting_payment')
               and expires_at > now()
             )
           )
       )
     ) as unavailable`,
    [userId]
  );

  if (result.rows[0]?.unavailable === true) {
    throw new ApiError(409, "VALIDATION_ERROR", "A lifetime cruush+ payment is already active or in progress.");
  }
}

async function terminalizeUnpaidCryptoIntentAfterLifetimeAccess(
  db: DbClient,
  intent: CryptoPaymentIntentRow
) {
  if ((intent.product_type ?? "cruush_plus") !== "cruush_plus") {
    return false;
  }

  if (!(["pending", "awaiting_payment"] as CryptoPaymentStatus[]).includes(intent.status)) {
    return false;
  }

  if (!await hasCruushPlusLifetimeAccess(db, intent.user_id)) {
    return false;
  }

  const result = await db.query<CryptoPaymentIntentRow>(
    `update crypto_payment_intents
     set status = case
           when status = 'awaiting_payment' then 'expired'
           else 'cancelled'
         end,
         settlement_note = 'Lifetime access became active before this payment completed. No additional payment was accepted.',
         updated_at = now()
     where id = $1
       and status in ('pending', 'awaiting_payment')
     returning *`,
    [intent.id]
  );

  if (!result.rows[0]) {
    throw new Error("Open crypto payment could not be closed after lifetime access became active.");
  }

  return true;
}

async function assertCryptoOpenIntentCapacity(
  db: DbClient,
  userId: string,
  productType: CryptoPaymentProductType
) {
  const result = await db.query<{
    open_count: string | number;
    has_lifetime_access: boolean;
  }>(
    `select
       (
         select count(*)::int
         from crypto_payment_intents
         where user_id = $1
           and (
             status = 'confirming'
             or (
               status in ('pending', 'awaiting_payment')
               and expires_at > now()
             )
           )
       ) as open_count,
       exists (
         select 1
         from cruush_plus_lifetime_access
         where user_id = $1
       ) as has_lifetime_access`,
    [userId]
  );

  if (productType === "cruush_plus" && result.rows[0]?.has_lifetime_access === true) {
    throw new ApiError(409, "VALIDATION_ERROR", "Lifetime cruush+ is already active.");
  }

  if (Number(result.rows[0]?.open_count ?? 0) >= CRYPTO_OPEN_INTENT_LIMIT_PER_USER) {
    throw new ApiError(
      409,
      "VALIDATION_ERROR",
      "Finish or wait for an existing crypto payment before starting another."
    );
  }
}

export async function createInHouseCryptoPaymentIntent(
  db: DbClient,
  config: AppConfig,
  input: {
    userId: string;
    planId: string;
    productType?: CryptoPaymentProductType;
    amountUsdCents: number;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
    rail?: CryptoPaymentRailId;
    watchStartBlock?: bigint;
    watchStartBlocksByChain?: Readonly<Partial<Record<number, bigint>>>;
  }
) {
  const rail = input.rail ?? "usdc_arbitrum";
  const productType = input.productType ?? "cruush_plus";
  const wallet = assertCryptoProcessorReady(config, rail);
  const walletXpubFingerprint = fingerprintCryptoWalletXpub(wallet.receiveChainXpub);
  const cruushPlusPlan = productType === "cruush_plus"
    ? getCruushPlusPlan(input.planId)
    : null;
  const pingPack = productType === "ping_pack"
    ? getPingPack(input.planId)
    : null;
  const amountCents = cruushPlusPlan?.amountCents ?? pingPack?.amountCents;

  if (amountCents !== input.amountUsdCents) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      productType === "ping_pack"
        ? "Crypto payment amount does not match that Ping pack."
        : "Crypto payment amount does not match that cruush+ plan."
    );
  }

  const outcome = await runTransaction(db, async (client) => {
    await lockCryptoPurchaseUser(client, input.userId);
    await expireStaleCryptoPaymentIntents(client);

    let reserved = await loadIdempotentCryptoPaymentIntent(
      client,
      input.userId,
      input.idempotencyKey
    );

    if (!reserved) {
      reserved = await loadCompatibleOpenCryptoPaymentIntent(client, {
        ...input,
        productType,
        walletXpubFingerprint,
        rail
      });
    }

    const reusedReservation = reserved !== null;

    if (!reserved) {
      if (cruushPlusPlan?.isLifetime) {
        await assertLifetimeCryptoPurchaseAvailable(client, input.userId);
      }

      await assertCryptoOpenIntentCapacity(client, input.userId, productType);
      if (cruushPlusPlan) {
        await assertCryptoPlanCanReserve(client, cruushPlusPlan);
      }
      reserved = await reserveCryptoPaymentIntent(client, {
        ...input,
        productType,
        walletXpubFingerprint,
        intentTtlMinutes: wallet.intentTtlMinutes,
        rail
      });
    }

    assertIdempotentReservationMatches(reserved, {
      planId: input.planId,
      productType,
      amountUsdCents: input.amountUsdCents,
      walletXpubFingerprint,
      rail
    });

    if (reusedReservation && await terminalizeUnpaidCryptoIntentAfterLifetimeAccess(client, reserved)) {
      return { intent: null, lifetimeAccessConflict: true as const };
    }

    if (reserved.payment_address) {
      return { intent: mapCryptoPaymentIntent(reserved), lifetimeAccessConflict: false as const };
    }

    if (reserved.status !== "pending") {
      throw new Error("Crypto payment intent has no address after leaving pending status.");
    }

    const paymentAddress = deriveCryptoReceivingAddress(
      wallet.receiveChainXpub,
      numericDerivationIndex(reserved.derivation_index)
    );
    const quotedAmountAtomic = quoteUsdCentsAsStablecoinAtomic(input.amountUsdCents);
    const watchStartBlock = input.watchStartBlock ?? 0n;
    if (watchStartBlock < 0n || watchStartBlock > 9_223_372_036_854_775_807n) {
      throw new Error("Crypto payment intent has an invalid watch-start block.");
    }
    const suppliedWatchStartBlocks = CRYPTO_PAYMENT_CHAIN_IDS.map((chainId) => {
      const supplied = input.watchStartBlocksByChain?.[chainId];
      if (supplied === undefined) return null;
      if (supplied < 0n || supplied > 9_223_372_036_854_775_807n) {
        throw new Error("Crypto payment intent has an invalid watch-start block.");
      }

      return supplied.toString();
    });

    // Snapshot every chain origin before the address becomes payable. The
    // intended chain uses the verified raw head. Explicit secondary origins
    // were resolved while the address was still private: a verified current
    // head for every configured chain, or zero only for an unconfigured chain.
    // A durable global cursor is deliberately not an allocation fallback: it
    // may be far behind the chain after a long idle period.
    await client.query(
      `insert into crypto_payment_watch_positions (
         intent_id,
         chain_id,
         watch_start_block,
         last_scanned_block
       )
       select $1,
              supported.chain_id,
              case
                when supported.chain_id = $2 then $3::bigint
                else coalesce(supported.supplied_origin, 0)
              end,
              null
       from unnest($4::integer[], $5::bigint[]) as supported(chain_id, supplied_origin)
       on conflict (intent_id, chain_id) do nothing`,
      [
        reserved.id,
        cryptoRail(rail).chainId,
        watchStartBlock.toString(),
        CRYPTO_PAYMENT_CHAIN_IDS,
        suppliedWatchStartBlocks
      ]
    );

    const updated = await client.query<CryptoPaymentIntentRow>(
      `update crypto_payment_intents
       set payment_address = $2,
           quoted_amount_atomic = $3,
           watch_start_block = $4,
           status = 'awaiting_payment',
           updated_at = now()
       where id = $1
         and status = 'pending'
         and payment_address is null
       returning *`,
      [reserved.id, paymentAddress, quotedAmountAtomic, watchStartBlock.toString()]
    );

    const row = updated.rows[0];
    if (!row) {
      throw new Error("Crypto payment intent address allocation returned no row.");
    }

    return { intent: mapCryptoPaymentIntent(row), lifetimeAccessConflict: false as const };
  });

  if (outcome.lifetimeAccessConflict) {
    throw new ApiError(409, "VALIDATION_ERROR", "Lifetime cruush+ is already active.");
  }

  return outcome.intent;
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

/**
 * Moves intents past their checkout window to 'expired'.
 *
 * Nothing else did this, which left every unpaid intent sitting in
 * 'awaiting_payment' forever: the member was told to keep waiting long after
 * the window closed, and the watcher's late-arrival window never started
 * counting, so abandoned checkouts were watched indefinitely.
 *
 * 'confirming' is deliberately excluded. Money has already been seen on chain
 * for those, and a checkout timer must never discard a payment somebody has
 * actually sent. An expired intent never exposes fillable payment details. It
 * may become paid only when the watcher proves the transfer was mined no later
 * than expires_at; a post-expiry transfer never grants.
 */
export async function expireStaleCryptoPaymentIntents(db: DbClient) {
  const result = await db.query<{ id: string }>(
    `update crypto_payment_intents
     set status = 'expired',
         updated_at = now()
     where status in ('pending', 'awaiting_payment')
       and expires_at < now()
     returning id`,
    []
  );

  return result.rows.length;
}

export async function loadCurrentOpenCryptoPaymentIntent(
  db: DbClient,
  userId: string,
  productType: CryptoPaymentProductType = "cruush_plus"
) {
  await expireStaleCryptoPaymentIntents(db);

  const result = await db.query<CryptoPaymentIntentRow>(
    `select *
     from crypto_payment_intents
     where user_id = $1
       and product_type = $2
       and status in ('pending', 'awaiting_payment', 'confirming')
     order by created_at desc
     limit 1`,
    [userId, productType]
  );

  return result.rows[0] ? mapCryptoPaymentIntent(result.rows[0]) : null;
}

export async function loadCryptoPaymentIntent(db: DbClient, userId: string, intentId: string) {
  await expireStaleCryptoPaymentIntents(db);

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

/**
 * Cancels one member-owned checkout without deleting its audit row.
 *
 * A confirming payment cannot be cancelled: chain evidence already exists and
 * settlement must finish. Locking both the member purchase lane and the intent
 * makes this decision serialize with creation and watcher settlement.
 */
export async function cancelCryptoPaymentIntent(db: DbClient, userId: string, intentId: string) {
  return runTransaction(db, async (client) => {
    await lockCryptoPurchaseUser(client, userId);
    const locked = await client.query<CryptoPaymentIntentRow>(
      `select *
       from crypto_payment_intents
       where id = $1
         and user_id = $2
       for update`,
      [intentId, userId]
    );
    const intent = locked.rows[0];

    if (!intent) {
      throw new ApiError(404, "CRYPTO_PAYMENT_NOT_FOUND", "That crypto payment was not found.");
    }

    if (intent.status === "cancelled") {
      return mapCryptoPaymentIntent(intent);
    }

    if (intent.status === "confirming" || intent.status === "paid") {
      throw new ApiError(
        409,
        "VALIDATION_ERROR",
        "This payment cannot be cancelled because funds were already detected."
      );
    }

    if (intent.status !== "pending" && intent.status !== "awaiting_payment") {
      throw new ApiError(409, "VALIDATION_ERROR", "This payment can no longer be cancelled.");
    }

    const updated = await client.query<CryptoPaymentIntentRow>(
      `update crypto_payment_intents
       set status = 'cancelled',
           metadata = metadata || '{"cancelledBy":"member"}'::jsonb,
           settlement_note = 'Member cancelled before cruush detected payment.',
           updated_at = now()
       where id = $1
         and user_id = $2
         and status in ('pending', 'awaiting_payment')
       returning *`,
      [intentId, userId]
    );
    const cancelled = updated.rows[0];
    if (!cancelled) {
      throw new ApiError(409, "VALIDATION_ERROR", "This payment could not be cancelled.");
    }

    return mapCryptoPaymentIntent(cancelled);
  });
}
