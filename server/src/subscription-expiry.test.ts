import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { subscriptionReminderCopy, subscriptionReminderDays, sendSubscriptionExpiryReminders } from "./subscription-expiry.js";
import { getCruushEntitlement } from "./match-relationships.js";
import { sendSubscriptionExpiryEmail } from "./mailer.js";
import { getNotificationPreferences, isWithinQuietHours, sendPushForNotification } from "./push-service.js";

vi.mock("./match-relationships.js", () => ({ getCruushEntitlement: vi.fn() }));
vi.mock("./mailer.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("./mailer.js")>(),
  sendSubscriptionExpiryEmail: vi.fn()
}));
vi.mock("./push-service.js", () => ({
  getNotificationPreferences: vi.fn(), isWithinQuietHours: vi.fn(),
  getVapidPublicKey: () => ({ enabled: true }), sendPushForNotification: vi.fn()
}));

const DAY = 86_400_000;
it("uses only the 3-day and 1-day windows and never sends expired reminders", () => {
  const now = Date.now();
  expect(subscriptionReminderDays(new Date(now + 3 * DAY), now)).toBe(3);
  expect(subscriptionReminderDays(new Date(now + DAY + 1), now)).toBe(3);
  expect(subscriptionReminderDays(new Date(now + DAY), now)).toBe(1);
  expect(subscriptionReminderDays(new Date(now), now)).toBeNull();
  expect(subscriptionReminderDays(new Date(now + 3 * DAY + 1), now)).toBeNull();
  expect(subscriptionReminderDays("invalid", now)).toBeNull();
  expect(subscriptionReminderCopy("2026-09-23T16:00:00Z").body).toBe("Your cruush+ subscription expires on Sep 23, 2026, 4:00 PM UTC.");
});

// Opt in with a disposable local PostgreSQL database. SQL constraints and
// concurrent claims are exercised against PostgreSQL, not a query-string mock.
describe.skipIf(!process.env.SUBSCRIPTION_TEST_DATABASE_URL)("subscription reminder delivery", () => {
  const pool = new pg.Pool({ connectionString: process.env.SUBSCRIPTION_TEST_DATABASE_URL, max: 1 });
  const schema = `reminders_${randomUUID().replaceAll("-", "")}`;
  const query = (text: string, params?: unknown[]) => pool.query(text, params);
  const app = { db: { query }, config: { RESEND_API_KEY: "test-only", MAIL_FROM: "test@example.invalid" }, log: { warn: vi.fn(), error: vi.fn() } } as any;
  let expiry: Date;
  let userId: string;
  beforeAll(async () => {
    await query(`create schema ${schema}`);
    await query(`set search_path to ${schema}, public`);
    await query(`
      create table app_users (id uuid primary key, email text, account_status text default 'active', email_verified_at timestamptz default now());
      create table cruush_plus_subscriptions (user_id uuid primary key, status text default 'active', current_period_ends_at timestamptz);
      create table cruush_plus_lifetime_access (user_id uuid primary key);
      create table promotional_cruush_plus_entitlements (user_id uuid, banked_seconds bigint);
      create table push_subscriptions (id uuid default gen_random_uuid(), user_id uuid, revoked_at timestamptz);
      create table app_notifications (id uuid default gen_random_uuid(), user_id uuid, type text, title text, body text,
        link_url text, actor_user_id uuid, conversation_id uuid, dedupe_key text, metadata jsonb, read_at timestamptz, created_at timestamptz default now());
      create unique index notifications_dedupe on app_notifications(user_id, dedupe_key) where dedupe_key is not null;
    `);
    await query(await readFile(new URL("../sql/187_subscription_expiry_reminders.sql", import.meta.url), "utf8"));
    await query(await readFile(new URL("../sql/189_subscription_expiry_email_delivery.sql", import.meta.url), "utf8"));
  });
  afterAll(async () => { await query(`drop schema ${schema} cascade`); await pool.end(); });
  beforeEach(async () => {
    vi.clearAllMocks();
    await query("truncate app_users, cruush_plus_subscriptions, cruush_plus_lifetime_access, promotional_cruush_plus_entitlements, app_notifications, push_subscriptions, subscription_expiry_reminders cascade");
    expiry = new Date(Date.now() + 2.9 * DAY);
    userId = randomUUID();
    await query("insert into app_users(id,email) values($1,'member@example.invalid')", [userId]);
    await query("insert into cruush_plus_subscriptions(user_id,current_period_ends_at) values($1,$2)", [userId, expiry]);
    await query("insert into push_subscriptions(user_id) values($1)", [userId]);
    vi.mocked(getCruushEntitlement).mockResolvedValue({ cruushPlus: true, expiresAt: expiry.toISOString(), ownerFullAccess: false });
    vi.mocked(getNotificationPreferences).mockResolvedValue({ pushEnabled: true } as any);
    vi.mocked(isWithinQuietHours).mockReturnValue(false);
    vi.mocked(sendPushForNotification).mockResolvedValue({ attempted: true, sent: 1 });
    vi.mocked(sendSubscriptionExpiryEmail).mockResolvedValue({ accepted: true, providerMessageId: "email_test_1" });
  });
  it("persists one reminder and sends once across repeated and concurrent sweeps", async () => {
    await Promise.all([sendSubscriptionExpiryReminders(app), sendSubscriptionExpiryReminders(app)]);
    await sendSubscriptionExpiryReminders(app);
    expect(sendPushForNotification).toHaveBeenCalledTimes(1);
    expect(sendSubscriptionExpiryEmail).toHaveBeenCalledTimes(1);
    const rows = (await query("select * from app_notifications")).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: "subscription_expiring", link_url: "/store" });
    expect(rows[0].metadata.daysBefore).toBe(3);
    expect((await query("select email_delivery_state, email_provider_message_id from subscription_expiry_reminders")).rows[0]).toMatchObject({
      email_delivery_state: "provider_accepted", email_provider_message_id: "email_test_1"
    });
  });
  it("retries email failure without repeating in-app or successful push delivery", async () => {
    vi.mocked(sendSubscriptionExpiryEmail).mockRejectedValueOnce(new Error("temporary outage"));
    await sendSubscriptionExpiryReminders(app);
    await sendSubscriptionExpiryReminders(app);
    expect(sendSubscriptionExpiryEmail).toHaveBeenCalledTimes(2);
    expect(vi.mocked(sendSubscriptionExpiryEmail).mock.calls[0][0].idempotencyKey).toBe(vi.mocked(sendSubscriptionExpiryEmail).mock.calls[1][0].idempotencyKey);
    expect(vi.mocked(sendSubscriptionExpiryEmail).mock.calls[0][0].payload).toEqual(vi.mocked(sendSubscriptionExpiryEmail).mock.calls[1][0].payload);
    expect(sendPushForNotification).toHaveBeenCalledTimes(1);
    expect((await query("select * from app_notifications")).rows).toHaveLength(1);
  });
  it("freezes the original email request and stops uncertain retries after 23 hours", async () => {
    vi.mocked(sendSubscriptionExpiryEmail).mockRejectedValueOnce(new Error("ambiguous provider timeout"));
    await sendSubscriptionExpiryReminders(app);
    const firstRequest = vi.mocked(sendSubscriptionExpiryEmail).mock.calls[0][0];
    await query("update app_users set email='changed@example.invalid' where id=$1", [userId]);
    await query("update subscription_expiry_reminders set email_started_at=now()-interval '23 hours 1 minute'");
    vi.mocked(sendSubscriptionExpiryEmail).mockClear();
    await sendSubscriptionExpiryReminders(app);
    expect(sendSubscriptionExpiryEmail).not.toHaveBeenCalled();
    const reminder = (await query("select email_payload, email_idempotency_key, email_delivery_state, email_reconciliation_required_at from subscription_expiry_reminders")).rows[0];
    expect(reminder.email_payload).toEqual(firstRequest.payload);
    expect(reminder.email_idempotency_key).toBe(firstRequest.idempotencyKey);
    expect(reminder.email_delivery_state).toBe("reconciliation_required");
    expect(reminder.email_reconciliation_required_at).not.toBeNull();
  });
  it("defers push during quiet hours, while email and in-app still arrive", async () => {
    vi.mocked(isWithinQuietHours).mockReturnValue(true);
    await sendSubscriptionExpiryReminders(app);
    expect(sendPushForNotification).not.toHaveBeenCalled();
    expect(sendSubscriptionExpiryEmail).toHaveBeenCalledTimes(1);
    vi.mocked(isWithinQuietHours).mockReturnValue(false);
    await sendSubscriptionExpiryReminders(app);
    expect(sendPushForNotification).toHaveBeenCalledTimes(1);
    expect(sendSubscriptionExpiryEmail).toHaveBeenCalledTimes(1);
  });
  it("respects push opt-out without dropping email or in-app", async () => {
    vi.mocked(getNotificationPreferences).mockResolvedValue({ pushEnabled: false } as any);
    await sendSubscriptionExpiryReminders(app);
    expect(sendPushForNotification).not.toHaveBeenCalled();
    expect(sendSubscriptionExpiryEmail).toHaveBeenCalledTimes(1);
    expect((await query("select * from app_notifications")).rows).toHaveLength(1);
  });
  it.each(["lifetime", "banked", "renewed", "inactive", "unverified", "expired"])("skips %s accounts", async (kind) => {
    if (kind === "lifetime") await query("insert into cruush_plus_lifetime_access values($1)", [userId]);
    if (kind === "banked") await query("insert into promotional_cruush_plus_entitlements values($1,86400)", [userId]);
    if (kind === "renewed") vi.mocked(getCruushEntitlement).mockResolvedValue({ cruushPlus: true, expiresAt: new Date(Date.now() + 30 * DAY).toISOString(), ownerFullAccess: false });
    if (kind === "inactive") await query("update app_users set account_status='deleted'");
    if (kind === "unverified") await query("update app_users set email_verified_at=null");
    if (kind === "expired") await query("update cruush_plus_subscriptions set current_period_ends_at=now()-interval '1 second'");
    await sendSubscriptionExpiryReminders(app);
    expect(sendSubscriptionExpiryEmail).not.toHaveBeenCalled();
    expect(sendPushForNotification).not.toHaveBeenCalled();
    expect((await query("select * from app_notifications")).rows).toHaveLength(0);
  });
  it("uses a separate 1-day reminder for the same expiry", async () => {
    expiry = new Date(Date.now() + 0.9 * DAY);
    await query("update cruush_plus_subscriptions set current_period_ends_at=$1", [expiry]);
    vi.mocked(getCruushEntitlement).mockResolvedValue({ cruushPlus: true, expiresAt: expiry.toISOString(), ownerFullAccess: false });
    await query("insert into subscription_expiry_reminders(user_id,expires_at,days_before,claim_token,claimed_until,email_sent_at,push_done_at) values($1,$2,3,gen_random_uuid(),now(),now(),now())", [userId, expiry]);
    await sendSubscriptionExpiryReminders(app);
    expect(sendSubscriptionExpiryEmail).toHaveBeenCalledTimes(1);
    expect((await query("select metadata from app_notifications")).rows[0].metadata.daysBefore).toBe(1);
  });
});
