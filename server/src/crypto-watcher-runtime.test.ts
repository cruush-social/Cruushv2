import { describe, expect, it, vi } from "vitest";
import {
  createChainSources,
  describeWatcherStatus,
  resolveWatchedChains,
  startCryptoWatcher
} from "./crypto-watcher-runtime.js";
import type { AppConfig } from "./config.js";
import type { DbClient } from "./db.js";

const baseRpc = "https://base.example/rpc-with-key";
const ethereumRpc = "https://ethereum.example/rpc-with-key";

function config(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    CRYPTO_PROCESSOR_ENABLED: true,
    CRYPTO_PROCESSOR_WATCHER_ENABLED: true,
    CRYPTO_PROCESSOR_BASE_RPC_URL: baseRpc,
    CRYPTO_PROCESSOR_ETHEREUM_RPC_URL: "",
    CRYPTO_PROCESSOR_CONFIRMATION_TARGET: 1,
    CRYPTO_PROCESSOR_WATCHER_INTERVAL_SECONDS: 30,
    ...overrides
  } as AppConfig;
}

function logger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

// A watchable intent must exist for a pass to reach the chain at all: with
// nothing to watch the watcher deliberately makes no request.
const watchableIntentRow = {
  id: "00000000-0000-4000-8000-000000000010",
  user_id: "00000000-0000-4000-8000-000000000001",
  plan_id: "plus_monthly",
  status: "awaiting_payment",
  payment_address: "0x73659c60270d326c06ac204f1a9c63f889a3d14b",
  quoted_amount_atomic: "18990000",
  asset: "USDC",
  network: "base"
};

function stubApp(overrides: Partial<AppConfig> = {}, rows: unknown[] = [watchableIntentRow]) {
  const log = logger();
  const db = {
    query: vi.fn(async (sql: string) =>
      /select id, user_id, plan_id, status/.test(sql) ? { rows } : { rows: [] }
    ),
    end: vi.fn()
  } as unknown as DbClient;
  return { db, config: config(overrides), log };
}

describe("which chains get watched", () => {
  it("watches a chain only when the processor, the watcher, and an endpoint are all set", () => {
    expect(resolveWatchedChains(config())).toEqual([{ chainId: 8453, endpointUrl: baseRpc }]);
  });

  it("watches nothing while the processor is disabled, even with an endpoint configured", () => {
    expect(resolveWatchedChains(config({ CRYPTO_PROCESSOR_ENABLED: false }))).toEqual([]);
  });

  it("watches nothing while the watcher is disabled, even with an endpoint configured", () => {
    expect(resolveWatchedChains(config({ CRYPTO_PROCESSOR_WATCHER_ENABLED: false }))).toEqual([]);
  });

  it("watches nothing when no endpoint is configured", () => {
    expect(resolveWatchedChains(config({ CRYPTO_PROCESSOR_BASE_RPC_URL: "" }))).toEqual([]);
  });

  it("watches both chains when both endpoints are configured", () => {
    expect(resolveWatchedChains(config({ CRYPTO_PROCESSOR_ETHEREUM_RPC_URL: ethereumRpc })))
      .toEqual([
        { chainId: 8453, endpointUrl: baseRpc },
        { chainId: 1, endpointUrl: ethereumRpc }
      ]);
  });
});

describe("reported watcher status", () => {
  it("never reveals the endpoint URL, which can carry an API key", () => {
    const status = describeWatcherStatus(config());

    expect(JSON.stringify(status)).not.toContain("rpc-with-key");
    expect(JSON.stringify(status)).not.toContain("base.example");
    expect(status).toEqual({ running: true, watchedChainIds: [8453], reason: null });
  });

  it("says which gate is closed, so a silent watcher can be diagnosed", () => {
    expect(describeWatcherStatus(config({ CRYPTO_PROCESSOR_ENABLED: false })).reason)
      .toBe("The crypto processor is disabled.");
    expect(describeWatcherStatus(config({ CRYPTO_PROCESSOR_WATCHER_ENABLED: false })).reason)
      .toBe("The crypto watcher is disabled.");
    expect(describeWatcherStatus(config({ CRYPTO_PROCESSOR_BASE_RPC_URL: "" })).reason)
      .toBe("No chain RPC endpoint is configured.");
  });
});

describe("starting the watcher", () => {
  it("does not start, and says why, when nothing is configured", () => {
    const app = stubApp({ CRYPTO_PROCESSOR_ENABLED: false });

    expect(startCryptoWatcher(app)).toBeNull();
    expect(app.log.info).toHaveBeenCalledWith(
      { reason: "The crypto processor is disabled." },
      "crypto watcher not started"
    );
  });

  it("builds no chain source at all while disabled, so nothing can dial out", () => {
    expect(createChainSources(config({ CRYPTO_PROCESSOR_ENABLED: false }))).toEqual([]);
    expect(createChainSources(config({ CRYPTO_PROCESSOR_WATCHER_ENABLED: false }))).toEqual([]);
  });

  it("keeps going when one chain's endpoint fails, instead of stopping settlement", async () => {
    const app = stubApp();
    const failing = {
      chainId: 8453,
      getBlockNumber: vi.fn().mockRejectedValue(new Error("endpoint down")),
      getLogs: vi.fn()
    };
    // Chain 1 is the PYUSD rail, so give it a PYUSD intent to watch.
    const workingApp = stubApp({}, [{ ...watchableIntentRow, asset: "PYUSD", network: "ethereum" }]);
    const working = {
      chainId: 1,
      getBlockNumber: vi.fn().mockResolvedValue(100n),
      getLogs: vi.fn().mockResolvedValue([])
    };

    const handle = startCryptoWatcher(
      { ...app, db: workingApp.db },
      { sources: [failing, working], schedule: false }
    )!;
    const results = await handle.runOnce();

    expect(app.log.error).toHaveBeenCalledWith(
      expect.objectContaining({ chainId: 8453 }),
      "crypto watcher pass failed"
    );
    expect(working.getBlockNumber).toHaveBeenCalled();
    expect(results).toHaveLength(1);
  });

  it("does not put the endpoint URL into an error log", async () => {
    const app = stubApp();
    const failing = {
      chainId: 8453,
      getBlockNumber: vi.fn().mockRejectedValue(new Error(`failed calling ${baseRpc}`)),
      getLogs: vi.fn()
    };

    await startCryptoWatcher(app, { sources: [failing], schedule: false })!.runOnce();

    // The message is whatever the source threw, so this asserts the watcher
    // adds no URL of its own; the source itself is what must keep the URL out,
    // and crypto-chain-source.test.ts covers that.
    const logged = app.log.error.mock.calls[0]![0] as Record<string, unknown>;
    expect(Object.keys(logged)).toEqual(["chainId", "error"]);
  });

  it("stops cleanly", () => {
    const app = stubApp();
    const source = {
      chainId: 8453,
      getBlockNumber: vi.fn().mockResolvedValue(1n),
      getLogs: vi.fn().mockResolvedValue([])
    };

    const handle = startCryptoWatcher(app, { sources: [source], schedule: false })!;
    expect(() => handle.stop()).not.toThrow();
  });
});
