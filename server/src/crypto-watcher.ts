/**
 * The chain watcher: the only thing allowed to decide that a payment happened.
 *
 * Rules this module exists to enforce:
 *
 * - Settlement evidence comes from chain logs read by the server itself. A
 *   browser poll, a copied address, or a member-supplied transaction hash is
 *   never evidence.
 * - Every observed log is stored once, keyed by (chain id, transaction hash,
 *   log index), so re-reading a block range cannot double-count.
 * - A transfer only counts once it reaches the configured confirmation target,
 *   and stops counting if the chain drops it.
 * - Entitlement is granted from the 'paid' transition and nowhere else, and the
 *   database refuses a second grant for the same intent.
 *
 * It runs only when a chain source is configured. Nothing here dials out on its
 * own; the caller supplies the source.
 */

import type { AppConfig } from "./config.js";
import type { DbClient } from "./db.js";
import { runTransaction } from "./db.js";
import {
  getCruushPlusPlan,
  grantCruushPlusPlan,
  lockCryptoPurchaseUser
} from "./billing.js";
import {
  CRYPTO_PAYMENT_RAILS,
  expireStaleCryptoPaymentIntents,
  type CryptoPaymentRailId,
  type CryptoPaymentStatus
} from "./crypto-payments.js";
import {
  ERC20_TRANSFER_TOPIC,
  addressToTopic,
  decodeErc20Transfer,
  type ChainLog,
  type ChainSource
} from "./crypto-chain-source.js";
import {
  DEFAULT_CRYPTO_SETTLEMENT_POLICY,
  evaluateCryptoSettlement,
  settlementOutcomeGrantsAccess,
  type CryptoSettlementPolicy
} from "./crypto-settlement-policy.js";
import { ApiError } from "./errors.js";

// A single pass never reads more than this many blocks, so a watcher that has
// fallen far behind catches up in bounded steps instead of one enormous query
// the endpoint would reject.
export const MAX_BLOCKS_PER_SCAN = 2_000n;

// Keep the topic2 OR-list small enough for conservative public RPC limits. A
// large customer set is split across requests for the same bounded block range.
export const MAX_RECIPIENT_TOPICS_PER_LOG_QUERY = 100;

// How far back to re-read on every pass. Anything inside this window may still
// be reorganized, so it is re-examined rather than trusted once.
export const REORG_SAFETY_DEPTH = 32n;

// Two 32-bit advisory-lock keys keep watcher coordination separate from user
// and plan locks while giving every chain its own cross-process pass lock.
const CRYPTO_WATCHER_LOCK_NAMESPACE = 0x63727573;

export type WatchableIntent = {
  id: string;
  userId: string;
  planId: string;
  status: CryptoPaymentStatus;
  paymentAddress: string;
  quotedAmountAtomic: string;
  rail: CryptoPaymentRailId;
  watchStartBlock: string;
  expiresAt: string;
};

export type WatcherPassResult = {
  chainId: number;
  scannedFromBlock: string;
  scannedToBlock: string;
  watchedAddresses: number;
  transfersObserved: number;
  transfersReorganized: number;
  intentsSettled: number;
  entitlementsGranted: number;
};

type IntentRow = {
  id: string;
  user_id: string;
  plan_id: string;
  status: CryptoPaymentStatus;
  payment_address: string;
  quoted_amount_atomic: string;
  asset: string;
  network: string;
  watch_start_block: string | null;
  expires_at: string | Date;
};

type IntentWatchPosition = {
  watchStartBlock: bigint;
  lastScannedBlock: bigint | null;
};

type IntentWatchPositionRow = {
  intent_id: string;
  watch_start_block: string;
  last_scanned_block: string | null;
};

type LockedIntentRow = IntentRow & {
  entitlement_granted_at: string | Date | null;
};

function railIdFor(asset: string, network: string): CryptoPaymentRailId | null {
  const entry = (Object.entries(CRYPTO_PAYMENT_RAILS) as [
    CryptoPaymentRailId,
    (typeof CRYPTO_PAYMENT_RAILS)[CryptoPaymentRailId]
  ][]).find(([, rail]) => rail.asset === asset && rail.network === network);

  return entry ? entry[0] : null;
}

/**
 * The policy for one chain.
 *
 * The confirmation target comes from the rail, because Base and Ethereum
 * produce blocks at very different rates and one shared count would mean two
 * very different waits. `CRYPTO_PROCESSOR_CONFIRMATION_TARGET` is kept as a
 * floor rather than a replacement: an operator can demand more confirmations
 * than the rail asks for, but never fewer.
 */
export function resolveSettlementPolicy(config: AppConfig, chainId?: number): CryptoSettlementPolicy {
  const rail = chainId === undefined
    ? null
    : (Object.values(CRYPTO_PAYMENT_RAILS) as (typeof CRYPTO_PAYMENT_RAILS)[CryptoPaymentRailId][])
        .find((candidate) => candidate.chainId === chainId) ?? null;

  const railTarget = rail?.confirmationTarget ?? DEFAULT_CRYPTO_SETTLEMENT_POLICY.confirmationTarget;
  const configuredFloor = config.CRYPTO_PROCESSOR_CONFIRMATION_TARGET ?? 0;

  return {
    ...DEFAULT_CRYPTO_SETTLEMENT_POLICY,
    confirmationTarget: Math.max(railTarget, configuredFloor)
  };
}

/**
 * Every watchable payment address is queried on every supported configured
 * chain, so a supported asset sent on the wrong network still leaves evidence.
 * Expired intents remain only for the bounded evidence window. An exact-rail
 * transfer may still settle only when its authoritative block timestamp proves
 * it landed no later than the intent expiry.
 */
export async function loadWatchableIntents(
  db: DbClient,
  chainId: number,
  policy: CryptoSettlementPolicy
): Promise<WatchableIntent[]> {
  const statuses = policy.acceptLatePayment
    ? ["awaiting_payment", "confirming", "expired"]
    : ["awaiting_payment", "confirming"];

  const chainIsSupported = (Object.values(CRYPTO_PAYMENT_RAILS) as (
    typeof CRYPTO_PAYMENT_RAILS[CryptoPaymentRailId]
  )[]).some((rail) => rail.chainId === chainId);

  if (!chainIsSupported) {
    return [];
  }

  const result = await db.query<IntentRow>(
    `select id, user_id, plan_id, status, payment_address, quoted_amount_atomic, asset, network,
            watch_start_block::text as watch_start_block, expires_at
     from crypto_payment_intents
     where status = any($1::text[])
       and payment_address is not null
       and quoted_amount_atomic is not null
       -- Abandoned checkouts stop being watched after the late-arrival window.
       -- Without this the watch set only grows, and the watcher polls forever
       -- for payments that will never arrive.
       and (status <> 'expired' or expires_at > now() - ($2::integer * interval '1 day'))`,
    [
      statuses,
      policy.lateArrivalWatchDays
    ]
  );

  return result.rows.flatMap((row) => {
    const rail = railIdFor(row.asset, row.network);
    if (!rail) {
      return [];
    }

    return [{
      id: row.id,
      userId: row.user_id,
      planId: row.plan_id,
      status: row.status,
      paymentAddress: row.payment_address,
      quotedAmountAtomic: row.quoted_amount_atomic,
      rail,
      // Migration 100 gives legacy issued addresses a conservative block-zero
      // origin. Keep the fallback for mixed-version rollout safety.
      watchStartBlock: row.watch_start_block ?? "0",
      expiresAt: new Date(row.expires_at).toISOString()
    }];
  });
}

/**
 * Stops a partly observed payment from remaining watchable forever.
 *
 * Transfer rows remain untouched for support review. Only the intent leaves
 * the active watch set after the same bounded window used for late evidence.
 */
export async function failStaleConfirmingIntents(
  db: DbClient,
  policy: CryptoSettlementPolicy
) {
  const note = `Payment evidence did not settle this checkout within the ${policy.lateArrivalWatchDays}-day post-expiry watch window. Transfer evidence was preserved for support review.`;
  const result = await db.query<{ id: string }>(
    `update crypto_payment_intents
     set status = 'failed',
         settlement_note = $2,
         updated_at = now()
     where status = 'confirming'
       and expires_at <= now() - ($1::integer * interval '1 day')
     returning id`,
    [policy.lateArrivalWatchDays, note]
  );

  return result.rows.length;
}

async function writeCursor(db: DbClient, chainId: number, block: bigint) {
  await db.query(
    `insert into crypto_chain_watch_cursors (chain_id, last_scanned_block)
     values ($1, $2)
     on conflict (chain_id) do update
     set last_scanned_block = greatest(crypto_chain_watch_cursors.last_scanned_block, excluded.last_scanned_block),
         last_scanned_at = now(),
         updated_at = now()`,
    [chainId, block.toString()]
  );
}

/**
 * Gives every watched address a durable origin and cursor on this chain.
 *
 * Intended-chain origins are captured before the address is shown. A missing
 * wrong-chain position always starts at block zero. A global cursor may have
 * advanced during address issuance, so it is never safe as a new origin.
 */
async function ensureIntentWatchPositions(
  db: DbClient,
  chainId: number,
  intents: WatchableIntent[]
) {
  const origins = intents.map((intent) =>
    CRYPTO_PAYMENT_RAILS[intent.rail].chainId === chainId
      ? BigInt(intent.watchStartBlock)
      : 0n
  );

  await db.query(
    `insert into crypto_payment_watch_positions (
       intent_id,
       chain_id,
       watch_start_block,
       last_scanned_block
     )
     select input.intent_id, $2, input.watch_start_block, null
     from unnest($1::uuid[], $3::bigint[]) as input(intent_id, watch_start_block)
     on conflict (intent_id, chain_id) do nothing`,
    [intents.map((intent) => intent.id), chainId, origins.map(String)]
  );

  const result = await db.query<IntentWatchPositionRow>(
    `select intent_id,
            watch_start_block::text as watch_start_block,
            last_scanned_block::text as last_scanned_block
     from crypto_payment_watch_positions
     where chain_id = $1
       and intent_id = any($2::uuid[])`,
    [chainId, intents.map((intent) => intent.id)]
  );
  const stored = new Map(result.rows.map((row) => [row.intent_id, {
    watchStartBlock: BigInt(row.watch_start_block),
    lastScannedBlock: row.last_scanned_block === null ? null : BigInt(row.last_scanned_block)
  }]));

  return new Map(intents.map((intent, index) => [
    intent.id,
    stored.get(intent.id) ?? {
      watchStartBlock: origins[index] ?? 0n,
      lastScannedBlock: null
    }
  ]));
}

async function writeIntentWatchPositions(
  db: DbClient,
  chainId: number,
  intentIds: string[],
  block: bigint
) {
  await db.query(
    `update crypto_payment_watch_positions
     set last_scanned_block = greatest(coalesce(last_scanned_block, watch_start_block), $3),
         updated_at = now()
     where chain_id = $1
       and intent_id = any($2::uuid[])
       and watch_start_block <= $3`,
    [chainId, intentIds, block.toString()]
  );
}

/**
 * The block range for this pass. Always re-reads the reorg window, and never
 * reads more than MAX_BLOCKS_PER_SCAN at a time.
 */
export function planScanRange(input: {
  cursor: bigint | null;
  headBlock: bigint;
  confirmationTarget: number;
  watchStartBlock?: bigint;
}): { fromBlock: bigint; toBlock: bigint } | null {
  const { cursor, headBlock } = input;

  if (headBlock < 0n) {
    return null;
  }

  // Re-read at least the confirmation window, because a chain that produces
  // blocks quickly needs a proportionally deeper look back: 32 blocks is about
  // a minute on Ethereum but only eight seconds on Arbitrum.
  const reorgDepth = REORG_SAFETY_DEPTH > BigInt(input.confirmationTarget)
    ? REORG_SAFETY_DEPTH
    : BigInt(input.confirmationTarget);

  // Start from the reorg window behind the cursor so dropped logs are noticed.
  const start = cursor === null
    ? (input.watchStartBlock ?? (headBlock > MAX_BLOCKS_PER_SCAN ? headBlock - MAX_BLOCKS_PER_SCAN : 0n))
    : (cursor > reorgDepth ? cursor - reorgDepth : 0n);

  if (start > headBlock) {
    return null;
  }

  const toBlock = start + MAX_BLOCKS_PER_SCAN - 1n > headBlock
    ? headBlock
    : start + MAX_BLOCKS_PER_SCAN - 1n;

  return { fromBlock: start, toBlock };
}

/**
 * Records one observed transfer. The unique constraint on
 * (chain_id, transaction_hash, log_index) is the deduplication boundary, so a
 * repeated read updates confirmations instead of inserting a second row.
 */
async function recordTransfer(
  db: DbClient,
  input: {
    intentId: string;
    chainId: number;
    transactionHash: string;
    logIndex: number;
    blockNumber: bigint;
    blockHash: string;
    blockTimestamp: Date;
    tokenAddress: string;
    fromAddress: string;
    toAddress: string;
    amountAtomic: bigint;
    confirmations: number;
    status: "observed" | "confirmed" | "reorganized";
    markIntentConfirming: boolean;
  }
) {
  await db.query(
    `with locked_intent as materialized (
       select id, status
       from crypto_payment_intents
       where id = $1
       for update
     ), recorded_transfer as (
       insert into crypto_payment_transfers (
         intent_id,
         chain_id,
         transaction_hash,
         log_index,
         block_number,
         block_hash,
         block_timestamp,
         token_address,
         from_address,
         to_address,
         amount_atomic,
         confirmations,
         status,
         confirmed_at
       )
       select $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
              case when $13 = 'confirmed' then now() else null end
       from locked_intent
       on conflict (chain_id, transaction_hash, log_index) do update
       set block_number = excluded.block_number,
           block_hash = excluded.block_hash,
           block_timestamp = excluded.block_timestamp,
           confirmations = excluded.confirmations,
           status = excluded.status,
           confirmed_at = case
             when excluded.status = 'confirmed' then coalesce(crypto_payment_transfers.confirmed_at, now())
             else null
           end,
           updated_at = now()
       returning intent_id
     )
     update crypto_payment_intents as intent
     set status = 'confirming',
         updated_at = now()
     from locked_intent, recorded_transfer
     where intent.id = locked_intent.id
       and recorded_transfer.intent_id = intent.id
       and locked_intent.status = 'awaiting_payment'
       and $14::boolean
     returning intent.id`,
    [
      input.intentId,
      input.chainId,
      input.transactionHash,
      input.logIndex,
      input.blockNumber.toString(),
      input.blockHash,
      input.blockTimestamp,
      input.tokenAddress,
      input.fromAddress,
      input.toAddress,
      input.amountAtomic.toString(),
      input.confirmations,
      input.status,
      input.markIntentConfirming
    ]
  );
}

/**
 * Marks transfers that the chain no longer reports in a range we just re-read.
 * They stop counting toward settlement but are kept, so support can still see
 * that they were once observed.
 */
async function markReorganizedTransfers(
  db: DbClient,
  input: {
    chainId: number;
    fromBlock: bigint;
    toBlock: bigint;
    seenKeys: string[];
    watchedIntentIds: string[];
  }
) {
  // Only intents whose addresses were actually queried this pass can be judged.
  // Without this the sweep condemned transfers it never asked about: once an
  // intent settles it leaves the watch set, its address drops out of the log
  // filter, and its transfer, still inside the re-read window, stopped
  // appearing in seenKeys. A genuine, still-valid payment was then recorded as
  // dropped by the chain, which is exactly what support sees when a member asks
  // where their money went, and it drowned out any real reorganization.
  if (input.watchedIntentIds.length === 0) {
    return 0;
  }

  const result = await db.query<{ id: string }>(
    `update crypto_payment_transfers
     set status = 'reorganized',
         confirmed_at = null,
         updated_at = now()
     where chain_id = $1
       and block_number between $2 and $3
       and status <> 'reorganized'
       and intent_id = any($5::uuid[])
       and (transaction_hash || ':' || log_index::text) <> all($4::text[])
     returning id`,
    [
      input.chainId,
      input.fromBlock.toString(),
      input.toBlock.toString(),
      input.seenKeys,
      input.watchedIntentIds
    ]
  );

  return result.rows.length;
}

async function lockAndSumConfirmedAmount(
  db: DbClient,
  intentId: string,
  railId: CryptoPaymentRailId,
  expiresAt: string | Date,
  watchStartBlock: string
): Promise<bigint> {
  const rail = CRYPTO_PAYMENT_RAILS[railId];
  const result = await db.query<{ total: string | null }>(
    `select coalesce(sum(amount_atomic::numeric), 0)::text as total
     from (
       select transfer.amount_atomic
       from crypto_payment_transfers transfer
       where transfer.intent_id = $1
         and transfer.chain_id = $2
         and lower(transfer.token_address) = $3
         and transfer.status = 'confirmed'
         and transfer.block_timestamp <= $4::timestamptz
         and transfer.block_number > $5::bigint
       order by transfer.id
       for update
     ) locked_transfer`,
    [intentId, rail.chainId, rail.tokenAddress.toLowerCase(), expiresAt, watchStartBlock]
  );

  return BigInt(result.rows[0]?.total ?? "0");
}

/**
 * Applies settlement for one intent from its confirmed transfers, and grants
 * the entitlement if it just became paid.
 *
 * A double grant is prevented by one thing: the atomic claim below, which only
 * one pass can win because it matches on the row still being unpaid and
 * ungranted. Everything then happens in that same transaction, so a failure
 * rolls the claim back and the next pass retries cleanly.
 *
 * The partial unique index on crypto_payment_intent_id does NOT provide a
 * second line of defence, despite appearances: grantCruushPlusPlan resolves its
 * conflict on (user_id), and the same intent always carries the same user, so
 * the index can never fire. Do not rely on it.
 */
type SettlementResult = { settled: boolean; granted: boolean; note: string | null };

async function settleIntentInTransaction(
  app: { db: DbClient },
  tx: DbClient,
  intent: WatchableIntent,
  policy: CryptoSettlementPolicy,
  userAlreadyLocked = false
): Promise<SettlementResult> {
  if (!userAlreadyLocked) {
    await lockCryptoPurchaseUser(tx, intent.userId);
  }

  const locked = await tx.query<LockedIntentRow>(
    `select id, user_id, plan_id, status, payment_address,
            quoted_amount_atomic, asset, network,
            watch_start_block::text as watch_start_block,
            expires_at, entitlement_granted_at
     from crypto_payment_intents
     where id = $1
       and user_id = $2
     for update`,
    [intent.id, intent.userId]
  );
  const current = locked.rows[0];
  if (
    !current
    || !(["awaiting_payment", "confirming", "expired"] as CryptoPaymentStatus[]).includes(current.status)
    || (current.status === "expired" && !policy.acceptLatePayment)
    || current.entitlement_granted_at != null
  ) {
    return { settled: false, granted: false, note: null };
  }

  const railId = railIdFor(current.asset, current.network);
  if (!railId) {
    return { settled: false, granted: false, note: null };
  }

  const confirmedAmountAtomic = await lockAndSumConfirmedAmount(
    tx,
    current.id,
    railId,
    current.expires_at,
    current.watch_start_block ?? "0"
  );
  if (confirmedAmountAtomic <= 0n) {
    return { settled: false, granted: false, note: null };
  }

  const outcome = evaluateCryptoSettlement({
    quotedAmountAtomic: BigInt(current.quoted_amount_atomic),
    confirmedAmountAtomic,
    policy
  });

  if (!settlementOutcomeGrantsAccess(outcome)) {
    if (current.status === "expired") {
      await tx.query(
        `update crypto_payment_intents
         set confirmed_amount_atomic = $2,
             settlement_note = $3,
             updated_at = now()
         where id = $1
           and status = 'expired'`,
        [current.id, confirmedAmountAtomic.toString(), outcome.note]
      );
    } else {
      await tx.query(
        `update crypto_payment_intents
         set status = 'confirming',
             confirmed_amount_atomic = $2,
             settlement_note = $3,
             updated_at = now()
         where id = $1
           and status in ('awaiting_payment', 'confirming')`,
        [current.id, confirmedAmountAtomic.toString(), outcome.note]
      );
    }

    return { settled: false, granted: false, note: outcome.note };
  }

  const note = "note" in outcome ? outcome.note : null;
  const plan = getCruushPlusPlan(current.plan_id);
  let entitlementAlreadyActive = false;
  let settlementNote = note;

  // The user lock makes this precheck stable through the claim. A member may
  // already have lifetime access when an older, scheduler-expired lifetime
  // payment is finally observed. That confirmed payment must remain recorded,
  // but the known business conflict must not roll back every other settlement,
  // transfer, and cursor update in this chain pass.
  if (plan.isLifetime) {
    const existingLifetime = await tx.query<{ has_lifetime_access: boolean }>(
      `select exists (
         select 1
         from cruush_plus_lifetime_access
         where user_id = $1
       ) as has_lifetime_access`,
      [current.user_id]
    );
    entitlementAlreadyActive = existingLifetime.rows[0]?.has_lifetime_access === true;
    if (entitlementAlreadyActive) {
      settlementNote = "Payment confirmed after lifetime cruush+ was already active. No additional entitlement was granted. Support review is required.";
    }
  }

  const claimed = await tx.query<{ id: string }>(
    `update crypto_payment_intents
     set status = 'paid',
         confirmed_amount_atomic = $2,
         settlement_note = $3,
         paid_at = coalesce(paid_at, now()),
         updated_at = now()
     where id = $1
       and status in ('awaiting_payment', 'confirming', 'expired')
       and entitlement_granted_at is null
     returning id`,
    [current.id, confirmedAmountAtomic.toString(), settlementNote]
  );

  if (claimed.rows.length === 0) {
    return { settled: false, granted: false, note: settlementNote };
  }

  if (entitlementAlreadyActive) {
    return { settled: true, granted: false, note: settlementNote };
  }

  await grantCruushPlusPlan({ ...app, db: tx } as never, current.user_id, plan, {
    kind: "crypto_payment_intent",
    intentId: current.id
  });

  await tx.query(
    `update crypto_payment_intents
     set entitlement_granted_at = now(),
         updated_at = now()
     where id = $1
       and entitlement_granted_at is null`,
    [current.id]
  );

  return { settled: true, granted: true, note: settlementNote };
}

export async function settleIntent(
  app: { db: DbClient },
  intent: WatchableIntent,
  policy: CryptoSettlementPolicy
): Promise<SettlementResult> {
  if (
    !(["awaiting_payment", "confirming", "expired"] as CryptoPaymentStatus[]).includes(intent.status)
    || (intent.status === "expired" && !policy.acceptLatePayment)
  ) {
    return { settled: false, granted: false, note: null };
  }

  // Creation and settlement take entity locks in one order: member, intent,
  // evidence, limited plan. The evidence sum and grant share the transaction.
  return runTransaction(app.db, (tx) =>
    settleIntentInTransaction(app, tx, intent, policy)
  );
}

function emptyWatcherPassResult(chainId: number, watchedAddresses: number): WatcherPassResult {
  return {
    chainId,
    scannedFromBlock: "0",
    scannedToBlock: "0",
    watchedAddresses,
    transfersObserved: 0,
    transfersReorganized: 0,
    intentsSettled: 0,
    entitlementsGranted: 0
  };
}

async function tryAcquireWatcherPassLock(db: DbClient, chainId: number) {
  const result = await db.query<{ acquired: boolean }>(
    `select pg_try_advisory_xact_lock($1::integer, $2::integer) as acquired`,
    [CRYPTO_WATCHER_LOCK_NAMESPACE, chainId]
  );

  return result.rows[0]?.acquired === true;
}

/**
 * One full watcher pass over one chain.
 *
 * Reads the head, works out a bounded block range that re-covers the reorg
 * window, fetches Transfer logs addressed to any watched payment address,
 * records them, drops anything the chain no longer reports, then settles.
 */
export async function runCryptoWatcherPass(
  app: { db: DbClient; config: AppConfig },
  source: ChainSource
): Promise<WatcherPassResult> {
  // Close stale checkout windows before deciding what to watch. Without this an
  // unpaid intent stays 'awaiting_payment' forever, so the late-arrival window
  // never starts counting and abandoned checkouts are watched indefinitely.
  await expireStaleCryptoPaymentIntents(app.db);

  const policy = resolveSettlementPolicy(app.config, source.chainId);
  await failStaleConfirmingIntents(app.db, policy);
  const initialIntents = await loadWatchableIntents(app.db, source.chainId, policy);
  const empty = emptyWatcherPassResult(source.chainId, initialIntents.length);

  // Nothing to watch means no request at all, not even a head read. An idle
  // processor must cost nothing: with no live intent there is no payment
  // address in existence, so there is nothing on chain that could concern us.
  // This is what keeps a running-but-unused watcher off the request bill
  // entirely, rather than burning two calls every poll forever.
  if (initialIntents.length === 0) {
    return empty;
  }

  // Commit origins before any remote request. Even a wrong-chain outage then
  // resumes from a durable lower bound instead of a later guessed cursor.
  await ensureIntentWatchPositions(
    app.db,
    source.chainId,
    initialIntents
  );

  return runTransaction(app.db, async (tx) => {
    // The transaction pins one PostgreSQL session, so this cross-process lock
    // covers reorganization marking through settlement and always releases on
    // commit or rollback. A duplicate pass returns before RPC or cursor writes.
    if (!await tryAcquireWatcherPassLock(tx, source.chainId)) {
      return empty;
    }

    // Reload after acquiring the lock. A prior process may have settled the
    // intent between the preflight read and this transaction.
    const intents = await loadWatchableIntents(tx, source.chainId, policy);
    const lockedEmpty = emptyWatcherPassResult(source.chainId, intents.length);
    if (intents.length === 0) {
      return lockedEmpty;
    }

    // Every entity lock is acquired in the same order used by purchase
    // creation and standalone settlement: user, intent, evidence, limited plan.
    // Sorting makes overlapping chain passes take shared users in one order.
    const userIds = Array.from(new Set(intents.map((intent) => intent.userId))).sort();
    for (const watchedUserId of userIds) {
      await lockCryptoPurchaseUser(tx, watchedUserId);
    }

    const positions = await ensureIntentWatchPositions(
      tx,
      source.chainId,
      intents
    );

    // A configured URL is not chain identity. Verify every active pass before
    // reading either the head or logs. Any mismatch aborts before cursor writes.
    const observedChainId = await source.getChainId();
    if (observedChainId !== source.chainId) {
      throw new ApiError(
        502,
        "CRYPTO_CHAIN_SOURCE_UNAVAILABLE",
        "Crypto watcher chain source is connected to the wrong network."
      );
    }

    const headBlock = await source.getBlockNumber();
    const plannedRanges = intents.flatMap((intent) => {
      const position: IntentWatchPosition | undefined = positions.get(intent.id);
      if (!position) {
        return [];
      }
      const planned = planScanRange({
        cursor: position.lastScannedBlock,
        headBlock,
        confirmationTarget: policy.confirmationTarget,
        watchStartBlock: position.watchStartBlock
      });
      return planned ? [planned] : [];
    });
    const earliestFromBlock = plannedRanges.reduce<bigint | null>(
      (earliest, planned) =>
        earliest === null || planned.fromBlock < earliest ? planned.fromBlock : earliest,
      null
    );
    const range = earliestFromBlock === null
      ? null
      : {
          fromBlock: earliestFromBlock,
          toBlock: earliestFromBlock + MAX_BLOCKS_PER_SCAN - 1n > headBlock
            ? headBlock
            : earliestFromBlock + MAX_BLOCKS_PER_SCAN - 1n
        };

    if (!range) {
      return lockedEmpty;
    }

    const byAddress = new Map(intents.map((intent) => [intent.paymentAddress.toLowerCase(), intent]));
    const tokenAddresses = Array.from(new Set(
      (Object.values(CRYPTO_PAYMENT_RAILS) as (typeof CRYPTO_PAYMENT_RAILS)[CryptoPaymentRailId][])
        .filter((rail) => rail.chainId === source.chainId)
        .map((rail) => rail.tokenAddress.toLowerCase())
    ));

    // This includes every token supported on the chain, so sending a configured
    // but wrong token to a payment address still leaves support evidence.
    const recipientTopics = Array.from(byAddress.keys()).map(addressToTopic);
    const logsByKey = new Map<string, ChainLog>();

    for (let offset = 0; offset < recipientTopics.length; offset += MAX_RECIPIENT_TOPICS_PER_LOG_QUERY) {
      const logs = await source.getLogs({
        fromBlock: range.fromBlock,
        toBlock: range.toBlock,
        address: tokenAddresses,
        topics: [
          ERC20_TRANSFER_TOPIC,
          null,
          recipientTopics.slice(offset, offset + MAX_RECIPIENT_TOPICS_PER_LOG_QUERY)
        ]
      });

      for (const log of logs) {
        const key = `${log.transactionHash.toLowerCase()}:${log.logIndex}`;
        const existing = logsByKey.get(key);
        // A removed duplicate is the conservative winner: it cannot credit
        // money, and the sweep retains the evidence for support.
        if (!existing || (!existing.removed && log.removed)) {
          logsByKey.set(key, log);
        }
      }
    }

    const logs = Array.from(logsByKey.values());
    const seenKeys: string[] = [];
    const touchedIntentIds = new Set<string>();
    const blockTimestamps = new Map<string, Promise<Date>>();
    let transfersObserved = 0;

    for (const log of logs) {
      const transfer = decodeErc20Transfer(log);
      if (!transfer) {
        continue;
      }

      const intent = byAddress.get(transfer.toAddress.toLowerCase());
      if (!intent) {
        continue;
      }

      const expectedRail = CRYPTO_PAYMENT_RAILS[intent.rail];
      const isExpectedRail = expectedRail.chainId === source.chainId
        && transfer.tokenAddress.toLowerCase() === expectedRail.tokenAddress.toLowerCase();

      // A removed log is a reorganized one. It must not count, and the sweep
      // below marks it, so it is deliberately not added to seenKeys.
      if (log.removed) {
        continue;
      }

      // Same-height competing hashes must each be checked against the
      // canonical block. Reusing one timestamp would skip hash validation.
      const blockKey = `${log.blockNumber}:${log.blockHash.toLowerCase()}`;
      let blockTimestampPromise = blockTimestamps.get(blockKey);
      if (!blockTimestampPromise) {
        blockTimestampPromise = source.getBlockTimestamp(log.blockNumber, log.blockHash);
        blockTimestamps.set(blockKey, blockTimestampPromise);
      }
      const blockTimestamp = await blockTimestampPromise;
      const arrivedBeforeExpiry = blockTimestamp.getTime() <= new Date(intent.expiresAt).getTime();
      const position = positions.get(intent.id);
      // The persisted origin is the already-mined head read before the address
      // is issued. A same-height log necessarily predates issuance.
      const arrivedAfterAddressOrigin = position !== undefined
        && log.blockNumber > position.watchStartBlock;
      const isCreditableTransfer = isExpectedRail
        && transfer.amountAtomic > 0n
        && arrivedBeforeExpiry
        && arrivedAfterAddressOrigin;

      const confirmations = headBlock >= log.blockNumber
        ? Number(headBlock - log.blockNumber) + 1
        : 0;

      await recordTransfer(tx, {
        intentId: intent.id,
        chainId: source.chainId,
        transactionHash: log.transactionHash,
        logIndex: log.logIndex,
        blockNumber: log.blockNumber,
        blockHash: log.blockHash,
        blockTimestamp,
        tokenAddress: transfer.tokenAddress,
        fromAddress: transfer.fromAddress,
        toAddress: transfer.toAddress,
        amountAtomic: transfer.amountAtomic,
        confirmations,
        status: confirmations >= policy.confirmationTarget ? "confirmed" : "observed",
        // Wrong-token, wrong-chain, post-expiry, and pre-origin transfers remain
        // support evidence but cannot move this intent forward.
        markIntentConfirming: isCreditableTransfer
      });

      seenKeys.push(`${log.transactionHash}:${log.logIndex}`);
      if (isCreditableTransfer) {
        touchedIntentIds.add(intent.id);
      }
      transfersObserved += 1;
    }

    const transfersReorganized = await markReorganizedTransfers(tx, {
      chainId: source.chainId,
      fromBlock: range.fromBlock,
      toBlock: range.toBlock,
      seenKeys,
      watchedIntentIds: intents.map((intent) => intent.id)
    });

    let intentsSettled = 0;
    let entitlementsGranted = 0;

    // Anything whose transfers changed in this pass is re-evaluated, including
    // intents whose transfers were just reorganized away.
    const intentsToSettle = intents.filter(
      (intent) => touchedIntentIds.has(intent.id) || transfersReorganized > 0
    );

    for (const intent of intentsToSettle) {
      const result = await settleIntentInTransaction(app, tx, intent, policy, true);
      if (result.settled) {
        intentsSettled += 1;
      }
      if (result.granted) {
        entitlementsGranted += 1;
      }
    }

    await writeIntentWatchPositions(
      tx,
      source.chainId,
      intents.map((intent) => intent.id),
      range.toBlock
    );
    await writeCursor(tx, source.chainId, range.toBlock);

    return {
      chainId: source.chainId,
      scannedFromBlock: range.fromBlock.toString(),
      scannedToBlock: range.toBlock.toString(),
      watchedAddresses: intents.length,
      transfersObserved,
      transfersReorganized,
      intentsSettled,
      entitlementsGranted
    };
  });
}

export { runTransaction };
