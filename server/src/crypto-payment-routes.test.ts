import { afterAll, describe, expect, it, vi } from "vitest";
import { buildServer } from "./app.js";
import { deriveCryptoReceivingAddress, fingerprintCryptoWalletXpub } from "./crypto-wallet.js";
import type { AppConfig } from "./config.js";
import type { DbClient } from "./db.js";
import { createMemoryRateLimiter } from "./rate-limit.js";

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
        network: "base",
        confirmationTarget: 1,
        rails: [
          {
            id: "usdc_base",
            asset: "USDC",
            network: "base",
            chainId: 8453,
            // Circle's own published address for native USDC on Base.
            tokenAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            decimals: 6,
            confirmationTarget: 30
          },
          {
            id: "pyusd_ethereum",
            asset: "PYUSD",
            network: "ethereum",
            chainId: 1,
            // PayPal's published PYUSD address on Ethereum mainnet.
            tokenAddress: "0x6c3ea9036406852006290770BEdFcAbA0e23A0e8",
            decimals: 6,
            confirmationTarget: 12
          }
        ]
      }
    });
    expect(response.body).not.toContain("XPUB");
    expect(response.body).not.toContain("WALLET");
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
  });

  it("derives the plan amount on the server and returns one account-linked address", async () => {
    const paymentAddress = deriveCryptoReceivingAddress(receiveChainXpub, 1);
    const commonRow = {
      id: intentId,
      user_id: userId,
      plan_id: "plus_monthly",
      processor: "in_house" as const,
      asset: "USDC" as const,
      network: "base" as const,
      amount_usd_cents: 1899,
      derivation_index: 1,
      wallet_xpub_fingerprint: fingerprintCryptoWalletXpub(receiveChainXpub),
      idempotency_key: "checkout-route-1",
      metadata: { source: "store" },
      expires_at: "2026-08-22T18:00:00Z",
      created_at: "2026-08-22T17:30:00Z",
      updated_at: "2026-08-22T17:30:00Z",
      paid_at: null
    };
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{
        ...commonRow,
        quoted_amount_atomic: null,
        payment_address: null,
        status: "pending" as const
      }] })
      .mockResolvedValueOnce({ rows: [{
        ...commonRow,
        quoted_amount_atomic: "18990000",
        payment_address: paymentAddress,
        status: "awaiting_payment" as const
      }] });
    const app = buildServer(baseConfig({
      CRYPTO_PROCESSOR_ENABLED: true,
      CRYPTO_PROCESSOR_WALLET_XPUB: receiveChainXpub
    }), {
      db: databaseWithTransaction(query),
      rateLimiter: createMemoryRateLimiter()
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
          idempotencyKey: "checkout-route-1"
        }
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body).toMatchObject({
        data: {
          id: intentId,
          planId: "plus_monthly",
          amountUsdCents: 1899,
          quotedAmountAtomic: "18990000",
          paymentAddress,
          asset: "USDC",
          network: "base",
          status: "awaiting_payment"
        }
      });
      expect(body.data.paymentUri).toBe(
        `ethereum:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913@8453/transfer?address=${paymentAddress}&uint256=18990000`
      );
      expect(body.data.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
      expect(response.body).not.toContain("walletXpub");
      expect(response.body).not.toContain("idempotencyKey");
      expect(query.mock.calls[0]?.[1]).toEqual(expect.arrayContaining([1899]));
    } finally {
      await app.close();
    }
  });
});
