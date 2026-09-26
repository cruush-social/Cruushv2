import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { getCruushEntitlement } from "./match-relationships.js";
import { createAppNotification, mapNotificationRow, type AppNotificationRow } from "./notification-service.js";
import { getNotificationPreferences, getVapidPublicKey, isWithinQuietHours, sendPushForNotification } from "./push-service.js";
import {
  buildSubscriptionExpiryEmail,
  sendSubscriptionExpiryEmail,
  type SubscriptionExpiryEmailPayload
} from "./mailer.js";

const DAY_MS = 86_400_000;
type Candidate = { user_id: string; email: string; expires_at: string | Date };
type Reminder = {
  id: string;
  email_delivery_state: "pending" | "provider_accepted" | "reconciliation_required";
  email_idempotency_key: string | null;
  email_payload: SubscriptionExpiryEmailPayload | null;
  email_started_at: string | Date | null;
  email_sent_at: string | Date | null;
  push_done_at: string | Date | null;
};

export function subscriptionReminderDays(expiresAt: string | Date, now = Date.now()): 3 | 1 | null {
  const remaining = new Date(expiresAt).getTime() - now;
  if (remaining <= 0 || remaining > 3 * DAY_MS || !Number.isFinite(remaining)) return null;
  return remaining <= DAY_MS ? 1 : 3;
}

export function subscriptionReminderCopy(expiresAt: string | Date) {
  const date = new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC"
  }).format(new Date(expiresAt));
  return { title: "cruush+ expires soon", body: `Your cruush+ subscription expires on ${date} UTC.` };
}

async function deliverReminder(app: FastifyInstance, candidate: Candidate) {
  const expiresAt = new Date(candidate.expires_at).toISOString();
  const days = subscriptionReminderDays(expiresAt);
  if (!days) return;
  const entitlement = await getCruushEntitlement(app, candidate.user_id);
  if (!entitlement.cruushPlus || entitlement.expiresAt !== expiresAt || entitlement.ownerFullAccess) return;
  const token = randomUUID();
  const claimed = await app.db.query<Reminder>(
    `insert into subscription_expiry_reminders (user_id, expires_at, days_before, claim_token, claimed_until)
     values ($1, $2, $3, $4, now() + interval '5 minutes')
     on conflict (user_id, expires_at, days_before) do update
       set claim_token = excluded.claim_token, claimed_until = excluded.claimed_until
       where subscription_expiry_reminders.claimed_until <= now()
         and (subscription_expiry_reminders.email_sent_at is null or subscription_expiry_reminders.push_done_at is null)
     returning id::text, email_started_at, email_sent_at, push_done_at,
       email_payload, email_idempotency_key, email_delivery_state`,
    [candidate.user_id, expiresAt, days, token]
  );
  const reminder = claimed.rows[0];
  if (!reminder) return;
  const dedupeKey = `subscription-expiry:${expiresAt}:${days}`;
  const copy = subscriptionReminderCopy(expiresAt);
  try {
    const current = await app.db.query<{ email: string }>(
      `select u.email from app_users u join cruush_plus_subscriptions s on s.user_id = u.id
       where u.id = $1 and u.account_status = 'active' and u.email_verified_at is not null
         and s.status = 'active' and s.current_period_ends_at = $2 and s.current_period_ends_at > now()`,
      [candidate.user_id, expiresAt]
    );
    if (!current.rows[0]) return;
    const currentAccess = await getCruushEntitlement(app, candidate.user_id);
    if (currentAccess.expiresAt !== expiresAt || currentAccess.ownerFullAccess) return;
    let notification = await createAppNotification(app, {
      userId: candidate.user_id, type: "subscription_expiring", ...copy,
      linkUrl: "/store", dedupeKey, metadata: { expiresAt, daysBefore: days }
    });
    if (!notification) {
      const existing = await app.db.query<AppNotificationRow>(
        `select * from app_notifications where user_id = $1 and dedupe_key = $2`, [candidate.user_id, dedupeKey]
      );
      if (existing.rows[0]) notification = mapNotificationRow(existing.rows[0]);
    }
    if (!reminder.push_done_at && notification) {
      const preferences = await getNotificationPreferences(app, candidate.user_id);
      const subscribed = await app.db.query(
        `select id from push_subscriptions where user_id = $1 and revoked_at is null limit 1`, [candidate.user_id]
      );
      let done = !preferences.pushEnabled || !subscribed.rows.length;
      if (!done && getVapidPublicKey(app.config).enabled && !isWithinQuietHours(preferences)) {
        const result = await sendPushForNotification(app, notification);
        done = result.sent > 0;
      }
      if (done) await app.db.query(
        `update subscription_expiry_reminders set push_done_at = now() where id = $1 and claim_token = $2`,
        [reminder.id, token]
      );
    }
    if (!reminder.email_sent_at && app.config.RESEND_API_KEY && app.config.MAIL_FROM) {
      // Resend retains keys for 24h; older ambiguous sends need reconciliation.
      if (reminder.email_started_at && Date.now() - new Date(reminder.email_started_at).getTime() >= 23 * 60 * 60 * 1000) {
        await app.db.query(
          `update subscription_expiry_reminders
           set email_delivery_state = 'reconciliation_required',
               email_reconciliation_required_at = coalesce(email_reconciliation_required_at, now())
           where id = $1 and claim_token = $2 and email_sent_at is null`,
          [reminder.id, token]
        );
        app.log.warn({ reminderId: reminder.id }, "subscription email needs delivery reconciliation");
        return;
      }
      const emailAccess = await getCruushEntitlement(app, candidate.user_id);
      if (emailAccess.expiresAt !== expiresAt || emailAccess.ownerFullAccess) return;
      const proposedPayload = buildSubscriptionExpiryEmail({
        body: copy.body,
        email: current.rows[0].email,
        from: app.config.MAIL_FROM,
        title: copy.title
      });
      const frozen = await app.db.query<Pick<Reminder, "email_idempotency_key" | "email_payload">>(
        `update subscription_expiry_reminders
         set email_started_at = coalesce(email_started_at, now()),
             email_payload = coalesce(email_payload, $3::jsonb),
             email_idempotency_key = coalesce(email_idempotency_key, $4)
         where id = $1 and claim_token = $2 and email_sent_at is null
         returning email_payload, email_idempotency_key`,
        [reminder.id, token, JSON.stringify(proposedPayload), `subscription-expiry/${reminder.id}`]
      );
      const emailPayload = frozen.rows[0]?.email_payload;
      const idempotencyKey = frozen.rows[0]?.email_idempotency_key;
      if (!emailPayload || !idempotencyKey) return;
      const delivery = await sendSubscriptionExpiryEmail({
        config: app.config,
        idempotencyKey,
        logger: app.log,
        payload: emailPayload
      });
      if (delivery.accepted) await app.db.query(
        `update subscription_expiry_reminders
         set email_sent_at = now(), email_delivery_state = 'provider_accepted',
             email_provider_message_id = $3
         where id = $1 and claim_token = $2`,
        [reminder.id, token, delivery.providerMessageId]
      );
    }
  } finally {
    await app.db.query(
      `update subscription_expiry_reminders set claimed_until = now() where id = $1 and claim_token = $2`,
      [reminder.id, token]
    );
  }
}

export async function sendSubscriptionExpiryReminders(app: FastifyInstance) {
  let cursor = "00000000-0000-0000-0000-000000000000";
  let processed = 0;
  for (;;) {
    const candidates = await app.db.query<Candidate>(
      `select u.id::text as user_id, u.email, s.current_period_ends_at as expires_at
       from cruush_plus_subscriptions s join app_users u on u.id = s.user_id
       where u.id > $1 and u.account_status = 'active' and u.email_verified_at is not null
         and s.status = 'active' and s.current_period_ends_at > now()
         and s.current_period_ends_at <= now() + interval '3 days'
         and not exists (select 1 from cruush_plus_lifetime_access l where l.user_id = u.id)
         and not exists (select 1 from promotional_cruush_plus_entitlements p where p.user_id = u.id and p.banked_seconds > 0)
       order by u.id limit 200`, [cursor]
    );
    for (const candidate of candidates.rows) {
      try { await deliverReminder(app, candidate); processed += 1; }
      catch { app.log.warn({ userId: candidate.user_id }, "subscription reminder delivery failed; will retry"); }
    }
    if (candidates.rows.length < 200) break;
    cursor = candidates.rows[candidates.rows.length - 1].user_id;
  }
  return processed;
}

export function startSubscriptionExpiryScheduler(app: FastifyInstance, intervalMs = 15 * 60 * 1000) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await sendSubscriptionExpiryReminders(app); }
    catch { app.log.error("subscription expiry sweep failed"); }
    finally { running = false; }
  };
  const timer = setInterval(() => { void run(); }, intervalMs);
  timer.unref();
  void run();
  return () => clearInterval(timer);
}
