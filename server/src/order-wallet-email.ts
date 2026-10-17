import { mapCryptoPaymentIntent, type CryptoPaymentIntentRow } from "./crypto-payments.js";
import { CRUUSH_PLUS_PLANS } from "./billing.js";
import { PING_PACKS } from "./ping-packs.js";
import { createHash, randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { buildOrderWalletReadyEmail, sendOrderWalletReadyEmail } from "./mailer.js";

type Pending = CryptoPaymentIntentRow & { intent_id: string; email: string; product_type: string; plan_id: string;
  first_attempt_at: string | Date | null; delivery_hash: string | null };

export async function sendPendingOrderWalletEmails(app: FastifyInstance) {
  if (!app.config.RESEND_API_KEY || !app.config.MAIL_FROM) return 0;
  const token = randomUUID();
  const result = await app.db.query<Pending>(
    `with candidates as (
       select e.intent_id from order_wallet_ready_emails e
       join crypto_payment_intents i on i.id = e.intent_id join app_users u on u.id = i.user_id
       where e.sent_at is null and not e.reconciliation_required and e.claimed_until <= now()
         and i.status = 'awaiting_payment' and i.payment_address is not null and i.expires_at > now()
         and u.account_status = 'active' and u.email_verified_at is not null
       order by e.claimed_until limit 20 for update of e skip locked
     ), claimed as (
       update order_wallet_ready_emails e set claim_token = $1, claimed_until = now() + interval '10 minutes'
       from candidates c where e.intent_id = c.intent_id returning e.*
     ) select c.intent_id, c.first_attempt_at, c.delivery_hash, u.email, i.*, i.expires_at::text as expires_at
       from claimed c join crypto_payment_intents i on i.id = c.intent_id
       join app_users u on u.id = i.user_id`, [token]);
  let sent = 0;
  for (const row of result.rows) {
    let content: ReturnType<typeof buildOrderWalletReadyEmail>;
    try {
      const intent = mapCryptoPaymentIntent(row);
      const planName = (row.product_type === 'ping_pack' ? PING_PACKS : CRUUSH_PLUS_PLANS).find(plan => plan.id === row.plan_id)?.name ?? row.plan_id;
      content = buildOrderWalletReadyEmail(app.config.APP_URL, row.product_type, row.plan_id, { ...intent, planName });
    } catch {
      app.log.warn("Order wallet email has incomplete payment details; delivery deferred.");
      continue;
    }
    // Detect changed recipients/content without storing personal data in the queue.
    const hash = createHash("sha256").update(JSON.stringify({ email: row.email, from: app.config.MAIL_FROM, ...content })).digest("hex");
    if ((row.delivery_hash && row.delivery_hash !== hash)
      || (row.first_attempt_at && Date.now() - new Date(row.first_attempt_at).getTime() >= 23 * 60 * 60 * 1000)) {
      await app.db.query(`update order_wallet_ready_emails set reconciliation_required = true where intent_id = $1 and claim_token = $2`, [row.intent_id, token]);
      continue;
    }
    try {
      const ready = await app.db.query(
        `update order_wallet_ready_emails e set first_attempt_at = coalesce(first_attempt_at, now()), delivery_hash = $3
         from crypto_payment_intents i, app_users u
         where e.intent_id = $1 and e.claim_token = $2 and e.sent_at is null and e.claimed_until > now()
           and i.id = e.intent_id and u.id = i.user_id and u.email = $4
           and u.account_status = 'active' and u.email_verified_at is not null
           and i.status = 'awaiting_payment' and i.expires_at > now()
           and i.payment_address = $5 and i.quoted_amount_atomic = $6 and i.asset = $7 and i.network = $8
           and i.metadata = $9::jsonb and i.expires_at = $10 and i.amount_usd_cents = $11
           and i.plan_id = $12 and i.product_type = $13
         returning e.intent_id`, [row.intent_id, token, hash, row.email, row.payment_address, row.quoted_amount_atomic, row.asset, row.network, JSON.stringify(row.metadata), row.expires_at, row.amount_usd_cents, row.plan_id, row.product_type]);
      if (!ready.rows.length) continue;
      const delivery = await sendOrderWalletReadyEmail({ config: app.config, logger: app.log,
        email: row.email, idempotencyKey: `order-wallet-ready/${row.intent_id}`, content });
      if (delivery.accepted) {
        await app.db.query(`update order_wallet_ready_emails set sent_at = now(), provider_message_id = $3
          where intent_id = $1 and claim_token = $2`, [row.intent_id, token, delivery.providerMessageId]);
        sent += 1;
      }
    } catch { app.log.warn("Order wallet email delivery failed; queued for retry."); }
    finally {
      await app.db.query(`update order_wallet_ready_emails set claimed_until = now() + interval '1 minute'
        where intent_id = $1 and claim_token = $2 and sent_at is null`, [row.intent_id, token]);
    }
  }
  return sent;
}

export function startOrderWalletEmailScheduler(app: FastifyInstance, intervalMs = 15_000) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await sendPendingOrderWalletEmails(app); }
    catch { app.log.error("Order wallet email sweep failed."); }
    finally { running = false; }
  };
  const timer = setInterval(() => { void run(); }, intervalMs);
  timer.unref(); void run(); return () => clearInterval(timer);
}
