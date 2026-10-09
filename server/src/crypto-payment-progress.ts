import type { AppConfig } from './config.js';
import type { DbClient } from './db.js';
import type { CryptoPaymentIntent } from './crypto-payments.js';
import { BITCOIN_CONFIRMATION_TARGET } from './bitcoin.js';
import { resolveSettlementPolicy } from './crypto-watcher.js';

type TransferProgress = { amount_atomic: string; confirmations: number };
export function confirmationProgress(transfers: TransferProgress[], quote: string, target: number) {
  const rows = transfers.filter(t => /^\d+$/.test(t.amount_atomic) && BigInt(t.amount_atomic) > 0n && Number.isSafeInteger(t.confirmations) && t.confirmations >= 0)
    .sort((a, b) => b.confirmations - a.confirmations);
  let amount = 0n;
  let confirmations = 0;
  // Use the best-confirmed outputs needed to fund this order. An unnecessary
  // dust payment cannot reset an otherwise completed order's progress.
  for (const row of rows) {
    amount += BigInt(row.amount_atomic);
    confirmations = Math.min(row.confirmations, target);
    if (amount >= BigInt(quote)) break;
  }
  return { confirmations, confirmationTarget: target, paymentAmountReceived: amount >= BigInt(quote) };
}

export async function withCryptoPaymentProgress(db: DbClient, config: AppConfig, intent: CryptoPaymentIntent) {
  const target = intent.rail === 'btc_bitcoin' ? BITCOIN_CONFIRMATION_TARGET : resolveSettlementPolicy(config, intent.chainId).confirmationTarget;
  if (!intent.quotedAmountAtomic) return { ...intent, confirmations: 0, confirmationTarget: target, paymentAmountReceived: false };
  const result = intent.rail === 'btc_bitcoin'
    ? await db.query<TransferProgress>(`select t.amount_atomic::text, t.confirmations from crypto_bitcoin_transfers t
        join crypto_payment_intents i on i.id = t.intent_id
        where i.id = $1 and i.user_id = $2 and i.asset = 'BTC' and i.network = 'bitcoin'
          and t.to_address = i.payment_address and t.status <> 'reorganized'
          and (t.block_number is null or (t.block_number > i.watch_start_block and t.block_timestamp <= i.expires_at))`, [intent.id, intent.userId])
    : await db.query<TransferProgress>(`select t.amount_atomic, t.confirmations from crypto_payment_transfers t
        join crypto_payment_intents i on i.id = t.intent_id
        where i.id = $1 and i.user_id = $2 and t.chain_id = $3 and lower(t.token_address) = $4
          and lower(t.to_address) = lower(i.payment_address) and t.status <> 'reorganized'
          and t.block_number > coalesce(i.watch_start_block, 0) and t.block_timestamp <= i.expires_at`, [intent.id, intent.userId, intent.chainId, intent.tokenAddress.toLowerCase()]);
  return { ...intent, ...confirmationProgress(result.rows, intent.quotedAmountAtomic, target) };
}
