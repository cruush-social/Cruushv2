import type { AppConfig } from './config.js';
import type { DbClient } from './db.js';
import { getCruushPlusPlan } from './billing.js';
import { getPingPack } from './ping-packs.js';
import { mapCryptoPaymentIntent, type CryptoPaymentIntentRow } from './crypto-payments.js';
import { withCryptoPaymentProgress } from './crypto-payment-progress.js';

const PAGE_SIZE = 20;

export async function loadCryptoOrderHistory(db: DbClient, config: AppConfig, userId: string, before?: string) {
  // Resolve the cursor inside the owner's records. Keep PostgreSQL's timestamp
  // precision and use the ID to make equal creation times deterministic.
  const result = await db.query<CryptoPaymentIntentRow & { entitlement_granted_at: string | Date | null }>(
    `select i.* from crypto_payment_intents i
     where i.user_id = $1
       and ($2::uuid is null or (i.created_at, i.id) < (
         select c.created_at, c.id from crypto_payment_intents c
         where c.id = $2::uuid and c.user_id = $1
       ))
     order by i.created_at desc, i.id desc
     limit $3`,
    [userId, before ?? null, PAGE_SIZE + 1]
  );
  const rows = result.rows.slice(0, PAGE_SIZE);
  const orders = await Promise.all(rows.map(async row => {
    const intent = await withCryptoPaymentProgress(db, config, mapCryptoPaymentIntent(row));
    let name = intent.productType === 'ping_pack' ? 'Pulse' : 'cruush+';
    // Removed historical catalog entries must not hide a member's purchase.
    try {
      name = intent.productType === 'ping_pack' ? getPingPack(intent.planId).name : getCruushPlusPlan(intent.planId).name;
    } catch { /* Keep the product name for historical plans. */ }
    // Only member-facing fields leave this endpoint: no derivation keys,
    // provider metadata, internal notes, or new payment instructions.
    return {
      id: intent.id, name, productType: intent.productType,
      asset: intent.asset, network: intent.network,
      amountUsdCents: intent.amountUsdCents, gasFeeUsdCents: intent.gasFeeUsdCents,
      totalUsdCents: intent.totalUsdCents, quotedAmountAtomic: intent.quotedAmountAtomic,
      status: intent.status === 'awaiting_payment' && new Date(intent.expiresAt).getTime() <= Date.now()
        ? 'expired' as const : intent.status,
      createdAt: intent.createdAt, expiresAt: intent.expiresAt, paidAt: intent.paidAt,
      activatedAt: row.entitlement_granted_at,
      confirmations: intent.confirmations, confirmationTarget: intent.confirmationTarget,
      paymentAmountReceived: intent.paymentAmountReceived
    };
  }));
  return { orders, nextCursor: result.rows.length > PAGE_SIZE ? rows[rows.length - 1].id : null };
}
