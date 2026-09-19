import type { AppConfig } from './config.js';
import type { DbClient } from './db.js';
import { runTransaction } from './db.js';
import { lockCryptoPurchaseUser } from './billing.js';
import { bitcoinAddressScript, BITCOIN_CONFIRMATION_TARGET, type BitcoinSource, type BitcoinTransaction } from './bitcoin.js';
import { expireStaleCryptoPaymentIntents } from './crypto-payments.js';
import { settleIntentInTransaction, resolveSettlementPolicy, type WatchableIntent, type WatcherPassResult } from './crypto-watcher.js';

type Evidence = { hash: string; index: number; amount: string; block: number | null; blockHash: string | null; time: number | null; confirmations: number };

/** Match actual output scripts, not a submitted hash or an explorer's address label. */
export function bitcoinOutputsForOrder(tx: BitcoinTransaction, address: string, head: number, origin: number, canonicalHash: string | null): Evidence[] {
  const script = bitcoinAddressScript(address);
  const status = tx.status;
  if (status.confirmed && (status.block_height == null || status.block_time == null || status.block_hash !== canonicalHash || status.block_height <= origin || status.block_height > head)) return [];
  return tx.vout.flatMap((out, index) => out.scriptpubkey === script && out.value > 0 ? [{
    hash: tx.txid, index, amount: String(out.value),
    block: status.confirmed ? status.block_height! : null,
    blockHash: status.confirmed ? status.block_hash! : null,
    time: status.confirmed ? status.block_time! : null,
    confirmations: status.confirmed ? head - status.block_height! + 1 : 0
  }] : []);
}

export async function runBitcoinWatcherPass(app: { db: DbClient; config: AppConfig }, source: BitcoinSource): Promise<WatcherPassResult> {
  await expireStaleCryptoPaymentIntents(app.db);
  const policy = { ...resolveSettlementPolicy(app.config), confirmationTarget: BITCOIN_CONFIRMATION_TARGET, underpaymentToleranceBps: 0, underpaymentToleranceMaxAtomic: 0n };
  const rows = await app.db.query<{
    id: string; user_id: string; plan_id: string; product_type: 'cruush_plus' | 'ping_pack';
    status: WatchableIntent['status']; payment_address: string; quoted_amount_atomic: string;
    watch_start_block: string; expires_at: string;
  }>(`select id, user_id, plan_id, product_type, status, payment_address, quoted_amount_atomic,
              watch_start_block::text, expires_at
       from crypto_payment_intents
       where asset = 'BTC' and network = 'bitcoin' and payment_address is not null
         and quoted_amount_atomic is not null
         and status in ('awaiting_payment', 'confirming', 'expired')
         and expires_at > now() - ($1::integer * interval '1 day')`, [policy.lateArrivalWatchDays]);
  const result: WatcherPassResult = { chainId: 0, scannedFromBlock: '0', scannedToBlock: '0', watchedAddresses: rows.rows.length, transfersObserved: 0, transfersReorganized: 0, intentsSettled: 0, entitlementsGranted: 0 };
  if (!rows.rows.length) return result;
  for (const row of rows.rows) {
    const intent: WatchableIntent = { id: row.id, userId: row.user_id, planId: row.plan_id, productType: row.product_type, status: row.status, paymentAddress: row.payment_address, quotedAmountAtomic: row.quoted_amount_atomic, rail: 'btc_bitcoin', watchStartBlock: row.watch_start_block, expiresAt: new Date(row.expires_at).toISOString() };
    await runTransaction(app.db, async db => {
      await lockCryptoPurchaseUser(db, intent.userId);
      const locked = await db.query<{ status: string }>(`select status from crypto_payment_intents where id = $1 and user_id = $2 for update`, [intent.id, intent.userId]);
      if (!['awaiting_payment', 'confirming', 'expired'].includes(locked.rows[0]?.status ?? '')) return;
      // Serialize observation and settlement so an older pass cannot overwrite newer chain evidence.
      const head = await source.head();
      result.scannedToBlock = String(head.height);
      const origin = Number(row.watch_start_block);
      const transactions = await source.transactions(intent.paymentAddress, origin);
      const evidence: Evidence[] = [];
      const hashes = new Map<number, string>();
      for (const tx of transactions) {
        const height = tx.status.block_height;
        let canonical: string | null = null;
        if (tx.status.confirmed && height != null) {
          canonical = hashes.get(height) ?? await source.blockHash(height);
          hashes.set(height, canonical);
        }
        evidence.push(...bitcoinOutputsForOrder(tx, intent.paymentAddress, head.height, origin, canonical));
      }
      // Never combine observations from opposite sides of a tip replacement.
      if (await source.blockHash(head.height) !== head.hash) throw new Error('Bitcoin chain changed during monitoring; retry next pass.');
      // Persist replacement/drop evidence. Old outputs never disappear from the audit record.
      const existing = await db.query<{ transaction_hash: string; output_index: number; status: string }>(`select transaction_hash, output_index, status from crypto_bitcoin_transfers where intent_id = $1`, [intent.id]);
      const seen = new Set(evidence.map(e => `${e.hash}:${e.index}`));
      for (const old of existing.rows) {
        if (!seen.has(`${old.transaction_hash}:${old.output_index}`) && old.status !== 'reorganized') {
          await db.query(`update crypto_bitcoin_transfers set status = 'reorganized', confirmations = 0, updated_at = now() where intent_id = $1 and transaction_hash = $2 and output_index = $3`, [intent.id, old.transaction_hash, old.output_index]);
          result.transfersReorganized++;
        }
      }
      for (const e of evidence) {
        await db.query(`insert into crypto_bitcoin_transfers
          (intent_id, transaction_hash, output_index, to_address, amount_atomic, block_number, block_hash, block_timestamp, confirmations, status)
          values ($1,$2,$3,$4,$5,$6,$7,to_timestamp($8),$9,$10)
          on conflict (transaction_hash, output_index) do update set
            block_number = excluded.block_number, block_hash = excluded.block_hash,
            block_timestamp = excluded.block_timestamp, confirmations = excluded.confirmations,
            status = excluded.status, updated_at = now()
          where crypto_bitcoin_transfers.intent_id = excluded.intent_id`,
          [intent.id, e.hash, e.index, intent.paymentAddress, e.amount, e.block, e.blockHash, e.time, e.confirmations, e.confirmations >= BITCOIN_CONFIRMATION_TARGET ? 'confirmed' : 'observed']);
        result.transfersObserved++;
      }
      if (evidence.some(e => e.time === null || e.time * 1000 <= Date.parse(intent.expiresAt))) {
        await db.query(`update crypto_payment_intents set status = 'confirming', updated_at = now() where id = $1 and status = 'awaiting_payment'`, [intent.id]);
      }
      const settled = await settleIntentInTransaction(app, db, intent, policy, true);
      if (settled.settled) result.intentsSettled++;
      if (settled.granted) result.entitlementsGranted++;
    });
  }
  return result;
}
