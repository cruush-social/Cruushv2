import { DEFAULT_EMAIL_TEMPLATE_VERSION } from "./email-template.js";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { sendWeeklyOrderReportEmail } from "./mailer.js";

type OrderReportRow = {
  source: string;
  order_id: string;
  user_id: string;
  account_email: string;
  product_type: string;
  plan_id: string;
  processor: string;
  asset: string;
  amount_usd_cents: number;
  status: string;
  created_at: string | Date;
  completed_at: string | Date | null;
};

type ClaimedReport = {
  email_started_at: string | Date | null;
  email_template_version: string | null;
  week_start: string | Date;
  week_end: string | Date;
};

function isoDate(value: string | Date) {
  return new Date(value).toISOString().slice(0, 10);
}

export function previousCompletedUtcWeek(now = new Date()) {
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const currentWeekStart = midnight - ((now.getUTCDay() + 6) % 7) * 86_400_000;
  const weekEnd = new Date(currentWeekStart);
  const weekStart = new Date(currentWeekStart - 7 * 86_400_000);
  return { weekStart: isoDate(weekStart), weekEnd: isoDate(weekEnd) };
}

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildWeeklyOrderCsv(rows: OrderReportRow[]) {
  const header = [
    "source", "order_id", "account_id", "account_email", "product_type", "plan_id",
    "processor", "asset", "amount_usd", "status", "created_at", "completed_at"
  ];
  const records = rows.map((row) => [
    row.source,
    row.order_id,
    row.user_id,
    row.account_email,
    row.product_type,
    row.plan_id,
    row.processor,
    row.asset,
    (Number(row.amount_usd_cents) / 100).toFixed(2),
    row.status,
    new Date(row.created_at).toISOString(),
    row.completed_at ? new Date(row.completed_at).toISOString() : ""
  ]);
  return [header, ...records].map((record) => record.map(csvCell).join(",")).join("\n") + "\n";
}

export async function sendPreviousWeekOrderReport(app: FastifyInstance, now = new Date()) {
  const { weekStart, weekEnd } = previousCompletedUtcWeek(now);
  const claimToken = randomUUID();
  const claimed = await app.db.query<ClaimedReport>(
    `insert into weekly_order_reports (week_start, week_end, claim_token, claimed_until)
     values ($1::date, $2::date, $3, now() + interval '15 minutes')
     on conflict (week_start) do update
       set claim_token = excluded.claim_token,
           claimed_until = excluded.claimed_until,
           updated_at = now()
       where weekly_order_reports.email_sent_at is null
         and coalesce(weekly_order_reports.claimed_until, '-infinity'::timestamptz) <= now()
     returning week_start, week_end, email_started_at, email_template_version`,
    [weekStart, weekEnd, claimToken]
  );
  if (!claimed.rows[0]) return false;

  try {
    if (claimed.rows[0].email_started_at && claimed.rows[0].email_template_version !== DEFAULT_EMAIL_TEMPLATE_VERSION) {
      app.log.warn("Weekly order report needs delivery reconciliation after email template change");
      return false;
    }
    const orders = await app.db.query<OrderReportRow>(
      `select 'crypto' as source,
              intent.id::text as order_id,
              intent.user_id::text as user_id,
              app_user.email as account_email,
              intent.product_type,
              intent.plan_id,
              intent.processor,
              intent.asset,
              intent.amount_usd_cents,
              intent.status,
              intent.created_at,
              intent.paid_at as completed_at
       from crypto_payment_intents intent
       join app_users app_user on app_user.id = intent.user_id
       where intent.created_at >= $1::date and intent.created_at < $2::date
       union all
       select 'test_checkout' as source,
              checkout.id::text as order_id,
              checkout.user_id::text as user_id,
              app_user.email as account_email,
              'cruush_plus' as product_type,
              checkout.plan_id,
              checkout.processor,
              checkout.currency as asset,
              checkout.amount_cents as amount_usd_cents,
              checkout.status,
              checkout.created_at,
              checkout.completed_at
       from billing_checkout_sessions checkout
       join app_users app_user on app_user.id = checkout.user_id
       where checkout.created_at >= $1::date and checkout.created_at < $2::date
       order by created_at, order_id`,
      [weekStart, weekEnd]
    );
    await app.db.query(
      `update weekly_order_reports set email_started_at = coalesce(email_started_at, now()), email_template_version = $3, updated_at = now()
       where week_start = $1::date and claim_token = $2`,
      [weekStart, claimToken, DEFAULT_EMAIL_TEMPLATE_VERSION]
    );
    const delivery = await sendWeeklyOrderReportEmail({
      config: app.config,
      csv: buildWeeklyOrderCsv(orders.rows),
      logger: app.log,
      weekStart,
      weekEnd
    });
    if (!delivery.accepted) return false;
    await app.db.query(
      `update weekly_order_reports
       set email_sent_at = now(), provider_message_id = $3, claimed_until = now(), updated_at = now()
       where week_start = $1::date and claim_token = $2`,
      [weekStart, claimToken, delivery.providerMessageId]
    );
    return true;
  } finally {
    await app.db.query(
      `update weekly_order_reports set claimed_until = now(), updated_at = now()
       where week_start = $1::date and claim_token = $2 and email_sent_at is null`,
      [weekStart, claimToken]
    );
  }
}

export function startWeeklyOrderReportScheduler(app: FastifyInstance, intervalMs = 6 * 60 * 60 * 1000) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await sendPreviousWeekOrderReport(app);
    } catch {
      app.log.error("weekly order report failed; will retry");
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void run(), intervalMs);
  timer.unref();
  void run();
  return () => clearInterval(timer);
}
