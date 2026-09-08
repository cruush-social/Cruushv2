
vi.mock("./crypto-collection-fee.js", () => ({
  quoteCollectionFee: vi.fn().mockResolvedValue({
    version: 1, feeUsdCents: 1, estimatedCostWei: "5000000000000",
    ethUsd: "2000.00", sampledAt: "2026-09-08T12:00:00.000Z"
  })
}));
import { describe, expect, it, vi } from "vitest";
import {
  assertCryptoPaymentStatusTransition,
  buildCryptoPaymentUri,
  cancelCryptoPaymentIntent,
  canTransitionCryptoPaymentStatus,
  createBoundedCryptoPaymentQrCodeCache,
  expireStaleCryptoPaymentIntents,
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
    network: "arbitrum",
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
    CRYPTO_PROCESSOR_WATCHER_ENABLED: true,
    CRYPTO_PROCESSOR_ARBITRUM_RPC_URL: "https://arbitrum.example/rpc-secret",
    CRYPTO_PROCESSOR_BASE_RPC_URL: "",
    CRYPTO_PROCESSOR_ETHEREUM_RPC_URL: "",
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

function newIntentQuery(
  reserved: CryptoPaymentIntentRow,
  updated?: CryptoPaymentIntentRow
) {
  return vi.fn(async (sql: string, values: unknown[] = []) => {
    if (sql.includes("pg_advisory_xact_lock")) return { rows: [] };
    if (sql.includes("set status = 'expired'")) return { rows: [] };
    if (sql.includes("idempotency_key = $2")) return { rows: [] };
    if (sql.includes("wallet_xpub_fingerprint = $5")) return { rows: [] };
    if (sql.includes("open_count")) return { rows: [{ open_count: 0 }] };
    if (sql.includes("insert into crypto_payment_intents")) return { rows: [reserved] };
    if (sql.includes("set payment_address = $2")) return { rows: updated ? [{...updated, quoted_amount_atomic: values[2], metadata: {...updated.metadata, collectionFee: JSON.parse(String(values[4]))}}] : [] };
    if (sql.includes("insert into crypto_payment_watch_positions")) return { rows: [] };
    throw new Error(`Unexpected query: ${sql}`);
  });
}

describe("crypto payment core", () => {
  it("allows only explicit forward payment transitions", () => {
    expect(canTransitionCryptoPaymentStatus("pending", "awaiting_payment")).toBe(true);
    expect(canTransitionCryptoPaymentStatus("confirming", "paid")).toBe(true);
    expect(canTransitionCryptoPaymentStatus("pending", "paid")).toBe(false);
    expect(canTransitionCryptoPaymentStatus("paid", "pending")).toBe(false);
    // The watcher applies this transition only after locked authoritative
    // evidence proves the transfer was mined by expires_at.
    expect(canTransitionCryptoPaymentStatus("expired", "paid")).toBe(true);
    expect(() => assertCryptoPaymentStatusTransition("paid", "pending")).toThrow(/cannot move/);
  });

  it("keeps a member cancellation as a terminal audit row", async () => {
    const open = paymentRow({
      quoted_amount_atomic: "18990000",
      payment_address: "0x73659c60270d326c06Ac204F1A9C63f889a3D14B",
      status: "awaiting_payment"
    });
    const cancelled = paymentRow({
      ...open,
      status: "cancelled",
      metadata: { source: "store", cancelledBy: "member" }
    });
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (sql.includes("for update")) return { rows: [open] };
      if (sql.includes("set status = 'cancelled'")) return { rows: [cancelled] };
      throw new Error(`Unexpected query: ${sql}`);
    });

    const result = await cancelCryptoPaymentIntent(
      transactionDb(query),
      open.user_id,
      open.id
    );

    expect(result.status).toBe("cancelled");
    const update = query.mock.calls.find(([sql]) => String(sql).includes("set status = 'cancelled'"));
    expect(update?.[0]).toContain("metadata = metadata ||");
    expect(update?.[0]).not.toContain("expires_at");
    expect(update?.[0]).not.toContain("delete from");
  });

  it("never cancels after chain funds are detected", async () => {
    const confirming = paymentRow({ status: "confirming" });
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (sql.includes("for update")) return { rows: [confirming] };
      throw new Error(`Unexpected query: ${sql}`);
    });

    await expect(cancelCryptoPaymentIntent(
      transactionDb(query),
      confirming.user_id,
      confirming.id
    )).rejects.toThrow(/funds were already detected/i);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("set status = 'cancelled'"))).toBe(false);
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
      network: "arbitrum",
      status: "awaiting_payment"
    });
    expect(mapped).not.toHaveProperty("idempotencyKey");
    expect(mapped).not.toHaveProperty("walletXpubFingerprint");
    expect(mapped).not.toHaveProperty("derivationIndex");
  });

  it("builds a spec-compliant ERC-681 request URI only once an address and amount exist", () => {
    const notYetAssigned = mapCryptoPaymentIntent(paymentRow());
    expect(buildCryptoPaymentUri(notYetAssigned)).toBeNull();

    const usdcArbitrum = mapCryptoPaymentIntent(paymentRow({
      quoted_amount_atomic: "18990000",
      payment_address: "0x73659c60270d326c06Ac204F1A9C63f889a3D14B",
      status: "awaiting_payment"
    }));
    expect(buildCryptoPaymentUri(usdcArbitrum)).toBe(
      "ethereum:0xaf88d065e77c8cC2239327C5EDb3A432268e5831@42161/transfer?address=0x73659c60270d326c06Ac204F1A9C63f889a3D14B&uint256=18990000"
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

  it("only attaches payment instructions while an intent can still accept payment", async () => {
    const notYetAssigned = await withCryptoPaymentDisplay(mapCryptoPaymentIntent(paymentRow()));
    expect(notYetAssigned.paymentUri).toBeNull();
    expect(notYetAssigned.qrCodeDataUrl).toBeNull();

    const awaitingPayment = await withCryptoPaymentDisplay(mapCryptoPaymentIntent(paymentRow({
      quoted_amount_atomic: "18990000",
      payment_address: "0x73659c60270d326c06Ac204F1A9C63f889a3D14B",
      status: "awaiting_payment"
    })));
    expect(awaitingPayment.paymentUri).toMatch(/^ethereum:0x[0-9a-fA-F]+@42161\/transfer\?/);
    expect(awaitingPayment.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);

    for (const status of ["paid", "expired", "failed", "cancelled", "refunded"] as const) {
      const terminal = await withCryptoPaymentDisplay(mapCryptoPaymentIntent(paymentRow({
        quoted_amount_atomic: "18990000",
        payment_address: "0x73659c60270d326c06Ac204F1A9C63f889a3D14B",
        status
      })));

      expect(terminal.paymentAddress, `${status} must not expose a retired address`).toBeNull();
      expect(terminal.paymentUri, `${status} must not remain fillable`).toBeNull();
      expect(terminal.qrCodeDataUrl, `${status} must not retain a QR code`).toBeNull();
    }
  });

  it("reuses one QR encoding while polling and keeps the cache bounded", async () => {
    const encode = vi.fn(async (paymentUri: string) => `data:image/png;base64,${paymentUri}`);
    const qrCodeCache = createBoundedCryptoPaymentQrCodeCache(2, encode);
    const intent = mapCryptoPaymentIntent(paymentRow({
      quoted_amount_atomic: "18990000",
      payment_address: "0x73659c60270d326c06Ac204F1A9C63f889a3D14B",
      status: "awaiting_payment"
    }));

    const [firstPoll, secondPoll] = await Promise.all([
      withCryptoPaymentDisplay(intent, qrCodeCache),
      withCryptoPaymentDisplay(intent, qrCodeCache)
    ]);

    expect(firstPoll.qrCodeDataUrl).toBe(secondPoll.qrCodeDataUrl);
    expect(encode).toHaveBeenCalledTimes(1);

    await qrCodeCache.get("payment-uri-2");
    await qrCodeCache.get("payment-uri-3");
    expect(qrCodeCache.size).toBe(2);

    await qrCodeCache.get(firstPoll.paymentUri!);
    expect(encode).toHaveBeenCalledTimes(4);
    expect(qrCodeCache.size).toBe(2);
  });

  it("retries a QR encoding after a failed cache entry", async () => {
    const encode = vi.fn()
      .mockRejectedValueOnce(new Error("encode failed"))
      .mockResolvedValueOnce("data:image/png;base64,recovered");
    const qrCodeCache = createBoundedCryptoPaymentQrCodeCache(2, encode);

    await expect(qrCodeCache.get("payment-uri")).rejects.toThrow("encode failed");
    await expect(qrCodeCache.get("payment-uri")).resolves.toBe("data:image/png;base64,recovered");
    expect(encode).toHaveBeenCalledTimes(2);
  });

  it("reports readiness per rail and never exposes RPC endpoints", () => {
    const disabled = getCryptoProcessorStatus(cryptoConfig({
      CRYPTO_PROCESSOR_ENABLED: false,
      CRYPTO_PROCESSOR_WALLET_XPUB: ""
    }));
    expect(disabled).toMatchObject({
      ready: false,
      asset: "USDC",
      network: "arbitrum",
      confirmationTarget: 1
    });
    expect(disabled.rails.every((rail) => rail.ready === false)).toBe(true);

    const arbitrumOnly = getCryptoProcessorStatus(cryptoConfig());
    expect(arbitrumOnly).toMatchObject({
      ready: true,
      asset: "USDC",
      network: "arbitrum",
      confirmationTarget: 1
    });
    expect(arbitrumOnly.rails.map(({ id, ready }) => ({ id, ready }))).toEqual([
      { id: "usdc_arbitrum", ready: true },
      { id: "pyusd_arbitrum", ready: true },
      { id: "pyusd_ethereum", ready: false },
      { id: "usdc_base", ready: false }
    ]);
    expect(JSON.stringify(arbitrumOnly)).not.toContain("rpc-secret");
    expect(JSON.stringify(arbitrumOnly)).not.toContain("arbitrum.example");
  });

  it("sets global readiness when any one rail is ready", () => {
    const baseOnly = getCryptoProcessorStatus(cryptoConfig({
      CRYPTO_PROCESSOR_ARBITRUM_RPC_URL: "",
      CRYPTO_PROCESSOR_BASE_RPC_URL: "https://base.example/rpc-secret"
    }));

    expect(baseOnly.ready).toBe(true);
    expect(baseOnly.rails.find((rail) => rail.id === "usdc_base")?.ready).toBe(true);
    expect(baseOnly.rails.filter((rail) => rail.id !== "usdc_base").every((rail) => !rail.ready)).toBe(true);
  });

  it.each(
    [
      ["invalid wallet", { CRYPTO_PROCESSOR_WALLET_XPUB: "not-an-xpub" }],
      ["disabled watcher", { CRYPTO_PROCESSOR_WATCHER_ENABLED: false }],
      ["missing chain endpoints", { CRYPTO_PROCESSOR_ARBITRUM_RPC_URL: "" }]
    ] satisfies Array<[string, Partial<AppConfig>]>
  )("reports every rail unavailable with %s", (_reason, overrides) => {
    const status = getCryptoProcessorStatus(cryptoConfig(overrides));

    expect(status.ready).toBe(false);
    expect(status.rails.every((rail) => !rail.ready)).toBe(true);
  });

  it("rejects intent creation before touching the database when the watcher is disabled", async () => {
    const query = vi.fn();

    await expect(createInHouseCryptoPaymentIntent(transactionDb(query), cryptoConfig({
      CRYPTO_PROCESSOR_WATCHER_ENABLED: false
    }), {
      userId: "00000000-0000-4000-8000-000000000001",
      planId: "plus_monthly",
      amountUsdCents: 1899,
      idempotencyKey: "checkout-watcher-disabled"
    })).rejects.toMatchObject({ statusCode: 503, code: "CRYPTO_PROCESSOR_NOT_READY" });
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects an unwatchable Base intent even when another rail is ready", async () => {
    const query = vi.fn();

    await expect(createInHouseCryptoPaymentIntent(transactionDb(query), cryptoConfig(), {
      userId: "00000000-0000-4000-8000-000000000001",
      planId: "plus_monthly",
      amountUsdCents: 1899,
      idempotencyKey: "checkout-base-unwatchable",
      rail: "usdc_base"
    })).rejects.toMatchObject({ statusCode: 503, code: "CRYPTO_PROCESSOR_NOT_READY" });
    expect(query).not.toHaveBeenCalled();
  });

  it("reserves one database index before deriving a unique watch-only address", async () => {
    const address = deriveCryptoReceivingAddress(receiveChainXpub, 1);
    const query = newIntentQuery(
      paymentRow(),
      paymentRow({
        quoted_amount_atomic: "19000000",
        payment_address: address,
        watch_start_block: "123456",
        status: "awaiting_payment"
      })
    );

    await expect(createInHouseCryptoPaymentIntent(transactionDb(query), cryptoConfig(), {
      userId: "00000000-0000-4000-8000-000000000001",
      planId: "plus_monthly",
      amountUsdCents: 1899,
      idempotencyKey: "checkout-1",
      metadata: { source: "store" },
      watchStartBlock: 123456n
    })).resolves.toMatchObject({
      paymentAddress: address,
      quotedAmountAtomic: "19000000",
      gasFeeUsdCents: 1,
      totalUsdCents: 1900,
      status: "awaiting_payment"
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("on conflict (user_id, idempotency_key) do update"),
      expect.arrayContaining([1899, walletFingerprint, "checkout-1"])
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("and payment_address is null"),
      ["00000000-0000-4000-8000-000000000010", address, "19000000", "123456", expect.any(String)]
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("insert into crypto_payment_watch_positions"),
      [
        "00000000-0000-4000-8000-000000000010",
        42161,
        "123456",
        [1, 8453, 42161],
        [null, null, null]
      ]
    );
    const positionIndex = query.mock.calls.findIndex(([sql]) =>
      String(sql).includes("insert into crypto_payment_watch_positions")
    );
    const addressIndex = query.mock.calls.findIndex(([sql]) =>
      String(sql).includes("set payment_address = $2")
    );
    expect(positionIndex).toBeGreaterThanOrEqual(0);
    expect(positionIndex).toBeLessThan(addressIndex);
    expect(String(query.mock.calls[positionIndex]?.[0])).toContain(
      "coalesce(supported.supplied_origin, 0)"
    );
    expect(String(query.mock.calls[positionIndex]?.[0])).not.toContain("crypto_chain_watch_cursors");
  });

  it("never watches a mainnet chain for a worthless-token testnet order", async () => {
    // An intent is normally watched across every mainnet chain so a payment
    // sent to the right address on the wrong chain still settles. A testnet
    // order must not inherit that: faucet tokens are free, so a testnet
    // transfer that could settle a mainnet order would be free cruush+.
    const address = deriveCryptoReceivingAddress(receiveChainXpub, 1);
    const query = newIntentQuery(
      paymentRow({ network: "base-sepolia" }),
      paymentRow({
        network: "base-sepolia",
        quoted_amount_atomic: "19000000",
        payment_address: address,
        watch_start_block: "77",
        status: "awaiting_payment"
      })
    );

    await createInHouseCryptoPaymentIntent(transactionDb(query), cryptoConfig({
      CRYPTO_PROCESSOR_TESTNET_ENABLED: true,
      CRYPTO_PROCESSOR_BASE_SEPOLIA_RPC_URL: "https://base-sepolia.example/rpc"
    }), {
      userId: "00000000-0000-4000-8000-000000000001",
      planId: "plus_monthly",
      amountUsdCents: 1899,
      idempotencyKey: "checkout-1",
      metadata: { source: "store" },
      rail: "usdc_base_sepolia",
      watchStartBlock: 77n
    });

    const positionCall = query.mock.calls.find(([sql]) =>
      String(sql).includes("insert into crypto_payment_watch_positions")
    ) as unknown as [string, unknown[]] | undefined;
    const watchedChainIds = positionCall?.[1]?.[3];

    expect(watchedChainIds).toEqual([84532]);
    expect(watchedChainIds).not.toContain(42161);
    expect(watchedChainIds).not.toContain(8453);
    expect(watchedChainIds).not.toContain(1);
  });

  it("reserves an approved Ping pack without entering cruush+ supply logic", async () => {
    const address = deriveCryptoReceivingAddress(receiveChainXpub, 2);
    const reserved = paymentRow({
      plan_id: "ping_10",
      product_type: "ping_pack",
      amount_usd_cents: 799,
      derivation_index: 2,
      idempotency_key: "ping-pack-10"
    });
    const query = newIntentQuery(
      reserved,
      paymentRow({
        ...reserved,
        quoted_amount_atomic: "8000000",
        payment_address: address,
        watch_start_block: "123456",
        status: "awaiting_payment"
      })
    );

    await expect(createInHouseCryptoPaymentIntent(transactionDb(query), cryptoConfig(), {
      userId: reserved.user_id,
      planId: "ping_10",
      productType: "ping_pack",
      amountUsdCents: 799,
      idempotencyKey: "ping-pack-10",
      metadata: { source: "ping_pack_store", pingCount: 10 },
      watchStartBlock: 123456n
    })).resolves.toMatchObject({
      planId: "ping_10",
      productType: "ping_pack",
      amountUsdCents: 799,
      quotedAmountAtomic: "8000000",
      paymentAddress: address
    });

    const reservation = query.mock.calls.find(([sql]) =>
      String(sql).includes("insert into crypto_payment_intents")
    );
    expect((reservation as unknown as [string, unknown[]] | undefined)?.[1]).toEqual(expect.arrayContaining([
      "ping_10",
      "ping_pack",
      799,
      "ping-pack-10"
    ]));
    expect(query.mock.calls.some(([sql]) => String(sql).includes("reservation_count"))).toBe(false);
  });

  it("keeps the hidden PYUSD Ethereum backend rail available when its chain is watchable", async () => {
    const address = deriveCryptoReceivingAddress(receiveChainXpub, 1);
    const query = newIntentQuery(
      paymentRow({ asset: "PYUSD", network: "ethereum" }),
      paymentRow({ asset: "PYUSD", network: "ethereum", quoted_amount_atomic: "19000000", payment_address: address, status: "awaiting_payment" })
    );

    await expect(createInHouseCryptoPaymentIntent(transactionDb(query), cryptoConfig({
      CRYPTO_PROCESSOR_ETHEREUM_RPC_URL: "https://ethereum.example/rpc-secret"
    }), {
      userId: "00000000-0000-4000-8000-000000000001",
      planId: "plus_monthly",
      amountUsdCents: 1899,
      idempotencyKey: "checkout-pyusd",
      rail: "pyusd_ethereum"
    })).resolves.toMatchObject({ rail: "pyusd_ethereum", asset: "PYUSD", network: "ethereum", chainId: 1 });
  });

  it("never allocates the treasury derivation index to a payment intent", async () => {
    const query = newIntentQuery(paymentRow({ derivation_index: 0 }));

    await expect(createInHouseCryptoPaymentIntent(transactionDb(query), cryptoConfig(), {
      userId: "00000000-0000-4000-8000-000000000001",
      planId: "plus_monthly",
      amountUsdCents: 1899,
      idempotencyKey: "checkout-treasury-index"
    })).rejects.toThrow(/invalid wallet derivation index/);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("set payment_address = $2"))).toBe(false);
  });

  it("rejects reuse of an idempotency key for a different purchase", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (sql.includes("set status = 'expired'")) return { rows: [] };
      if (sql.includes("idempotency_key = $2")) {
        return { rows: [paymentRow({ plan_id: "plus_yearly" })] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    });

    await expect(createInHouseCryptoPaymentIntent(transactionDb(query), cryptoConfig(), {
      userId: "00000000-0000-4000-8000-000000000001",
      planId: "plus_monthly",
      amountUsdCents: 1899,
      idempotencyKey: "checkout-1"
    })).rejects.toMatchObject({ statusCode: 409, code: "VALIDATION_ERROR" });
    expect(query.mock.calls.some(([sql]) => String(sql).includes("insert into crypto_payment_intents"))).toBe(false);
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

describe("expiring stale checkout windows", () => {
  it("closes pending and awaiting_payment intents once the window has passed", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: "a" }, { id: "b" }] });
    const db = { query, end: vi.fn() } as unknown as DbClient;

    expect(await expireStaleCryptoPaymentIntents(db)).toBe(2);

    const sql = query.mock.calls[0]![0] as string;
    expect(sql).toContain("set status = 'expired'");
    expect(sql).toContain("status in ('pending', 'awaiting_payment')");
    expect(sql).toContain("expires_at < now()");
  });

  it("never expires an intent whose money has already been seen on chain", async () => {
    // 'confirming' means a transfer was observed. A checkout timer must not
    // discard a payment somebody actually sent.
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const db = { query, end: vi.fn() } as unknown as DbClient;

    await expireStaleCryptoPaymentIntents(db);

    const sql = query.mock.calls[0]![0] as string;
    expect(sql).not.toContain("confirming");
    expect(sql).not.toContain("paid");
  });
});
