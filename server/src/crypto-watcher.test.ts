import { describe, expect, it, vi } from "vitest";
import {
  MAX_BLOCKS_PER_SCAN,
  REORG_SAFETY_DEPTH,
  loadWatchableIntents,
  planScanRange,
  resolveSettlementPolicy,
  runCryptoWatcherPass,
  settleIntent,
  type WatchableIntent
} from "./crypto-watcher.js";
import {
  ERC20_TRANSFER_TOPIC,
  addressToTopic,
  type ChainLog,
  type ChainSource
} from "./crypto-chain-source.js";
import { DEFAULT_CRYPTO_SETTLEMENT_POLICY } from "./crypto-settlement-policy.js";
import type { AppConfig } from "./config.js";
import type { DbClient } from "./db.js";

const intentId = "00000000-0000-4000-8000-000000000010";
const userId = "00000000-0000-4000-8000-000000000001";
const paymentAddress = "0x73659c60270d326c06ac204f1a9c63f889a3d14b";
const senderAddress = "0x8e23ee67d1332ad560396262c48ffbb01f93d052";
const usdcOnBase = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

function watchableIntent(overrides: Partial<WatchableIntent> = {}): WatchableIntent {
  return {
    id: intentId,
    userId,
    planId: "plus_monthly",
    status: "awaiting_payment",
    paymentAddress,
    quotedAmountAtomic: "18990000",
    rail: "usdc_base",
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

function chainSource(logs: ChainLog[], headBlock = 1000n): ChainSource {
  return {
    chainId: 8453,
    getBlockNumber: vi.fn().mockResolvedValue(headBlock),
    getLogs: vi.fn().mockResolvedValue(logs)
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
  it("includes expired intents when late payment is accepted, because a transfer cannot be undone", async () => {
    const { db, calls } = stubDb([[/from crypto_payment_intents/, []]]);

    await loadWatchableIntents(db, 8453, DEFAULT_CRYPTO_SETTLEMENT_POLICY);

    expect(calls[0]!.values[0]).toEqual(["awaiting_payment", "confirming", "expired"]);
  });

  it("drops expired intents when late payment is turned off", async () => {
    const { db, calls } = stubDb([[/from crypto_payment_intents/, []]]);

    await loadWatchableIntents(db, 8453, { ...DEFAULT_CRYPTO_SETTLEMENT_POLICY, acceptLatePayment: false });

    expect(calls[0]!.values[0]).toEqual(["awaiting_payment", "confirming"]);
  });

  it("stops watching abandoned checkouts after the late-arrival window", async () => {
    // The leak this closes: accepting late payment without a bound means every
    // abandoned checkout is watched forever, so the watch set only grows and
    // the watcher polls for eternity on payments that will never arrive.
    const { db, calls } = stubDb([[/from crypto_payment_intents/, []]]);

    await loadWatchableIntents(db, 8453, DEFAULT_CRYPTO_SETTLEMENT_POLICY);

    expect(calls[0]!.sql).toContain("status <> 'expired' or expires_at > now()");
    expect(calls[0]!.values[3]).toBe(DEFAULT_CRYPTO_SETTLEMENT_POLICY.lateArrivalWatchDays);
    expect(DEFAULT_CRYPTO_SETTLEMENT_POLICY.lateArrivalWatchDays).toBe(7);
  });

  it("only loads intents on rails that belong to the chain being scanned", async () => {
    const { db, calls } = stubDb([[/from crypto_payment_intents/, []]]);

    await loadWatchableIntents(db, 1, DEFAULT_CRYPTO_SETTLEMENT_POLICY);

    expect(calls[0]!.values[1]).toEqual(["PYUSD"]);
    expect(calls[0]!.values[2]).toEqual(["ethereum"]);
  });
});

describe("settling one intent", () => {
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

  it("does not grant a second time when another pass already claimed the intent", async () => {
    // The claiming update matches no row, which is what a concurrent pass sees.
    const { db } = stubDb([
      [/coalesce\(sum\(amount_atomic/, [{ total: "18990000" }]],
      [/set status = 'paid'/, []]
    ]);

    expect(await settleIntent({ db }, watchableIntent(), DEFAULT_CRYPTO_SETTLEMENT_POLICY))
      .toMatchObject({ settled: true, granted: false });
  });

  it("claims the paid transition only from a non-paid, ungranted row", async () => {
    const { db, calls } = stubDb([
      [/coalesce\(sum\(amount_atomic/, [{ total: "18990000" }]],
      [/set status = 'paid'/, [{ id: intentId }]]
    ]);

    await settleIntent({ db }, watchableIntent(), DEFAULT_CRYPTO_SETTLEMENT_POLICY);

    const claim = calls.find((call) => /set status = 'paid'/.test(call.sql))!;
    expect(claim.sql).toContain("status <> 'paid'");
    expect(claim.sql).toContain("entitlement_granted_at is null");
  });

  it("moves a partly paid intent to confirming and grants nothing", async () => {
    const { db, calls } = stubDb([
      [/coalesce\(sum\(amount_atomic/, [{ total: "1000000" }]]
    ]);

    const result = await settleIntent({ db }, watchableIntent(), DEFAULT_CRYPTO_SETTLEMENT_POLICY);

    expect(result).toMatchObject({ settled: false, granted: false });
    expect(result.note).toContain("Waiting for");
    expect(calls.some((call) => /set status = 'confirming'/.test(call.sql))).toBe(true);
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

  it("settles a late payment on an expired intent rather than keeping the money for nothing", async () => {
    const { db } = stubDb([
      [/coalesce\(sum\(amount_atomic/, [{ total: "18990000" }]],
      [/set status = 'paid'/, [{ id: intentId }]]
    ]);

    expect(await settleIntent({ db }, watchableIntent({ status: "expired" }), DEFAULT_CRYPTO_SETTLEMENT_POLICY))
      .toMatchObject({ settled: true, granted: true });
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

  it("only counts confirmed transfers, never merely observed ones", async () => {
    const { db, calls } = stubDb([
      [/coalesce\(sum\(amount_atomic/, [{ total: "18990000" }]],
      [/set status = 'paid'/, [{ id: intentId }]]
    ]);

    await settleIntent({ db }, watchableIntent(), DEFAULT_CRYPTO_SETTLEMENT_POLICY);

    const sum = calls.find((call) => /coalesce\(sum\(amount_atomic/.test(call.sql))!;
    expect(sum.sql).toContain("status = 'confirmed'");
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
        network: "base"
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

  it("asks the endpoint only for Transfer logs addressed to watched addresses", async () => {
    const { db } = stubDb(passHandlers([[/coalesce\(sum\(amount_atomic/, [{ total: "0" }]]]));
    const source = chainSource([]);

    await runCryptoWatcherPass({ db, config: config() }, source);

    const filter = vi.mocked(source.getLogs).mock.calls[0]![0];
    expect(filter.address).toEqual([usdcOnBase]);
    expect(filter.topics[0]).toBe(ERC20_TRANSFER_TOPIC);
    expect(filter.topics[2]).toEqual([addressToTopic(paymentAddress)]);
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

  it("holds a transfer at observed until it reaches the confirmation target", async () => {
    const { db, calls } = stubDb(passHandlers([[/coalesce\(sum\(amount_atomic/, [{ total: "0" }]]]));
    // Head is the same block as the log, and the target is 3, so it is 1 of 3.
    const source = chainSource([transferLog({ blockNumber: 1000n })], 1000n);

    await runCryptoWatcherPass({ db, config: config({ CRYPTO_PROCESSOR_CONFIRMATION_TARGET: 3 }) }, source);

    const insert = calls.find((call) => /insert into crypto_payment_transfers/.test(call.sql))!;
    expect(insert.values[11]).toBe("observed");
    expect(insert.values[10]).toBe(1);
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
    expect(insert.values[11]).toBe("confirmed");
    expect(insert.values[10]).toBe(30);
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
    expect(insert.values[10]).toBe(10);
    expect(insert.values[11]).toBe("observed");
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

    expect(source.getBlockNumber).not.toHaveBeenCalled();
    expect(source.getLogs).not.toHaveBeenCalled();
    expect(result.watchedAddresses).toBe(0);
    // The stale position is dropped, so resuming later does not grind back
    // through every block slept past looking for payments that cannot exist.
    expect(calls.some((call) => /delete from crypto_chain_watch_cursors/.test(call.sql))).toBe(true);
  });

  it("resumes near the head after an idle period instead of replaying the gap", async () => {
    // With the cursor cleared, the first pass that has something to watch
    // starts one bounded step behind the head, not at the block it last saw.
    const range = planScanRange({ cursor: null, headBlock: 5_000_000n, confirmationTarget: 30 });

    expect(range).toEqual({
      fromBlock: 5_000_000n - MAX_BLOCKS_PER_SCAN,
      toBlock: 5_000_000n - 1n
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
