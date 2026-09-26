import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { DbClient } from "./db.js";
import { createPool } from "./db.js";
import type { AppConfig } from "./config.js";
import { getPingPack, grantPingPackPurchase, PING_PACKS } from "./ping-packs.js";
import { getSideQuestPingBalance } from "./side-quests.js";

describe("Ping packs", () => {
  it("keeps the approved counts and prices exact", () => {
    expect(PING_PACKS.map((pack) => ({
      id: pack.id,
      pingCount: pack.pingCount,
      amountCents: pack.amountCents
    }))).toEqual([
      { id: "ping_3", pingCount: 3, amountCents: 999 },
      { id: "ping_10", pingCount: 10, amountCents: 2499 },
      { id: "ping_25", pingCount: 25, amountCents: 4999 }
    ]);
    expect(PING_PACKS.map((pack) => pack.name)).toEqual(["3 Pulses", "10 Pulses", "25 Pulses"]);
    expect(() => getPingPack("ping_100")).toThrow(/not available/i);
  });

  it("uses the payment intent as the idempotent grant boundary", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: "purchase-1" }] });
    const pack = getPingPack("ping_25");
    const result = await grantPingPackPurchase(
      { query, end: vi.fn() } as unknown as DbClient,
      {
        userId: "user-1",
        cryptoPaymentIntentId: "intent-1",
        pack
      }
    );

    expect(result).toEqual({ inserted: true, purchaseId: "purchase-1" });
    expect(query.mock.calls[0]?.[0]).toContain("on conflict (crypto_payment_intent_id) do nothing");
    expect(query.mock.calls[0]?.[1]).toEqual([
      "user-1",
      "intent-1",
      "ping_25",
      25,
      4999,
      "USD"
    ]);
  });

  it("preserves the recorded amount when an older paid order settles", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: "purchase-legacy" }] });
    await grantPingPackPurchase(
      { query, end: vi.fn() } as unknown as DbClient,
      {
        userId: "user-legacy",
        cryptoPaymentIntentId: "intent-legacy",
        pack: getPingPack("ping_10"),
        amountCents: 799
      }
    );

    expect(query.mock.calls[0]?.[1]).toEqual([
      "user-legacy",
      "intent-legacy",
      "ping_10",
      10,
      799,
      "USD"
    ]);
  });

  it("combines permanent purchases with earned credits before subtracting bonus-credit uses", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ balance: 12 }] });
    const balance = await getSideQuestPingBalance(
      { query, end: vi.fn() } as unknown as DbClient,
      "user-1"
    );

    expect(balance).toBe(12);
    expect(query.mock.calls[0]?.[0]).toContain("sum(ping_count)");
    expect(query.mock.calls[0]?.[0]).toContain("from ping_pack_purchases");
    expect(query.mock.calls[0]?.[0]).toContain("bonus_credit_used");
  });
});

const realPostgresUrl = process.env.CRUUSH_CRYPTO_ATOMICITY_POSTGRES_URL;

describe.skipIf(!realPostgresUrl)("Ping packs with real PostgreSQL", () => {
  let db: DbClient;
  let userId: string;
  let paymentIntentId: string;

  beforeAll(async () => {
    const databaseName = new URL(realPostgresUrl!).pathname.slice(1);
    if (!/^cruush_crypto_atomicity(?:_[a-z0-9]+)*$/.test(databaseName)) {
      throw new Error("CRUUSH_CRYPTO_ATOMICITY_POSTGRES_URL must name a disposable crypto-atomicity database.");
    }

    db = createPool({ DATABASE_URL: realPostgresUrl! } as AppConfig);
    const user = await db.query<{ id: string }>(
      `insert into app_users (email, password_hash)
       values ('crypto-atomicity-ping-pack@example.test', 'test-hash')
       returning id::text as id`
    );
    userId = user.rows[0]!.id;
    const intent = await db.query<{ id: string }>(
      `insert into crypto_payment_intents (
         user_id, plan_id, product_type, asset, network, amount_usd_cents,
         quoted_amount_atomic, confirmed_amount_atomic, wallet_xpub_fingerprint,
         status, idempotency_key, paid_at
       ) values (
         $1, 'ping_10', 'ping_pack', 'USDC', 'arbitrum', 2499,
         '24990000', '24990000', $2, 'paid', 'ping-pack-postgres', now()
       )
       returning id::text as id`,
      [userId, "a".repeat(64)]
    );
    paymentIntentId = intent.rows[0]!.id;
  });

  afterAll(async () => {
    if (db && userId) {
      await db.query("delete from app_users where id = $1", [userId]);
      await db.end();
    }
  });

  it("persists one permanent grant and counts it once", async () => {
    const pack = getPingPack("ping_10");
    const first = await grantPingPackPurchase(db, {
      userId,
      cryptoPaymentIntentId: paymentIntentId,
      pack
    });
    const replay = await grantPingPackPurchase(db, {
      userId,
      cryptoPaymentIntentId: paymentIntentId,
      pack
    });

    expect(first.inserted).toBe(true);
    expect(replay).toEqual({ inserted: false, purchaseId: null });
    expect(await getSideQuestPingBalance(db, userId)).toBe(10);
    const count = await db.query<{ count: string }>(
      "select count(*)::text as count from ping_pack_purchases where crypto_payment_intent_id = $1",
      [paymentIntentId]
    );
    expect(count.rows[0]?.count).toBe("1");
  });
});
