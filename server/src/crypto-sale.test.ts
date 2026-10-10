import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./crypto-collection-fee.js", () => ({
  quoteCollectionFee: vi.fn().mockResolvedValue({ version: 1, feeUsdCents: 1, estimatedCostWei: "5000000000000", ethUsd: "2000.00", sampledAt: "2026-10-09T12:00:00.000Z" })
}));
import { buildServer } from "./app.js";
import { createInHouseCryptoPaymentIntent, mapCryptoPaymentIntent, type CryptoPaymentIntentRow } from "./crypto-payments.js";
import { fingerprintCryptoWalletXpub } from "./crypto-wallet.js";
import { createMemoryRateLimiter } from "./rate-limit.js";
import { CRUUSH_PLUS_SALE, cruushPlusOrderSale } from "./cruush-plus-sale.js";
import type { AppConfig } from "./config.js";
import type { DbClient } from "./db.js";

const receiveChainXpub = "xpub6FHa3pjLCk84BayeJxFW2SP4XRrFd1JYnxeLeU8EqN3vDfZmbqBqaGJAyiLjTAwm6ZLRQUMv1ZACTj37sR62cfN7fe5JnJ7dh8zL4fiyLHV";
const userId = "00000000-0000-4000-8000-000000000001";
const config = {
  NODE_ENV: "test", PORT: 3001, HOST: "127.0.0.1", DATABASE_URL: "postgres://postgres:postgres@localhost:5432/cruush", CORS_ORIGIN: "http://localhost:5173", SESSION_SECRET: "test-secret", APP_URL: "https://cruush.test",
  CRYPTO_PROCESSOR_ENABLED: true, CRYPTO_PROCESSOR_WALLET_XPUB: receiveChainXpub, CRYPTO_PROCESSOR_WATCHER_ENABLED: true, CRYPTO_PROCESSOR_ARBITRUM_RPC_URL: "https://arbitrum.example/rpc", CRYPTO_PROCESSOR_BASE_RPC_URL: "", CRYPTO_PROCESSOR_ETHEREUM_RPC_URL: "", CRYPTO_PROCESSOR_INTENT_TTL_MINUTES: 30
} as AppConfig;
function recordedOrder(overrides: Partial<CryptoPaymentIntentRow> = {}): CryptoPaymentIntentRow {
  return { id: "00000000-0000-4000-8000-000000000010", user_id: userId, plan_id: "plus_monthly", product_type: "cruush_plus", processor: "in_house", asset: "USDC", network: "arbitrum", amount_usd_cents: 1899, derivation_index: 1, wallet_xpub_fingerprint: fingerprintCryptoWalletXpub(receiveChainXpub), idempotency_key: "sale-order-1", status: "awaiting_payment", payment_address: "0x73659c60270d326c06Ac204F1A9C63f889a3D14B", quoted_amount_atomic: "19000000", metadata: { source: "store", collectionFee: { feeUsdCents: 1 } }, expires_at: "2030-01-01T00:00:00Z", created_at: "2026-10-08T00:00:00Z", updated_at: "2026-10-08T00:00:00Z", ...overrides };
}
function database(existing: CryptoPaymentIntentRow | null = null) {
  let row = existing;
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (sql.includes("pg_advisory_xact_lock") || sql.includes("set status = 'expired'")) return { rows: [] };
    if (sql.includes("idempotency_key = $2")) return { rows: existing ? [existing] : [] };
    if (sql.includes("wallet_xpub_fingerprint = $5")) return { rows: [] };
    if (sql.includes("open_count")) return { rows: [{ open_count: 0, has_lifetime_access: false }] };
    if (sql.includes("as has_lifetime_access")) return { rows: [{ has_lifetime_access: false }] };
    if (sql.includes("checkout_coupon_redemptions")) return { rows: [] };
    if (sql.includes("insert into crypto_payment_intents")) {
      row = recordedOrder({ user_id: String(values[0]), plan_id: String(values[1]), product_type: values[2] as "cruush_plus" | "ping_pack", asset: values[3] as "USDC", network: values[4] as "arbitrum", amount_usd_cents: Number(values[5]), idempotency_key: String(values[7]), metadata: JSON.parse(String(values[8])), status: "pending", payment_address: null, quoted_amount_atomic: null });
      return { rows: [row] };
    }
    if (sql.includes("set payment_address = $2")) {
      row = { ...row!, payment_address: String(values[1]), quoted_amount_atomic: String(values[2]), status: "awaiting_payment", metadata: { ...row!.metadata, collectionFee: JSON.parse(String(values[4])) } };
      return { rows: [row] };
    }
    if (sql.includes("insert into crypto_payment_watch_positions") || sql.includes("from crypto_payment_transfers") || sql.includes("from crypto_chain_watch_cursors") || sql.includes("from founder_redemptions")) return { rows: [] };
    throw new Error(`Unexpected query: ${sql}`);
  });
  const db = { query, end: vi.fn(), transaction: async <T>(callback: (tx: DbClient) => Promise<T>) => callback(db) } as unknown as DbClient;
  return { db, query };
}
const apps: ReturnType<typeof buildServer>[] = [];
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-10T12:00:00Z"));
});
afterEach(async () => { for (const app of apps.splice(0)) await app.close(); vi.useRealTimers(); });
function makeApp(db: DbClient) {
  const app = buildServer(config, { db, rateLimiter: createMemoryRateLimiter(), cryptoPaymentRailHeadReader: async () => 123456n });
  apps.push(app); return app;
}

describe("sale checkout contracts", () => {
  it("quotes list price after the deadline while retrying a stored sale order preserves its quote", async () => {
    const storedSale = cruushPlusOrderSale(1899);
    vi.setSystemTime(new Date("2026-10-12T03:59:00Z"));
    const fresh = makeApp(database().db);
    const response = await fresh.inject({ method: "POST", url: "/api/crypto/payment-intents", headers: { "x-user-id": userId }, payload: { planId: "plus_monthly", idempotencyKey: "after-sale" } });
    expect(response.statusCode).toBe(201);
    expect(response.json().data).toMatchObject({ amountUsdCents: 1899, sale: null, discount: null });
    const existing = recordedOrder({ amount_usd_cents: 950, metadata: { sale: storedSale, collectionFee: { feeUsdCents: 1 } } });
    const retryApp = makeApp(database(existing).db);
    const retry = await retryApp.inject({ method: "POST", url: "/api/crypto/payment-intents", headers: { "x-user-id": userId }, payload: { planId: "plus_monthly", idempotencyKey: existing.idempotency_key } });
    expect(retry.statusCode).toBe(201);
    expect(retry.json().data).toMatchObject({ amountUsdCents: 950, sale: storedSale });
  });

  it.each([userId, "00000000-0000-4000-8000-000000000002"])("automatically quotes the same 50%% price for account %s without consuming CLUBS20", async (accountId) => {
    const { db, query } = database(); const app = makeApp(db);
    const response = await app.inject({ method: "POST", url: "/api/crypto/payment-intents", headers: { "x-user-id": accountId }, payload: { planId: "plus_monthly", idempotencyKey: "sale-order-1", couponCode: "CLUBS20" } });
    expect(response.statusCode).toBe(201);
    expect(response.json().data).toMatchObject({ amountUsdCents: 950, totalUsdCents: 951, quotedAmountAtomic: "9510000", discount: null, sale: { ...CRUUSH_PLUS_SALE, originalAmountUsdCents: 1899, amountUsdCents: 950 } });
    expect(query.mock.calls.some(([sql]) => sql.includes("checkout_coupon_redemptions"))).toBe(false);
  });

  it("advertises half-price cruush+ and every Pulse pack on the authenticated catalogues", async () => {
    const { db } = database(); const app = makeApp(db);
    const catalog = await app.inject({ method: "GET", url: "/api/billing/plans", headers: { "x-user-id": userId } });
    expect(catalog.json().data.sale).toEqual(CRUUSH_PLUS_SALE);
    expect(catalog.json().data.plans.find((plan: { id: string }) => plan.id === "plus_monthly")).toMatchObject({ amountCents: 950, originalAmountCents: 1899 });
    const pulse = await app.inject({ method: "GET", url: "/api/billing/ping-packs", headers: { "x-user-id": userId } });
    expect(pulse.json().data.packs.map((pack: { amountCents: number }) => pack.amountCents)).toEqual([500, 1250, 2500]);
    expect(pulse.json().data.packs[0]).toMatchObject({ id: "ping_3", pingCount: 3, originalAmountCents: 999, sale: CRUUSH_PLUS_SALE });
    expect(pulse.json().data.sale).toEqual(CRUUSH_PLUS_SALE);
  });

  it("applies the Pulse sale without stacking or consuming a coupon", async () => {
    const { db, query } = database(); const app = makeApp(db);
    const response = await app.inject({ method: "POST", url: "/api/crypto/ping-pack-intents", headers: { "x-user-id": userId }, payload: { packId: "ping_3", idempotencyKey: "pulse-order-1", couponCode: "CLUBS20" } });
    expect(response.statusCode).toBe(201);
    expect(response.json().data).toMatchObject({ amountUsdCents: 500, sale: { percentOff: 50, originalAmountUsdCents: 999 }, discount: null });
    expect(query.mock.calls.some(([sql]) => sql.includes("insert into checkout_coupon_redemptions"))).toBe(false);
  });

  it("restores Pulse catalogue and new quotes at the Sunday deadline", async () => {
    vi.setSystemTime(new Date("2026-10-12T03:59:00Z"));
    const { db } = database(); const app = makeApp(db);
    const catalogue = await app.inject({ method: "GET", url: "/api/billing/ping-packs", headers: { "x-user-id": userId } });
    expect(catalogue.json().data.sale).toBeNull();
    expect(catalogue.json().data.packs.map((pack: { amountCents: number }) => pack.amountCents)).toEqual([999, 2499, 4999]);
    const response = await app.inject({ method: "POST", url: "/api/crypto/ping-pack-intents", headers: { "x-user-id": userId }, payload: { packId: "ping_3", idempotencyKey: "pulse-expired-sale" } });
    expect(response.statusCode).toBe(201);
    expect(response.json().data).toMatchObject({ amountUsdCents: 999, sale: null });
  });

  it.each([
    { url: "/api/crypto/payment-intents", product: { planId: "plus_monthly" }, amountUsdCents: 1899 },
    { url: "/api/crypto/ping-pack-intents", product: { packId: "ping_3" }, amountUsdCents: 999 }
  ])("uses list price when an awaited rail read crosses the sale deadline: $url", async ({ url, product, amountUsdCents }) => {
    const deadline = Date.parse("2026-10-12T03:59:00Z");
    vi.setSystemTime(deadline - 1);
    const { db } = database();
    const readRailHead = vi.fn(async () => {
      await Promise.resolve();
      vi.setSystemTime(deadline);
      return 123456n;
    });
    const app = buildServer(config, { db, rateLimiter: createMemoryRateLimiter(), cryptoPaymentRailHeadReader: readRailHead });
    apps.push(app);
    const response = await app.inject({ method: "POST", url, headers: { "x-user-id": userId }, payload: { ...product, idempotencyKey: "sale-boundary-order" } });
    expect(readRailHead).toHaveBeenCalled();
    expect(response.statusCode).toBe(201);
    expect(response.json().data).toMatchObject({ amountUsdCents, sale: null, discount: null });
  });

  it.each([false, true])("preserves a Pulse order created before the sale (coupon=%s)", async (hasCoupon) => {
    const discount = hasCoupon ? { code: "CLUBS20", percentOff: 20, originalAmountUsdCents: 999, discountAmountUsdCents: 200, amountUsdCents: 799 } : null;
    const existing = recordedOrder({ product_type: "ping_pack", plan_id: "ping_3", amount_usd_cents: discount?.amountUsdCents ?? 999, metadata: { source: "ping_pack_store", ...(discount ? { discount } : {}), collectionFee: { feeUsdCents: 1 } } });
    const { db } = database(existing); const app = makeApp(db);
    const response = await app.inject({ method: "POST", url: "/api/crypto/ping-pack-intents", headers: { "x-user-id": userId }, payload: { packId: "ping_3", idempotencyKey: existing.idempotency_key, ...(hasCoupon ? { couponCode: "CLUBS20" } : {}) } });
    expect(response.statusCode).toBe(201);
    expect(response.json().data).toMatchObject({ amountUsdCents: existing.amount_usd_cents, sale: null, discount });
  });

  it.each([false, true])("returns the original quote on an old order retry (coupon=%s)", async (hasCoupon) => {
    const discount = hasCoupon ? { code: "CLUBS20", percentOff: 20, originalAmountUsdCents: 1899, discountAmountUsdCents: 380, amountUsdCents: 1519 } : null;
    const existing = recordedOrder({ amount_usd_cents: discount?.amountUsdCents ?? 1899, metadata: { ...(discount ? { discount } : {}), collectionFee: { feeUsdCents: 1 } } });
    const { db, query } = database(existing);
    const result = await createInHouseCryptoPaymentIntent(db, config, { userId, planId: "plus_monthly", amountUsdCents: 950, idempotencyKey: existing.idempotency_key, ...(hasCoupon ? { couponCode: "CLUBS20" } : {}) });
    expect(result.amountUsdCents).toBe(existing.amount_usd_cents);
    expect(result.quotedAmountAtomic).toBe(existing.quoted_amount_atomic);
    expect(result.discount).toEqual(discount);
    expect(result.sale).toBeNull();
    expect(query.mock.calls.some(([sql]) => sql.includes("insert into") || sql.includes("set payment_address") || sql.includes("checkout_coupon_redemptions"))).toBe(false);
  });

  it("rejects client amounts and core amount mismatches, while stored paid orders remain unchanged", async () => {
    const { db, query } = database(); const app = makeApp(db);
    const response = await app.inject({ method: "POST", url: "/api/crypto/payment-intents", headers: { "x-user-id": userId }, payload: { planId: "plus_monthly", idempotencyKey: "sale-order-1", amountUsdCents: 1 } });
    expect(response.statusCode).toBe(400);
    await expect(createInHouseCryptoPaymentIntent(db, config, { userId, planId: "plus_monthly", amountUsdCents: 475, idempotencyKey: "sale-order-1" })).rejects.toThrow(/amount does not match/);
    expect(query).not.toHaveBeenCalled();
    expect(mapCryptoPaymentIntent(recordedOrder({ status: "paid" }))).toMatchObject({ amountUsdCents: 1899, sale: null });
    expect(mapCryptoPaymentIntent(recordedOrder({ amount_usd_cents: 950, metadata: { sale: cruushPlusOrderSale(1899) } }))).toMatchObject({ amountUsdCents: 950, sale: { percentOff: 50 } });
  });
});
