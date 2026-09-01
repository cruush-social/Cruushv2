import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "./config.js";
import { createPool, runTransaction, type DbClient } from "./db.js";
import {
  CRUUSH_PLUS_PLANS,
  completeFakeCheckoutSession,
  getCruushPlusPlan,
  grantCruushPlusPlan
} from "./billing.js";
import {
  CRYPTO_OPEN_INTENT_LIMIT_PER_USER,
  CRYPTO_PAYMENT_RAILS,
  createInHouseCryptoPaymentIntent,
  loadCurrentOpenCryptoPaymentIntent,
  type CryptoPaymentIntentRow
} from "./crypto-payments.js";
import {
  CRYPTO_LATE_EVIDENCE_WINDOW_DAYS,
  DEFAULT_CRYPTO_SETTLEMENT_POLICY
} from "./crypto-settlement-policy.js";
import { fingerprintCryptoWalletXpub } from "./crypto-wallet.js";
import { settleIntent } from "./crypto-watcher.js";

const { bankPromotionMock } = vi.hoisted(() => ({
  bankPromotionMock: vi.fn()
}));

vi.mock("./rewards-service.js", () => ({
  bankActivePromotionForPaidSubscription: bankPromotionMock
}));

const receiveChainXpub = "xpub6FHa3pjLCk84BayeJxFW2SP4XRrFd1JYnxeLeU8EqN3vDfZmbqBqaGJAyiLjTAwm6ZLRQUMv1ZACTj37sR62cfN7fe5JnJ7dh8zL4fiyLHV";
const walletFingerprint = fingerprintCryptoWalletXpub(receiveChainXpub);
const userId = "91000000-0000-4000-8000-000000000001";

function cryptoConfig(): AppConfig {
  return {
    CRYPTO_PROCESSOR_ENABLED: true,
    CRYPTO_PROCESSOR_WALLET_XPUB: receiveChainXpub,
    CRYPTO_PROCESSOR_WATCHER_ENABLED: true,
    CRYPTO_PROCESSOR_ARBITRUM_RPC_URL: "https://arbitrum.example.test",
    CRYPTO_PROCESSOR_BASE_RPC_URL: "",
    CRYPTO_PROCESSOR_ETHEREUM_RPC_URL: "",
    CRYPTO_PROCESSOR_CONFIRMATION_TARGET: 1,
    CRYPTO_PROCESSOR_INTENT_TTL_MINUTES: 30
  } as AppConfig;
}

function paymentRow(overrides: Partial<CryptoPaymentIntentRow> = {}): CryptoPaymentIntentRow {
  return {
    id: "92000000-0000-4000-8000-000000000001",
    user_id: userId,
    plan_id: "plus_monthly",
    processor: "in_house",
    asset: "USDC",
    network: "arbitrum",
    amount_usd_cents: 1899,
    quoted_amount_atomic: "18990000",
    derivation_index: 1,
    wallet_xpub_fingerprint: walletFingerprint,
    payment_address: "0x73659c60270d326c06Ac204F1A9C63f889a3D14B",
    status: "awaiting_payment",
    idempotency_key: "atomicity-original",
    metadata: {},
    expires_at: "2030-01-01T00:00:00.000Z",
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    paid_at: null,
    ...overrides
  };
}

function transactionDb(query: DbClient["query"]): DbClient {
  const client = { query, end: vi.fn() } as DbClient;
  return {
    query,
    end: vi.fn(),
    transaction: async <T>(callback: (transactionClient: DbClient) => Promise<T>) => callback(client)
  };
}

describe("crypto purchase atomicity SQL boundaries", () => {
  it("stacks finite crypto time from the later subscription or entitlement end", async () => {
    const stackedEnd = new Date("2030-03-15T00:00:00.000Z");
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (sql.includes("with current_entitlement")) {
        return { rows: [{ current_period_ends_at: stackedEnd }] };
      }
      if (sql.includes("insert into user_entitlements")) {
        return { rows: [{ cruush_plus_enabled: true, cruush_plus_expires_at: stackedEnd }] };
      }
      return { rows: [] };
    }) as DbClient["query"];

    const result = await grantCruushPlusPlan(
      { db: { query } } as FastifyInstance,
      userId,
      getCruushPlusPlan("plus_monthly"),
      { kind: "crypto_payment_intent", intentId: "92000000-0000-4000-8000-000000000010" }
    );

    const subscriptionSql = String(
      vi.mocked(query).mock.calls.find(([sql]) => String(sql).includes("with current_entitlement"))?.[0]
    );
    expect(subscriptionSql).toContain("greatest(");
    expect(subscriptionSql).toContain("cruush_plus_subscriptions.current_period_ends_at");
    expect(subscriptionSql).toContain("select cruush_plus_expires_at from current_entitlement");
    expect(subscriptionSql).toContain("make_interval(months => $4::integer, days => $5::integer)");
    expect(result.expiresAt).toBe(stackedEnd.toISOString());
  });

  it("leaves fake checkout replacement semantics unchanged", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("insert into user_entitlements")) {
        return { rows: [{ cruush_plus_enabled: true, cruush_plus_expires_at: "2026-10-01T00:00:00.000Z" }] };
      }
      return { rows: [] };
    }) as DbClient["query"];

    await grantCruushPlusPlan(
      { db: { query } } as FastifyInstance,
      userId,
      getCruushPlusPlan("plus_monthly"),
      { kind: "checkout_session", sessionId: "93000000-0000-4000-8000-000000000001", testMode: true }
    );

    const subscriptionCall = vi.mocked(query).mock.calls.find(([sql]) =>
      String(sql).includes("insert into cruush_plus_subscriptions")
    );
    expect(String(subscriptionCall?.[0])).not.toContain("make_interval");
    expect(subscriptionCall?.[1]?.[1]).toBe("93000000-0000-4000-8000-000000000001");
    expect(subscriptionCall?.[1]?.[5]).toBe(true);
  });

  it("completes a fake lifetime checkout under the shared user lock inside one transaction", async () => {
    const checkoutSessionId = "93000000-0000-4000-8000-000000000002";
    const rootQuery = vi.fn();
    const transactionQuery = vi.fn(async (sql: string) => {
      if (sql.includes("from billing_checkout_sessions")) {
        return { rows: [{
          id: checkoutSessionId,
          user_id: userId,
          plan_id: "lifetime_founder",
          processor: "fake",
          status: "pending",
          test_mode: true,
          amount_cents: 99999,
          currency: "USD"
        }] };
      }
      if (sql.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (sql.includes("insert into cruush_plus_lifetime_access")) {
        return { rows: [{ user_id: userId }] };
      }
      if (sql.includes("insert into user_entitlements")) {
        return { rows: [{ cruush_plus_enabled: true, cruush_plus_expires_at: null }] };
      }
      return { rows: [] };
    }) as DbClient["query"];
    const transaction = vi.fn(async <T>(callback: (client: DbClient) => Promise<T>) => callback({
      query: transactionQuery,
      end: vi.fn()
    }));
    const app = {
      config: { BILLING_TEST_CHECKOUT_ENABLED: true },
      db: { query: rootQuery, end: vi.fn(), transaction }
    } as unknown as FastifyInstance;

    await completeFakeCheckoutSession(app, userId, checkoutSessionId);

    const calls = vi.mocked(transactionQuery).mock.calls.map(([sql]) => String(sql));
    const lockIndex = calls.findIndex((sql) => sql.includes("pg_advisory_xact_lock"));
    const lifetimeGrantIndex = calls.findIndex((sql) => sql.includes("insert into cruush_plus_lifetime_access"));
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(rootQuery).not.toHaveBeenCalled();
    expect(lockIndex).toBeGreaterThan(calls.findIndex((sql) => sql.includes("update billing_checkout_sessions")));
    expect(lifetimeGrantIndex).toBeGreaterThan(lockIndex);
    expect(calls[lifetimeGrantIndex]).toContain("status in ('pending', 'awaiting_payment')");
    expect(calls[lifetimeGrantIndex]).not.toContain("'confirming'");
  });

  it("never overwrites an existing lifetime grant from a second crypto payment", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (sql.includes("as reserved")) return { rows: [{ reserved: true }] };
      if (sql.includes("reservation_count")) return { rows: [{ reservation_count: 1 }] };
      if (sql.includes("insert into cruush_plus_lifetime_access")) return { rows: [] };
      throw new Error(`unexpected query: ${sql}`);
    }) as DbClient["query"];

    await expect(grantCruushPlusPlan(
      { db: { query } } as FastifyInstance,
      userId,
      getCruushPlusPlan("lifetime_founder"),
      { kind: "crypto_payment_intent", intentId: "92000000-0000-4000-8000-000000000011" }
    )).rejects.toMatchObject({ statusCode: 409, code: "VALIDATION_ERROR" });

    expect(vi.mocked(query).mock.calls.some(([sql]) =>
      String(sql).includes("on conflict (user_id) do nothing")
    )).toBe(true);
    expect(vi.mocked(query).mock.calls.some(([sql]) =>
      String(sql).includes("insert into user_entitlements")
    )).toBe(false);
  });

  it("atomically closes every pending or awaiting crypto intent after a lifetime grant without touching confirming", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (sql.includes("as reserved")) return { rows: [{ reserved: true }] };
      if (sql.includes("reservation_count")) return { rows: [{ reservation_count: 1 }] };
      if (sql.includes("insert into cruush_plus_lifetime_access")) {
        return { rows: [{ user_id: userId }] };
      }
      if (sql.includes("insert into user_entitlements")) {
        return { rows: [{ cruush_plus_enabled: true, cruush_plus_expires_at: null }] };
      }
      return { rows: [] };
    }) as DbClient["query"];

    await grantCruushPlusPlan(
      { db: { query } } as FastifyInstance,
      userId,
      getCruushPlusPlan("lifetime_founder"),
      { kind: "crypto_payment_intent", intentId: "92000000-0000-4000-8000-000000000019" }
    );

    const lifetimeGrantCall = vi.mocked(query).mock.calls.find(([sql]) =>
      String(sql).includes("insert into cruush_plus_lifetime_access")
    );
    const lifetimeGrantSql = String(lifetimeGrantCall?.[0]);

    expect(lifetimeGrantSql).toContain("closed_unpaid_intents as");
    expect(lifetimeGrantSql).toContain("status in ('pending', 'awaiting_payment')");
    expect(lifetimeGrantSql).not.toContain("status in ('pending', 'awaiting_payment', 'confirming')");
    expect(lifetimeGrantSql).toContain("when status = 'awaiting_payment' then 'expired'");
    expect(lifetimeGrantSql).toContain("Lifetime access was granted before this payment completed");
    expect(lifetimeGrantCall?.[1]).toEqual([
      userId,
      "92000000-0000-4000-8000-000000000019",
      "lifetime_founder"
    ]);
  });

  it("reuses a compatible open intent instead of allocating another address", async () => {
    const existing = paymentRow();
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (sql.includes("set status = 'expired'")) return { rows: [] };
      if (sql.includes("idempotency_key = $2")) return { rows: [] };
      if (sql.includes("wallet_xpub_fingerprint = $4")) return { rows: [existing] };
      if (sql.includes("has_lifetime_access")) return { rows: [{ has_lifetime_access: false }] };
      throw new Error(`unexpected query: ${sql}`);
    }) as DbClient["query"];

    const result = await createInHouseCryptoPaymentIntent(
      transactionDb(query),
      cryptoConfig(),
      {
        userId,
        planId: "plus_monthly",
        amountUsdCents: 1899,
        idempotencyKey: "atomicity-fresh-key"
      }
    );

    expect(result.id).toBe(existing.id);
    expect(vi.mocked(query).mock.calls.some(([sql]) =>
      String(sql).includes("insert into crypto_payment_intents")
    )).toBe(false);
  });

  it.each([
    ["finite", "plus_monthly", 1899, "18990000"],
    ["lifetime", "lifetime_founder", 99999, "999990000"]
  ] as const)("terminalizes an open %s intent if lifetime access arrived before retry", async (
    _kind,
    planId,
    amountUsdCents,
    quotedAmountAtomic
  ) => {
    const existing = paymentRow({
      plan_id: planId,
      amount_usd_cents: amountUsdCents,
      quoted_amount_atomic: quotedAmountAtomic,
      idempotency_key: `atomicity-${planId}-retry`
    });
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (sql.includes("set status = 'expired'")) return { rows: [] };
      if (sql.includes("idempotency_key = $2")) return { rows: [existing] };
      if (sql.includes("has_lifetime_access")) return { rows: [{ has_lifetime_access: true }] };
      if (sql.includes("Lifetime access became active")) {
        return { rows: [{ ...existing, status: "expired" }] };
      }
      throw new Error(`unexpected query: ${sql}`);
    }) as DbClient["query"];

    await expect(createInHouseCryptoPaymentIntent(
      transactionDb(query),
      cryptoConfig(),
      {
        userId,
        planId,
        amountUsdCents,
        idempotencyKey: `atomicity-${planId}-retry`
      }
    )).rejects.toMatchObject({ statusCode: 409, code: "VALIDATION_ERROR" });

    const close = vi.mocked(query).mock.calls.find(([sql]) =>
      String(sql).includes("Lifetime access became active")
    );
    expect(String(close?.[0])).toContain("when status = 'awaiting_payment' then 'expired'");
    expect(vi.mocked(query).mock.calls.some(([sql]) =>
      String(sql).includes("set payment_address = $2")
    )).toBe(false);
  });

  it("keeps a confirming intent settleable after lifetime access arrives", async () => {
    const confirming = paymentRow({
      status: "confirming",
      idempotency_key: "atomicity-confirming-after-lifetime"
    });
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (sql.includes("set status = 'expired'")) return { rows: [] };
      if (sql.includes("idempotency_key = $2")) return { rows: [confirming] };
      throw new Error(`unexpected query: ${sql}`);
    }) as DbClient["query"];

    await expect(createInHouseCryptoPaymentIntent(
      transactionDb(query),
      cryptoConfig(),
      {
        userId,
        planId: "plus_monthly",
        amountUsdCents: 1899,
        idempotencyKey: "atomicity-confirming-after-lifetime"
      }
    )).resolves.toMatchObject({ id: confirming.id, status: "confirming" });

    expect(vi.mocked(query).mock.calls.some(([sql]) =>
      String(sql).includes("Lifetime access became active")
    )).toBe(false);
    expect(vi.mocked(query).mock.calls.some(([sql]) =>
      String(sql).includes("has_lifetime_access")
    )).toBe(false);
  });

  it.each([
    ["finite", "plus_monthly", 1899, "18990000"],
    ["lifetime", "lifetime_founder", 99999, "999990000"]
  ] as const)("preserves the same already-paid %s intent as a terminal idempotent response", async (
    _kind,
    planId,
    amountUsdCents,
    quotedAmountAtomic
  ) => {
    const paid = paymentRow({
      plan_id: planId,
      amount_usd_cents: amountUsdCents,
      quoted_amount_atomic: quotedAmountAtomic,
      status: "paid",
      idempotency_key: `atomicity-${planId}-paid`
    });
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (sql.includes("set status = 'expired'")) return { rows: [] };
      if (sql.includes("idempotency_key = $2")) return { rows: [paid] };
      throw new Error(`unexpected query: ${sql}`);
    }) as DbClient["query"];

    await expect(createInHouseCryptoPaymentIntent(
      transactionDb(query),
      cryptoConfig(),
      {
        userId,
        planId,
        amountUsdCents,
        idempotencyKey: `atomicity-${planId}-paid`
      }
    )).resolves.toMatchObject({ id: paid.id, status: "paid" });

    expect(vi.mocked(query).mock.calls.some(([sql]) =>
      String(sql).includes("has_lifetime_access")
    )).toBe(false);
  });

  it("blocks a fresh finite intent when lifetime access already exists", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (sql.includes("set status = 'expired'")) return { rows: [] };
      if (sql.includes("idempotency_key = $2")) return { rows: [] };
      if (sql.includes("wallet_xpub_fingerprint = $4")) return { rows: [] };
      if (sql.includes("open_count")) {
        return { rows: [{ open_count: 0, has_lifetime_access: true }] };
      }
      throw new Error(`unexpected query: ${sql}`);
    }) as DbClient["query"];

    await expect(createInHouseCryptoPaymentIntent(
      transactionDb(query),
      cryptoConfig(),
      {
        userId,
        planId: "plus_monthly",
        amountUsdCents: 1899,
        idempotencyKey: "atomicity-finite-after-lifetime"
      }
    )).rejects.toMatchObject({ statusCode: 409, code: "VALIDATION_ERROR" });

    expect(vi.mocked(query).mock.calls.some(([sql]) =>
      String(sql).includes("insert into crypto_payment_intents")
    )).toBe(false);
  });

  it("enforces the open-intent cap before reserving an address", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (sql.includes("set status = 'expired'")) return { rows: [] };
      if (sql.includes("idempotency_key = $2")) return { rows: [] };
      if (sql.includes("wallet_xpub_fingerprint = $4")) return { rows: [] };
      if (sql.includes("open_count")) return { rows: [{ open_count: CRYPTO_OPEN_INTENT_LIMIT_PER_USER }] };
      throw new Error(`unexpected query: ${sql}`);
    }) as DbClient["query"];

    await expect(createInHouseCryptoPaymentIntent(
      transactionDb(query),
      cryptoConfig(),
      {
        userId,
        planId: "plus_monthly",
        amountUsdCents: 1899,
        idempotencyKey: "atomicity-over-cap"
      }
    )).rejects.toMatchObject({ statusCode: 409, code: "VALIDATION_ERROR" });

    expect(vi.mocked(query).mock.calls.some(([sql]) =>
      String(sql).includes("insert into crypto_payment_intents")
    )).toBe(false);
  });

  it.each([
    ["founder_annual", 1000],
    ["lifetime_founder", 250]
  ] as const)("blocks sold-out %s before address reservation", async (planId, supplyLimit) => {
    const plan = getCruushPlusPlan(planId);
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (sql.includes("set status = 'expired'")) return { rows: [] };
      if (sql.includes("idempotency_key = $2")) return { rows: [] };
      if (sql.includes("wallet_xpub_fingerprint = $4")) return { rows: [] };
      if (sql.includes("unavailable")) return { rows: [{ unavailable: false }] };
      if (sql.includes("open_count")) return { rows: [{ open_count: 0 }] };
      if (sql.includes("reservation_count")) return { rows: [{ reservation_count: supplyLimit }] };
      throw new Error(`unexpected query: ${sql}`);
    }) as DbClient["query"];

    await expect(createInHouseCryptoPaymentIntent(
      transactionDb(query),
      cryptoConfig(),
      {
        userId,
        planId,
        amountUsdCents: plan.amountCents,
        idempotencyKey: `atomicity-sold-out-${planId}`
      }
    )).rejects.toMatchObject({ statusCode: 409, code: "VALIDATION_ERROR" });

    expect(vi.mocked(query).mock.calls.some(([sql]) =>
      String(sql).includes("insert into crypto_payment_intents")
    )).toBe(false);
    const supplyCall = vi.mocked(query).mock.calls.find(([sql]) =>
      String(sql).includes("reservation_count")
    );
    expect(String(supplyCall?.[0])).toContain("status = 'expired'");
    expect(String(supplyCall?.[0])).toContain(
      "expires_at > now() - ($2::integer * interval '1 day')"
    );
    expect(supplyCall?.[1]).toEqual([planId, CRYPTO_LATE_EVIDENCE_WINDOW_DAYS]);
  });

  it("restores the newest current open intent after expiring stale checkout rows", async () => {
    const current = paymentRow({ status: "confirming" });
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: "expired" }] })
      .mockResolvedValueOnce({ rows: [current] }) as DbClient["query"];

    await expect(loadCurrentOpenCryptoPaymentIntent({ query } as DbClient, userId))
      .resolves.toMatchObject({ id: current.id, status: "confirming" });

    expect(String(vi.mocked(query).mock.calls[0]?.[0])).toContain("set status = 'expired'");
    expect(String(vi.mocked(query).mock.calls[1]?.[0])).toContain(
      "status in ('pending', 'awaiting_payment', 'confirming')"
    );
    expect(String(vi.mocked(query).mock.calls[1]?.[0])).toContain("order by created_at desc");
  });
});

const realPostgresUrl = process.env.CRUUSH_CRYPTO_ATOMICITY_POSTGRES_URL;
const { Pool } = pg;
const candidateA = "94000000-0000-4000-8000-000000000001";
const candidateB = "94000000-0000-4000-8000-000000000002";
const candidateC = "94000000-0000-4000-8000-000000000006";
const capUser = "94000000-0000-4000-8000-000000000003";
const stackUser = "94000000-0000-4000-8000-000000000004";
const lifetimeOwner = "94000000-0000-4000-8000-000000000005";
const lifetimeRaceUser = "94000000-0000-4000-8000-000000000007";
const originSnapshotUser = "94000000-0000-4000-8000-000000000008";
const fixtureUsers = [
  candidateA,
  candidateB,
  candidateC,
  capUser,
  stackUser,
  lifetimeOwner,
  lifetimeRaceUser,
  originSnapshotUser
];

describe.skipIf(!realPostgresUrl)("crypto purchase atomicity with real PostgreSQL", () => {
  let pool: InstanceType<typeof Pool>;
  let db: DbClient;

  async function cleanFixtures() {
    await pool.query(
      `delete from app_users
       where id = any($1::uuid[])
          or email like 'crypto-atomicity-supply-%@example.test'
          or email like 'crypto-atomicity-window-%@example.test'`,
      [fixtureUsers]
    );
  }

  async function cleanSupplyWindowFixtures(scenario: string) {
    await pool.query(
      "delete from app_users where email like $1",
      [`crypto-atomicity-window-${scenario}-%@example.test`]
    );
  }

  async function seedFounderAnnualFinalSlot(scenario: string) {
    await cleanSupplyWindowFixtures(scenario);
    const actors = await pool.query<{ id: string; email: string }>(
      `insert into app_users (email, password_hash)
       select 'crypto-atomicity-window-' || $1 || '-' || actor.role || '@example.test', 'test-hash'
       from unnest(array['reserved', 'later-a', 'later-b']) as actor(role)
       returning id::text, email`,
      [scenario]
    );
    await pool.query(
      `with users as (
         insert into app_users (email, password_hash)
         select 'crypto-atomicity-window-' || $1 || '-supply-' || n || '@example.test', 'test-hash'
         from generate_series(1, 999) as n
         returning id
       )
       insert into founder_redemptions (user_id, plan_id, amount_cents, test_mode)
       select id, 'founder_annual', 9999, false
       from users`,
      [scenario]
    );

    const actorId = (role: string) => actors.rows.find(({ email }) =>
      email === `crypto-atomicity-window-${scenario}-${role}@example.test`
    )?.id;
    const reservedUserId = actorId("reserved");
    const laterUserA = actorId("later-a");
    const laterUserB = actorId("later-b");
    if (!reservedUserId || !laterUserA || !laterUserB) {
      throw new Error("Unable to create limited-plan supply-window fixtures.");
    }

    return { reservedUserId, laterUserA, laterUserB };
  }

  beforeAll(async () => {
    if (!realPostgresUrl) return;
    const databaseName = decodeURIComponent(
      new URL(realPostgresUrl).pathname.split("/").filter(Boolean).pop() ?? ""
    );
    if (!/^cruush_crypto_atomicity(?:_[a-z0-9]+)*$/.test(databaseName)) {
      throw new Error("CRUUSH_CRYPTO_ATOMICITY_POSTGRES_URL must name a disposable crypto-atomicity database.");
    }

    pool = new Pool({ connectionString: realPostgresUrl, max: 12 });
    db = createPool({ DATABASE_URL: realPostgresUrl } as AppConfig);
    await cleanFixtures();
    await pool.query(
      `insert into app_users (id, email, password_hash)
       select fixture.id::uuid, fixture.email, 'test-hash'
       from unnest($1::text[], $2::text[]) as fixture(id, email)`,
      [
        fixtureUsers,
        fixtureUsers.map((_, index) => `crypto-atomicity-candidate-${index}@example.test`)
      ]
    );
  });

  afterAll(async () => {
    if (!pool) return;
    await cleanFixtures();
    await db.end();
    await pool.end();
  });

  it("reuses a concurrent lifetime purchase and serializes the final slot and grant guard", async () => {
    await pool.query(
      `with users as (
         insert into app_users (email, password_hash)
         select 'crypto-atomicity-supply-' || n || '@example.test', 'test-hash'
         from generate_series(1, 248) as n
         returning id
       )
       insert into founder_redemptions (user_id, plan_id, amount_cents, test_mode)
       select id, 'lifetime_founder', 99999, false
       from users`
    );

    const duplicate = await Promise.all([
      createInHouseCryptoPaymentIntent(db, cryptoConfig(), {
        userId: candidateA,
        planId: "lifetime_founder",
        amountUsdCents: 99999,
        idempotencyKey: "atomicity-duplicate-lifetime-a"
      }),
      createInHouseCryptoPaymentIntent(db, cryptoConfig(), {
        userId: candidateA,
        planId: "lifetime_founder",
        amountUsdCents: 99999,
        idempotencyKey: "atomicity-duplicate-lifetime-b"
      })
    ]);
    expect(duplicate[0]?.id).toBe(duplicate[1]?.id);
    expect(duplicate[0]?.paymentAddress).toBe(duplicate[1]?.paymentAddress);
    const duplicateRows = await pool.query<{ count: string }>(
      "select count(*)::text as count from crypto_payment_intents where user_id = $1",
      [candidateA]
    );
    expect(duplicateRows.rows[0]?.count).toBe("1");

    const attempts = await Promise.allSettled([
      createInHouseCryptoPaymentIntent(db, cryptoConfig(), {
        userId: candidateB,
        planId: "lifetime_founder",
        amountUsdCents: 99999,
        idempotencyKey: "atomicity-final-slot-b"
      }),
      createInHouseCryptoPaymentIntent(db, cryptoConfig(), {
        userId: candidateC,
        planId: "lifetime_founder",
        amountUsdCents: 99999,
        idempotencyKey: "atomicity-final-slot-c"
      })
    ]);

    const fulfilled = attempts.filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof createInHouseCryptoPaymentIntent>>> =>
      result.status === "fulfilled"
    );
    const rejected = attempts.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatchObject({ statusCode: 409, code: "VALIDATION_ERROR" });

    const winner = fulfilled[0]!.value;
    const retry = await createInHouseCryptoPaymentIntent(db, cryptoConfig(), {
      userId: winner.userId,
      planId: "lifetime_founder",
      amountUsdCents: 99999,
      idempotencyKey: winner.userId === candidateB ? "atomicity-final-slot-b" : "atomicity-final-slot-c"
    });
    expect(retry.id).toBe(winner.id);
    expect(retry.paymentAddress).toBe(winner.paymentAddress);

    const loserUserId = winner.userId === candidateB ? candidateC : candidateB;
    const bypass = await pool.query<{ id: string }>(
      `insert into crypto_payment_intents (
         user_id, plan_id, asset, network, amount_usd_cents,
         confirmed_amount_atomic, wallet_xpub_fingerprint, status, idempotency_key
       ) values ($1, 'lifetime_founder', 'USDC', 'arbitrum', 99999,
         '999990000', $2, 'paid', 'atomicity-bypass')
       returning id::text`,
      [loserUserId, walletFingerprint]
    );

    await expect(runTransaction(db, (tx) => grantCruushPlusPlan(
      { db: tx } as FastifyInstance,
      loserUserId,
      getCruushPlusPlan("lifetime_founder"),
      { kind: "crypto_payment_intent", intentId: bypass.rows[0]!.id }
    ))).rejects.toMatchObject({ statusCode: 409, code: "VALIDATION_ERROR" });

    const forbiddenGrants = await pool.query<{ access_count: string; badge_count: string }>(
      `select
         (select count(*) from cruush_plus_lifetime_access where user_id = $1)::text as access_count,
         (select count(*) from user_badges where user_id = $1)::text as badge_count`,
      [loserUserId]
    );
    expect(forbiddenGrants.rows[0]).toEqual({ access_count: "0", badge_count: "0" });
  });

  it("keeps the last limited slot reserved through the evidence window and grants on-time expired evidence", async () => {
    const scenario = "held";
    const { reservedUserId, laterUserA, laterUserB } = await seedFounderAnnualFinalSlot(scenario);

    try {
      const intent = await createInHouseCryptoPaymentIntent(db, cryptoConfig(), {
        userId: reservedUserId,
        planId: "founder_annual",
        amountUsdCents: 9999,
        idempotencyKey: "atomicity-window-held-original",
        watchStartBlock: 100n
      });
      const expired = await pool.query<{ expires_at: string | Date }>(
        `update crypto_payment_intents
         set status = 'expired',
             expires_at = now() - interval '1 day',
             updated_at = now()
         where id = $1
         returning expires_at`,
        [intent.id]
      );

      const blocked = await Promise.allSettled([laterUserA, laterUserB].map((candidate, index) =>
        createInHouseCryptoPaymentIntent(db, cryptoConfig(), {
          userId: candidate,
          planId: "founder_annual",
          amountUsdCents: 9999,
          idempotencyKey: `atomicity-window-held-later-${index}`,
          watchStartBlock: 100n
        })
      ));
      const rejected = blocked.filter((result): result is PromiseRejectedResult => result.status === "rejected");
      expect(rejected).toHaveLength(2);
      for (const result of rejected) {
        expect(result.reason).toMatchObject({ statusCode: 409, code: "VALIDATION_ERROR" });
      }

      const expiresAt = new Date(expired.rows[0]!.expires_at);
      const rail = CRYPTO_PAYMENT_RAILS[intent.rail];
      await pool.query(
        `insert into crypto_payment_transfers (
           intent_id, chain_id, transaction_hash, log_index, block_number, block_hash,
           block_timestamp, token_address, from_address, to_address, amount_atomic,
           confirmations, status, confirmed_at
         ) values (
           $1, $2, $3, 0, 101, $4, $5, $6, $7, $8, $9, 1000, 'confirmed', now()
         )`,
        [
          intent.id,
          rail.chainId,
          `0x${"1".repeat(64)}`,
          `0x${"2".repeat(64)}`,
          new Date(expiresAt.getTime() - 60_000),
          rail.tokenAddress,
          `0x${"3".repeat(40)}`,
          intent.paymentAddress,
          intent.quotedAmountAtomic
        ]
      );

      await expect(settleIntent({ db }, {
        id: intent.id,
        userId: reservedUserId,
        planId: "founder_annual",
        status: "expired",
        paymentAddress: intent.paymentAddress!,
        quotedAmountAtomic: intent.quotedAmountAtomic!,
        rail: intent.rail,
        watchStartBlock: "100",
        expiresAt: expiresAt.toISOString()
      }, DEFAULT_CRYPTO_SETTLEMENT_POLICY)).resolves.toMatchObject({
        settled: true,
        granted: true
      });

      const state = await pool.query<{
        status: string;
        entitlement_granted: boolean;
        founder_count: string;
      }>(
        `select intent.status,
                intent.entitlement_granted_at is not null as entitlement_granted,
                (select count(*)::text from founder_redemptions
                 where user_id = $2 and plan_id = 'founder_annual') as founder_count
         from crypto_payment_intents intent
         where intent.id = $1`,
        [intent.id, reservedUserId]
      );
      expect(state.rows[0]).toEqual({
        status: "paid",
        entitlement_granted: true,
        founder_count: "1"
      });
    } finally {
      await cleanSupplyWindowFixtures(scenario);
    }
  }, 20_000);

  it("releases an evidence-free limited reservation after the bounded window with one concurrent winner", async () => {
    const scenario = "released";
    const { reservedUserId, laterUserA, laterUserB } = await seedFounderAnnualFinalSlot(scenario);

    try {
      const intent = await createInHouseCryptoPaymentIntent(db, cryptoConfig(), {
        userId: reservedUserId,
        planId: "founder_annual",
        amountUsdCents: 9999,
        idempotencyKey: "atomicity-window-released-original",
        watchStartBlock: 200n
      });
      await pool.query(
        `update crypto_payment_intents
         set status = 'expired',
             expires_at = now() - ($2::integer * interval '1 day'),
             updated_at = now()
         where id = $1`,
        [intent.id, CRYPTO_LATE_EVIDENCE_WINDOW_DAYS + 1]
      );

      const attempts = await Promise.allSettled([laterUserA, laterUserB].map((candidate, index) =>
        createInHouseCryptoPaymentIntent(db, cryptoConfig(), {
          userId: candidate,
          planId: "founder_annual",
          amountUsdCents: 9999,
          idempotencyKey: `atomicity-window-released-later-${index}`,
          watchStartBlock: 200n
        })
      ));
      const fulfilled = attempts.filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof createInHouseCryptoPaymentIntent>>> =>
        result.status === "fulfilled"
      );
      const rejected = attempts.filter((result): result is PromiseRejectedResult => result.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]?.reason).toMatchObject({ statusCode: 409, code: "VALIDATION_ERROR" });

      const state = await pool.query<{
        old_status: string;
        old_evidence_count: string;
        new_open_count: string;
      }>(
        `select
           (select status from crypto_payment_intents where id = $1) as old_status,
           (select count(*)::text from crypto_payment_transfers where intent_id = $1) as old_evidence_count,
           (select count(*)::text from crypto_payment_intents
            where id = $2 and status = 'awaiting_payment') as new_open_count`,
        [intent.id, fulfilled[0]!.value.id]
      );
      expect(state.rows[0]).toEqual({
        old_status: "expired",
        old_evidence_count: "0",
        new_open_count: "1"
      });
    } finally {
      await cleanSupplyWindowFixtures(scenario);
    }
  }, 20_000);

  it("serializes concurrent fresh keys to one restorable open intent and address", async () => {
    const requests = [
      ["plus_weekly", 1099],
      ["plus_monthly", 1899],
      ["plus_3_month", 3597],
      ["plus_annual", 11999]
    ] as const;
    const attempts = await Promise.allSettled(requests.map(([planId, amountUsdCents], index) =>
      createInHouseCryptoPaymentIntent(db, cryptoConfig(), {
        userId: capUser,
        planId,
        amountUsdCents,
        idempotencyKey: `atomicity-cap-${index}`
      })
    ));

    expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(
      CRYPTO_OPEN_INTENT_LIMIT_PER_USER
    );
    expect(attempts.filter((result) => result.status === "rejected")).toHaveLength(3);
    const stored = await pool.query<{ open_count: string; address_count: string }>(
      `select
         count(*)::text as open_count,
         count(payment_address)::text as address_count
       from crypto_payment_intents
       where user_id = $1
         and status in ('pending', 'awaiting_payment', 'confirming')`,
      [capUser]
    );
    expect(stored.rows[0]).toEqual({ open_count: "1", address_count: "1" });
  });

  it("atomically stacks concurrent finite grants from the later entitlement end", async () => {
    await pool.query(
      `insert into cruush_plus_subscriptions (
         user_id, plan_id, status, current_period_starts_at, current_period_ends_at, test_mode
       ) values ($1, 'plus_monthly', 'active', '2029-12-01T00:00:00Z', '2029-12-31T00:00:00Z', false)`,
      [stackUser]
    );
    await pool.query(
      `insert into user_entitlements (user_id, cruush_plus_enabled, cruush_plus_expires_at)
       values ($1, true, '2030-01-15T00:00:00Z')`,
      [stackUser]
    );
    const intents = await pool.query<{ id: string }>(
      `insert into crypto_payment_intents (
         user_id, plan_id, asset, network, amount_usd_cents,
         confirmed_amount_atomic, wallet_xpub_fingerprint, status, idempotency_key
       ) values
         ($1, 'plus_monthly', 'USDC', 'arbitrum', 1899, '18990000', $2, 'paid', 'atomicity-stack-a'),
         ($1, 'plus_monthly', 'USDC', 'arbitrum', 1899, '18990000', $2, 'paid', 'atomicity-stack-b')
       returning id::text`,
      [stackUser, walletFingerprint]
    );

    await Promise.all(intents.rows.map(({ id }) => runTransaction(db, (tx) =>
      grantCruushPlusPlan(
        { db: tx } as FastifyInstance,
        stackUser,
        getCruushPlusPlan("plus_monthly"),
        { kind: "crypto_payment_intent", intentId: id }
      )
    )));

    const periods = await pool.query<{
      subscription_end: Date;
      entitlement_end: Date;
    }>(
      `select subscription.current_period_ends_at as subscription_end,
              entitlement.cruush_plus_expires_at as entitlement_end
       from cruush_plus_subscriptions subscription
       join user_entitlements entitlement on entitlement.user_id = subscription.user_id
       where subscription.user_id = $1`,
      [stackUser]
    );
    expect(periods.rows[0]?.subscription_end.toISOString()).toBe("2030-03-15T00:00:00.000Z");
    expect(periods.rows[0]?.entitlement_end.toISOString()).toBe("2030-03-15T00:00:00.000Z");
  });

  it("blocks every new finite or lifetime intent when lifetime access already exists", async () => {
    await pool.query(
      `insert into cruush_plus_lifetime_access (user_id, plan_id, test_mode)
       values ($1, 'lifetime_founder', false)`,
      [lifetimeOwner]
    );

    for (const [planId, amountUsdCents] of [
      ["plus_monthly", 1899],
      ["lifetime_founder", 99999]
    ] as const) {
      await expect(createInHouseCryptoPaymentIntent(db, cryptoConfig(), {
        userId: lifetimeOwner,
        planId,
        amountUsdCents,
        idempotencyKey: `atomicity-existing-lifetime-${planId}`
      })).rejects.toMatchObject({ statusCode: 409, code: "VALIDATION_ERROR" });
    }

    const intents = await pool.query<{ count: string }>(
      "select count(*)::text as count from crypto_payment_intents where user_id = $1",
      [lifetimeOwner]
    );
    expect(intents.rows[0]?.count).toBe("0");
  });

  it("persists a verified secondary head instead of a stale cursor before address publication", async () => {
    await pool.query("delete from crypto_chain_watch_cursors where chain_id = any($1::integer[])", [[1, 8453]]);
    await pool.query(
      `insert into crypto_chain_watch_cursors (chain_id, last_scanned_block)
       values (8453, 500000)`,
      []
    );

    let announceSnapshot!: () => void;
    const snapshotCaptured = new Promise<void>((resolve) => {
      announceSnapshot = resolve;
    });
    let releaseCreation!: () => void;
    const creationReleased = new Promise<void>((resolve) => {
      releaseCreation = resolve;
    });
    const pausedDb: DbClient = {
      query: db.query.bind(db),
      end: db.end.bind(db),
      transaction: (callback) => db.transaction!(async (transactionClient) => callback({
        query: async <T = Record<string, unknown>>(sql: string, params?: unknown[]) => {
          if (sql.includes("insert into crypto_payment_watch_positions")) {
            announceSnapshot();
            await creationReleased;
          }
          return transactionClient.query<T>(sql, params);
        },
        end: transactionClient.end.bind(transactionClient)
      }))
    };

    const creation = createInHouseCryptoPaymentIntent(pausedDb, cryptoConfig(), {
      userId: originSnapshotUser,
      planId: "plus_monthly",
      amountUsdCents: 1899,
      idempotencyKey: "atomicity-origin-snapshot",
      watchStartBlock: 123456n,
      watchStartBlocksByChain: {
        1: 0n,
        8453: 50_000_000n
      }
    });

    try {
      await snapshotCaptured;
      const beforePublication = await pool.query<{ published: boolean }>(
        `select exists (
           select 1
           from crypto_payment_intents
           where user_id = $1
             and payment_address is not null
         ) as published`,
        [originSnapshotUser]
      );
      expect(beforePublication.rows[0]?.published).toBe(false);

      await pool.query(
        `update crypto_chain_watch_cursors
         set last_scanned_block = 900000,
             updated_at = now()
         where chain_id = 8453`,
        []
      );
    } finally {
      releaseCreation();
    }

    const intent = await creation;
    const positions = await pool.query<{
      chain_id: number;
      watch_start_block: string;
      post_issuance_block_scannable: boolean;
    }>(
      `select chain_id,
              watch_start_block::text as watch_start_block,
              case when chain_id = 8453 then 50000001 > watch_start_block else true end
                as post_issuance_block_scannable
       from crypto_payment_watch_positions
       where intent_id = $1
       order by chain_id`,
      [intent.id]
    );
    expect(positions.rows).toEqual([
      { chain_id: 1, watch_start_block: "0", post_issuance_block_scannable: true },
      { chain_id: 8453, watch_start_block: "50000000", post_issuance_block_scannable: true },
      { chain_id: 42161, watch_start_block: "123456", post_issuance_block_scannable: true }
    ]);
    const advancedCursor = await pool.query<{ last_scanned_block: string }>(
      `select last_scanned_block::text as last_scanned_block
       from crypto_chain_watch_cursors
       where chain_id = 8453`,
      []
    );
    expect(advancedCursor.rows[0]?.last_scanned_block).toBe("900000");

    await pool.query("delete from crypto_chain_watch_cursors where chain_id = any($1::integer[])", [[1, 8453]]);
  });

  it("serializes fake lifetime completion against a fresh crypto intent and closes the payable address", async () => {
    const checkout = await pool.query<{ id: string }>(
      `insert into billing_checkout_sessions (
         user_id, plan_id, processor, status, test_mode, amount_cents, currency, expires_at
       ) values ($1, 'lifetime_founder', 'fake', 'pending', true, 99999, 'USD', now() + interval '30 minutes')
       returning id::text`,
      [lifetimeRaceUser]
    );

    let releaseCreate!: () => void;
    const releaseCreatePromise = new Promise<void>((resolve) => {
      releaseCreate = resolve;
    });
    let capacityRead!: () => void;
    const capacityReadPromise = new Promise<void>((resolve) => {
      capacityRead = resolve;
    });
    const createDb: DbClient = {
      query: db.query.bind(db),
      end: db.end.bind(db),
      transaction: (callback) => db.transaction!(async (transactionClient) => callback({
        query: async <T = Record<string, unknown>>(sql: string, params?: unknown[]) => {
          const result = await transactionClient.query<T>(sql, params);
          if (sql.includes("as open_count")) {
            capacityRead();
            await releaseCreatePromise;
          }
          return result;
        },
        end: transactionClient.end.bind(transactionClient)
      }))
    };

    let lifetimeLockAttempted!: () => void;
    const lifetimeLockAttemptedPromise = new Promise<void>((resolve) => {
      lifetimeLockAttempted = resolve;
    });
    const checkoutDb: DbClient = {
      query: db.query.bind(db),
      end: db.end.bind(db),
      transaction: (callback) => db.transaction!(async (transactionClient) => callback({
        query: async <T = Record<string, unknown>>(sql: string, params?: unknown[]) => {
          if (sql.includes("pg_advisory_xact_lock")) {
            lifetimeLockAttempted();
          }
          return transactionClient.query<T>(sql, params);
        },
        end: transactionClient.end.bind(transactionClient)
      }))
    };

    const createPromise = createInHouseCryptoPaymentIntent(createDb, cryptoConfig(), {
      userId: lifetimeRaceUser,
      planId: "plus_monthly",
      amountUsdCents: 1899,
      idempotencyKey: "atomicity-lifetime-checkout-race"
    });
    await capacityReadPromise;

    const checkoutPromise = completeFakeCheckoutSession({
      db: checkoutDb,
      config: { BILLING_TEST_CHECKOUT_ENABLED: true }
    } as FastifyInstance, lifetimeRaceUser, checkout.rows[0]!.id);
    await lifetimeLockAttemptedPromise;
    releaseCreate();

    await expect(Promise.all([createPromise, checkoutPromise])).resolves.toHaveLength(2);

    const state = await pool.query<{ lifetime_count: string; open_count: string; confirming_count: string }>(
      `select
         (select count(*) from cruush_plus_lifetime_access where user_id = $1)::text as lifetime_count,
         (select count(*) from crypto_payment_intents
          where user_id = $1 and status in ('pending', 'awaiting_payment'))::text as open_count,
         (select count(*) from crypto_payment_intents
          where user_id = $1 and status = 'confirming')::text as confirming_count`,
      [lifetimeRaceUser]
    );
    expect(state.rows[0]).toEqual({ lifetime_count: "1", open_count: "0", confirming_count: "0" });
  });
});

describe("crypto catalog limited plans", () => {
  it("keeps both founder plans explicitly supply-limited", () => {
    expect(CRUUSH_PLUS_PLANS.filter((plan) => plan.supplyLimit).map((plan) => [plan.id, plan.supplyLimit]))
      .toEqual([
        ["founder_annual", 1000],
        ["lifetime_founder", 250]
      ]);
  });
});
