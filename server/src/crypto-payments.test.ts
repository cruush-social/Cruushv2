import { describe, expect, it, vi } from "vitest";
import {
  assertCryptoPaymentStatusTransition,
  buildCryptoPaymentUri,
  canTransitionCryptoPaymentStatus,
  createInHouseCryptoPaymentIntent,
  getCryptoProcessorStatus,
  hashCryptoPaymentEventPayload,
  mapCryptoPaymentIntent,
  recordCryptoPaymentEvent,
  withCryptoPaymentDisplay,
  type CryptoPaymentIntentRow
} from "./crypto-payments.js";
import { deriveCryptoReceivingAddress, fingerprintCryptoWalletXpub } from "./crypto-wallet.js";
import type { AppConfig } from "./config.js";
import type { DbClient } from "./db.js";

const receiveChainXpub = "xpub6FHa3pjLCk84BayeJxFW2SP4XRrFd1JYnxeLeU8EqN3vDfZmbqBqaGJAyiLjTAwm6ZLRQUMv1ZACTj37sR62cfN7fe5JnJ7dh8zL4fiyLHV";
const walletFingerprint = fingerprintCryptoWalletXpub(receiveChainXpub);

function paymentRow(overrides: Partial<CryptoPaymentIntentRow> = {}): CryptoPaymentIntentRow {
  return {
    id: "00000000-0000-4000-8000-000000000010",
    user_id: "00000000-0000-4000-8000-000000000001",
    plan_id: "plus_monthly",
    processor: "in_house",
    asset: "USDC",
    network: "base",
    amount_usd_cents: 1899,
    quoted_amount_atomic: null,
    derivation_index: 1,
    wallet_xpub_fingerprint: walletFingerprint,
    payment_address: null,
    status: "pending",
    idempotency_key: "checkout-1",
    metadata: { source: "store" },
    expires_at: "2026-08-22T18:00:00Z",
    created_at: "2026-08-22T17:30:00Z",
    updated_at: "2026-08-22T17:30:00Z",
    paid_at: null,
    ...overrides
  };
}

function cryptoConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    CRYPTO_PROCESSOR_ENABLED: true,
    CRYPTO_PROCESSOR_WALLET_XPUB: receiveChainXpub,
    CRYPTO_PROCESSOR_CONFIRMATION_TARGET: 1,
    CRYPTO_PROCESSOR_INTENT_TTL_MINUTES: 30,
    ...overrides
  } as AppConfig;
}

function transactionDb(query: ReturnType<typeof vi.fn>): DbClient {
  const client = { query, end: vi.fn() } as unknown as DbClient;
  return {
    query,
    end: vi.fn(),
    transaction: async <T>(callback: (transactionClient: DbClient) => Promise<T>) => callback(client)
  } as DbClient;
}

describe("crypto payment core", () => {
  it("allows only explicit forward payment transitions and safe terminal repeats", () => {
    expect(canTransitionCryptoPaymentStatus("pending", "awaiting_payment")).toBe(true);
    expect(canTransitionCryptoPaymentStatus("confirming", "paid")).toBe(true);
    expect(canTransitionCryptoPaymentStatus("pending", "paid")).toBe(false);
    expect(canTransitionCryptoPaymentStatus("paid", "pending")).toBe(false);
    expect(canTransitionCryptoPaymentStatus("expired", "paid")).toBe(false);
    expect(() => assertCryptoPaymentStatusTransition("paid", "pending")).toThrow(/cannot move/);
  });

  it("maps database rows without exposing idempotency or wallet configuration", () => {
    const mapped = mapCryptoPaymentIntent(paymentRow({
      quoted_amount_atomic: "18990000",
      payment_address: "0x73659c60270d326c06Ac204F1A9C63f889a3D14B",
      status: "awaiting_payment"
    }));

    expect(mapped).toMatchObject({
      userId: "00000000-0000-4000-8000-000000000001",
      amountUsdCents: 1899,
      asset: "USDC",
      network: "base",
      status: "awaiting_payment"
    });
    expect(mapped).not.toHaveProperty("idempotencyKey");
    expect(mapped).not.toHaveProperty("walletXpubFingerprint");
    expect(mapped).not.toHaveProperty("derivationIndex");
  });

  it("builds a spec-compliant ERC-681 request URI only once an address and amount exist", () => {
    const notYetAssigned = mapCryptoPaymentIntent(paymentRow());
    expect(buildCryptoPaymentUri(notYetAssigned)).toBeNull();

    const usdcBase = mapCryptoPaymentIntent(paymentRow({
      quoted_amount_atomic: "18990000",
      payment_address: "0x73659c60270d326c06Ac204F1A9C63f889a3D14B",
      status: "awaiting_payment"
    }));
    expect(buildCryptoPaymentUri(usdcBase)).toBe(
      "ethereum:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913@8453/transfer?address=0x73659c60270d326c06Ac204F1A9C63f889a3D14B&uint256=18990000"
    );

    const pyusdEthereum = mapCryptoPaymentIntent(paymentRow({
      asset: "PYUSD",
      network: "ethereum",
      quoted_amount_atomic: "18990000",
      payment_address: "0x73659c60270d326c06Ac204F1A9C63f889a3D14B",
      status: "awaiting_payment"
    }));
    expect(buildCryptoPaymentUri(pyusdEthereum)).toBe(
      "ethereum:0x6c3ea9036406852006290770BEdFcAbA0e23A0e8@1/transfer?address=0x73659c60270d326c06Ac204F1A9C63f889a3D14B&uint256=18990000"
    );
  });

  it("only attaches a QR code once a payment URI exists, and never otherwise", async () => {
    const notYetAssigned = await withCryptoPaymentDisplay(mapCryptoPaymentIntent(paymentRow()));
    expect(notYetAssigned.paymentUri).toBeNull();
    expect(notYetAssigned.qrCodeDataUrl).toBeNull();

    const awaitingPayment = await withCryptoPaymentDisplay(mapCryptoPaymentIntent(paymentRow({
      quoted_amount_atomic: "18990000",
      payment_address: "0x73659c60270d326c06Ac204F1A9C63f889a3D14B",
      status: "awaiting_payment"
    })));
    expect(awaitingPayment.paymentUri).toMatch(/^ethereum:0x[0-9a-fA-F]+@8453\/transfer\?/);
    expect(awaitingPayment.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it("fails closed unless the processor and public wallet configuration are both ready", () => {
    expect(getCryptoProcessorStatus(cryptoConfig({
      CRYPTO_PROCESSOR_ENABLED: false,
      CRYPTO_PROCESSOR_WALLET_XPUB: ""
    }))).toEqual({
      ready: false,
      asset: "USDC",
      network: "base",
      rails: expect.any(Array),
      confirmationTarget: 1
    });

    expect(getCryptoProcessorStatus(cryptoConfig())).toEqual({
      ready: true,
      asset: "USDC",
      network: "base",
      rails: expect.any(Array),
      confirmationTarget: 1
    });
  });

  it("reserves one database index before deriving a unique watch-only address", async () => {
    const address = deriveCryptoReceivingAddress(receiveChainXpub, 1);
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [paymentRow()] })
      .mockResolvedValueOnce({ rows: [paymentRow({
        quoted_amount_atomic: "18990000",
        payment_address: address,
        status: "awaiting_payment"
      })] });

    await expect(createInHouseCryptoPaymentIntent(transactionDb(query), cryptoConfig(), {
      userId: "00000000-0000-4000-8000-000000000001",
      planId: "plus_monthly",
      amountUsdCents: 1899,
      idempotencyKey: "checkout-1",
      metadata: { source: "store" }
    })).resolves.toMatchObject({
      paymentAddress: address,
      quotedAmountAtomic: "18990000",
      status: "awaiting_payment"
    });

    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("on conflict (user_id, idempotency_key) do update"),
      expect.arrayContaining([1899, walletFingerprint, "checkout-1"])
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("and payment_address is null"),
      ["00000000-0000-4000-8000-000000000010", address, "18990000"]
    );
  });

  it("supports the Venmo-compatible PYUSD Ethereum rail without changing wallet derivation", async () => {
    const address = deriveCryptoReceivingAddress(receiveChainXpub, 1);
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [paymentRow({ asset: "PYUSD", network: "ethereum" })] })
      .mockResolvedValueOnce({ rows: [paymentRow({ asset: "PYUSD", network: "ethereum", quoted_amount_atomic: "18990000", payment_address: address, status: "awaiting_payment" })] });

    await expect(createInHouseCryptoPaymentIntent(transactionDb(query), cryptoConfig(), {
      userId: "00000000-0000-4000-8000-000000000001",
      planId: "plus_monthly",
      amountUsdCents: 1899,
      idempotencyKey: "checkout-pyusd",
      rail: "pyusd_ethereum"
    })).resolves.toMatchObject({ rail: "pyusd_ethereum", asset: "PYUSD", network: "ethereum", chainId: 1 });
  });

  it("never allocates the treasury derivation index to a payment intent", async () => {
    const query = vi.fn().mockResolvedValueOnce({
      rows: [paymentRow({ derivation_index: 0 })]
    });

    await expect(createInHouseCryptoPaymentIntent(transactionDb(query), cryptoConfig(), {
      userId: "00000000-0000-4000-8000-000000000001",
      planId: "plus_monthly",
      amountUsdCents: 1899,
      idempotencyKey: "checkout-treasury-index"
    })).rejects.toThrow(/invalid wallet derivation index/);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("rejects reuse of an idempotency key for a different purchase", async () => {
    const query = vi.fn().mockResolvedValueOnce({
      rows: [paymentRow({ plan_id: "plus_yearly" })]
    });

    await expect(createInHouseCryptoPaymentIntent(transactionDb(query), cryptoConfig(), {
      userId: "00000000-0000-4000-8000-000000000001",
      planId: "plus_monthly",
      amountUsdCents: 1899,
      idempotencyKey: "checkout-1"
    })).rejects.toMatchObject({ statusCode: 409, code: "VALIDATION_ERROR" });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("deduplicates chain events at the database boundary", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: "event-1" }] });
    const db = { query, end: vi.fn() } as unknown as DbClient;
    const payloadBytes = Buffer.from('{"transaction":"0xabc"}', "utf8");

    await expect(recordCryptoPaymentEvent(db, {
      externalEventId: "8453:0xabc:0",
      eventType: "transfer.observed",
      payloadBytes,
      payload: { transaction: "0xabc", logIndex: 0 }
    })).resolves.toEqual({ inserted: true, eventId: "event-1" });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("on conflict (source, external_event_id) do nothing"),
      [
        "8453:0xabc:0",
        "transfer.observed",
        JSON.stringify({ transaction: "0xabc", logIndex: 0 }),
        hashCryptoPaymentEventPayload(payloadBytes)
      ]
    );
  });
});
