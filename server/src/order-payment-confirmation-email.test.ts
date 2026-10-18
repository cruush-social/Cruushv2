import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import type { FastifyInstance } from 'fastify';
import { buildOrderPaymentConfirmationEmail, buildOrderWalletReadyEmail, sendOrderPaymentConfirmationEmail } from './mailer.js';
import { sendPendingOrderPaymentConfirmationEmails } from './order-payment-confirmation-email.js';
import { walletEmailFixture } from './order-wallet-email.fixture.js';
vi.mock('./mailer.js', async original => ({ ...await original<typeof import('./mailer.js')>(), sendOrderPaymentConfirmationEmail: vi.fn() }));
const expires = '2027-02-17T19:30:00.123456Z';
describe('payment confirmation copy', () => {
  it('uses the readable plan and actual granted expiry with the time-capsule link', () => {
    const c = buildOrderPaymentConfirmationEmail('https://cruush.app', { id:'synthetic-order', planName:'3 month cruush+', productType:'cruush_plus', amountUsdCents:3597, accessExpiresAt:expires });
    for (const body of [c.text, c.html]) {
      for (const value of ['3 month cruush+', '2027-02-17 19:30:00 UTC', '/rewards', '/settings/orders', '$35.97', 'voluntary refunds']) expect(body).toContain(value);
      expect(body).not.toContain('plus_3_month');
    }
    expect(c.html).toContain('class="glass-panel"');
    expect(c.text).toContain('nothing renews automatically');
    const wallet = buildOrderWalletReadyEmail('https://cruush.app', 'cruush_plus', 'plus_3_month', { ...walletEmailFixture, planName:'3 month cruush+' });
    expect(wallet.text).not.toContain('Plan ID'); expect(wallet.text).not.toContain('plus_3_month');
  });
  it('distinguishes lifetime and Pulse purchases', () => {
    const order = { id:'synthetic',planName:'Lifetime cruush+',productType:'cruush_plus',amountUsdCents:9999,accessExpiresAt:null };
    expect(buildOrderPaymentConfirmationEmail('https://cruush.app', order).text).toContain('does not expire');
    const pulse = buildOrderPaymentConfirmationEmail('https://cruush.app', {...order,productType:'ping_pack',planName:'3 Pulses'});
    expect(pulse.text).toContain('Your Pulses have been added'); expect(pulse.text).not.toContain('lifetime cruush+ access is active');
  });
});
const url = process.env.ORDER_CONFIRMATION_TEST_DATABASE_URL;
describe.skipIf(!url)('payment receipt outbox with Postgres', () => {
  const pool = new pg.Pool({connectionString:url});
  const member = '00000000-0000-4000-8000-000000000001', order = '00000000-0000-4000-8000-000000000002';
  const app = {db:pool,config:{RESEND_API_KEY:'synthetic',MAIL_FROM:'test@example.invalid',APP_URL:'https://cruush.app'},log:{warn:vi.fn(),error:vi.fn()}} as unknown as FastifyInstance;
  beforeAll(async () => {
    await pool.query(`create table app_users(id uuid primary key,email text,account_status text,email_verified_at timestamptz);
      create table crypto_payment_intents(id uuid primary key,user_id uuid references app_users,product_type text,plan_id text,status text,entitlement_granted_at timestamptz,expires_at timestamptz,amount_usd_cents integer);
      create table cruush_plus_subscriptions(user_id uuid,crypto_payment_intent_id uuid,current_period_ends_at timestamptz);
      create table cruush_plus_lifetime_access(user_id uuid,crypto_payment_intent_id uuid);`);
    await pool.query(await readFile(new URL('../sql/233_order_payment_confirmation_email.sql',import.meta.url),'utf8'));
  });
  beforeEach(async () => {
    vi.mocked(sendOrderPaymentConfirmationEmail).mockReset().mockResolvedValue({accepted:true,providerMessageId:'synthetic-message'});
    await pool.query('truncate app_users,crypto_payment_intents,cruush_plus_subscriptions,cruush_plus_lifetime_access,order_payment_confirmation_emails cascade');
    await pool.query("insert into app_users values($1,'member@example.invalid','active',now())",[member]);
    await pool.query("insert into crypto_payment_intents values($1,$2,'cruush_plus','plus_3_month','confirming',null,now(),3597)",[order,member]);
    await pool.query('insert into cruush_plus_subscriptions values($1,$2,$3)',[member,order,expires]);
  });
  afterAll(async()=>{await pool.end();});
  const activate = () => pool.query("update crypto_payment_intents set status='paid',entitlement_granted_at=now() where id=$1",[order]);
  it('queues only activated payments, snapshots expiry, and sends once across workers',async()=>{
    await sendPendingOrderPaymentConfirmationEmails(app); expect(sendOrderPaymentConfirmationEmail).not.toHaveBeenCalled();
    await activate(); await activate();
    await pool.query("update cruush_plus_subscriptions set current_period_ends_at='2027-05-17'");
    await Promise.all([sendPendingOrderPaymentConfirmationEmails(app),sendPendingOrderPaymentConfirmationEmails(app)]);
    await sendPendingOrderPaymentConfirmationEmails(app);
    expect(sendOrderPaymentConfirmationEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendOrderPaymentConfirmationEmail).mock.calls[0][0].content.text).toContain('2027-02-17 19:30:00 UTC');
    expect((await pool.query('select sent_at from order_payment_confirmation_emails')).rows[0].sent_at).toBeInstanceOf(Date);
  });
  it('rolls back the queued receipt with a failed activation transaction',async()=>{
    const client=await pool.connect();try {await client.query('begin');await client.query("update crypto_payment_intents set status='paid',entitlement_granted_at=now()");await client.query('rollback');}finally{client.release();}
    expect((await pool.query('select * from order_payment_confirmation_emails')).rows).toHaveLength(0);
  });
  it('retries with the same idempotency key',async()=>{
    await activate(); vi.mocked(sendOrderPaymentConfirmationEmail).mockRejectedValueOnce(new Error('timeout'));
    await sendPendingOrderPaymentConfirmationEmails(app);await pool.query('update order_payment_confirmation_emails set claimed_until=now()');
    await sendPendingOrderPaymentConfirmationEmails(app);
    const calls=vi.mocked(sendOrderPaymentConfirmationEmail).mock.calls;
    expect(calls).toHaveLength(2);expect(calls[1][0].idempotencyKey).toBe(calls[0][0].idempotencyKey);
  });
  it('blocks changed-recipient retries',async()=>{
    await activate(); vi.mocked(sendOrderPaymentConfirmationEmail).mockRejectedValueOnce(new Error('timeout'));
    await sendPendingOrderPaymentConfirmationEmails(app);
    await pool.query("update app_users set email='changed@example.invalid';update order_payment_confirmation_emails set claimed_until=now()");
    await sendPendingOrderPaymentConfirmationEmails(app);expect(sendOrderPaymentConfirmationEmail).toHaveBeenCalledTimes(1);
    expect((await pool.query('select reconciliation_required from order_payment_confirmation_emails')).rows[0].reconciliation_required).toBe(true);
  });
  it('does not send refunded orders or backfill previously activated orders',async()=>{
    await activate();await pool.query("update crypto_payment_intents set status='refunded'");
    await sendPendingOrderPaymentConfirmationEmails(app);expect(sendOrderPaymentConfirmationEmail).not.toHaveBeenCalled();
    await pool.query('delete from order_payment_confirmation_emails');
    await pool.query(await readFile(new URL('../sql/233_order_payment_confirmation_email.sql',import.meta.url),'utf8'));
    expect((await pool.query('select * from order_payment_confirmation_emails')).rows).toHaveLength(0);
  });
  it('requires real lifetime evidence when there is no expiry',async()=>{
    await pool.query('delete from cruush_plus_subscriptions');await activate();
    expect((await pool.query('select * from order_payment_confirmation_emails')).rows).toHaveLength(0);
    await pool.query('update crypto_payment_intents set entitlement_granted_at=null');
    await pool.query('insert into cruush_plus_lifetime_access values($1,$2)',[member,order]);await activate();
    expect((await pool.query('select access_expires_at from order_payment_confirmation_emails')).rows).toEqual([{access_expires_at:null}]);
  });
});
