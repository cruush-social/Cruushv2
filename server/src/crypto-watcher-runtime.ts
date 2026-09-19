import { createBitcoinSource, type BitcoinSource } from "./bitcoin.js";
import { runBitcoinWatcherPass } from "./bitcoin-watcher.js";
/**
 * Scheduling for the chain watcher.
 *
 * The watcher grants real cruush+ time from what it reads, so it starts only
 * when every gate is explicitly open: the processor enabled, the watcher
 * enabled, and an endpoint configured for that chain. Any missing gate means
 * that chain is simply not watched, and the reason is reported rather than
 * swallowed.
 *
 * A pass never overlaps itself, and a failing pass never stops the schedule:
 * an endpoint that is down for a minute must not mean payments stop settling
 * for the rest of the process lifetime.
 */

import type { AppConfig } from "./config.js";
import type { DbClient } from "./db.js";
import {
  CRYPTO_PAYMENT_RAILS,
  assertCryptoProcessorReady,
  isCryptoPaymentRailReady,
  getCryptoPaymentChainRpcEndpoint,
  getCryptoPaymentRailRpcEndpoint,
  getCryptoPaymentRailIdForChainId,
  type CryptoPaymentRailId
} from "./crypto-payments.js";
import { createJsonRpcChainSource, type ChainSource } from "./crypto-chain-source.js";
import { runCryptoWatcherPass, type WatcherPassResult } from "./crypto-watcher.js";
import { ApiError } from "./errors.js";

export type WatcherLogger = {
  info(payload: Record<string, unknown>, message: string): void;
  warn(payload: Record<string, unknown>, message: string): void;
  error(payload: Record<string, unknown>, message: string): void;
};

export type ConfiguredChain = { chainId: number; endpointUrl: string };
export type CryptoPaymentRailHeadReader = (
  config: AppConfig,
  railId: CryptoPaymentRailId
) => Promise<bigint>;

/**
 * Captures the exact chain origin before a payment address becomes fillable.
 * The endpoint must identify itself as the fixed rail's chain before its head
 * can be persisted; a configured URL alone is not enough evidence.
 */
export async function readVerifiedCryptoPaymentRailHead(
  config: AppConfig,
  railId: CryptoPaymentRailId,
  sourceFactory: (input: { chainId: number; endpointUrl: string }) => ChainSource = createJsonRpcChainSource
) {
  assertCryptoProcessorReady(config, railId);
  if (railId === "btc_bitcoin") return BigInt((await createBitcoinSource(config.CRYPTO_PROCESSOR_BITCOIN_ESPLORA_URL ?? "").head()).height);
  const rail = CRYPTO_PAYMENT_RAILS[railId];
  const source = sourceFactory({
    chainId: rail.chainId,
    endpointUrl: getCryptoPaymentRailRpcEndpoint(config, railId)
  });
  const observedChainId = await source.getChainId();

  if (observedChainId !== rail.chainId) {
    throw new ApiError(
      502,
      "CRYPTO_CHAIN_SOURCE_UNAVAILABLE",
      "Crypto chain source is connected to the wrong network."
    );
  }

  return source.getBlockNumber();
}

/**
 * Which chains are actually watchable, given configuration. Returns nothing at
 * all unless both the processor and the watcher are enabled, so a stray RPC URL
 * in an environment file can never by itself start settling payments.
 */
export function resolveWatchedChains(config: AppConfig): ConfiguredChain[] {
  if (config.CRYPTO_PROCESSOR_ENABLED !== true || config.CRYPTO_PROCESSOR_WATCHER_ENABLED !== true) {
    return [];
  }

  // Arbitrum first: it carries both tokens and is the rail customers actually
  // reach from Cash App, Venmo, and PayPal.
  const endpoints: Array<[number, string]> = [
    [CRYPTO_PAYMENT_RAILS.usdc_arbitrum.chainId, getCryptoPaymentRailRpcEndpoint(config, "usdc_arbitrum")],
    [CRYPTO_PAYMENT_RAILS.pyusd_ethereum.chainId, getCryptoPaymentRailRpcEndpoint(config, "pyusd_ethereum")],
    [CRYPTO_PAYMENT_RAILS.usdc_base.chainId, getCryptoPaymentRailRpcEndpoint(config, "usdc_base")]
  ];

  // The testnet chain is polled only when the rail is deliberately enabled, and
  // that flag is refused in production. Without this the rail can take an order
  // it can never settle, because nothing ever reads the chain.
  if (config.CRYPTO_PROCESSOR_TESTNET_ENABLED === true) {
    endpoints.push([
      CRYPTO_PAYMENT_RAILS.usdc_base_sepolia.chainId,
      getCryptoPaymentRailRpcEndpoint(config, "usdc_base_sepolia")
    ]);
  }

  if (isCryptoPaymentRailReady(config, "btc_bitcoin")) endpoints.push([0, config.CRYPTO_PROCESSOR_BITCOIN_ESPLORA_URL ?? ""]);

  return endpoints
    .filter(([, endpointUrl]) => endpointUrl.length > 0)
    .map(([chainId, endpointUrl]) => ({ chainId, endpointUrl }));
}

export function describeWatcherStatus(config: AppConfig) {
  const chains = resolveWatchedChains(config);

  return {
    running: chains.length > 0,
    watchedChainIds: chains.map((chain) => chain.chainId),
    // Never include the endpoint URLs; they can carry an API key.
    reason: config.CRYPTO_PROCESSOR_ENABLED !== true
      ? "The crypto processor is disabled."
      : config.CRYPTO_PROCESSOR_WATCHER_ENABLED !== true
        ? "The crypto watcher is disabled."
        : chains.length === 0
          ? "No chain RPC endpoint is configured."
          : null
  };
}

export function createChainSources(config: AppConfig): ChainSource[] {
  return resolveWatchedChains(config).filter(chain => chain.chainId !== 0).map((chain) =>
    createJsonRpcChainSource({ chainId: chain.chainId, endpointUrl: chain.endpointUrl })
  );
}

export function createCryptoReceiptSource(
  config: AppConfig,
  chainId: number,
  sourceFactory: (input: { chainId: number; endpointUrl: string }) => ChainSource = createJsonRpcChainSource
) {
  const readinessRail = getCryptoPaymentRailIdForChainId(chainId);
  assertCryptoProcessorReady(config, readinessRail);
  const endpointUrl = getCryptoPaymentChainRpcEndpoint(config, chainId);
  if (!endpointUrl) {
    throw new ApiError(
      503,
      "CRYPTO_PROCESSOR_NOT_READY",
      "That crypto payment network is not configured for receipt recovery."
    );
  }
  return sourceFactory({ chainId, endpointUrl });
}

export type CryptoWatcherHandle = {
  stop(): void;
  runOnce(): Promise<WatcherPassResult[]>;
};

export function startCryptoWatcher(
  app: { db: DbClient; config: AppConfig; log: WatcherLogger },
  options: { sources?: ChainSource[]; bitcoinSource?: BitcoinSource; schedule?: boolean } = {}
): CryptoWatcherHandle | null {
  const sources = options.sources ?? createChainSources(app.config);

  const bitcoinSource = options.bitcoinSource ?? (options.sources === undefined && isCryptoPaymentRailReady(app.config, "btc_bitcoin") ? createBitcoinSource(app.config.CRYPTO_PROCESSOR_BITCOIN_ESPLORA_URL ?? "") : null);

  if (sources.length === 0 && !bitcoinSource) {
    const status = describeWatcherStatus(app.config);
    app.log.info({ reason: status.reason }, "crypto watcher not started");
    return null;
  }

  let running = false;
  let stopped = false;

  async function runOnce() {
    const results: WatcherPassResult[] = [];

    for (const source of sources) {
      try {
        const result = await runCryptoWatcherPass(app, source);
        results.push(result);

        if (result.transfersObserved > 0 || result.entitlementsGranted > 0 || result.transfersReorganized > 0) {
          app.log.info({ ...result }, "crypto watcher pass");
        }
      } catch (error) {
        // One chain failing must not stop the others, and must not stop the
        // schedule. The endpoint URL never reaches the log.
        app.log.error(
          { chainId: source.chainId, error: error instanceof Error ? error.message : "unknown error" },
          "crypto watcher pass failed"
        );
      }
    }

    if (bitcoinSource) {
      try { results.push(await runBitcoinWatcherPass(app, bitcoinSource)); }
      catch { app.log.error({ network: "bitcoin" }, "Bitcoin monitoring failed; will retry"); }
    }
    return results;
  }

  const intervalMs = (app.config.CRYPTO_PROCESSOR_WATCHER_INTERVAL_SECONDS ?? 60) * 1000;
  let timer: NodeJS.Timeout | null = null;

  if (options.schedule !== false) {
    timer = setInterval(() => {
      // Skip rather than queue: a slow pass must not pile up behind itself.
      if (running || stopped) {
        return;
      }

      running = true;
      void runOnce().finally(() => {
        running = false;
      });
    }, intervalMs);

    // Never hold the process open for a poller.
    timer.unref?.();
    app.log.info(
      { chainIds: sources.map((source) => source.chainId), intervalSeconds: intervalMs / 1000 },
      "crypto watcher started"
    );
  }

  return {
    stop() {
      stopped = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
    runOnce
  };
}
