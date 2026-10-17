import { walletEmailFixture } from "./order-wallet-email.fixture.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import pg from "pg";
import type { FastifyInstance } from "fastify";
import { buildOrderWalletReadyEmail, sendOrderWalletReadyEmail } from "./mailer.js";
import { sendPendingOrderWalletEmails } from "./order-wallet-email.js";
vi.mock("./mailer.js", async importOriginal => ({ ...await importOriginal<typeof import("./mailer.js")>(), sendOrderWalletReadyEmail: vi.fn() }));
const url = process.env.ORDER_EMAIL_TEST_DATABASE_URL;

describe("wallet-ready copy", () => {
  it("links instructions, security and order history with correct branding", () => {
    const c = buildOrderWalletReadyEmail("https://cruush.app", "cruush_plus", "plus_monthly", walletEmailFixture);
    expect(c.html).toContain("font-family:'Iowan Old Style','Baskerville','Times New Roman',serif;font-style:italic;font-weight:400;");
    for (const target of ["/settings/orders", "/blog/payment-security.html", "/blog/stablecoin-payments.html", "/blog/crypto-first.html"]) expect(c.text).toContain(target);
    expect(c.text).toContain("We’ll remind you before your time expires");
    expect(c.text).toContain("This is not an anonymous payment");
    expect(c.text).toContain("Nothing renews");
  });
  it("does not promise time-expiry reminders for lifetime or Pulse purchases", () => {
    for (const [type, plan] of [["ping_pack", "pulse_10"], ["cruush_plus", "lifetime_founder"]]) {
      expect(buildOrderWalletReadyEmail("https://cruush.app", type, plan, walletEmailFixture).text).not.toContain("We’ll remind you");
    }
  });
});

describe.skipIf(!url)("wallet-ready delivery against Postgres", () => {
  const pool = new pg.Pool({ connectionString: url });
  const userId = "00000000-0000-4000-8000-000000000001";
  const orderId = "00000000-0000-4000-8000-000000000002";
  const app = { db: pool, config: { RESEND_API_KEY: "test", MAIL_FROM: "test@example.invalid", APP_URL: "https://cruush.app" }, log: { warn: vi.fn(), error: vi.fn() } } as unknown as FastifyInstance;
  beforeAll(async () => {
    await pool.query(`create table app_users(id uuid primary key,email text,account_status text,email_verified_at timestamptz);
      create table crypto_payment_intents(id uuid primary key,user_id uuid references app_users,product_type text,plan_id text,status text,payment_address text,expires_at timestamptz, asset text default 'PYUSD', network text default 'arbitrum', amount_usd_cents integer default 1899, quoted_amount_atomic text default '19090000', created_at timestamptz default now(), metadata jsonb default '{"sendingApp":"paypal","collectionFee":{"feeUsdCents":10}}');`);
    await pool.query(await readFile(new URL("../sql/231_order_wallet_ready_email.sql", import.meta.url), "utf8"));
  });
  beforeEach(async () => {
    vi.mocked(sendOrderWalletReadyEmail).mockReset().mockResolvedValue({ accepted: true, providerMessageId: "test-message" });
    await pool.query("truncate app_users, crypto_payment_intents, order_wallet_ready_emails cascade");
    await pool.query("insert into app_users values($1,'member@example.invalid','active',now())", [userId]);
    await pool.query("insert into crypto_payment_intents(id,user_id,product_type,plan_id,status,payment_address,expires_at) values($1,$2,'cruush_plus','plus_monthly','awaiting_payment','synthetic-address',now()+interval '30 minutes')", [orderId,userId]);
    await pool.query("insert into order_wallet_ready_emails(intent_id) values($1)", [orderId]);
  });
  afterAll(async () => { await pool.end(); });
  it("sends once across concurrent workers and subsequent sweeps", async () => {
    await Promise.all([sendPendingOrderWalletEmails(app), sendPendingOrderWalletEmails(app)]);
    await sendPendingOrderWalletEmails(app);
    expect(sendOrderWalletReadyEmail).toHaveBeenCalledTimes(1);
    const content = vi.mocked(sendOrderWalletReadyEmail).mock.calls[0][0].content;
    expect(content.text).toContain(`Order ID: ${orderId}`);
    expect(content.text).toContain('Send exactly: 19.09 PYUSD');
    expect(content.text).toContain('Payment wallet ID: synthetic-address');
    expect(content.text).toContain('Open PayPal:');
    expect((await pool.query("select sent_at,provider_message_id from order_wallet_ready_emails")).rows[0]).toEqual({ sent_at: expect.any(Date),provider_message_id:"test-message" });
  });
  it("retries ambiguous failures using the same content and key", async () => {
    vi.mocked(sendOrderWalletReadyEmail).mockRejectedValueOnce(new Error("timeout"));
    await sendPendingOrderWalletEmails(app);
    await pool.query("update order_wallet_ready_emails set claimed_until=now()");
    await sendPendingOrderWalletEmails(app);
    const calls=vi.mocked(sendOrderWalletReadyEmail).mock.calls;
    expect(calls).toHaveLength(2); expect(calls[0][0].idempotencyKey).toBe(calls[1][0].idempotencyKey); expect(calls[0][0].content).toEqual(calls[1][0].content);
  });
  it("does not resend changed payment details under an uncertain delivery key", async () => {
    vi.mocked(sendOrderWalletReadyEmail).mockRejectedValueOnce(new Error("timeout"));
    await sendPendingOrderWalletEmails(app);
    await pool.query("update crypto_payment_intents set quoted_amount_atomic='19100000';update order_wallet_ready_emails set claimed_until=now()");
    await sendPendingOrderWalletEmails(app);
    expect(sendOrderWalletReadyEmail).toHaveBeenCalledTimes(1);
    expect((await pool.query("select reconciliation_required from order_wallet_ready_emails")).rows[0].reconciliation_required).toBe(true);
  });
  it("does not resend with a changed recipient after an uncertain attempt", async () => {
    vi.mocked(sendOrderWalletReadyEmail).mockRejectedValueOnce(new Error("timeout"));
    await sendPendingOrderWalletEmails(app);
    await pool.query("update app_users set email='changed@example.invalid';update order_wallet_ready_emails set claimed_until=now()");
    await sendPendingOrderWalletEmails(app);
    expect(sendOrderWalletReadyEmail).toHaveBeenCalledTimes(1);
    expect((await pool.query("select reconciliation_required from order_wallet_ready_emails")).rows[0].reconciliation_required).toBe(true);
  });
  it.each(["cancelled","expired","paid","confirming"])("does not send for %s orders", async status => {
    await pool.query("update crypto_payment_intents set status=$1",[status]);await sendPendingOrderWalletEmails(app);expect(sendOrderWalletReadyEmail).not.toHaveBeenCalled();
  });
  it("does not backfill orders or send to unverified accounts", async () => {
    await pool.query("delete from order_wallet_ready_emails");await sendPendingOrderWalletEmails(app);expect(sendOrderWalletReadyEmail).not.toHaveBeenCalled();
    await pool.query("insert into order_wallet_ready_emails(intent_id) values($1)",[orderId]);await pool.query("update app_users set email_verified_at=null");await sendPendingOrderWalletEmails(app);expect(sendOrderWalletReadyEmail).not.toHaveBeenCalled();
  });
});
