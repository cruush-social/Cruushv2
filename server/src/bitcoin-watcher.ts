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
    watch_start_block: string; expires_at: string; past_recovery_window: boolean; has_transfer: boolean;
  }>(`select id, user_id, plan_id, product_type, status, payment_address, quoted_amount_atomic,
              watch_start_block::text, expires_at,
              expires_at <= now() - ($1::integer * interval '1 day') as past_recovery_window,
              exists(select 1 from crypto_bitcoin_transfers transfer where transfer.intent_id = crypto_payment_intents.id and transfer.status <> 'reorganized') as has_transfer
       from crypto_payment_intents
       where asset = 'BTC' and network = 'bitcoin' and payment_address is not null
         and quoted_amount_atomic is not null
         and status in ('awaiting_payment', 'confirming', 'expired', 'cancelled')
         and (status = 'confirming' or expires_at > now() - ($1::integer * interval '1 day'))
       order by created_at, id`, [policy.lateArrivalWatchDays]);
  const result: WatcherPassResult = { chainId: 0, scannedFromBlock: '0', scannedToBlock: '0', watchedAddresses: rows.rows.length, transfersObserved: 0, transfersReorganized: 0, intentsSettled: 0, entitlementsGranted: 0 };
  await source.syncAddresses?.(rows.rows.map(row => row.payment_address));
  if (!rows.rows.length) return result;
  let firstFailure: unknown;
  for (const row of rows.rows) {
    if (source.historyMode === 'triggered' && !row.has_transfer && !source.hasPendingTransactions?.(row.payment_address)) continue;
    const intent: WatchableIntent = { id: row.id, userId: row.user_id, planId: row.plan_id, productType: row.product_type, status: row.status, paymentAddress: row.payment_address, quotedAmountAtomic: row.quoted_amount_atomic, rail: 'btc_bitcoin', watchStartBlock: row.watch_start_block, expiresAt: new Date(row.expires_at).toISOString() };
    try {
      await runTransaction(app.db, async db => {
        await lockCryptoPurchaseUser(db, intent.userId);
        const locked = await db.query<{ status: string }>(`select status from crypto_payment_intents where id = $1 and user_id = $2 for update`, [intent.id, intent.userId]);
        if (!['awaiting_payment', 'confirming', 'expired', 'cancelled'].includes(locked.rows[0]?.status ?? '')) return;
        // Serialize observation and settlement so an older pass cannot overwrite newer chain evidence.
        const existing = await db.query<{
          transaction_hash: string; output_index: number; status: string; amount_atomic: string;
          block_number: string | null; block_hash: string | null; block_time: string | null;
        }>(`select transaction_hash, output_index, status, amount_atomic, block_number::text, block_hash,
                   extract(epoch from block_timestamp)::bigint::text as block_time
            from crypto_bitcoin_transfers where intent_id = $1`, [intent.id]);
        const origin = Number(row.watch_start_block);
        const transactions = await source.transactions(intent.paymentAddress, origin);
        if (source.historyMode === 'triggered' && transactions.length === 0 && existing.rows.every(item => item.status === 'reorganized')) return;
        const head = await source.head();
        result.scannedToBlock = String(head.height);
        const hashes = new Map<number, string>();
        const evidence = new Map<string, Evidence>();
        const invalidPersisted = new Set<string>();
        if (source.historyMode === 'triggered') {
          for (const old of existing.rows) {
            if (old.status === 'reorganized') continue;
            const key = `${old.transaction_hash}:${old.output_index}`;
            const block = old.block_number === null ? null : Number(old.block_number);
            if (block === null) {
              evidence.set(key, { hash: old.transaction_hash, index: old.output_index, amount: old.amount_atomic, block: null, blockHash: null, time: null, confirmations: 0 });
              continue;
            }
            if (!Number.isSafeInteger(block) || block <= origin || block > head.height || !old.block_hash) continue;
            const canonical = hashes.get(block) ?? await source.blockHash(block);
            hashes.set(block, canonical);
            if (canonical !== old.block_hash) {
              invalidPersisted.add(key);
              continue;
            }
            evidence.set(key, {
              hash: old.transaction_hash, index: old.output_index, amount: old.amount_atomic,
              block, blockHash: old.block_hash, time: old.block_time === null ? null : Number(old.block_time),
              confirmations: head.height - block + 1
            });
          }
        }
        for (const tx of transactions) {
          const height = tx.status.block_height;
          let canonical: string | null = null;
          if (tx.status.confirmed && height != null) {
            canonical = hashes.get(height) ?? await source.blockHash(height);
            hashes.set(height, canonical);
          }
          for (const item of bitcoinOutputsForOrder(tx, intent.paymentAddress, head.height, origin, canonical)) {
            evidence.set(`${item.hash}:${item.index}`, item);
          }
        }
        if (source.verifyTransactions && [...evidence.values()].some(item => item.confirmations >= BITCOIN_CONFIRMATION_TARGET)) {
          const independentlyVerified = await source.verifyTransactions(intent.paymentAddress, origin);
          const verified = new Map<string, Evidence>();
          for (const tx of independentlyVerified) {
            const height = tx.status.block_height;
            let canonical: string | null = null;
            if (tx.status.confirmed && height != null) {
              canonical = hashes.get(height) ?? await source.blockHash(height);
              hashes.set(height, canonical);
            }
            for (const item of bitcoinOutputsForOrder(tx, intent.paymentAddress, head.height, origin, canonical)) {
              verified.set(`${item.hash}:${item.index}`, item);
            }
          }
          for (const [key, item] of evidence) {
            if (item.confirmations < BITCOIN_CONFIRMATION_TARGET) continue;
            const match = verified.get(key);
            if (!match || match.amount !== item.amount || match.blockHash !== item.blockHash) evidence.delete(key);
          }
        }
        // Never combine observations from opposite sides of a tip replacement.
        if (await source.blockHash(head.height) !== head.hash) throw new Error('Bitcoin chain changed during monitoring; retry next pass.');
        // Persist replacement/drop evidence. Old outputs never disappear from the audit record.
        const seen = new Set(evidence.keys());
        for (const old of existing.rows) {
          const key = `${old.transaction_hash}:${old.output_index}`;
          const disappeared = source.historyMode === 'triggered' ? invalidPersisted.has(key) : !seen.has(key);
          if (disappeared && old.status !== 'reorganized') {
            await db.query(`update crypto_bitcoin_transfers set status = 'reorganized', confirmations = 0, updated_at = now() where intent_id = $1 and transaction_hash = $2 and output_index = $3`, [intent.id, old.transaction_hash, old.output_index]);
            result.transfersReorganized++;
          }
        }
        for (const e of evidence.values()) {
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
        if ([...evidence.values()].some(e => e.time === null || e.time * 1000 <= Date.parse(intent.expiresAt))) {
          // Cancellation cannot stop a broadcast Bitcoin transaction. Recover an
          // address that receives funds before the deadline and let the ordinary
          // settlement path finish instead of stranding the member's payment.
          await db.query(`update crypto_payment_intents set status = 'confirming', updated_at = now() where id = $1 and status in ('awaiting_payment', 'cancelled')`, [intent.id]);
        }
        const settled = await settleIntentInTransaction(app, db, intent, policy, true);
        if (settled.settled) result.intentsSettled++;
        if (settled.granted) result.entitlementsGranted++;
        if (row.past_recovery_window && !settled.settled) {
          const timelyCanonicalAmount = [...evidence.values()].reduce((amount, item) =>
            item.time !== null && item.time * 1000 <= Date.parse(intent.expiresAt)
              ? amount + BigInt(item.amount)
              : amount, 0n);
          if (timelyCanonicalAmount < BigInt(intent.quotedAmountAtomic)) {
            const note = `Payment did not fully settle within the ${policy.lateArrivalWatchDays}-day post-expiry watch window. Transfer evidence was preserved for support review.`;
            await db.query(`update crypto_payment_intents
              set status = 'failed', settlement_note = $2, updated_at = now()
              where id = $1 and status = 'confirming'`, [intent.id, note]);
          }
        }
      });
    } catch (error) {
      firstFailure ??= error;
    }
  }
  if (firstFailure) throw firstFailure;
  return result;
}
