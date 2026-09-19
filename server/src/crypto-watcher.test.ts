import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import pg from "pg";
import {
  MAX_BLOCKS_PER_SCAN,
  MAX_RECIPIENT_TOPICS_PER_LOG_QUERY,
  REORG_SAFETY_DEPTH,
  failStaleConfirmingIntents,
  ingestCryptoPaymentReceipt,
  loadWatchableIntents,
  planScanRange,
  resolveSettlementPolicy,
  runCryptoWatcherPass,
  settleIntent,
  type WatchableIntent,
  type WatcherPassResult
} from "./crypto-watcher.js";
import {
  ERC20_TRANSFER_TOPIC,
  addressToTopic,
  type ChainLog,
  type ChainSource
} from "./crypto-chain-source.js";
import { DEFAULT_CRYPTO_SETTLEMENT_POLICY } from "./crypto-settlement-policy.js";
import type { AppConfig } from "./config.js";
import { createPool, type DbClient } from "./db.js";

const intentId = "00000000-0000-4000-8000-000000000010";
const userId = "00000000-0000-4000-8000-000000000001";
const paymentAddress = "0x73659c60270d326c06ac204f1a9c63f889a3d14b";
const senderAddress = "0x8e23ee67d1332ad560396262c48ffbb01f93d052";
const usdcOnBase = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const usdcOnArbitrum = "0xaf88d065e77c8cc2239327c5edb3a432268e5831";
const pyusdOnArbitrum = "0x46850ad61c2b7d64d08c9c754f45254596696984";

function watchableIntent(overrides: Partial<WatchableIntent> = {}): WatchableIntent {
  return {
    id: intentId,
    userId,
    planId: "plus_monthly",
    status: "awaiting_payment",
    paymentAddress,
    quotedAmountAtomic: "18990000",
    rail: "usdc_base",
    watchStartBlock: "900",
    expiresAt: "2026-09-01T00:30:00.000Z",
    ...overrides
  };
}

function transferLog(overrides: Partial<ChainLog> = {}): ChainLog {
  return {
    address: usdcOnBase,
    topics: [ERC20_TRANSFER_TOPIC, addressToTopic(senderAddress), addressToTopic(paymentAddress)],
    data: `0x${(18_990_000).toString(16).padStart(64, "0")}`,
    blockNumber: 1000n,
    blockHash: `0x${"a".repeat(64)}`,
    transactionHash: `0x${"b".repeat(64)}`,
    logIndex: 3,
    removed: false,
    ...overrides
  };
}

function chainSource(
  logs: ChainLog[],
  headBlock = 1000n,
  chainId = 8453,
  blockTimestamp = new Date("2026-09-01T00:00:00.000Z")
): ChainSource {
  return {
    chainId,
    getChainId: vi.fn().mockResolvedValue(chainId),
    getBlockNumber: vi.fn().mockResolvedValue(headBlock),
    getBlockTimestamp: vi.fn().mockResolvedValue(blockTimestamp),
    getLogs: vi.fn().mockResolvedValue(logs)
  };
}

function receiptSource(
  logs: ChainLog[],
  headBlock = 1029n,
  chainId = 8453,
  blockTimestamp = new Date("2026-09-01T00:00:00.000Z")
): ChainSource {
  const source = chainSource(logs, headBlock, chainId, blockTimestamp);
  return {
    ...source,
    getTransactionReceipt: vi.fn().mockResolvedValue({
      transactionHash: transferLog().transactionHash,
      blockNumber: 1000n,
      blockHash: transferLog().blockHash,
      succeeded: true,
      logs
    })
  };
}

/**
 * A database stub that answers by SQL shape. Each entry is [matcher, rows].
 * Anything unmatched returns no rows, so a query this test did not think about
 * fails loudly rather than silently returning something plausible.
 */
function stubDb(handlers: Array<[RegExp, unknown[] | ((values: unknown[]) => unknown[])]>) {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    calls.push({ sql, values });
    for (const [matcher, rows] of handlers) {
      if (matcher.test(sql)) {
        return { rows: typeof rows === "function" ? rows(values) : rows };
      }
    }
    if (/from crypto_payment_intents/.test(sql) && /for update/.test(sql)) {
      return {
        rows: [{
          id: intentId,
          user_id: userId,
          plan_id: "plus_monthly",
          status: "awaiting_payment",
          payment_address: paymentAddress,
          quoted_amount_atomic: "18990000",
          asset: "USDC",
          network: "base",
          watch_start_block: "900",
          expires_at: "2026-09-01T00:30:00.000Z",
          entitlement_granted_at: null
        }]
      };
    }
    if (/pg_try_advisory_xact_lock/.test(sql)) {
      return { rows: [{ acquired: true }] };
    }
    if (/with current_entitlement/.test(sql)) {
      return { rows: [{ current_period_ends_at: "2026-10-01T00:00:00.000Z" }] };
    }
    if (/insert into user_entitlements/.test(sql)) {
      return {
        rows: [{
          cruush_plus_enabled: true,
          cruush_plus_expires_at: "2026-10-01T00:00:00.000Z"
        }]
      };
    }
    return { rows: [] };
  });

  const db = { query, end: vi.fn() } as unknown as DbClient;
  return { db, query, calls };
}

function config(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    CRYPTO_PROCESSOR_ENABLED: true,
    CRYPTO_PROCESSOR_CONFIRMATION_TARGET: 1,
    CRYPTO_PROCESSOR_INTENT_TTL_MINUTES: 30,
    ...overrides
  } as AppConfig;
}

describe("scan range planning", () => {
  it("re-reads the reorganization window behind the cursor, so dropped logs are noticed", () => {
    const range = planScanRange({ cursor: 1_000n, headBlock: 1_100n, confirmationTarget: 1 });

    expect(range).toEqual({ fromBlock: 1_000n - REORG_SAFETY_DEPTH, toBlock: 1_100n });
  });

  it("never reads more than one bounded step, so a far-behind watcher catches up gradually", () => {
    const range = planScanRange({ cursor: 10_000n, headBlock: 10_000_000n, confirmationTarget: 1 });

    expect(range!.toBlock - range!.fromBlock + 1n).toBe(MAX_BLOCKS_PER_SCAN);
  });

  it("does not read the whole chain on a first run", () => {
    const range = planScanRange({ cursor: null, headBlock: 10_000_000n, confirmationTarget: 1 });

    expect(range!.fromBlock).toBe(10_000_000n - MAX_BLOCKS_PER_SCAN);
  });

  it("starts a missing cursor at the durable payment-address origin", () => {
    const range = planScanRange({
      cursor: null,
      headBlock: 10_000_000n,
      confirmationTarget: 240,
      watchStartBlock: 9_990_000n
    });

    expect(range).toEqual({
      fromBlock: 9_990_000n,
      toBlock: 9_990_000n + MAX_BLOCKS_PER_SCAN - 1n
    });
  });

  it("clamps to block zero on a very short chain", () => {
    expect(planScanRange({ cursor: 5n, headBlock: 10n, confirmationTarget: 1 })).toEqual({
      fromBlock: 0n,
      toBlock: 10n
    });
  });

  it("declines to scan when the cursor is already ahead of the head", () => {
    expect(planScanRange({ cursor: 5_000n, headBlock: 10n, confirmationTarget: 1 })).toBeNull();
  });
});

describe("watchable intents", () => {
  it("keeps expired intents watchable for bounded transfer evidence", async () => {
    const { db, calls } = stubDb([[/from crypto_payment_intents/, []]]);

    await loadWatchableIntents(db, 8453, DEFAULT_CRYPTO_SETTLEMENT_POLICY);

    expect(calls[0]!.values[0]).toEqual(["awaiting_payment", "confirming", "expired"]);
  });

  it("stops observing expired intents when late evidence watching is disabled", async () => {
    const { db, calls } = stubDb([[/from crypto_payment_intents/, []]]);

    await loadWatchableIntents(db, 8453, { ...DEFAULT_CRYPTO_SETTLEMENT_POLICY, acceptLatePayment: false });

    expect(calls[0]!.values[0]).toEqual(["awaiting_payment", "confirming"]);
  });

  it("never watches a mainnet order on a worthless-token chain, or the reverse", async () => {
    // An intent is watched across chains so a payment sent to the right address
    // on the wrong chain still settles. Crossing the testnet boundary would let
    // a free faucet transfer settle a real mainnet order.
    const rows = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        user_id: "22222222-2222-4222-8222-222222222222",
        plan_id: "plus_monthly",
        status: "awaiting_payment",
        product_type: "cruush_plus",
        payment_address: "0x1111111111111111111111111111111111111111",
        quoted_amount_atomic: "1899000",
        asset: "USDC",
        network: "arbitrum",
        watch_start_block: "10",
        expires_at: new Date("2099-01-01T00:00:00Z")
      },
      {
        id: "33333333-3333-4333-8333-333333333333",
        user_id: "22222222-2222-4222-8222-222222222222",
        plan_id: "ping_3",
        status: "awaiting_payment",
        product_type: "ping_pack",
        payment_address: "0x3333333333333333333333333333333333333333",
        quoted_amount_atomic: "2990000",
        asset: "USDC",
        network: "base-sepolia",
        watch_start_block: "10",
        expires_at: new Date("2099-01-01T00:00:00Z")
      }
    ];

    const onTestnet = await loadWatchableIntents(
      stubDb([[/from crypto_payment_intents/, rows]]).db,
      84532,
      DEFAULT_CRYPTO_SETTLEMENT_POLICY
    );
    const onMainnet = await loadWatchableIntents(
      stubDb([[/from crypto_payment_intents/, rows]]).db,
      42161,
      DEFAULT_CRYPTO_SETTLEMENT_POLICY
    );

    expect(onTestnet.map((intent) => intent.rail)).toEqual(["usdc_base_sepolia"]);
    expect(onMainnet.map((intent) => intent.rail)).toEqual(["usdc_arbitrum"]);
  });

  it("stops watching abandoned checkouts after the late-arrival window", async () => {
    // The leak this closes: accepting late payment without a bound means every
    // abandoned checkout is watched forever, so the watch set only grows and
    // the watcher polls for eternity on payments that will never arrive.
    const { db, calls } = stubDb([[/from crypto_payment_intents/, []]]);

    await loadWatchableIntents(db, 8453, DEFAULT_CRYPTO_SETTLEMENT_POLICY);

    expect(calls[0]!.sql).toContain("status <> 'expired' or expires_at > now()");
    expect(calls[0]!.values[1]).toBe(DEFAULT_CRYPTO_SETTLEMENT_POLICY.lateArrivalWatchDays);
    expect(DEFAULT_CRYPTO_SETTLEMENT_POLICY.lateArrivalWatchDays).toBe(7);
  });

  it("loads every watchable address on each supported chain for wrong-network evidence", async () => {
    const { db, calls } = stubDb([[/from crypto_payment_intents/, [{
      id: intentId,
      user_id: userId,
      plan_id: "plus_monthly",
      status: "awaiting_payment",
      payment_address: paymentAddress,
      quoted_amount_atomic: "18990000",
      asset: "USDC",
      network: "base",
      watch_start_block: "900",
      expires_at: "2026-09-01T00:30:00.000Z"
    }]]]);

    const intents = await loadWatchableIntents(db, 1, DEFAULT_CRYPTO_SETTLEMENT_POLICY);

    expect(intents).toHaveLength(1);
    expect(intents[0]?.rail).toBe("usdc_base");
    expect(calls[0]!.sql).not.toContain("asset = any");
    expect(calls[0]!.sql).not.toContain("network = any");
  });

  it("fails stale confirming intents with a truthful note while preserving transfer evidence", async () => {
    const { db, calls } = stubDb([[/set status = 'failed'/, [{ id: intentId }]]]);

    expect(await failStaleConfirmingIntents(db, DEFAULT_CRYPTO_SETTLEMENT_POLICY)).toBe(1);

    const cleanup = calls[0]!;
    expect(cleanup.sql).toContain("where status = 'confirming'");
    expect(cleanup.sql).toContain("expires_at <= now() - ($1::integer * interval '1 day')");
    expect(cleanup.sql).not.toContain("crypto_payment_transfers");
    expect(cleanup.values[0]).toBe(DEFAULT_CRYPTO_SETTLEMENT_POLICY.lateArrivalWatchDays);
    expect(cleanup.values[1]).toContain("did not settle this checkout within the 7-day post-expiry watch window");
    expect(cleanup.values[1]).toContain("Transfer evidence was preserved for support review");
  });
});

describe("settling one intent", () => {
  it("requires every atomic unit of a fee-bearing quote before granting", async () => {
    for (const total of ["18990000", "19000000"]) {
      const { db, calls } = stubDb([
        [/from crypto_payment_intents[\s\S]*for update/, [{
          id: intentId, user_id: userId, plan_id: "plus_monthly", status: "awaiting_payment",
          payment_address: paymentAddress, quoted_amount_atomic: "19000000", asset: "USDC", network: "base",
          watch_start_block: "900", expires_at: "2026-09-01T00:30:00.000Z", entitlement_granted_at: null,
          metadata: { collectionFee: { feeUsdCents: 1 } }
        }]],
        [/coalesce\(sum\(amount_atomic/, [{ total }]],
        [/set status = 'paid'/, [{ id: intentId }]]
      ]);
      const result = await settleIntent({ db }, watchableIntent(), DEFAULT_CRYPTO_SETTLEMENT_POLICY);
      expect(result.granted).toBe(total === "19000000");
      expect(calls.some(({sql}) => /entitlement_granted_at = now\(\)/.test(sql))).toBe(total === "19000000");
    }
  });

  it("grants exactly once when the confirmed total covers the quote", async () => {
    const { db, query } = stubDb([
      [/coalesce\(sum\(amount_atomic/, [{ total: "18990000" }]],
      [/set status = 'paid'/, [{ id: intentId }]]
    ]);
    const grantedCalls = query.mock.calls;

    const result = await settleIntent({ db }, watchableIntent(), DEFAULT_CRYPTO_SETTLEMENT_POLICY);

    expect(result).toMatchObject({ settled: true, granted: true });
    expect(grantedCalls.some(([sql]) => /entitlement_granted_at = now\(\)/.test(sql as string))).toBe(true);
  });

  it("grants a paid Ping pack once instead of cruush+ time", async () => {
    const { db, calls } = stubDb([
      [/from crypto_payment_intents[\s\S]*for update/, [{
        id: intentId,
        user_id: userId,
        plan_id: "ping_10",
        product_type: "ping_pack",
        status: "awaiting_payment",
        payment_address: paymentAddress,
        quoted_amount_atomic: "7990000",
        asset: "USDC",
        network: "base",
        watch_start_block: "900",
        expires_at: "2026-09-01T00:30:00.000Z",
        entitlement_granted_at: null
      }]],
      [/coalesce\(sum\(amount_atomic/, [{ total: "7990000" }]],
      [/set status = 'paid'/, [{ id: intentId }]],
      [/insert into ping_pack_purchases/, [{ id: "00000000-0000-4000-8000-000000000099" }]]
    ]);

    const result = await settleIntent(
      { db },
      watchableIntent({
        planId: "ping_10",
        productType: "ping_pack",
        quotedAmountAtomic: "7990000"
      }),
      DEFAULT_CRYPTO_SETTLEMENT_POLICY
    );

    expect(result).toMatchObject({ settled: true, granted: true });
    const grant = calls.find((call) => /insert into ping_pack_purchases/.test(call.sql));
    expect(grant?.values).toEqual([userId, intentId, "ping_10", 10, 799, "USD"]);
    expect(calls.some((call) => /with current_entitlement/.test(call.sql))).toBe(false);
    expect(calls.some((call) => /entitlement_granted_at = now\(\)/.test(call.sql))).toBe(true);
  });

  it("claims, grants, and records in one transaction so a failed grant strands nobody", async () => {
    // Three separate statements left a member committed as paid with no
    // entitlement if anything failed in between, and loadWatchableIntents
    // excludes paid, so the watcher would never revisit them.
    const used: string[] = [];
    const query = vi.fn(async (sql: string) => {
      used.push(sql);
      if (/from crypto_payment_intents/.test(sql) && /for update/.test(sql)) {
        return {
          rows: [{
            id: intentId,
            user_id: userId,
            plan_id: "plus_monthly",
            status: "awaiting_payment",
            payment_address: paymentAddress,
            quoted_amount_atomic: "18990000",
            asset: "USDC",
            network: "base",
            watch_start_block: "900",
            expires_at: "2026-09-01T00:30:00.000Z",
            entitlement_granted_at: null
          }]
        };
      }
      if (/coalesce\(sum\(amount_atomic/.test(sql)) return { rows: [{ total: "18990000" }] };
      if (/set status = 'paid'/.test(sql)) return { rows: [{ id: intentId }] };
      if (/with current_entitlement/.test(sql)) {
        return { rows: [{ current_period_ends_at: "2026-10-01T00:00:00.000Z" }] };
      }
      if (/insert into user_entitlements/.test(sql)) {
        return {
          rows: [{
            cruush_plus_enabled: true,
            cruush_plus_expires_at: "2026-10-01T00:00:00.000Z"
          }]
        };
      }
      return { rows: [] };
    });
    let ranInTransaction = false;
    const db = {
      query,
      end: vi.fn(),
      transaction: async <T>(cb: (c: DbClient) => Promise<T>) => {
        ranInTransaction = true;
        return cb({ query, end: vi.fn() } as unknown as DbClient);
      }
    } as unknown as DbClient;

    const result = await settleIntent({ db }, watchableIntent(), DEFAULT_CRYPTO_SETTLEMENT_POLICY);

    expect(result).toMatchObject({ settled: true, granted: true });
    expect(ranInTransaction).toBe(true);
    // The claim and the grant record are both inside it.
    expect(used.some((sql) => /set status = 'paid'/.test(sql))).toBe(true);
    expect(used.some((sql) => /entitlement_granted_at = now\(\)/.test(sql))).toBe(true);
  });

  it("reports no settlement when another pass already claimed the intent", async () => {
    // The claiming update matches no row, which is what a concurrent pass sees.
    const { db } = stubDb([
      [/coalesce\(sum\(amount_atomic/, [{ total: "18990000" }]],
      [/set status = 'paid'/, []]
    ]);

    expect(await settleIntent({ db }, watchableIntent(), DEFAULT_CRYPTO_SETTLEMENT_POLICY))
      .toMatchObject({ settled: false, granted: false });
  });

  it("claims the paid transition only from a currently payable, ungranted row", async () => {
    const { db, calls } = stubDb([
      [/coalesce\(sum\(amount_atomic/, [{ total: "18990000" }]],
      [/set status = 'paid'/, [{ id: intentId }]]
    ]);

    await settleIntent({ db }, watchableIntent(), DEFAULT_CRYPTO_SETTLEMENT_POLICY);

    const claim = calls.find((call) => /set status = 'paid'/.test(call.sql))!;
    expect(claim.sql).toContain("status in ('awaiting_payment', 'confirming', 'expired')");
    expect(claim.sql).toContain("entitlement_granted_at is null");
  });

  it("moves a partly paid intent to confirming and grants nothing", async () => {
    const { db, calls } = stubDb([
      [/coalesce\(sum\(amount_atomic/, [{ total: "1000000" }]]
    ]);

    const result = await settleIntent({ db }, watchableIntent(), DEFAULT_CRYPTO_SETTLEMENT_POLICY);

    expect(result).toMatchObject({ settled: false, granted: false });
    expect(result.note).toContain("Waiting for");
    const confirming = calls.find((call) => /set status = 'confirming'/.test(call.sql))!;
    expect(confirming.sql).toContain("status in ('awaiting_payment', 'confirming')");
    expect(calls.some((call) => /set status = 'paid'/.test(call.sql))).toBe(false);
  });

  it("does nothing at all when no money has confirmed yet", async () => {
    const { db, calls } = stubDb([[/coalesce\(sum\(amount_atomic/, [{ total: "0" }]]]);

    expect(await settleIntent({ db }, watchableIntent(), DEFAULT_CRYPTO_SETTLEMENT_POLICY))
      .toMatchObject({ settled: false, granted: false });
    expect(calls.some((call) => /update crypto_payment_intents/.test(call.sql))).toBe(false);
  });

  it("refuses to settle an intent that is already terminal", async () => {
    const { db, query } = stubDb([[/coalesce\(sum\(amount_atomic/, [{ total: "18990000" }]]]);

    for (const status of ["failed", "cancelled", "refunded"] as const) {
      expect(await settleIntent({ db }, watchableIntent({ status }), DEFAULT_CRYPTO_SETTLEMENT_POLICY))
        .toMatchObject({ settled: false, granted: false });
    }

    expect(query).not.toHaveBeenCalled();
  });

  it("settles an expired scheduler state when chain evidence proves the payment arrived before expiry", async () => {
    const { db } = stubDb([
      [/from crypto_payment_intents[\s\S]*for update/, [{
        id: intentId,
        user_id: userId,
        plan_id: "plus_monthly",
        status: "expired",
        payment_address: paymentAddress,
        quoted_amount_atomic: "18990000",
        asset: "USDC",
        network: "base",
        watch_start_block: "900",
        expires_at: "2026-09-01T00:30:00.000Z",
        entitlement_granted_at: null
      }]],
      [/coalesce\(sum\(amount_atomic/, [{ total: "18990000" }]],
      [/set status = 'paid'/, [{ id: intentId }]]
    ]);

    expect(await settleIntent({ db }, watchableIntent({ status: "expired" }), DEFAULT_CRYPTO_SETTLEMENT_POLICY))
      .toMatchObject({ settled: true, granted: true });
  });

  it("records a confirmed lifetime payment without retrying a lifetime grant that is already active", async () => {
    const { db, calls } = stubDb([
      [/from crypto_payment_intents[\s\S]*for update/, [{
        id: intentId,
        user_id: userId,
        plan_id: "lifetime_founder",
        status: "expired",
        payment_address: paymentAddress,
        quoted_amount_atomic: "999990000",
        asset: "USDC",
        network: "base",
        watch_start_block: "900",
        expires_at: "2026-09-01T00:30:00.000Z",
        entitlement_granted_at: null
      }]],
      [/coalesce\(sum\(amount_atomic/, [{ total: "999990000" }]],
      [/from cruush_plus_lifetime_access/, [{ has_lifetime_access: true }]],
      [/set status = 'paid'/, [{ id: intentId }]]
    ]);

    const result = await settleIntent(
      { db },
      watchableIntent({
        planId: "lifetime_founder",
        status: "expired",
        quotedAmountAtomic: "999990000"
      }),
      DEFAULT_CRYPTO_SETTLEMENT_POLICY
    );

    expect(result).toMatchObject({
      settled: true,
      granted: false,
      note: expect.stringContaining("lifetime cruush+ was already active")
    });
    const claim = calls.find((call) => /set status = 'paid'/.test(call.sql))!;
    expect(claim.values[2]).toContain("Support review is required");
    expect(calls.some((call) => /insert into cruush_plus_lifetime_access/.test(call.sql))).toBe(false);
    expect(calls.some((call) => /entitlement_granted_at = now\(\)/.test(call.sql))).toBe(false);
  });

  it("leaves an expired intent alone when late payment is turned off", async () => {
    const { db, query } = stubDb([[/coalesce\(sum\(amount_atomic/, [{ total: "18990000" }]]]);

    expect(await settleIntent(
      { db },
      watchableIntent({ status: "expired" }),
      { ...DEFAULT_CRYPTO_SETTLEMENT_POLICY, acceptLatePayment: false }
    )).toMatchObject({ settled: false, granted: false });
    expect(query).not.toHaveBeenCalled();
  });

  it("grants on an overpayment and records the excess for support visibility", async () => {
    const { db, calls } = stubDb([
      [/coalesce\(sum\(amount_atomic/, [{ total: "25000000" }]],
      [/set status = 'paid'/, [{ id: intentId }]]
    ]);

    const result = await settleIntent({ db }, watchableIntent(), DEFAULT_CRYPTO_SETTLEMENT_POLICY);

    expect(result.granted).toBe(true);
    expect(result.note).toContain("recorded for support visibility");
    const claim = calls.find((call) => /set status = 'paid'/.test(call.sql))!;
    expect(claim.values[1]).toBe("25000000");
  });

  it("sums several confirmed transfers, so a payment split across transactions still settles", async () => {
    // The sum query is what adds them up; this proves settlement reads the sum,
    // not any single transfer.
    const { db } = stubDb([
      [/coalesce\(sum\(amount_atomic/, [{ total: "18990000" }]],
      [/set status = 'paid'/, [{ id: intentId }]]
    ]);

    expect(await settleIntent({ db }, watchableIntent(), DEFAULT_CRYPTO_SETTLEMENT_POLICY))
      .toMatchObject({ settled: true, granted: true });
  });

  it("only counts confirmed transfers for the intent's exact chain and token contract", async () => {
    const { db, calls } = stubDb([
      [/coalesce\(sum\(amount_atomic/, [{ total: "18990000" }]],
      [/set status = 'paid'/, [{ id: intentId }]]
    ]);

    await settleIntent({ db }, watchableIntent(), DEFAULT_CRYPTO_SETTLEMENT_POLICY);

    const sum = calls.find((call) => /coalesce\(sum\(amount_atomic/.test(call.sql))!;
    expect(sum.sql).toContain("status = 'confirmed'");
    expect(sum.sql).toContain("chain_id = $2");
    expect(sum.sql).toContain("lower(transfer.token_address) = $3");
    expect(sum.sql).toContain("block_timestamp <= $4::timestamptz");
    expect(sum.sql).toContain("block_number > $5::bigint");
    expect(sum.sql).toContain("for update");
    expect(sum.values).toEqual([intentId, 8453, usdcOnBase, "2026-09-01T00:30:00.000Z", "900"]);
  });

  it("takes the member, intent, evidence, then limited-plan locks in one order", async () => {
    const { db, calls } = stubDb([
      [/from crypto_payment_intents[\s\S]*for update/, [{
        id: intentId,
        user_id: userId,
        plan_id: "founder_annual",
        status: "awaiting_payment",
        payment_address: paymentAddress,
        quoted_amount_atomic: "99990000",
        asset: "USDC",
        network: "base",
        watch_start_block: "900",
        expires_at: "2026-09-01T00:30:00.000Z",
        entitlement_granted_at: null
      }]],
      [/coalesce\(sum\(amount_atomic/, [{ total: "99990000" }]],
      [/set status = 'paid'/, [{ id: intentId }]],
      [/as reserved/, [{ reserved: true }]],
      [/reservation_count/, [{ reservation_count: 1 }]]
    ]);

    const result = await settleIntent(
      { db },
      watchableIntent({ planId: "founder_annual", quotedAmountAtomic: "99990000" }),
      DEFAULT_CRYPTO_SETTLEMENT_POLICY
    );

    expect(result.granted).toBe(true);
    const memberLock = calls.findIndex((call) =>
      /pg_advisory_xact_lock/.test(call.sql)
      && String(call.values[0]).includes("crypto-purchase:user")
    );
    const intentLock = calls.findIndex((call) =>
      /from crypto_payment_intents/.test(call.sql) && /for update/.test(call.sql)
    );
    const evidenceLock = calls.findIndex((call) =>
      /from crypto_payment_transfers/.test(call.sql) && /for update/.test(call.sql)
    );
    const planLock = calls.findIndex((call) =>
      /pg_advisory_xact_lock/.test(call.sql)
      && String(call.values[0]).includes("crypto-supply:plan")
    );
    expect([memberLock, intentLock, evidenceLock, planLock].every((index) => index >= 0)).toBe(true);
    expect(memberLock).toBeLessThan(intentLock);
    expect(intentLock).toBeLessThan(evidenceLock);
    expect(evidenceLock).toBeLessThan(planLock);
  });

  it("recomputes locked evidence inside the claim transaction after a concurrent reorganization", async () => {
    let insideTransaction = false;
    const used: string[] = [];
    const query = vi.fn(async (sql: string) => {
      used.push(sql);
      if (/from crypto_payment_intents/.test(sql) && /for update/.test(sql)) {
        return {
          rows: [{
            id: intentId,
            user_id: userId,
            plan_id: "plus_monthly",
            status: "awaiting_payment",
            payment_address: paymentAddress,
            quoted_amount_atomic: "18990000",
            asset: "USDC",
            network: "base",
            watch_start_block: "900",
            expires_at: "2026-09-01T00:30:00.000Z",
            entitlement_granted_at: null
          }]
        };
      }
      if (/from crypto_payment_transfers/.test(sql)) {
        expect(insideTransaction).toBe(true);
        expect(sql).toContain("for update");
        // The competing reorganization committed before this lock was won.
        return { rows: [{ total: "0" }] };
      }
      return { rows: [] };
    });
    const db = {
      query,
      end: vi.fn(),
      transaction: async <T>(cb: (client: DbClient) => Promise<T>) => {
        insideTransaction = true;
        try {
          return await cb({ query, end: vi.fn() } as unknown as DbClient);
        } finally {
          insideTransaction = false;
        }
      }
    } as unknown as DbClient;

    await expect(settleIntent({ db }, watchableIntent(), DEFAULT_CRYPTO_SETTLEMENT_POLICY))
      .resolves.toMatchObject({ settled: false, granted: false });
    expect(used.some((sql) => /set status = 'paid'/.test(sql))).toBe(false);
  });
});

describe("recovering one transaction receipt", () => {
  function lockedReceiptIntent() {
    return {
      id: intentId,
      user_id: userId,
      plan_id: "plus_monthly",
      status: "awaiting_payment",
      payment_address: paymentAddress,
      quoted_amount_atomic: "18990000",
      asset: "USDC",
      network: "base",
      watch_start_block: "900",
      selected_watch_start_block: "900",
      expires_at: "2026-09-01T00:30:00.000Z",
      entitlement_granted_at: null
    };
  }

  it("independently verifies a confirmed exact-rail receipt and grants once", async () => {
    const { db, calls } = stubDb([
      [/select user_id from crypto_payment_intents where id/, [{ user_id: userId }]],
      [/selected_watch_start_block/, [lockedReceiptIntent()]],
      [/coalesce\(sum\(amount_atomic/, [{ total: "18990000" }]],
      [/set status = 'paid'/, [{ id: intentId }]]
    ]);
    const source = receiptSource([transferLog()]);

    const result = await ingestCryptoPaymentReceipt(
      { db, config: config() },
      source,
      { intentId, transactionHash: transferLog().transactionHash }
    );

    expect(result).toMatchObject({
      transfersRecorded: 1,
      creditableTransfers: 1,
      confirmations: 30,
      settled: true,
      entitlementGranted: true
    });
    expect(vi.mocked(source.getChainId).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(source.getTransactionReceipt!).mock.invocationCallOrder[0]!);
    expect(source.getBlockTimestamp).toHaveBeenCalledWith(1000n, transferLog().blockHash);
    const evidence = calls.find((call) => /insert into crypto_payment_transfers/.test(call.sql))!;
    expect(evidence.values[1]).toBe(8453);
    expect(evidence.values[12]).toBe("confirmed");
    expect(evidence.values[13]).toBe(true);
  });

  it("retains a supported wrong-token receipt but never credits or grants it", async () => {
    const wrongTokenLog = transferLog({ address: usdcOnArbitrum });
    const { db, calls } = stubDb([
      [/select user_id from crypto_payment_intents where id/, [{ user_id: userId }]],
      [/selected_watch_start_block/, [lockedReceiptIntent()]]
    ]);

    const result = await ingestCryptoPaymentReceipt(
      { db, config: config() },
      receiptSource([wrongTokenLog]),
      { intentId, transactionHash: wrongTokenLog.transactionHash }
    );

    expect(result).toMatchObject({
      transfersRecorded: 1,
      creditableTransfers: 0,
      settled: false,
      entitlementGranted: false
    });
    const evidence = calls.find((call) => /insert into crypto_payment_transfers/.test(call.sql))!;
    expect(evidence.values[7]).toBe(usdcOnArbitrum);
    expect(evidence.values[13]).toBe(false);
    expect(calls.some((call) => /set status = 'paid'/.test(call.sql))).toBe(false);
  });
});

describe("a full watcher pass", () => {
  function passHandlers(extra: Array<[RegExp, unknown[]]> = []) {
    return [
      [/select id, user_id, plan_id, status/, [{
        id: intentId,
        user_id: userId,
        plan_id: "plus_monthly",
        status: "awaiting_payment",
        payment_address: paymentAddress,
        quoted_amount_atomic: "18990000",
        asset: "USDC",
        network: "base",
        watch_start_block: "900",
        expires_at: "2026-09-01T00:30:00.000Z"
      }]],
      [/from crypto_chain_watch_cursors/, [{ last_scanned_block: "900" }]],
      ...extra
    ] as Array<[RegExp, unknown[]]>;
  }

  it("closes stale checkout windows before deciding what to watch", async () => {
    // If nothing expires an intent, the late-arrival window never starts
    // counting and abandoned checkouts are watched forever.
    const { db, calls } = stubDb(passHandlers([[/coalesce\(sum\(amount_atomic/, [{ total: "0" }]]]));

    await runCryptoWatcherPass({ db, config: config() }, chainSource([]));

    const expiryIndex = calls.findIndex((call) => /set status = 'expired'/.test(call.sql));
    const loadIndex = calls.findIndex((call) => /select id, user_id, plan_id, status/.test(call.sql));
    expect(expiryIndex).toBeGreaterThanOrEqual(0);
    expect(expiryIndex).toBeLessThan(loadIndex);
  });

  it("verifies the configured chain before every active head and log scan", async () => {
    const { db, calls } = stubDb(passHandlers());
    const source = chainSource([]);
    vi.mocked(source.getChainId).mockResolvedValue(42161);

    await expect(runCryptoWatcherPass({ db, config: config() }, source))
      .rejects.toMatchObject({
        statusCode: 502,
        code: "CRYPTO_CHAIN_SOURCE_UNAVAILABLE"
      });

    expect(source.getBlockNumber).not.toHaveBeenCalled();
    expect(source.getLogs).not.toHaveBeenCalled();
    expect(calls.some((call) => /insert into crypto_chain_watch_cursors/.test(call.sql))).toBe(false);
    expect(calls.some((call) => /set last_scanned_block/.test(call.sql))).toBe(false);
  });

  it("skips an overlapping cross-process pass before RPC or cursor advancement", async () => {
    const { db, calls } = stubDb(passHandlers([
      [/pg_try_advisory_xact_lock/, [{ acquired: false }]]
    ]));
    const source = chainSource([transferLog()]);

    const result = await runCryptoWatcherPass({ db, config: config() }, source);

    expect(result).toMatchObject({
      transfersObserved: 0,
      transfersReorganized: 0,
      intentsSettled: 0,
      entitlementsGranted: 0
    });
    expect(source.getChainId).not.toHaveBeenCalled();
    expect(source.getBlockNumber).not.toHaveBeenCalled();
    expect(source.getLogs).not.toHaveBeenCalled();
    expect(calls.some((call) => /update crypto_payment_watch_positions/.test(call.sql))).toBe(false);
    expect(calls.some((call) => /insert into crypto_chain_watch_cursors/.test(call.sql))).toBe(false);
  });

  it("starts a missing wrong-chain position at zero even after the global cursor advanced", async () => {
    const { db, calls } = stubDb([
      [/select id, user_id, plan_id, status/, [{
        id: intentId,
        user_id: userId,
        plan_id: "plus_monthly",
        status: "awaiting_payment",
        payment_address: paymentAddress,
        quoted_amount_atomic: "18990000",
        asset: "USDC",
        network: "base",
        watch_start_block: "900",
        expires_at: "2026-09-01T00:30:00.000Z"
      }]],
      [/from crypto_chain_watch_cursors/, [{ last_scanned_block: "900000" }]],
      [/from crypto_payment_watch_positions/, []]
    ]);
    const source = chainSource([], 1_000_000n, 42161);

    const result = await runCryptoWatcherPass({ db, config: config() }, source);

    expect(result.scannedFromBlock).toBe("0");
    expect(result.scannedToBlock).toBe((MAX_BLOCKS_PER_SCAN - 1n).toString());
    const position = calls.find((call) => /insert into crypto_payment_watch_positions/.test(call.sql))!;
    expect(position.values[1]).toBe(42161);
    expect(position.values[2]).toEqual(["0"]);
    expect(calls.some((call) => /update crypto_payment_watch_positions/.test(call.sql))).toBe(true);
  });

  it("cleans up stale confirming intents before loading the active watch set", async () => {
    const { db, calls } = stubDb(passHandlers());

    await runCryptoWatcherPass({ db, config: config() }, chainSource([]));

    const cleanupIndex = calls.findIndex((call) => /set status = 'failed'/.test(call.sql));
    const loadIndex = calls.findIndex((call) => /select id, user_id, plan_id, status/.test(call.sql));
    expect(cleanupIndex).toBeGreaterThanOrEqual(0);
    expect(cleanupIndex).toBeLessThan(loadIndex);
  });

  it("asks the endpoint only for Transfer logs addressed to watched addresses", async () => {
    const { db } = stubDb(passHandlers([[/coalesce\(sum\(amount_atomic/, [{ total: "0" }]]]));
    const source = chainSource([]);

    await runCryptoWatcherPass({ db, config: config() }, source);

    const filter = vi.mocked(source.getLogs).mock.calls[0]![0];
    expect(filter.address).toEqual([usdcOnBase]);
    expect(filter.topics[0]).toBe(ERC20_TRANSFER_TOPIC);
    expect(filter.topics[2]).toEqual([addressToTopic(paymentAddress)]);
  });

  it("batches recipient topics and deduplicates logs returned across batches", async () => {
    const intentRows = Array.from(
      { length: MAX_RECIPIENT_TOPICS_PER_LOG_QUERY + 1 },
      (_, index) => ({
        id: `00000000-0000-4000-8000-${(index + 10).toString().padStart(12, "0")}`,
        user_id: userId,
        plan_id: "plus_monthly",
        status: "awaiting_payment",
        payment_address: index === 0
          ? paymentAddress
          : `0x${(index + 1).toString(16).padStart(40, "0")}`,
        quoted_amount_atomic: "18990000",
        asset: "USDC",
        network: "base",
        watch_start_block: "900",
        expires_at: "2026-09-01T00:30:00.000Z"
      })
    );
    const { db, calls } = stubDb([
      [/select id, user_id, plan_id, status/, intentRows],
      [/from crypto_chain_watch_cursors/, [{ last_scanned_block: "900" }]]
    ]);
    const source = chainSource([transferLog()]);

    const result = await runCryptoWatcherPass({ db, config: config() }, source);

    expect(source.getLogs).toHaveBeenCalledTimes(2);
    const recipientBatches = vi.mocked(source.getLogs).mock.calls.map(([filter]) => filter.topics[2] as string[]);
    expect(recipientBatches.map((batch) => batch.length)).toEqual([
      MAX_RECIPIENT_TOPICS_PER_LOG_QUERY,
      1
    ]);
    expect(new Set(recipientBatches.flat()).size).toBe(intentRows.length);
    expect(result.watchedAddresses).toBe(intentRows.length);
    expect(result.transfersObserved).toBe(1);
    expect(calls.filter((call) => /insert into crypto_payment_transfers/.test(call.sql))).toHaveLength(1);
  });

  it("catches up from the oldest durable address origin when the cursor is missing", async () => {
    const secondIntentId = "00000000-0000-4000-8000-000000000011";
    const secondAddress = "0x1111111111111111111111111111111111111111";
    const { db } = stubDb([
      [/select id, user_id, plan_id, status/, [
        {
          id: intentId,
          user_id: userId,
          plan_id: "plus_monthly",
          status: "awaiting_payment",
          payment_address: paymentAddress,
          quoted_amount_atomic: "18990000",
          asset: "USDC",
          network: "base",
          watch_start_block: "9000",
          expires_at: "2026-09-01T00:30:00.000Z"
        },
        {
          id: secondIntentId,
          user_id: userId,
          plan_id: "plus_monthly",
          status: "awaiting_payment",
          payment_address: secondAddress,
          quoted_amount_atomic: "18990000",
          asset: "USDC",
          network: "base",
          watch_start_block: "7000",
          expires_at: "2026-09-01T00:30:00.000Z"
        }
      ]],
      [/from crypto_chain_watch_cursors/, []]
    ]);
    const source = chainSource([], 10_000n);

    const result = await runCryptoWatcherPass({ db, config: config() }, source);

    expect(result.scannedFromBlock).toBe("7000");
    expect(result.scannedToBlock).toBe("8999");
    expect(vi.mocked(source.getLogs).mock.calls[0]![0]).toMatchObject({
      fromBlock: 7000n,
      toBlock: 8999n
    });
  });

  it("never credits a newer address for a log before its own persisted origin", async () => {
    const newerIntentId = "00000000-0000-4000-8000-000000000011";
    const newerAddress = "0x1111111111111111111111111111111111111111";
    const intentRows = [
      {
        id: intentId,
        user_id: userId,
        plan_id: "plus_monthly",
        status: "awaiting_payment",
        payment_address: paymentAddress,
        quoted_amount_atomic: "18990000",
        asset: "USDC",
        network: "base",
        watch_start_block: "900",
        expires_at: "2026-09-01T00:30:00.000Z"
      },
      {
        id: newerIntentId,
        user_id: userId,
        plan_id: "plus_monthly",
        status: "awaiting_payment",
        payment_address: newerAddress,
        quoted_amount_atomic: "18990000",
        asset: "USDC",
        network: "base",
        watch_start_block: "1100",
        expires_at: "2026-09-01T00:30:00.000Z"
      }
    ];
    const { db, calls } = stubDb([
      [/select id, user_id, plan_id, status/, intentRows],
      [/from crypto_chain_watch_cursors/, []],
      [/from crypto_payment_watch_positions/, [
        { intent_id: intentId, watch_start_block: "900", last_scanned_block: null },
        { intent_id: newerIntentId, watch_start_block: "1100", last_scanned_block: null }
      ]]
    ]);
    const source = chainSource([
      transferLog({
        topics: [ERC20_TRANSFER_TOPIC, addressToTopic(senderAddress), addressToTopic(newerAddress)],
        blockNumber: 1000n
      })
    ], 1129n);

    const result = await runCryptoWatcherPass({ db, config: config() }, source);

    expect(result).toMatchObject({
      scannedFromBlock: "900",
      transfersObserved: 1,
      intentsSettled: 0,
      entitlementsGranted: 0
    });
    const evidence = calls.find((call) => /insert into crypto_payment_transfers/.test(call.sql))!;
    expect(evidence.values[0]).toBe(newerIntentId);
    expect(evidence.values[12]).toBe("confirmed");
    expect(evidence.values[13]).toBe(false);
    expect(calls.some((call) => /coalesce\(sum\(amount_atomic/.test(call.sql))).toBe(false);
    expect(calls.some((call) => /set status = 'paid'/.test(call.sql))).toBe(false);
  });

  it("never credits a newer address for a log at its already-mined origin block", async () => {
    const newerIntentId = "00000000-0000-4000-8000-000000000012";
    const newerAddress = "0x2222222222222222222222222222222222222222";
    const intentRows = [
      {
        id: intentId,
        user_id: userId,
        plan_id: "plus_monthly",
        status: "awaiting_payment",
        payment_address: paymentAddress,
        quoted_amount_atomic: "18990000",
        asset: "USDC",
        network: "base",
        watch_start_block: "900",
        expires_at: "2026-09-01T00:30:00.000Z"
      },
      {
        id: newerIntentId,
        user_id: userId,
        plan_id: "plus_monthly",
        status: "awaiting_payment",
        payment_address: newerAddress,
        quoted_amount_atomic: "18990000",
        asset: "USDC",
        network: "base",
        watch_start_block: "1000",
        expires_at: "2026-09-01T00:30:00.000Z"
      }
    ];
    const { db, calls } = stubDb([
      [/select id, user_id, plan_id, status/, intentRows],
      [/from crypto_chain_watch_cursors/, []],
      [/from crypto_payment_watch_positions/, [
        { intent_id: intentId, watch_start_block: "900", last_scanned_block: null },
        { intent_id: newerIntentId, watch_start_block: "1000", last_scanned_block: null }
      ]]
    ]);
    const source = chainSource([
      transferLog({
        topics: [ERC20_TRANSFER_TOPIC, addressToTopic(senderAddress), addressToTopic(newerAddress)],
        blockNumber: 1000n
      })
    ], 1029n);

    const result = await runCryptoWatcherPass({ db, config: config() }, source);

    expect(result).toMatchObject({
      scannedFromBlock: "900",
      transfersObserved: 1,
      intentsSettled: 0,
      entitlementsGranted: 0
    });
    const evidence = calls.find((call) => /insert into crypto_payment_transfers/.test(call.sql))!;
    expect(evidence.values[0]).toBe(newerIntentId);
    expect(evidence.values[12]).toBe("confirmed");
    expect(evidence.values[13]).toBe(false);
    expect(calls.some((call) => /coalesce\(sum\(amount_atomic/.test(call.sql))).toBe(false);
    expect(calls.some((call) => /set status = 'paid'/.test(call.sql))).toBe(false);
  });

  it("records a confirmed transfer once, keyed so a re-read cannot double-count", async () => {
    const { db, calls } = stubDb(passHandlers([
      [/coalesce\(sum\(amount_atomic/, [{ total: "18990000" }]],
      [/set status = 'paid'/, [{ id: intentId }]]
    ]));

    const result = await runCryptoWatcherPass({ db, config: config() }, chainSource([transferLog()]));

    expect(result.transfersObserved).toBe(1);
    const insert = calls.find((call) => /insert into crypto_payment_transfers/.test(call.sql))!;
    expect(insert.sql).toContain("on conflict (chain_id, transaction_hash, log_index) do update");
    expect(insert.values).toContain("18990000");
  });

  it("uses block time, not scheduler time, to settle a payment mined before expiry", async () => {
    const expiredRow = {
      id: intentId,
      user_id: userId,
      plan_id: "plus_monthly",
      status: "expired",
      payment_address: paymentAddress,
      quoted_amount_atomic: "18990000",
      asset: "USDC",
      network: "base",
      watch_start_block: "900",
      expires_at: "2026-09-01T00:30:00.000Z",
      entitlement_granted_at: null
    };
    const { db, calls } = stubDb([
      [/select id, user_id, plan_id, status/, [expiredRow]],
      [/from crypto_chain_watch_cursors/, [{ last_scanned_block: "900" }]],
      [/coalesce\(sum\(amount_atomic/, [{ total: "18990000" }]],
      [/set status = 'paid'/, [{ id: intentId }]]
    ]);
    const blockTimestamp = new Date("2026-09-01T00:29:59.000Z");
    const source = chainSource([transferLog()], 1029n, 8453, blockTimestamp);

    const result = await runCryptoWatcherPass({ db, config: config() }, source);

    expect(result).toMatchObject({ intentsSettled: 1, entitlementsGranted: 1 });
    expect(source.getBlockTimestamp).toHaveBeenCalledWith(1000n, `0x${"a".repeat(64)}`);
    const evidence = calls.find((call) => /insert into crypto_payment_transfers/.test(call.sql))!;
    expect(evidence.values[6]).toEqual(blockTimestamp);
    const sum = calls.find((call) => /coalesce\(sum\(amount_atomic/.test(call.sql))!;
    expect(sum.sql).toContain("block_timestamp <= $4::timestamptz");
    expect(sum.sql).toContain("block_number > $5::bigint");
  });

  it("continues the chain pass after an expired lifetime payment finds lifetime access already active", async () => {
    const lifetimeIntentId = "00000000-0000-4000-8000-000000000011";
    const lifetimeUserId = "00000000-0000-4000-8000-000000000002";
    const lifetimeAddress = "0x1111111111111111111111111111111111111111";
    const intentRows = [
      {
        id: lifetimeIntentId,
        user_id: lifetimeUserId,
        plan_id: "lifetime_founder",
        status: "expired",
        payment_address: lifetimeAddress,
        quoted_amount_atomic: "999990000",
        asset: "USDC",
        network: "base",
        watch_start_block: "900",
        expires_at: "2026-09-01T00:30:00.000Z",
        entitlement_granted_at: null
      },
      {
        id: intentId,
        user_id: userId,
        plan_id: "plus_monthly",
        status: "awaiting_payment",
        payment_address: paymentAddress,
        quoted_amount_atomic: "18990000",
        asset: "USDC",
        network: "base",
        watch_start_block: "900",
        expires_at: "2026-09-01T00:30:00.000Z",
        entitlement_granted_at: null
      }
    ];
    const byId = new Map(intentRows.map((row) => [row.id, row]));
    const { db, calls } = stubDb([
      [/from crypto_payment_intents[\s\S]*for update/, (values) => {
        const row = byId.get(String(values[0]));
        return row ? [row] : [];
      }],
      [/select id, user_id, plan_id, status/, intentRows],
      [/from crypto_payment_watch_positions/, [
        { intent_id: lifetimeIntentId, watch_start_block: "900", last_scanned_block: "900" },
        { intent_id: intentId, watch_start_block: "900", last_scanned_block: "900" }
      ]],
      [/from crypto_chain_watch_cursors/, [{ last_scanned_block: "900" }]],
      [/coalesce\(sum\(amount_atomic/, (values) => [{
        total: values[0] === lifetimeIntentId ? "999990000" : "18990000"
      }]],
      [/from cruush_plus_lifetime_access/, (values) => [{
        has_lifetime_access: values[0] === lifetimeUserId
      }]],
      [/set status = 'paid'/, (values) => [{ id: values[0] }]]
    ]);
    const source = chainSource([
      transferLog({
        topics: [ERC20_TRANSFER_TOPIC, addressToTopic(senderAddress), addressToTopic(lifetimeAddress)],
        data: `0x${(999_990_000).toString(16).padStart(64, "0")}`,
        transactionHash: `0x${"c".repeat(64)}`,
        logIndex: 4
      }),
      transferLog()
    ], 1029n);

    const result = await runCryptoWatcherPass({ db, config: config() }, source);

    expect(result).toMatchObject({
      transfersObserved: 2,
      intentsSettled: 2,
      entitlementsGranted: 1
    });
    const claims = calls.filter((call) => /set status = 'paid'/.test(call.sql));
    expect(claims).toHaveLength(2);
    expect(claims.find((call) => call.values[0] === lifetimeIntentId)?.values[2])
      .toContain("lifetime cruush+ was already active");
    expect(calls.some((call) => /insert into crypto_chain_watch_cursors/.test(call.sql))).toBe(true);
    expect(calls.some((call) => /insert into cruush_plus_lifetime_access/.test(call.sql))).toBe(false);
  });

  it("validates each competing hash when logs share a block height", async () => {
    const firstHash = `0x${"a".repeat(64)}`;
    const secondHash = `0x${"d".repeat(64)}`;
    const { db } = stubDb(passHandlers([
      [/coalesce\(sum\(amount_atomic/, [{ total: "0" }]]
    ]));
    const source = chainSource([
      transferLog({ blockHash: firstHash }),
      transferLog({
        blockHash: secondHash,
        transactionHash: `0x${"c".repeat(64)}`,
        logIndex: 4
      })
    ]);

    await runCryptoWatcherPass({ db, config: config() }, source);

    expect(source.getBlockTimestamp).toHaveBeenCalledTimes(2);
    expect(source.getBlockTimestamp).toHaveBeenNthCalledWith(1, 1000n, firstHash);
    expect(source.getBlockTimestamp).toHaveBeenNthCalledWith(2, 1000n, secondHash);
  });

  it("retains a post-expiry transfer as evidence without granting access", async () => {
    const { db, calls } = stubDb(passHandlers());
    const blockTimestamp = new Date("2026-09-01T00:30:01.000Z");
    const source = chainSource([transferLog()], 1029n, 8453, blockTimestamp);

    const result = await runCryptoWatcherPass({ db, config: config() }, source);

    expect(result).toMatchObject({
      transfersObserved: 1,
      intentsSettled: 0,
      entitlementsGranted: 0
    });
    const evidence = calls.find((call) => /insert into crypto_payment_transfers/.test(call.sql))!;
    expect(evidence.values[6]).toEqual(blockTimestamp);
    expect(evidence.values[13]).toBe(false);
    expect(calls.some((call) => /coalesce\(sum\(amount_atomic/.test(call.sql))).toBe(false);
    expect(calls.some((call) => /set status = 'paid'/.test(call.sql))).toBe(false);
  });

  it("atomically records a pre-confirmation transfer and marks an open intent confirming", async () => {
    const { db, calls } = stubDb(passHandlers([[/coalesce\(sum\(amount_atomic/, [{ total: "0" }]]]));
    // Head is the same block as the log, and the target is 3, so it is 1 of 3.
    const source = chainSource([transferLog({ blockNumber: 1000n })], 1000n);

    await runCryptoWatcherPass({ db, config: config({ CRYPTO_PROCESSOR_CONFIRMATION_TARGET: 3 }) }, source);

    const insert = calls.find((call) => /insert into crypto_payment_transfers/.test(call.sql))!;
    expect(insert.values[12]).toBe("observed");
    expect(insert.values[11]).toBe(1);
    expect(insert.values[13]).toBe(true);
    expect(insert.sql).toContain("with locked_intent as materialized");
    expect(insert.sql).toContain("for update");
    expect(insert.sql).toContain("set status = 'confirming'");
    expect(insert.sql).toContain("locked_intent.status = 'awaiting_payment'");
    expect(insert.sql).toContain("$14::boolean");
  });

  it("never revives a terminal database row from a stale awaiting snapshot", async () => {
    const { db, calls } = stubDb(passHandlers([[/coalesce\(sum\(amount_atomic/, [{ total: "18990000" }]], [/set status = 'paid'/, []]]));

    const result = await runCryptoWatcherPass(
      { db, config: config() },
      chainSource([transferLog({ blockNumber: 1000n })], 1029n)
    );

    const record = calls.find((call) => /insert into crypto_payment_transfers/.test(call.sql))!;
    const paidClaim = calls.find((call) => /set status = 'paid'/.test(call.sql))!;
    expect(record.sql).toContain("select id, status");
    expect(record.sql).toContain("for update");
    expect(record.sql).toContain("locked_intent.status = 'awaiting_payment'");
    expect(paidClaim.sql).toContain("status in ('awaiting_payment', 'confirming', 'expired')");
    expect(result.intentsSettled).toBe(0);
    expect(result.entitlementsGranted).toBe(0);
  });

  it("confirms a transfer once it is deep enough", async () => {
    const { db, calls } = stubDb(passHandlers([
      [/coalesce\(sum\(amount_atomic/, [{ total: "18990000" }]],
      [/set status = 'paid'/, [{ id: intentId }]]
    ]));
    // Base's rail asks for 30 confirmations, so the head must be 29 blocks past
    // the log for it to count.
    const source = chainSource([transferLog({ blockNumber: 1000n })], 1029n);

    await runCryptoWatcherPass({ db, config: config() }, source);

    const insert = calls.find((call) => /insert into crypto_payment_transfers/.test(call.sql))!;
    expect(insert.values[12]).toBe("confirmed");
    expect(insert.values[11]).toBe(30);
  });

  it("holds a Base transfer until the rail's own 30 confirmations, not the configured floor of 1", async () => {
    // The bug this guards: one shared confirmation target across two chains
    // with different block times. Base builds a block every ~2s, so 1
    // confirmation is ~2 seconds of protection on a grant that cannot be undone.
    const { db, calls } = stubDb(passHandlers([[/coalesce\(sum\(amount_atomic/, [{ total: "0" }]]]));
    // 10 confirmations deep: past a floor of 1, short of the rail's 30.
    const source = chainSource([transferLog({ blockNumber: 1000n })], 1009n);

    await runCryptoWatcherPass({ db, config: config({ CRYPTO_PROCESSOR_CONFIRMATION_TARGET: 1 }) }, source);

    const insert = calls.find((call) => /insert into crypto_payment_transfers/.test(call.sql))!;
    expect(insert.values[11]).toBe(10);
    expect(insert.values[12]).toBe("observed");
  });

  it("ignores a log the chain has marked removed, so a reorganized transfer never settles", async () => {
    const { db, calls } = stubDb(passHandlers([[/coalesce\(sum\(amount_atomic/, [{ total: "0" }]]]));

    const result = await runCryptoWatcherPass(
      { db, config: config() },
      chainSource([transferLog({ removed: true })])
    );

    expect(result.transfersObserved).toBe(0);
    expect(calls.some((call) => /insert into crypto_payment_transfers/.test(call.sql))).toBe(false);
  });

  it("only judges intents whose addresses it actually queried this pass", async () => {
    // A settled intent leaves the watch set, so its address drops out of the
    // log filter and its transfer stops appearing in seenKeys while still
    // inside the re-read window. Without scoping, the sweep condemned that
    // still-valid payment as dropped by the chain, and support would tell a
    // paying member their money had vanished.
    const { db, calls } = stubDb(passHandlers([
      [/set status = 'reorganized'/, []],
      [/coalesce\(sum\(amount_atomic/, [{ total: "0" }]]
    ]));

    await runCryptoWatcherPass({ db, config: config() }, chainSource([]));

    const sweep = calls.find((call) => /set status = 'reorganized'/.test(call.sql))!;
    expect(sweep.sql).toContain("intent_id = any(");
    // Scoped to exactly the intents loaded for this pass.
    expect(sweep.values[4]).toEqual([intentId]);
  });

  it("does not sweep at all when it watched nothing, since an empty list matches every row", async () => {
    // `x <> all('{}')` is vacuously true in Postgres, so an unscoped sweep over
    // an empty pass would have condemned the entire block range.
    const { db, calls } = stubDb([
      [/select id, user_id, plan_id, status/, []],
      [/from crypto_chain_watch_cursors/, [{ last_scanned_block: "900" }]]
    ]);

    await runCryptoWatcherPass({ db, config: config() }, chainSource([]));

    expect(calls.some((call) => /set status = 'reorganized'/.test(call.sql))).toBe(false);
  });

  it("marks transfers the chain no longer reports, and keeps them for support", async () => {
    const { db, calls } = stubDb(passHandlers([
      [/set status = 'reorganized'/, [{ id: "transfer-1" }]],
      [/coalesce\(sum\(amount_atomic/, [{ total: "0" }]]
    ]));

    const result = await runCryptoWatcherPass({ db, config: config() }, chainSource([]));

    expect(result.transfersReorganized).toBe(1);
    const sweep = calls.find((call) => /set status = 'reorganized'/.test(call.sql))!;
    expect(sweep.sql).toContain("update crypto_payment_transfers");
    expect(sweep.sql).not.toContain("delete");
  });

  it("ignores a transfer sent to an address this processor does not own", async () => {
    const { db, calls } = stubDb(passHandlers([[/coalesce\(sum\(amount_atomic/, [{ total: "0" }]]]));
    const stranger = "0x1111111111111111111111111111111111111111";

    const result = await runCryptoWatcherPass(
      { db, config: config() },
      chainSource([transferLog({
        topics: [ERC20_TRANSFER_TOPIC, addressToTopic(senderAddress), addressToTopic(stranger)]
      })])
    );

    expect(result.transfersObserved).toBe(0);
    expect(calls.some((call) => /insert into crypto_payment_transfers/.test(call.sql))).toBe(false);
  });

  it("records a known wrong-token transfer as non-creditable support evidence", async () => {
    const { db, calls } = stubDb([
      [/select id, user_id, plan_id, status/, [{
        id: intentId,
        user_id: userId,
        plan_id: "plus_monthly",
        status: "awaiting_payment",
        payment_address: paymentAddress,
        quoted_amount_atomic: "18990000",
        asset: "PYUSD",
        network: "arbitrum",
        watch_start_block: "900",
        expires_at: "2026-09-01T00:30:00.000Z"
      }]],
      [/from crypto_chain_watch_cursors/, [{ last_scanned_block: "900" }]]
    ]);

    const source = chainSource([transferLog({ address: usdcOnArbitrum })], 1239n, 42161);
    const result = await runCryptoWatcherPass(
      { db, config: config() },
      source
    );

    expect(result.transfersObserved).toBe(1);
    const evidence = calls.find((call) => /insert into crypto_payment_transfers/.test(call.sql))!;
    expect(evidence.values[7]).toBe(usdcOnArbitrum);
    expect(evidence.values[13]).toBe(false);
    expect(evidence.sql).toContain("and $14::boolean");
    expect(calls.some((call) => /coalesce\(sum\(amount_atomic/.test(call.sql))).toBe(false);
    expect(calls.some((call) => /set status = 'paid'/.test(call.sql))).toBe(false);
    expect(vi.mocked(source.getLogs).mock.calls[0]![0].address).toEqual([
      usdcOnArbitrum,
      pyusdOnArbitrum
    ]);
  });

  it("records a supported token sent on the wrong configured network without crediting it", async () => {
    const { db, calls } = stubDb([
      [/select id, user_id, plan_id, status/, [{
        id: intentId,
        user_id: userId,
        plan_id: "plus_monthly",
        status: "awaiting_payment",
        payment_address: paymentAddress,
        quoted_amount_atomic: "18990000",
        asset: "USDC",
        network: "base",
        watch_start_block: "900",
        expires_at: "2026-09-01T00:30:00.000Z"
      }]],
      [/from crypto_chain_watch_cursors/, [{ last_scanned_block: "900" }]]
    ]);
    const source = chainSource([transferLog({ address: usdcOnArbitrum })], 1239n, 42161);

    const result = await runCryptoWatcherPass({ db, config: config() }, source);

    expect(result.transfersObserved).toBe(1);
    const evidence = calls.find((call) => /insert into crypto_payment_transfers/.test(call.sql))!;
    expect(evidence.values[1]).toBe(42161);
    expect(evidence.values[7]).toBe(usdcOnArbitrum);
    expect(evidence.values[13]).toBe(false);
    expect(calls.some((call) => /coalesce\(sum\(amount_atomic/.test(call.sql))).toBe(false);
    expect(calls.some((call) => /set status = 'paid'/.test(call.sql))).toBe(false);
  });

  it("skips a malformed log instead of stalling the whole pass", async () => {
    const { db } = stubDb(passHandlers([
      [/coalesce\(sum\(amount_atomic/, [{ total: "18990000" }]],
      [/set status = 'paid'/, [{ id: intentId }]]
    ]));

    const result = await runCryptoWatcherPass({ db, config: config() }, chainSource([
      transferLog({ data: "0x00" }),
      transferLog({ transactionHash: `0x${"c".repeat(64)}` })
    ]));

    expect(result.transfersObserved).toBe(1);
  });

  it("advances the cursor so the next pass does not re-read the same range", async () => {
    const { db, calls } = stubDb(passHandlers([[/coalesce\(sum\(amount_atomic/, [{ total: "0" }]]]));

    const result = await runCryptoWatcherPass({ db, config: config() }, chainSource([], 1000n));

    expect(result.scannedToBlock).toBe("1000");
    const cursor = calls.find((call) => /insert into crypto_chain_watch_cursors/.test(call.sql))!;
    expect(cursor.sql).toContain("greatest(");
    expect(cursor.values[1]).toBe("1000");
  });

  it("makes no request whatsoever when nothing is being watched", async () => {
    // An idle processor must cost nothing. Not one head read, not one log
    // query. With no live intent there is no payment address in existence, so
    // there is nothing on chain that could concern us.
    const { db, calls } = stubDb([
      [/select id, user_id, plan_id, status/, []],
      [/from crypto_chain_watch_cursors/, [{ last_scanned_block: "900" }]]
    ]);
    const source = chainSource([]);

    const result = await runCryptoWatcherPass({ db, config: config() }, source);

    expect(source.getChainId).not.toHaveBeenCalled();
    expect(source.getBlockNumber).not.toHaveBeenCalled();
    expect(source.getLogs).not.toHaveBeenCalled();
    expect(result.watchedAddresses).toBe(0);
    // The durable cursor remains. A wrong-chain outage must resume from proven
    // state rather than guessing a recent range and skipping support evidence.
    expect(calls.some((call) => /delete from crypto_chain_watch_cursors/.test(call.sql))).toBe(false);
  });

  it("keeps the generic no-origin planner fallback bounded", async () => {
    // Active watcher passes always supply a durable per-intent origin. This
    // fallback remains bounded for isolated callers that have neither one.
    const range = planScanRange({ cursor: null, headBlock: 5_000_000n, confirmationTarget: 30 });

    expect(range).toEqual({
      fromBlock: 5_000_000n - MAX_BLOCKS_PER_SCAN,
      toBlock: 5_000_000n - 1n
    });
  });
});

const realPostgresUrl = process.env.CRUUSH_CRYPTO_WATCHER_POSTGRES_URL;
const { Pool } = pg;
const realUserBeforeExpiry = "95000000-0000-4000-8000-000000000001";
const realUserReorganized = "95000000-0000-4000-8000-000000000002";
const realUserOverlappingPass = "95000000-0000-4000-8000-000000000003";
const realIntentBeforeExpiry = "95000000-0000-4000-8000-000000000011";
const realIntentReorganized = "95000000-0000-4000-8000-000000000012";
const realIntentOverlappingPass = "95000000-0000-4000-8000-000000000013";

describe.skipIf(!realPostgresUrl)("watcher settlement concurrency with real PostgreSQL", () => {
  let pool: InstanceType<typeof Pool>;
  let db: DbClient;

  async function cleanFixtures() {
    await pool.query(
      "delete from app_users where id = any($1::uuid[])",
      [[realUserBeforeExpiry, realUserReorganized, realUserOverlappingPass]]
    );
  }

  async function insertFixture(input: {
    userId: string;
    intentId: string;
    address: string;
    transactionHash: string;
  }) {
    await pool.query(
      `insert into app_users (id, email, password_hash)
       values ($1, $2, 'test-hash')`,
      [input.userId, `watcher-${input.userId.slice(-1)}@example.test`]
    );
    await pool.query(
      `insert into crypto_payment_intents (
         id, user_id, plan_id, asset, network, amount_usd_cents,
         quoted_amount_atomic, wallet_xpub_fingerprint, payment_address,
         status, idempotency_key, expires_at, watch_start_block
       ) values (
         $1, $2, 'plus_monthly', 'USDC', 'base', 1899,
         '18990000', $3, $4, 'expired', $5,
         now() - interval '1 minute', 900
       )`,
      [input.intentId, input.userId, "f".repeat(64), input.address, `watcher-${input.intentId}`]
    );
    await pool.query(
      `insert into crypto_payment_transfers (
         intent_id, chain_id, transaction_hash, log_index, block_number,
         block_hash, block_timestamp, token_address, from_address,
         to_address, amount_atomic, confirmations, status, confirmed_at
       ) values (
         $1, 8453, $2, 0, 1000, $3, now() - interval '2 minutes',
         $4, $5, $6, '18990000', 30, 'confirmed', now()
       )`,
      [
        input.intentId,
        input.transactionHash,
        `0x${"a".repeat(64)}`,
        usdcOnBase,
        senderAddress,
        input.address
      ]
    );
  }

  beforeAll(async () => {
    if (!realPostgresUrl) return;
    const databaseName = decodeURIComponent(
      new URL(realPostgresUrl).pathname.split("/").filter(Boolean).pop() ?? ""
    );
    if (!/^cruush_crypto_watcher(?:_[a-z0-9]+)*$/.test(databaseName)) {
      throw new Error("CRUUSH_CRYPTO_WATCHER_POSTGRES_URL must name a disposable crypto-watcher database.");
    }
    pool = new Pool({ connectionString: realPostgresUrl, max: 6 });
    db = createPool({ DATABASE_URL: realPostgresUrl } as AppConfig);
    await cleanFixtures();
  });

  beforeEach(async () => {
    if (!pool) return;
    await cleanFixtures();
  });

  afterAll(async () => {
    if (!pool) return;
    await cleanFixtures();
    await db.end();
    await pool.end();
  });

  it("grants when the block predates expiry even though the scheduler already expired the row", async () => {
    await insertFixture({
      userId: realUserBeforeExpiry,
      intentId: realIntentBeforeExpiry,
      address: "0x1111111111111111111111111111111111111111",
      transactionHash: `0x${"1".repeat(64)}`
    });

    const result = await settleIntent(
      { db },
      watchableIntent({
        id: realIntentBeforeExpiry,
        userId: realUserBeforeExpiry,
        status: "expired",
        paymentAddress: "0x1111111111111111111111111111111111111111"
      }),
      DEFAULT_CRYPTO_SETTLEMENT_POLICY
    );

    expect(result).toMatchObject({ settled: true, granted: true });
    const stored = await pool.query<{ status: string; granted: boolean }>(
      `select intent.status,
              intent.entitlement_granted_at is not null as granted
       from crypto_payment_intents intent
       where intent.id = $1`,
      [realIntentBeforeExpiry]
    );
    expect(stored.rows[0]).toEqual({ status: "paid", granted: true });
  });

  it("waits for a concurrent reorganization and refuses its now-stale evidence", async () => {
    await insertFixture({
      userId: realUserReorganized,
      intentId: realIntentReorganized,
      address: "0x2222222222222222222222222222222222222222",
      transactionHash: `0x${"2".repeat(64)}`
    });
    const reorgClient = await pool.connect();

    try {
      await reorgClient.query("begin");
      await reorgClient.query(
        `update crypto_payment_transfers
         set status = 'reorganized', confirmed_at = null
         where intent_id = $1`,
        [realIntentReorganized]
      );

      const settlement = settleIntent(
        { db },
        watchableIntent({
          id: realIntentReorganized,
          userId: realUserReorganized,
          status: "expired",
          paymentAddress: "0x2222222222222222222222222222222222222222"
        }),
        DEFAULT_CRYPTO_SETTLEMENT_POLICY
      );
      await new Promise((resolve) => setTimeout(resolve, 50));
      await reorgClient.query("commit");

      await expect(settlement).resolves.toMatchObject({ settled: false, granted: false });
    } finally {
      await reorgClient.query("rollback").catch(() => undefined);
      reorgClient.release();
    }

    const stored = await pool.query<{ status: string; granted: boolean }>(
      `select intent.status,
              intent.entitlement_granted_at is not null as granted
       from crypto_payment_intents intent
       where intent.id = $1`,
      [realIntentReorganized]
    );
    expect(stored.rows[0]).toEqual({ status: "expired", granted: false });
  });

  it("skips an overlapping reorg pass before it can trail an irreversible grant", async () => {
    const address = "0x3333333333333333333333333333333333333333";
    const transactionHash = `0x${"3".repeat(64)}`;
    const blockHash = `0x${"a".repeat(64)}`;
    await insertFixture({
      userId: realUserOverlappingPass,
      intentId: realIntentOverlappingPass,
      address,
      transactionHash
    });

    let announceLogRead!: () => void;
    const logReadStarted = new Promise<void>((resolve) => {
      announceLogRead = resolve;
    });
    let releaseLogRead!: () => void;
    const holdLogRead = new Promise<void>((resolve) => {
      releaseLogRead = resolve;
    });
    const blockTimestamp = new Date(Date.now() - 120_000);
    const grantingSource = chainSource([], 1029n, 8453, blockTimestamp);
    vi.mocked(grantingSource.getLogs).mockImplementation(async () => {
      announceLogRead();
      await holdLogRead;
      return [transferLog({
        topics: [ERC20_TRANSFER_TOPIC, addressToTopic(senderAddress), addressToTopic(address)],
        blockHash,
        transactionHash,
        logIndex: 0
      })];
    });
    const staleReorgSource = chainSource([], 1029n, 8453, blockTimestamp);

    const grantingPass = runCryptoWatcherPass({ db, config: config() }, grantingSource);
    await logReadStarted;

    const duplicatePass = runCryptoWatcherPass({ db, config: config() }, staleReorgSource);
    let duplicateResult: WatcherPassResult | undefined;
    let duplicateError: unknown;
    try {
      duplicateResult = await Promise.race([
        duplicatePass,
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Overlapping watcher pass did not skip.")), 2_000);
        })
      ]);
    } catch (error) {
      duplicateError = error;
    } finally {
      releaseLogRead();
    }

    const granted = await grantingPass;
    if (duplicateError) {
      throw duplicateError;
    }

    expect(duplicateResult).toMatchObject({
      transfersObserved: 0,
      transfersReorganized: 0,
      intentsSettled: 0,
      entitlementsGranted: 0
    });
    expect(staleReorgSource.getChainId).not.toHaveBeenCalled();
    expect(staleReorgSource.getBlockNumber).not.toHaveBeenCalled();
    expect(staleReorgSource.getLogs).not.toHaveBeenCalled();
    expect(granted).toMatchObject({ intentsSettled: 1, entitlementsGranted: 1 });

    const stored = await pool.query<{ intent_status: string; transfer_status: string; granted: boolean }>(
      `select intent.status as intent_status,
              transfer.status as transfer_status,
              intent.entitlement_granted_at is not null as granted
       from crypto_payment_intents intent
       join crypto_payment_transfers transfer on transfer.intent_id = intent.id
       where intent.id = $1
         and transfer.transaction_hash = $2`,
      [realIntentOverlappingPass, transactionHash]
    );
    expect(stored.rows[0]).toEqual({
      intent_status: "paid",
      transfer_status: "confirmed",
      granted: true
    });
  });
});

describe("policy resolution", () => {
  it("uses each rail's own confirmation target, because the chains differ in block time", () => {
    // Base ~2s blocks, Ethereum ~12s blocks. 30 Base blocks and 12 Ethereum
    // blocks are both roughly a minute or two of protection; one shared number
    // could not be right for both.
    expect(resolveSettlementPolicy(config(), 8453).confirmationTarget).toBe(30);
    expect(resolveSettlementPolicy(config(), 1).confirmationTarget).toBe(12);
  });

  it("lets configuration demand more confirmations, but never fewer than the rail asks", () => {
    expect(resolveSettlementPolicy(config({ CRYPTO_PROCESSOR_CONFIRMATION_TARGET: 64 }), 8453).confirmationTarget)
      .toBe(64);
    expect(resolveSettlementPolicy(config({ CRYPTO_PROCESSOR_CONFIRMATION_TARGET: 1 }), 8453).confirmationTarget)
      .toBe(30);
    expect(resolveSettlementPolicy(config({ CRYPTO_PROCESSOR_CONFIRMATION_TARGET: 1 }), 1).confirmationTarget)
      .toBe(12);
  });

  it("keeps the rest of the policy defaults untouched", () => {
    expect(resolveSettlementPolicy(config(), 8453)).toEqual({
      ...DEFAULT_CRYPTO_SETTLEMENT_POLICY,
      confirmationTarget: 30
    });
  });

  it("falls back to the cautious standalone default for an unknown chain", () => {
    expect(resolveSettlementPolicy(config(), 999_999).confirmationTarget)
      .toBe(DEFAULT_CRYPTO_SETTLEMENT_POLICY.confirmationTarget);
  });
});
