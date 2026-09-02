/**
 * Reconciliation and support lookup for crypto payments.
 *
 * This exists so that when someone writes in saying "I sent the money and got
 * nothing", there is an answer that does not require reading the chain by hand.
 *
 * Everything here is read-only. Nothing in this module grants access, moves an
 * intent forward, or touches money; settlement lives in crypto-watcher.ts. The
 * lookups are deliberately usable by transaction hash and by address, because
 * those are the two things a member can actually produce.
 */

import type { DbClient } from "./db.js";
import { CRYPTO_PAYMENT_RAILS } from "./crypto-payments.js";
import { DEFAULT_CRYPTO_SETTLEMENT_POLICY } from "./crypto-settlement-policy.js";

export type CryptoPaymentTransferRow = {
  id: string;
  intent_id: string;
  chain_id: number;
  token_address: string;
  block_hash: string;
  block_timestamp: string | Date | null;
  transaction_hash: string;
  log_index: number;
  block_number: string;
  amount_atomic: string;
  from_address: string;
  to_address: string;
  confirmations: number;
  status: "observed" | "confirmed" | "reorganized";
  first_seen_at: string | Date;
  confirmed_at: string | Date | null;
};

export type CryptoReconciliationRecord = {
  intentId: string;
  userId: string;
  planId: string;
  status: string;
  asset: string;
  network: string;
  derivationIndex: number;
  paymentAddress: string | null;
  quotedAmountAtomic: string | null;
  confirmedAmountAtomic: string | null;
  settlementNote: string | null;
  entitlementGrantedAt: string | Date | null;
  createdAt: string | Date;
  expiresAt: string | Date;
  paidAt: string | Date | null;
  transfers: Array<{
    transactionHash: string;
    logIndex: number;
    chainId: number;
    tokenAddress: string;
    blockHash: string;
    blockTimestamp: string | Date | null;
    blockNumber: string;
    amountAtomic: string;
    fromAddress: string;
    confirmations: number;
    status: string;
    firstSeenAt: string | Date;
    confirmedAt: string | Date | null;
  }>;
};

const INTENT_COLUMNS = `
  i.id,
  i.user_id,
  i.plan_id,
  i.status,
  i.asset,
  i.network,
  i.derivation_index,
  i.payment_address,
  i.quoted_amount_atomic,
  i.confirmed_amount_atomic,
  i.settlement_note,
  i.entitlement_granted_at,
  i.created_at,
  i.expires_at,
  i.paid_at
`;

type IntentRow = {
  id: string;
  user_id: string;
  plan_id: string;
  status: string;
  asset: string;
  network: string;
  derivation_index: number | string;
  payment_address: string | null;
  quoted_amount_atomic: string | null;
  confirmed_amount_atomic: string | null;
  settlement_note: string | null;
  entitlement_granted_at: string | Date | null;
  created_at: string | Date;
  expires_at: string | Date;
  paid_at: string | Date | null;
};

async function attachTransfers(db: DbClient, rows: IntentRow[]): Promise<CryptoReconciliationRecord[]> {
  if (rows.length === 0) {
    return [];
  }

  const transfers = await db.query<CryptoPaymentTransferRow>(
    `select id, intent_id, chain_id, token_address, block_hash, block_timestamp,
            transaction_hash, log_index, block_number::text as block_number,
            amount_atomic, from_address, to_address, confirmations, status, first_seen_at, confirmed_at
     from crypto_payment_transfers
     where intent_id = any($1::uuid[])
     order by block_number asc, log_index asc`,
    [rows.map((row) => row.id)]
  );

  const byIntent = new Map<string, CryptoPaymentTransferRow[]>();
  for (const transfer of transfers.rows) {
    const list = byIntent.get(transfer.intent_id) ?? [];
    list.push(transfer);
    byIntent.set(transfer.intent_id, list);
  }

  return rows.map((row) => ({
    intentId: row.id,
    userId: row.user_id,
    planId: row.plan_id,
    status: row.status,
    asset: row.asset,
    network: row.network,
    derivationIndex: Number(row.derivation_index),
    paymentAddress: row.payment_address,
    quotedAmountAtomic: row.quoted_amount_atomic,
    confirmedAmountAtomic: row.confirmed_amount_atomic,
    settlementNote: row.settlement_note,
    entitlementGrantedAt: row.entitlement_granted_at,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    paidAt: row.paid_at,
    transfers: (byIntent.get(row.id) ?? []).map((transfer) => ({
      transactionHash: transfer.transaction_hash,
      logIndex: transfer.log_index,
      chainId: transfer.chain_id,
      tokenAddress: transfer.token_address,
      blockHash: transfer.block_hash,
      blockTimestamp: transfer.block_timestamp,
      blockNumber: transfer.block_number,
      amountAtomic: transfer.amount_atomic,
      fromAddress: transfer.from_address,
      confirmations: transfer.confirmations,
      status: transfer.status,
      firstSeenAt: transfer.first_seen_at,
      confirmedAt: transfer.confirmed_at
    }))
  }));
}

export async function findCryptoPaymentsByIntentId(db: DbClient, intentId: string) {
  const result = await db.query<IntentRow>(
    `select ${INTENT_COLUMNS} from crypto_payment_intents i where i.id = $1`,
    [intentId]
  );

  return attachTransfers(db, result.rows);
}

export async function findCryptoPaymentsByUserId(db: DbClient, userId: string, limit = 50) {
  const result = await db.query<IntentRow>(
    `select ${INTENT_COLUMNS} from crypto_payment_intents i
     where i.user_id = $1
     order by i.created_at desc
     limit $2`,
    [userId, Math.min(Math.max(limit, 1), 200)]
  );

  return attachTransfers(db, result.rows);
}

export async function findCryptoPaymentsByAddress(db: DbClient, address: string) {
  const result = await db.query<IntentRow>(
    `select ${INTENT_COLUMNS} from crypto_payment_intents i
     where lower(i.payment_address) = lower($1)`,
    [address]
  );

  return attachTransfers(db, result.rows);
}

/**
 * Finds the intent a transaction paid into. This is the lookup that answers
 * "here is my transaction hash, where did it go", and it works even when the
 * transfer never confirmed or was later reorganized.
 */
export async function findCryptoPaymentsByTransactionHash(db: DbClient, transactionHash: string) {
  const result = await db.query<IntentRow>(
    `select distinct ${INTENT_COLUMNS}
     from crypto_payment_intents i
     join crypto_payment_transfers t on t.intent_id = i.id
     where lower(t.transaction_hash) = lower($1)`,
    [transactionHash]
  );

  return attachTransfers(db, result.rows);
}

export type CryptoReconciliationException = {
  kind:
    | "paid_without_entitlement"
    | "entitlement_without_paid"
    | "confirmed_money_not_settled"
    | "unmatched_transfer"
    | "flagged_settlement";
  intentId: string | null;
  detail: string;
};

/**
 * Everything that does not add up. This is the report a human reads before the
 * first customer payment, and after any incident.
 *
 * Each query answers one specific question that has a real failure behind it:
 * money taken without access granted, access granted without money, money that
 * confirmed but never settled, and transfers that reference no live intent.
 */
export async function findCryptoReconciliationExceptions(db: DbClient): Promise<CryptoReconciliationException[]> {
  const exceptions: CryptoReconciliationException[] = [];

  // Someone paid and the grant did not happen. This is the one that costs a
  // member their access, so it comes first.
  const paidWithoutEntitlement = await db.query<{ id: string; paid_at: string | null }>(
    `select id, paid_at::text as paid_at
     from crypto_payment_intents
     where status = 'paid'
       and entitlement_granted_at is null`,
    []
  );
  for (const row of paidWithoutEntitlement.rows) {
    // A paid intent with no paid_at is itself wrong, so say so rather than
    // printing "settled at null".
    exceptions.push({
      kind: "paid_without_entitlement",
      intentId: row.id,
      detail: row.paid_at
        ? `Intent settled at ${row.paid_at} but no entitlement was recorded.`
        : "Intent is marked paid with no settlement time and no entitlement recorded."
    });
  }

  // Access exists without a settled payment behind it.
  const entitlementWithoutPaid = await db.query<{ id: string; status: string }>(
    `select id, status
     from crypto_payment_intents
     where entitlement_granted_at is not null
       and status not in ('paid', 'refunded')`,
    []
  );
  for (const row of entitlementWithoutPaid.rows) {
    exceptions.push({
      kind: "entitlement_without_paid",
      intentId: row.id,
      detail: `Entitlement recorded while the intent is '${row.status}'.`
    });
  }

  // Confirmed money that covers the quote, on an intent the watcher never
  // moved. Only the intent's exact chain and token count. Mismatched transfers
  // stay stored and remain visible through support lookup as truthful,
  // non-creditable evidence.
  const intendedRails = Object.values(CRYPTO_PAYMENT_RAILS);
  const stuck = await db.query<{ id: string; confirmed: string; quoted: string }>(
    `select i.id,
            sum(t.amount_atomic::numeric)::text as confirmed,
            i.quoted_amount_atomic as quoted
     from crypto_payment_intents i
     join unnest($1::text[], $2::text[], $3::integer[], $4::text[])
       as intended(asset, network, chain_id, token_address)
       on intended.asset = i.asset
      and intended.network = i.network
     join crypto_payment_transfers t
       on t.intent_id = i.id
      and t.status = 'confirmed'
      and t.chain_id = intended.chain_id
      and lower(t.token_address) = intended.token_address
      and t.block_number > coalesce(i.watch_start_block, 0)
      and t.block_timestamp <= i.expires_at
     where i.status not in ('paid', 'refunded')
       and i.quoted_amount_atomic is not null
     group by i.id, i.quoted_amount_atomic
     having sum(t.amount_atomic::numeric) >=
       i.quoted_amount_atomic::numeric - least(
         floor(i.quoted_amount_atomic::numeric * $5::integer / 10000),
         $6::numeric
       )`,
    [
      intendedRails.map((rail) => rail.asset),
      intendedRails.map((rail) => rail.network),
      intendedRails.map((rail) => rail.chainId),
      intendedRails.map((rail) => rail.tokenAddress.toLowerCase()),
      DEFAULT_CRYPTO_SETTLEMENT_POLICY.underpaymentToleranceBps,
      DEFAULT_CRYPTO_SETTLEMENT_POLICY.underpaymentToleranceMaxAtomic.toString()
    ]
  );
  for (const row of stuck.rows) {
    exceptions.push({
      kind: "confirmed_money_not_settled",
      intentId: row.id,
      detail: `Confirmed ${row.confirmed} against a quote of ${row.quoted}, but the intent never settled.`
    });
  }

  // Transfers whose intent is gone. The foreign key cascades on delete, so this
  // should be empty; if it is not, something deleted an intent it should not
  // have.
  const unmatched = await db.query<{ transaction_hash: string; log_index: number }>(
    `select t.transaction_hash, t.log_index
     from crypto_payment_transfers t
     left join crypto_payment_intents i on i.id = t.intent_id
     where i.id is null`,
    []
  );
  for (const row of unmatched.rows) {
    exceptions.push({
      kind: "unmatched_transfer",
      intentId: null,
      detail: `Transfer ${row.transaction_hash}:${row.log_index} references no payment intent.`
    });
  }

  // Anything settlement flagged on the way through, such as a large
  // overpayment. cruush does not refund, so this is visibility, not a queue of
  // pending refund decisions.
  const flagged = await db.query<{ id: string; settlement_note: string }>(
    `select id, settlement_note
     from crypto_payment_intents
     where settlement_note is not null
       and status = 'paid'`,
    []
  );
  for (const row of flagged.rows) {
    exceptions.push({
      kind: "flagged_settlement",
      intentId: row.id,
      detail: row.settlement_note
    });
  }

  return exceptions;
}
