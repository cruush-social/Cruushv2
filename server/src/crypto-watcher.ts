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
import { getCruushPlusPlan, grantCruushPlusPlan } from "./billing.js";
import {
  CRYPTO_PAYMENT_RAILS,
  assertCryptoPaymentStatusTransition,
  expireStaleCryptoPaymentIntents,
  type CryptoPaymentRailId,
  type CryptoPaymentStatus
} from "./crypto-payments.js";
import {
  ERC20_TRANSFER_TOPIC,
  addressToTopic,
  decodeErc20Transfer,
  type ChainSource
} from "./crypto-chain-source.js";
import {
  DEFAULT_CRYPTO_SETTLEMENT_POLICY,
  evaluateCryptoSettlement,
  lateArrivalIsSettleable,
  settlementOutcomeGrantsAccess,
  type CryptoSettlementPolicy
} from "./crypto-settlement-policy.js";

// A single pass never reads more than this many blocks, so a watcher that has
// fallen far behind catches up in bounded steps instead of one enormous query
// the endpoint would reject.
export const MAX_BLOCKS_PER_SCAN = 2_000n;

// How far back to re-read on every pass. Anything inside this window may still
// be reorganized, so it is re-examined rather than trusted once.
export const REORG_SAFETY_DEPTH = 32n;

export type WatchableIntent = {
  id: string;
  userId: string;
  planId: string;
  status: CryptoPaymentStatus;
  paymentAddress: string;
  quotedAmountAtomic: string;
  rail: CryptoPaymentRailId;
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
 * Intents that still need watching on one chain. Expired intents are included
 * when the policy accepts late payment, because money that has already left
 * someone's wallet does not care that a checkout timer ran out.
 */
export async function loadWatchableIntents(
  db: DbClient,
  chainId: number,
  policy: CryptoSettlementPolicy
): Promise<WatchableIntent[]> {
  const statuses = policy.acceptLatePayment
    ? ["awaiting_payment", "confirming", "expired"]
    : ["awaiting_payment", "confirming"];

  const rails = (Object.entries(CRYPTO_PAYMENT_RAILS) as [
    CryptoPaymentRailId,
    (typeof CRYPTO_PAYMENT_RAILS)[CryptoPaymentRailId]
  ][]).filter(([, rail]) => rail.chainId === chainId);

  if (rails.length === 0) {
    return [];
  }

  const result = await db.query<IntentRow>(
    `select id, user_id, plan_id, status, payment_address, quoted_amount_atomic, asset, network
     from crypto_payment_intents
     where status = any($1::text[])
       and payment_address is not null
       and quoted_amount_atomic is not null
       and asset = any($2::text[])
       and network = any($3::text[])
       -- Abandoned checkouts stop being watched after the late-arrival window.
       -- Without this the watch set only grows, and the watcher polls forever
       -- for payments that will never arrive.
       and (status <> 'expired' or expires_at > now() - ($4::integer * interval '1 day'))`,
    [
      statuses,
      rails.map(([, rail]) => rail.asset),
      rails.map(([, rail]) => rail.network),
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
      rail
    }];
  });
}

async function readCursor(db: DbClient, chainId: number): Promise<bigint | null> {
  const result = await db.query<{ last_scanned_block: string }>(
    `select last_scanned_block::text as last_scanned_block
     from crypto_chain_watch_cursors
     where chain_id = $1`,
    [chainId]
  );

  const row = result.rows[0];
  return row ? BigInt(row.last_scanned_block) : null;
}

/**
 * Forgets how far the watcher had read on a chain.
 *
 * Safe only when there is nothing to watch, and called only from there. If no
 * intent is watchable then no payment address is live, so no money can arrive
 * that we would need the old position to find. Keeping a stale cursor across a
 * quiet period would instead force the watcher to grind back through every
 * block it slept past, one bounded step per pass, spending requests to look for
 * payments that could not exist.
 */
async function clearCursor(db: DbClient, chainId: number) {
  await db.query(`delete from crypto_chain_watch_cursors where chain_id = $1`, [chainId]);
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
 * The block range for this pass. Always re-reads the reorg window, and never
 * reads more than MAX_BLOCKS_PER_SCAN at a time.
 */
export function planScanRange(input: {
  cursor: bigint | null;
  headBlock: bigint;
  confirmationTarget: number;
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
    ? (headBlock > MAX_BLOCKS_PER_SCAN ? headBlock - MAX_BLOCKS_PER_SCAN : 0n)
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
    tokenAddress: string;
    fromAddress: string;
    toAddress: string;
    amountAtomic: bigint;
    confirmations: number;
    status: "observed" | "confirmed" | "reorganized";
  }
) {
  await db.query(
    `insert into crypto_payment_transfers (
       intent_id,
       chain_id,
       transaction_hash,
       log_index,
       block_number,
       block_hash,
       token_address,
       from_address,
       to_address,
       amount_atomic,
       confirmations,
       status,
       confirmed_at
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, case when $12 = 'confirmed' then now() else null end)
     on conflict (chain_id, transaction_hash, log_index) do update
     set block_number = excluded.block_number,
         block_hash = excluded.block_hash,
         confirmations = excluded.confirmations,
         status = excluded.status,
         confirmed_at = case
           when excluded.status = 'confirmed' then coalesce(crypto_payment_transfers.confirmed_at, now())
           else null
         end,
         updated_at = now()`,
    [
      input.intentId,
      input.chainId,
      input.transactionHash,
      input.logIndex,
      input.blockNumber.toString(),
      input.blockHash,
      input.tokenAddress,
      input.fromAddress,
      input.toAddress,
      input.amountAtomic.toString(),
      input.confirmations,
      input.status
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
  input: { chainId: number; fromBlock: bigint; toBlock: bigint; seenKeys: string[] }
) {
  const result = await db.query<{ id: string }>(
    `update crypto_payment_transfers
     set status = 'reorganized',
         confirmed_at = null,
         updated_at = now()
     where chain_id = $1
       and block_number between $2 and $3
       and status <> 'reorganized'
       and (transaction_hash || ':' || log_index::text) <> all($4::text[])
     returning id`,
    [input.chainId, input.fromBlock.toString(), input.toBlock.toString(), input.seenKeys]
  );

  return result.rows.length;
}

async function sumConfirmedAmount(db: DbClient, intentId: string): Promise<bigint> {
  const result = await db.query<{ total: string | null }>(
    `select coalesce(sum(amount_atomic::numeric), 0)::text as total
     from crypto_payment_transfers
     where intent_id = $1
       and status = 'confirmed'`,
    [intentId]
  );

  return BigInt(result.rows[0]?.total ?? "0");
}

/**
 * Applies settlement for one intent from its confirmed transfers, and grants
 * the entitlement if it just became paid.
 *
 * The grant is guarded three ways: the status transition must be legal, the
 * update that sets entitlement_granted_at only matches a row where it is still
 * null, and the database refuses a second paid access record for the same
 * intent. A concurrent second pass therefore cannot grant twice.
 */
export async function settleIntent(
  app: { db: DbClient },
  intent: WatchableIntent,
  policy: CryptoSettlementPolicy
): Promise<{ settled: boolean; granted: boolean; note: string | null }> {
  if (!lateArrivalIsSettleable({ status: intent.status, policy })) {
    return { settled: false, granted: false, note: null };
  }

  const confirmedAmountAtomic = await sumConfirmedAmount(app.db, intent.id);
  if (confirmedAmountAtomic <= 0n) {
    return { settled: false, granted: false, note: null };
  }

  const outcome = evaluateCryptoSettlement({
    quotedAmountAtomic: BigInt(intent.quotedAmountAtomic),
    confirmedAmountAtomic,
    policy
  });

  if (!settlementOutcomeGrantsAccess(outcome)) {
    // Partial money is real money. Move to 'confirming' so the state says
    // "something arrived", and leave a note naming the shortfall.
    if (intent.status === "awaiting_payment") {
      assertCryptoPaymentStatusTransition(intent.status, "confirming");
      await app.db.query(
        `update crypto_payment_intents
         set status = 'confirming',
             confirmed_amount_atomic = $2,
             settlement_note = $3,
             updated_at = now()
         where id = $1
           and status = 'awaiting_payment'`,
        [intent.id, confirmedAmountAtomic.toString(), outcome.note]
      );
    } else {
      await app.db.query(
        `update crypto_payment_intents
         set confirmed_amount_atomic = $2,
             settlement_note = $3,
             updated_at = now()
         where id = $1`,
        [intent.id, confirmedAmountAtomic.toString(), outcome.note]
      );
    }

    return { settled: false, granted: false, note: outcome.note };
  }

  const note = "note" in outcome ? outcome.note : null;

  // Claim the paid transition. Only the pass that actually moves the row from a
  // non-paid state gets to grant.
  const claimed = await app.db.query<{ id: string }>(
    `update crypto_payment_intents
     set status = 'paid',
         confirmed_amount_atomic = $2,
         settlement_note = $3,
         paid_at = coalesce(paid_at, now()),
         updated_at = now()
     where id = $1
       and status <> 'paid'
       and entitlement_granted_at is null
     returning id`,
    [intent.id, confirmedAmountAtomic.toString(), note]
  );

  if (claimed.rows.length === 0) {
    return { settled: true, granted: false, note };
  }

  const plan = getCruushPlusPlan(intent.planId);
  await grantCruushPlusPlan(app as never, intent.userId, plan, {
    kind: "crypto_payment_intent",
    intentId: intent.id
  });

  await app.db.query(
    `update crypto_payment_intents
     set entitlement_granted_at = now(),
         updated_at = now()
     where id = $1
       and entitlement_granted_at is null`,
    [intent.id]
  );

  return { settled: true, granted: true, note };
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
  const intents = await loadWatchableIntents(app.db, source.chainId, policy);

  const empty: WatcherPassResult = {
    chainId: source.chainId,
    scannedFromBlock: "0",
    scannedToBlock: "0",
    watchedAddresses: intents.length,
    transfersObserved: 0,
    transfersReorganized: 0,
    intentsSettled: 0,
    entitlementsGranted: 0
  };

  // Nothing to watch means no request at all, not even a head read. An idle
  // processor must cost nothing: with no live intent there is no payment
  // address in existence, so there is nothing on chain that could concern us.
  // This is what keeps a running-but-unused watcher off the request bill
  // entirely, rather than burning two calls every poll forever.
  if (intents.length === 0) {
    await clearCursor(app.db, source.chainId);
    return empty;
  }

  const headBlock = await source.getBlockNumber();
  const cursor = await readCursor(app.db, source.chainId);
  const range = planScanRange({ cursor, headBlock, confirmationTarget: policy.confirmationTarget });

  if (!range) {
    return empty;
  }

  const byAddress = new Map(intents.map((intent) => [intent.paymentAddress.toLowerCase(), intent]));
  const tokenAddresses = Array.from(new Set(
    (Object.values(CRYPTO_PAYMENT_RAILS) as (typeof CRYPTO_PAYMENT_RAILS)[CryptoPaymentRailId][])
      .filter((rail) => rail.chainId === source.chainId)
      .map((rail) => rail.tokenAddress.toLowerCase())
  ));

  const logs = await source.getLogs({
    fromBlock: range.fromBlock,
    toBlock: range.toBlock,
    address: tokenAddresses,
    // topic0 is Transfer; topic2 is the indexed recipient, narrowed to the
    // addresses this processor actually owns, so the endpoint does the
    // filtering rather than shipping every token transfer on the chain.
    topics: [
      ERC20_TRANSFER_TOPIC,
      null,
      Array.from(byAddress.keys()).map(addressToTopic)
    ]
  });

  const seenKeys: string[] = [];
  const touchedIntentIds = new Set<string>();
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

    // A removed log is a reorganized one. It must not count, and the sweep
    // below marks it, so it is deliberately not added to seenKeys.
    if (log.removed) {
      continue;
    }

    const confirmations = headBlock >= log.blockNumber
      ? Number(headBlock - log.blockNumber) + 1
      : 0;

    await recordTransfer(app.db, {
      intentId: intent.id,
      chainId: source.chainId,
      transactionHash: log.transactionHash,
      logIndex: log.logIndex,
      blockNumber: log.blockNumber,
      blockHash: log.blockHash,
      tokenAddress: transfer.tokenAddress,
      fromAddress: transfer.fromAddress,
      toAddress: transfer.toAddress,
      amountAtomic: transfer.amountAtomic,
      confirmations,
      status: confirmations >= policy.confirmationTarget ? "confirmed" : "observed"
    });

    seenKeys.push(`${log.transactionHash}:${log.logIndex}`);
    touchedIntentIds.add(intent.id);
    transfersObserved += 1;
  }

  const transfersReorganized = await markReorganizedTransfers(app.db, {
    chainId: source.chainId,
    fromBlock: range.fromBlock,
    toBlock: range.toBlock,
    seenKeys
  });

  let intentsSettled = 0;
  let entitlementsGranted = 0;

  // Anything whose transfers changed in this pass is re-evaluated, including
  // intents whose transfers were just reorganized away.
  const intentsToSettle = intents.filter((intent) => touchedIntentIds.has(intent.id) || transfersReorganized > 0);

  for (const intent of intentsToSettle) {
    const result = await settleIntent(app, intent, policy);
    if (result.settled) {
      intentsSettled += 1;
    }
    if (result.granted) {
      entitlementsGranted += 1;
    }
  }

  await writeCursor(app.db, source.chainId, range.toBlock);

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
}

export { runTransaction };
