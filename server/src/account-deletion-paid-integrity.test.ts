import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { buildServer } from "./app.js";
import { hashPassword, hashSessionToken, SESSION_COOKIE_NAME } from "./auth.js";
import { assertCryptoPlanCanReserve, getCruushPlusPlan } from "./billing.js";
import { runBitcoinWatcherPass } from "./bitcoin-watcher.js";
import type { BitcoinSource } from "./bitcoin.js";
import { loadConfig } from "./config.js";
import { findCryptoPaymentsByTransactionHash } from "./crypto-reconciliation.js";
import { loadWatchableIntents, settleIntent, type WatchableIntent } from "./crypto-watcher.js";
import { DEFAULT_CRYPTO_SETTLEMENT_POLICY } from "./crypto-settlement-policy.js";
import { createPool, type DbClient } from "./db.js";

const databaseUrl = process.env.CRUUSH_REAL_POSTGRES_URL;
const userId = "e0000000-0000-4000-8000-000000000001";
const intentIds = [
  "e0000000-0000-4000-8000-000000000101",
  "e0000000-0000-4000-8000-000000000102",
  "e0000000-0000-4000-8000-000000000103"
];
const mediaKey = "account-deletion-paid-integrity/photo.enc";
const sessionToken = "account-deletion-paid-integrity-session";
const password = "account-deletion-paid-integrity-password";

describe.skipIf(!databaseUrl)("paid account deletion with real PostgreSQL", () => {
  let db: DbClient;
  let app: ReturnType<typeof buildServer>;

  async function cleanFixtures() {
    await db.query("delete from crypto_payment_collections where intent_id = any($1::uuid[])", [intentIds]);
    await db.query("delete from crypto_payment_intents where id = any($1::uuid[])", [intentIds]);
    await db.query("delete from app_users where id = $1", [userId]);
    await db.query("delete from account_deletion_media_cleanup where object_key = $1", [mediaKey]);
    await db.query("delete from rate_limit_buckets where bucket_key = $1", [`account-delete:user:${userId}`]);
  }

  beforeAll(async () => {
    if (!/^\/cruush_account_deletion_integrity(?:_[a-z0-9]+)*$/.test(new URL(databaseUrl!).pathname)) {
      throw new Error("Use a disposable account-deletion database.");
    }
    const config = loadConfig({
      ...process.env,
      NODE_ENV: "test",
      DATABASE_URL: databaseUrl!,
      SESSION_SECRET: process.env.SESSION_SECRET ?? "account-deletion-paid-integrity-test",
      CORS_ORIGIN: "http://localhost:5173"
    });
    db = createPool(config);
    app = buildServer(config, { db });
    await app.ready();
    await cleanFixtures();
  });

  afterEach(async () => { if (db) await cleanFixtures(); });
  afterAll(async () => { if (app) await app.close(); });

  it("does not reserve founder supply for retained confirming or paid history after deletion", async () => {
    await db.query(`insert into crypto_payment_intents (
      id, user_id, plan_id, amount_usd_cents, wallet_xpub_fingerprint, status,
      idempotency_key, confirmed_amount_atomic
    ) values
      ($1, null, 'founder_annual', 2999, $3, 'confirming', 'deleted-founder-confirming', null),
      ($2, null, 'founder_annual', 2999, $3, 'paid', 'deleted-founder-paid', '29990000')`,
    [intentIds[0], intentIds[1], "f".repeat(64)]);
    const query = vi.spyOn(db, "query");
    try {
      await assertCryptoPlanCanReserve(db, getCruushPlusPlan("founder_annual"));
      const reservationIndex = query.mock.calls.findIndex(([sql]) => sql.includes("as reservation_count"));
      const result = await query.mock.results[reservationIndex]?.value;
      expect(result.rows[0]).toEqual({ reservation_count: 0 });
    } finally {
      query.mockRestore();
    }
    expect((await db.query("select count(*)::integer as count from crypto_payment_intents where id = any($1::uuid[])", [intentIds])).rows[0])
      .toEqual({ count: 2 });
  });

  it.each(["waiting", "signed", "broadcast", "confirmed"])(
    "deletes account content while retaining a %s collection and unlinked payment evidence",
    async (collectionStatus) => {
      await db.query("insert into app_users (id, email, password_hash) values ($1, $2, $3)",
        [userId, "account-deletion-paid@example.test", await hashPassword(password)]);
      await db.query("insert into app_sessions (user_id, token_hash, expires_at) values ($1, $2, now() + interval '1 day')",
        [userId, hashSessionToken(sessionToken)]);
      await db.query("insert into profiles (id, display_name) values ($1, 'Paid deletion fixture')", [userId]);
      await db.query("insert into posts (user_id, content, expires_in, expires_at) values ($1, 'Delete this content.', 'never', '9999-12-31')", [userId]);
      await db.query(`insert into media_objects (
        owner_user_id, surface, object_key, media_type, mime_type, byte_size,
        encrypted_data_key, data_key_nonce, data_key_auth_tag, content_nonce, content_auth_tag, key_version
      ) values ($1, 'profile_photo', $2, 'image', 'image/jpeg', 1, 'test-key', 'test-nonce', 'test-tag', 'test-nonce', 'test-tag', 'v1')`,
      [userId, mediaKey]);
      await db.query(`insert into crypto_payment_intents (
        id, user_id, plan_id, asset, network, amount_usd_cents, quoted_amount_atomic,
        wallet_xpub_fingerprint, payment_address, status, idempotency_key, expires_at,
        watch_start_block, confirmed_amount_atomic, entitlement_granted_at
      ) values
        ($1, $4, 'plus_monthly', 'USDC', 'base', 1899, '18990000', $5, $6, 'paid', 'paid-delete', now() + interval '1 hour', 900, '18990000', now()),
        ($2, $4, 'plus_monthly', 'USDC', 'base', 1899, '18990000', $5, $7, 'confirming', 'pending-delete', now() + interval '1 hour', 900, null, null),
        ($3, $4, 'plus_monthly', 'BTC', 'bitcoin', 1899, '20000', $5, $8, 'confirming', 'btc-delete', now() + interval '1 hour', 100, null, null)`,
      [...intentIds, userId, "f".repeat(64), `0x${"1".repeat(40)}`, `0x${"2".repeat(40)}`, "bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g"]);
      const signedBundle = { fixture: "persisted forwarding transaction" };
      await db.query("insert into crypto_payment_collections (intent_id, status, signed_bundle) values ($1, $2, $3::jsonb)",
        [intentIds[0], collectionStatus, collectionStatus === "waiting" ? null : JSON.stringify(signedBundle)]);
      await db.query(`insert into crypto_payment_transfers (
        intent_id, chain_id, transaction_hash, log_index, block_number, block_hash,
        token_address, from_address, to_address, amount_atomic, confirmations, status
      ) values ($1, 8453, $2, 0, 1000, $3, $4, $5, $6, '18990000', 30, 'confirmed')`,
      [intentIds[0], `0x${"a".repeat(64)}`, `0x${"b".repeat(64)}`, `0x${"3".repeat(40)}`, `0x${"4".repeat(40)}`, `0x${"1".repeat(40)}`]);
      await db.query(`insert into crypto_bitcoin_transfers (intent_id, transaction_hash, output_index, to_address, amount_atomic, status)
        values ($1, $2, 0, $3, 20000, 'observed')`,
      [intentIds[2], "c".repeat(64), "bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g"]);
      await db.query(`insert into cruush_plus_subscriptions (user_id, plan_id, current_period_ends_at, crypto_payment_intent_id)
        values ($1, 'plus_monthly', now() + interval '1 month', $2)`, [userId, intentIds[0]]);

      const response = await app.inject({
        method: "DELETE", url: "/api/auth/me",
        headers: { origin: "http://localhost:5173", cookie: `${SESSION_COOKIE_NAME}=${sessionToken}` },
        payload: { password, confirmation: "DELETE" }
      });
      expect(response.statusCode).toBe(204);

      const remaining = await db.query(`select
        (select count(*)::integer from app_users where id = $1) as accounts,
        (select count(*)::integer from profiles where id = $1) as profiles,
        (select count(*)::integer from posts where user_id = $1) as posts,
        (select count(*)::integer from media_objects where owner_user_id = $1) as media,
        (select count(*)::integer from cruush_plus_subscriptions where user_id = $1) as subscriptions,
        (select count(*)::integer from app_sessions where user_id = $1) as sessions,
        (select count(*)::integer from account_deletion_media_cleanup where object_key = $2) as cleanup`, [userId, mediaKey]);
      expect(remaining.rows[0]).toEqual({ accounts: 0, profiles: 0, posts: 0, media: 0, subscriptions: 0, sessions: 0, cleanup: 0 });
      expect((await db.query("select user_id from crypto_payment_intents where id = any($1::uuid[]) order by id", [intentIds])).rows)
        .toEqual([{ user_id: null }, { user_id: null }, { user_id: null }]);
      expect((await db.query("select status, signed_bundle from crypto_payment_collections where intent_id = $1", [intentIds[0]])).rows[0])
        .toEqual({ status: collectionStatus, signed_bundle: collectionStatus === "waiting" ? null : signedBundle });
      expect((await db.query("select status, amount_atomic from crypto_payment_transfers where intent_id = $1", [intentIds[0]])).rows[0])
        .toEqual({ status: "confirmed", amount_atomic: "18990000" });
      expect((await db.query("select status, amount_atomic::text from crypto_bitcoin_transfers where intent_id = $1", [intentIds[2]])).rows[0])
        .toEqual({ status: "observed", amount_atomic: "20000" });
      const retainedHistory = await findCryptoPaymentsByTransactionHash(db, `0x${"a".repeat(64)}`);
      expect(retainedHistory[0]).toMatchObject({ userId: null, status: "paid", confirmedAmountAtomic: "18990000" });
      expect(retainedHistory[0]?.transfers[0]).toMatchObject({ status: "confirmed", amountAtomic: "18990000" });

      expect(await loadWatchableIntents(db, 8453, DEFAULT_CRYPTO_SETTLEMENT_POLICY)).toEqual([]);
      const staleIntent: WatchableIntent = {
        id: intentIds[1]!, userId, planId: "plus_monthly", status: "confirming",
        paymentAddress: `0x${"2".repeat(40)}`, quotedAmountAtomic: "18990000", rail: "usdc_base",
        watchStartBlock: "900", expiresAt: new Date(Date.now() + 3600000).toISOString()
      };
      expect(await settleIntent({ db }, staleIntent, DEFAULT_CRYPTO_SETTLEMENT_POLICY))
        .toEqual({ settled: false, granted: false, note: null });
      const source: BitcoinSource = {
        head: vi.fn(), blockHash: vi.fn(), feeRate: vi.fn(), transactions: vi.fn(), syncAddresses: vi.fn()
      };
      expect((await runBitcoinWatcherPass({ db, config: app.config }, source)).watchedAddresses).toBe(0);
      expect(source.head).not.toHaveBeenCalled();
      expect(source.transactions).not.toHaveBeenCalled();
      expect((await db.query("select count(*)::integer as count from user_entitlements where user_id = $1", [userId])).rows[0]).toEqual({ count: 0 });
      expect((await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie: `${SESSION_COOKIE_NAME}=${sessionToken}` } })).statusCode).toBe(401);
    }
  );
});
