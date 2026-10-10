
vi.mock("./crypto-collection-fee.js", () => ({
  quoteCollectionFee: vi.fn().mockResolvedValue({
    version: 1, feeUsdCents: 1, estimatedCostWei: "5000000000000",
    ethUsd: "2000.00", sampledAt: "2026-09-08T12:00:00.000Z"
  })
}));
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "./app.js";
import { CRUUSH_PLUS_SALE, cruushPlusOrderSale } from "./cruush-plus-sale.js";
import { deriveCryptoReceivingAddress, fingerprintCryptoWalletXpub } from "./crypto-wallet.js";
import type { AppConfig } from "./config.js";
import type { DbClient } from "./db.js";
import { ApiError } from "./errors.js";
import { createMemoryRateLimiter } from "./rate-limit.js";
import {
  CRYPTO_PAYMENT_INTENT_CREATE_RATE_LIMIT,
  CRYPTO_PAYMENT_INTENT_READ_RATE_LIMIT,
  CRYPTO_SUPPORT_RECEIPT_RATE_LIMIT,
  resolvePrePublicationWatchStartBlocks
} from "./routes/crypto-payments.js";
import type { ChainSource } from "./crypto-chain-source.js";

beforeEach(() => { vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-10T12:00:00Z")); });
afterEach(() => vi.restoreAllMocks());

const userId = "00000000-0000-4000-8000-000000000001";
const intentId = "00000000-0000-4000-8000-000000000010";
const receiveChainXpub = "xpub6FHa3pjLCk84BayeJxFW2SP4XRrFd1JYnxeLeU8EqN3vDfZmbqBqaGJAyiLjTAwm6ZLRQUMv1ZACTj37sR62cfN7fe5JnJ7dh8zL4fiyLHV";

function baseConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    NODE_ENV: "test",
    PORT: 3001,
    HOST: "127.0.0.1",
    DATABASE_URL: "postgres://postgres:postgres@localhost:5432/cruush",
    CORS_ORIGIN: "http://localhost:5173",
    SESSION_SECRET: "test-secret",
    APP_URL: "https://cruush.test",
    CRYPTO_PROCESSOR_ENABLED: false,
    CRYPTO_PROCESSOR_WALLET_XPUB: "",
    CRYPTO_PROCESSOR_WATCHER_ENABLED: false,
    CRYPTO_PROCESSOR_ARBITRUM_RPC_URL: "",
    CRYPTO_PROCESSOR_BASE_RPC_URL: "",
    CRYPTO_PROCESSOR_ETHEREUM_RPC_URL: "",
    CRYPTO_PROCESSOR_CONFIRMATION_TARGET: 1,
    CRYPTO_PROCESSOR_INTENT_TTL_MINUTES: 30,
    ...overrides
  } as AppConfig;
}

function databaseWithTransaction(query: ReturnType<typeof vi.fn>): DbClient {
  const client = { query, end: vi.fn() } as unknown as DbClient;
  return {
    query,
    end: vi.fn().mockResolvedValue(undefined),
    transaction: async <T>(callback: (transactionClient: DbClient) => Promise<T>) => callback(client)
  } as DbClient;
}

const disabledApp = buildServer(baseConfig(), {
  db: {
    query: vi.fn(),
    end: vi.fn().mockResolvedValue(undefined)
  },
  rateLimiter: createMemoryRateLimiter()
});

describe("crypto payment routes", () => {
  afterAll(async () => {
    await disabledApp.close();
  });

  it("requires authentication and rejects invalid order-history cursors", async () => {
    const anonymous = await disabledApp.inject({ method: "GET", url: "/api/crypto/orders" });
    expect(anonymous.statusCode).toBe(401);
    const invalid = await disabledApp.inject({ method: "GET", url: "/api/crypto/orders?before=invalid", headers: { "x-user-id": userId } });
    expect(invalid.statusCode).toBe(400);
  });

  it("returns bounded owner-scoped history with expired confirmation progress and no private wallet fields", async () => {
    const before = "00000000-0000-4000-8000-000000000099";
    const rows = Array.from({ length: 21 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 10).padStart(12, '0')}`,
      user_id: userId, plan_id: index === 0 ? "ping_3" : "plus_monthly",
      product_type: index === 0 ? "ping_pack" : "cruush_plus",
      asset: "BTC", network: "bitcoin", amount_usd_cents: 1899,
      quoted_amount_atomic: "10000", payment_address: "fixture-address",
      status: "expired", metadata: { privateFixture: "must-not-leave-server", ...(index === 0 ? { sendingApp: "paypal" } : {}) },
      wallet_xpub_fingerprint: "private-wallet-fingerprint", derivation_index: 42,
      expires_at: "2026-09-01T10:00:00Z", created_at: "2026-08-31T10:00:00Z",
      updated_at: "2026-09-02T10:00:00Z", paid_at: null, entitlement_granted_at: null,
    }));
    const query = vi.fn(async (sql: string, values: unknown[] = []) => {
      if (sql.includes("select i.* from crypto_payment_intents i")) {
        expect(sql).toContain("i.user_id = $1");
        expect(sql).toContain("c.user_id = $1");
        expect(sql).toContain("order by i.created_at desc, i.id desc");
        expect(values).toEqual([userId, before, 21]);
        return { rows };
      }
      if (sql.includes("crypto_bitcoin_transfers")) {
        expect(values[1]).toBe(userId);
        return { rows: [{ amount_atomic: "10000", confirmations: 3 }] };
      }
      throw new Error("Unexpected history query");
    });
    const app = buildServer(baseConfig(), { db: databaseWithTransaction(query), rateLimiter: createMemoryRateLimiter() });
    try {
      const response = await app.inject({ method: "GET", url: `/api/crypto/orders?before=${before}`, headers: { "x-user-id": userId } });
      expect(response.statusCode).toBe(200);
      const history = response.json().data;
      expect(history.orders).toHaveLength(20);
      expect(history.nextCursor).toBe(rows[19].id);
      expect(history.orders[0]).toMatchObject({ name: "3 Pulses", status: "expired", confirmations: 3, confirmationTarget: 6, paymentAmountReceived: true, activatedAt: null, sendingApp: "paypal" });
      expect(history.orders[1].name).toBe("Monthly cruush+");
      // An order recorded before the app was stored names no app.
      expect(history.orders[1].sendingApp).toBeNull();
      expect(response.body).not.toMatch(/private-wallet|must-not-leave|derivation|payment_address|user_id/);
    } finally { await app.close(); }
  });

  it("reports a disabled processor without exposing wallet configuration", async () => {
    const response = await disabledApp.inject({
      method: "GET",
      url: "/api/crypto/status",
      headers: { "x-user-id": userId }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        ready: false,
        asset: "USDC",
        network: "arbitrum",
        confirmationTarget: 1,
        rails: [
          {
            id: "btc_bitcoin", asset: "BTC", network: "bitcoin", chainId: 0,
            tokenAddress: "", decimals: 8, confirmationTarget: 6, ready: false
          },
          {
            id: "usdc_arbitrum",
            asset: "USDC",
            network: "arbitrum",
            chainId: 42161,
            // Circle's published native USDC on Arbitrum.
            tokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
            decimals: 6,
            confirmationTarget: 240,
            ready: false
          },
          {
            id: "pyusd_arbitrum",
            asset: "PYUSD",
            network: "arbitrum",
            chainId: 42161,
            // Paxos' published PYUSD on Arbitrum.
            tokenAddress: "0x46850aD61C2B7d64d08c9C754F45254596696984",
            decimals: 6,
            confirmationTarget: 240,
            ready: false
          },
          {
            id: "pyusd_ethereum",
            asset: "PYUSD",
            network: "ethereum",
            chainId: 1,
            tokenAddress: "0x6c3ea9036406852006290770BEdFcAbA0e23A0e8",
            decimals: 6,
            confirmationTarget: 12,
            ready: false
          },
          {
            id: "usdc_base",
            asset: "USDC",
            network: "base",
            chainId: 8453,
            tokenAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            decimals: 6,
            confirmationTarget: 30,
            ready: false
          }
        ]
      }
    });
    expect(response.body).not.toContain("XPUB");
    expect(response.body).not.toContain("WALLET");
    expect(response.body).not.toContain("RPC_URL");
    expect(response.body).not.toContain("http");
  });

  it("serves the approved permanent Ping pack catalog to a member", async () => {
    const response = await disabledApp.inject({
      method: "GET",
      url: "/api/billing/ping-packs",
      headers: { "x-user-id": userId }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        currency: "USD",
        sale: CRUUSH_PLUS_SALE,
        packs: [
          expect.objectContaining({ id: "ping_3", pingCount: 3, amountCents: 500, originalAmountCents: 999 }),
          expect.objectContaining({ id: "ping_10", pingCount: 10, amountCents: 1250, originalAmountCents: 2499 }),
          expect.objectContaining({ id: "ping_25", pingCount: 25, amountCents: 2500, originalAmountCents: 4999 })
        ]
      }
    });
  });

  it("requires authentication and rejects client-controlled payment fields", async () => {
    const unauthenticated = await disabledApp.inject({
      method: "GET",
      url: "/api/crypto/status"
    });
    expect(unauthenticated.statusCode).toBe(401);

    const response = await disabledApp.inject({
      method: "POST",
      url: "/api/crypto/payment-intents",
      headers: {
        "content-type": "application/json",
        "x-user-id": userId
      },
      payload: {
        planId: "plus_monthly",
        idempotencyKey: "checkout-route-1",
        amountUsdCents: 1,
        network: "another-network",
        voucher: true
      }
    });

    expect(response.statusCode).toBe(400);

    // The sending app is a fixed list: an unknown app never reaches the order record.
    const unknownApp = await disabledApp.inject({
      method: "POST",
      url: "/api/crypto/payment-intents",
      headers: { "content-type": "application/json", "x-user-id": userId },
      payload: { planId: "plus_monthly", idempotencyKey: "checkout-route-1", rail: "btc_bitcoin", sendingApp: "zelle" }
    });
    expect(unknownApp.statusCode).toBe(400);
  });

  it("refuses the worthless-token testnet rail unless it was deliberately enabled", async () => {
    // Base Sepolia USDC is free from a faucet. Accepting it would hand out real
    // cruush+ for nothing, so the rail must be rejected while the flag is off,
    // and it must not even be advertised.
    const response = await disabledApp.inject({
      method: "POST",
      url: "/api/crypto/payment-intents",
      headers: {
        "content-type": "application/json",
        "x-user-id": userId
      },
      payload: {
        planId: "plus_monthly",
        idempotencyKey: "testnet-rail-refused",
        rail: "usdc_base_sepolia"
      }
    });

    expect(response.statusCode).toBe(400);

    const status = await disabledApp.inject({
      method: "GET",
      url: "/api/crypto/status",
      headers: { "x-user-id": userId }
    });
    const railIds = status.json().data.rails.map((rail: { id: string }) => rail.id);

    expect(railIds).not.toContain("usdc_base_sepolia");
    expect(railIds).toContain("usdc_arbitrum");
  });

  it("keeps receipt recovery moderator-only, rate-limited, and independently ingested", async () => {
    const transactionHash = `0x${"b".repeat(64)}`;
    const query = vi.fn(async (sql: string, values: unknown[] = []) => {
      if (/from app_users users/.test(sql) && values[0] === userId) {
        return { rows: [{ role: "admin", email: "admin@cruush.local" }] };
      }
      return { rows: [] };
    });
    const source = { chainId: 8453 } as ChainSource;
    const createReceiptSource = vi.fn().mockReturnValue(source);
    const ingestReceipt = vi.fn().mockResolvedValue({
      intentId,
      transactionHash,
      chainId: 8453,
      transfersRecorded: 1,
      creditableTransfers: 1,
      confirmations: 30,
      settled: true,
      entitlementGranted: true,
      settlementNote: null
    });
    const app = buildServer(baseConfig(), {
      db: { query, end: vi.fn().mockResolvedValue(undefined) } as unknown as DbClient,
      rateLimiter: createMemoryRateLimiter(),
      cryptoReceiptSourceFactory: createReceiptSource,
      cryptoReceiptIngestor: ingestReceipt
    });
    const request = {
      method: "POST" as const,
      url: "/api/crypto/support/payment-receipts",
      headers: { "content-type": "application/json", "x-user-id": userId },
      payload: { intentId, transactionHash, chainId: 8453 }
    };

    try {
      const forbidden = await app.inject({
        ...request,
        headers: {
          ...request.headers,
          "x-user-id": "00000000-0000-4000-8000-000000000099"
        }
      });
      expect(forbidden.statusCode).toBe(403);
      expect(createReceiptSource).not.toHaveBeenCalled();
      expect(ingestReceipt).not.toHaveBeenCalled();

      const response = await app.inject(request);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ data: { settled: true, entitlementGranted: true } });
      expect(createReceiptSource.mock.calls[0]?.[0]).toBe(app.config);
      expect(createReceiptSource.mock.calls[0]?.[1]).toBe(8453);
      expect(ingestReceipt.mock.calls[0]?.[0]).toBe(app);
      expect(ingestReceipt.mock.calls[0]?.[1]).toBe(source);
      expect(ingestReceipt.mock.calls[0]?.[2]).toEqual(request.payload);

      for (let attempt = 1; attempt < CRYPTO_SUPPORT_RECEIPT_RATE_LIMIT.max; attempt += 1) {
        expect((await app.inject(request)).statusCode).toBe(200);
      }
      expect((await app.inject(request)).statusCode).toBe(429);
      expect(ingestReceipt).toHaveBeenCalledTimes(CRYPTO_SUPPORT_RECEIPT_RATE_LIMIT.max);
    } finally {
      await app.close();
    }
  });

  it("rate-limits payment intent creation per member before processor work", async () => {
    const query = vi.fn();
    const app = buildServer(baseConfig(), {
      db: {
        query,
        end: vi.fn().mockResolvedValue(undefined)
      },
      rateLimiter: createMemoryRateLimiter()
    });
    const request = {
      method: "POST" as const,
      url: "/api/crypto/payment-intents",
      headers: {
        "content-type": "application/json",
        "x-user-id": userId
      },
      payload: {
        planId: "plus_monthly",
        idempotencyKey: "checkout-rate-limit"
      }
    };

    try {
      for (let attempt = 0; attempt < CRYPTO_PAYMENT_INTENT_CREATE_RATE_LIMIT.max; attempt += 1) {
        const response = await app.inject(request);
        expect(response.statusCode).toBe(503);
      }

      const limited = await app.inject(request);
      expect(limited.statusCode).toBe(429);
      expect(limited.json()).toEqual({
        error: {
          code: "RATE_LIMITED",
          message: "Too many crypto payment attempts. Try again shortly.",
          details: expect.any(Object)
        }
      });
      expect(query).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("shares one member polling limit across current and by-id intent reads", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const app = buildServer(baseConfig(), {
      db: {
        query,
        end: vi.fn().mockResolvedValue(undefined)
      },
      rateLimiter: createMemoryRateLimiter()
    });
    const byIdRequest = {
      method: "GET" as const,
      url: `/api/crypto/payment-intents/${intentId}`,
      headers: { "x-user-id": userId }
    };
    const currentRequest = {
      ...byIdRequest,
      url: "/api/crypto/payment-intents/current"
    };

    try {
      for (let attempt = 0; attempt < CRYPTO_PAYMENT_INTENT_READ_RATE_LIMIT.max; attempt += 1) {
        const readsCurrentIntent = attempt % 2 === 0;
        const response = await app.inject(readsCurrentIntent ? currentRequest : byIdRequest);
        expect(response.statusCode).toBe(readsCurrentIntent ? 200 : 404);
      }

      const queryCallsBeforeLimit = query.mock.calls.length;
      const limited = await app.inject(currentRequest);
      expect(limited.statusCode).toBe(429);
      expect(limited.json()).toEqual({
        error: {
          code: "RATE_LIMITED",
          message: "Too many crypto payment status checks. Try again shortly.",
          details: expect.any(Object)
        }
      });
      expect(query).toHaveBeenCalledTimes(queryCallsBeforeLimit);
    } finally {
      await app.close();
    }
  });

  it("treats current as a static route and returns the newest open intent or null", async () => {
    const paymentAddress = deriveCryptoReceivingAddress(receiveChainXpub, 1);
    const openIntent = {
      id: intentId,
      user_id: userId,
      plan_id: "plus_monthly",
      processor: "in_house" as const,
      asset: "USDC" as const,
      network: "arbitrum" as const,
      amount_usd_cents: 1899,
      quoted_amount_atomic: "18990000",
      derivation_index: 1,
      wallet_xpub_fingerprint: fingerprintCryptoWalletXpub(receiveChainXpub),
      payment_address: paymentAddress,
      status: "awaiting_payment" as const,
      idempotency_key: "checkout-current",
      metadata: { source: "store" },
      expires_at: "2026-08-22T18:00:00Z",
      created_at: "2026-08-22T17:30:00Z",
      updated_at: "2026-08-22T17:30:00Z",
      paid_at: null
    };
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [openIntent] })
      .mockResolvedValueOnce({ rows: [] }) // Confirmation-progress lookup.
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const app = buildServer(baseConfig(), {
      db: {
        query,
        end: vi.fn().mockResolvedValue(undefined)
      },
      rateLimiter: createMemoryRateLimiter()
    });

    try {
      const current = await app.inject({
        method: "GET",
        url: "/api/crypto/payment-intents/current",
        headers: { "x-user-id": userId }
      });

      expect(current.statusCode).toBe(200);
      expect(current.json()).toMatchObject({
        data: {
          id: intentId,
          status: "awaiting_payment",
          paymentAddress
        }
      });
      const currentLookupSql = query.mock.calls[1]?.[0] as string;
      expect(currentLookupSql).toContain("status in ('pending', 'awaiting_payment', 'confirming')");
      expect(currentLookupSql).toContain("order by created_at desc");
      expect(currentLookupSql).toContain("limit 1");

      const none = await app.inject({
        method: "GET",
        url: "/api/crypto/payment-intents/current",
        headers: { "x-user-id": userId }
      });
      expect(none.statusCode).toBe(200);
      expect(none.json()).toEqual({ data: null });
    } finally {
      await app.close();
    }
  });

  it("cancels only the member-owned open intent and keeps its recorded row", async () => {
    const paymentAddress = deriveCryptoReceivingAddress(receiveChainXpub, 1);
    const openIntent = {
      id: intentId,
      user_id: userId,
      plan_id: "plus_monthly",
      processor: "in_house" as const,
      asset: "USDC" as const,
      network: "arbitrum" as const,
      amount_usd_cents: 1899,
      quoted_amount_atomic: "18990000",
      derivation_index: 1,
      wallet_xpub_fingerprint: fingerprintCryptoWalletXpub(receiveChainXpub),
      payment_address: paymentAddress,
      status: "awaiting_payment" as const,
      idempotency_key: "checkout-cancel",
      metadata: { source: "store" },
      expires_at: "2099-08-22T18:00:00Z",
      created_at: "2099-08-22T17:00:00Z",
      updated_at: "2099-08-22T17:00:00Z",
      paid_at: null
    };
    const cancelledIntent = {
      ...openIntent,
      status: "cancelled" as const,
      metadata: { source: "store", cancelledBy: "member" },
      updated_at: "2099-08-22T17:01:00Z"
    };
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("from crypto_payment_transfers")) return { rows: [] };
      if (sql.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (sql.includes("for update")) return { rows: [openIntent] };
      if (sql.includes("set status = 'cancelled'")) return { rows: [cancelledIntent] };
      throw new Error(`Unexpected query: ${sql}`);
    });
    const app = buildServer(baseConfig(), {
      db: databaseWithTransaction(query),
      rateLimiter: createMemoryRateLimiter()
    });

    try {
      const response = await app.inject({
        method: "POST",
        url: `/api/crypto/payment-intents/${intentId}/cancel`,
        headers: { "x-user-id": userId }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        data: {
          id: intentId,
          userId,
          status: "cancelled",
          paymentAddress: null,
          paymentUri: null,
          qrCodeDataUrl: null
        }
      });
      expect(query.mock.calls.some(([sql]) => String(sql).includes("delete from"))).toBe(false);
    } finally {
      await app.close();
    }
  });

  it("derives the plan amount on the server and returns one account-linked address", async () => {
    const paymentAddress = deriveCryptoReceivingAddress(receiveChainXpub, 1);
    const readRailHead = vi.fn(async (_config: AppConfig, rail: string) =>
      rail === "usdc_base" ? 50_000_000n : 123_456n
    );
    const commonRow = {
      id: intentId,
      user_id: userId,
      plan_id: "plus_monthly",
      processor: "in_house" as const,
      asset: "USDC" as const,
      network: "arbitrum" as const,
      amount_usd_cents: 950,
      derivation_index: 1,
      wallet_xpub_fingerprint: fingerprintCryptoWalletXpub(receiveChainXpub),
      watch_start_block: null,
      idempotency_key: "checkout-route-1",
      metadata: { source: "store", sendingApp: "cash_app", sale: cruushPlusOrderSale(1899) },
      expires_at: "2026-08-22T18:00:00Z",
      created_at: "2026-08-22T17:30:00Z",
      updated_at: "2026-08-22T17:30:00Z",
      paid_at: null
    };
    const reservedRow = {
      ...commonRow,
      quoted_amount_atomic: null,
      payment_address: null,
      status: "pending" as const
    };
    const allocatedRow = {
      ...commonRow,
      quoted_amount_atomic: "9510000",
      payment_address: paymentAddress,
      watch_start_block: "123456",
      status: "awaiting_payment" as const
    };
    const query = vi.fn(async (sql: string, _values: unknown[] = []) => {
      if (sql.includes("from crypto_chain_watch_cursors")) return { rows: [] };
      if (sql.includes("from crypto_payment_transfers")) return { rows: [] };
      if (sql.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (sql.includes("set status = 'expired'")) return { rows: [] };
      if (sql.includes("idempotency_key = $2")) return { rows: [] };
      if (sql.includes("wallet_xpub_fingerprint = $5")) return { rows: [] };
      if (sql.includes("open_count")) return { rows: [{ open_count: 0 }] };
      if (sql.includes("insert into crypto_payment_intents")) return { rows: [reservedRow] };
      if (sql.includes("insert into crypto_payment_watch_positions")) return { rows: [] };
      if (sql.includes("set payment_address = $2")) return { rows: [{...allocatedRow, quoted_amount_atomic: _values[2], metadata: {...allocatedRow.metadata, collectionFee: JSON.parse(String(_values[4]))}}] };
      throw new Error(`Unexpected query: ${sql}`);
    });
    const app = buildServer(baseConfig({
      CRYPTO_PROCESSOR_ENABLED: true,
      CRYPTO_PROCESSOR_WALLET_XPUB: receiveChainXpub,
      CRYPTO_PROCESSOR_WATCHER_ENABLED: true,
      CRYPTO_PROCESSOR_ARBITRUM_RPC_URL: "https://arbitrum.example/rpc-secret",
      CRYPTO_PROCESSOR_BASE_RPC_URL: "https://base.example/rpc-secret"
    }), {
      db: databaseWithTransaction(query),
      rateLimiter: createMemoryRateLimiter(),
      cryptoPaymentRailHeadReader: readRailHead
    });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/crypto/payment-intents",
        headers: {
          "content-type": "application/json",
          "x-user-id": userId
        },
        payload: {
          planId: "plus_monthly",
          idempotencyKey: "checkout-route-1",
          sendingApp: "cash_app"
        }
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body).toMatchObject({
        data: {
          id: intentId,
          planId: "plus_monthly",
          amountUsdCents: 950,
          quotedAmountAtomic: "9510000",
          gasFeeUsdCents: 1,
          totalUsdCents: 951,
          paymentAddress,
          asset: "USDC",
          network: "arbitrum",
          sendingApp: "cash_app",
          status: "awaiting_payment"
        }
      });
      // The chosen app is part of the method: an open order is only reused
      // for the same app, and a new one records it.
      const compatibleLookup = query.mock.calls.find(([sql]) =>
        String(sql).includes("wallet_xpub_fingerprint = $5")
      );
      expect((compatibleLookup as unknown as [string, unknown[]] | undefined)?.[0]).toContain("metadata->>'sendingApp'");
      expect((compatibleLookup as unknown as [string, unknown[]] | undefined)?.[1]).toEqual(
        expect.arrayContaining(["cash_app"])
      );
      expect(body.data.paymentUri).toBe(
        `ethereum:0xaf88d065e77c8cC2239327C5EDb3A432268e5831@42161/transfer?address=${paymentAddress}&uint256=9510000`
      );
      expect(body.data.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
      expect(response.body).not.toContain("walletXpub");
      expect(response.body).not.toContain("idempotencyKey");
      expect(readRailHead).toHaveBeenCalledWith(expect.any(Object), "usdc_arbitrum");
      expect(readRailHead).toHaveBeenCalledWith(expect.any(Object), "usdc_base");
      const positionAllocation = query.mock.calls.find(([sql]) =>
        String(sql).includes("insert into crypto_payment_watch_positions")
      );
      expect((positionAllocation as unknown as [string, unknown[]] | undefined)?.[1]).toEqual([
        intentId,
        42161,
        "123456",
        [1, 8453, 42161],
        ["0", "50000000", null]
      ]);
      expect(query.mock.calls.some(([sql]) =>
        String(sql).includes("crypto_chain_watch_cursors")
      )).toBe(false);
      const addressAllocation = query.mock.calls.find(([sql]) =>
        String(sql).includes("set payment_address = $2")
      );
      expect((addressAllocation as unknown as [string, unknown[]] | undefined)?.[1]).toEqual([
        intentId,
        paymentAddress,
        "9510000",
        "123456",
        expect.any(String)
      ]);
      const reservation = query.mock.calls.find(([sql]) =>
        String(sql).includes("insert into crypto_payment_intents")
      );
      expect((reservation as unknown as [string, unknown[]] | undefined)?.[1])
        .toEqual(expect.arrayContaining([950, JSON.stringify({ source: "store", sendingApp: "cash_app", sale: cruushPlusOrderSale(1899) })]));
    } finally {
      await app.close();
    }
  });

  it("uses a configured secondary's current verified head and zero only for an unconfigured chain", async () => {
    const readRailHead = vi.fn().mockResolvedValue(50_000_000n);

    await expect(resolvePrePublicationWatchStartBlocks(
      baseConfig({ CRYPTO_PROCESSOR_BASE_RPC_URL: "https://base.example/rpc-secret" }),
      "usdc_arbitrum",
      readRailHead
    )).resolves.toEqual({
      1: 0n,
      8453: 50_000_000n
    });
    expect(readRailHead).toHaveBeenCalledOnce();
    expect(readRailHead).toHaveBeenCalledWith(expect.any(Object), "usdc_base");
  });

  it("issues no address when the rail endpoint fails chain verification", async () => {
    const query = vi.fn();
    const readRailHead = vi.fn().mockRejectedValue(new ApiError(
      502,
      "CRYPTO_CHAIN_SOURCE_UNAVAILABLE",
      "Crypto chain source is connected to the wrong network."
    ));
    const app = buildServer(baseConfig({
      CRYPTO_PROCESSOR_ENABLED: true,
      CRYPTO_PROCESSOR_WALLET_XPUB: receiveChainXpub,
      CRYPTO_PROCESSOR_WATCHER_ENABLED: true,
      CRYPTO_PROCESSOR_ARBITRUM_RPC_URL: "https://arbitrum.example/rpc-secret"
    }), {
      db: databaseWithTransaction(query),
      rateLimiter: createMemoryRateLimiter(),
      cryptoPaymentRailHeadReader: readRailHead
    });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/crypto/payment-intents",
        headers: {
          "content-type": "application/json",
          "x-user-id": userId
        },
        payload: {
          planId: "plus_monthly",
          idempotencyKey: "checkout-route-wrong-chain"
        }
      });

      expect(response.statusCode).toBe(502);
      expect(response.json()).toMatchObject({
        error: { code: "CRYPTO_CHAIN_SOURCE_UNAVAILABLE" }
      });
      expect(query).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("issues no address when a configured secondary endpoint fails chain verification", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("from crypto_chain_watch_cursors")) return { rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    });
    const readRailHead = vi.fn(async (_config: AppConfig, rail: string) => {
      if (rail === "usdc_arbitrum") return 123_456n;
      throw new ApiError(
        502,
        "CRYPTO_CHAIN_SOURCE_UNAVAILABLE",
        "Crypto chain source is connected to the wrong network."
      );
    });
    const app = buildServer(baseConfig({
      CRYPTO_PROCESSOR_ENABLED: true,
      CRYPTO_PROCESSOR_WALLET_XPUB: receiveChainXpub,
      CRYPTO_PROCESSOR_WATCHER_ENABLED: true,
      CRYPTO_PROCESSOR_ARBITRUM_RPC_URL: "https://arbitrum.example/rpc-secret",
      CRYPTO_PROCESSOR_BASE_RPC_URL: "https://base.example/rpc-secret"
    }), {
      db: databaseWithTransaction(query),
      rateLimiter: createMemoryRateLimiter(),
      cryptoPaymentRailHeadReader: readRailHead
    });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/crypto/payment-intents",
        headers: {
          "content-type": "application/json",
          "x-user-id": userId
        },
        payload: {
          planId: "plus_monthly",
          idempotencyKey: "checkout-route-secondary-wrong-chain"
        }
      });

      expect(response.statusCode).toBe(502);
      expect(response.json()).toMatchObject({
        error: { code: "CRYPTO_CHAIN_SOURCE_UNAVAILABLE" }
      });
      expect(readRailHead).toHaveBeenCalledWith(expect.any(Object), "usdc_arbitrum");
      expect(readRailHead).toHaveBeenCalledWith(expect.any(Object), "usdc_base");
      expect(query.mock.calls.some(([sql]) =>
        String(sql).includes("insert into crypto_payment_intents")
          || String(sql).includes("set payment_address = $2")
      )).toBe(false);
    } finally {
      await app.close();
    }
  });

  it("never returns fillable payment instructions for an expired intent", async () => {
    const paymentAddress = deriveCryptoReceivingAddress(receiveChainXpub, 1);
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        id: intentId,
        user_id: userId,
        plan_id: "plus_monthly",
        processor: "in_house" as const,
        asset: "USDC" as const,
        network: "arbitrum" as const,
        amount_usd_cents: 1899,
        quoted_amount_atomic: "18990000",
        derivation_index: 1,
        wallet_xpub_fingerprint: fingerprintCryptoWalletXpub(receiveChainXpub),
        payment_address: paymentAddress,
        status: "expired" as const,
        idempotency_key: "checkout-route-expired",
        metadata: { source: "store" },
        expires_at: "2026-08-22T18:00:00Z",
        created_at: "2026-08-22T17:30:00Z",
        updated_at: "2026-08-22T18:00:01Z",
        paid_at: null
      }] })
      .mockResolvedValueOnce({ rows: [] }); // Confirmation-progress lookup.
    const app = buildServer(baseConfig(), {
      db: databaseWithTransaction(query),
      rateLimiter: createMemoryRateLimiter()
    });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/crypto/payment-intents/${intentId}`,
        headers: { "x-user-id": userId }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        data: {
          id: intentId,
          status: "expired",
          paymentUri: null,
          qrCodeDataUrl: null
        }
      });
    } finally {
      await app.close();
    }
  });
});
