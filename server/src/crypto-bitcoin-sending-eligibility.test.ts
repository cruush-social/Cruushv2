import { describe, expect, it } from "vitest";
import { HDKey } from "@scure/bip32";
import { listBitcoinSendingEligibility } from "./crypto-payments.js";
import { BITCOIN_GENESIS_HASH } from "./bitcoin.js";
import type { AppConfig } from "./config.js";

// BIP84 public test vector seed, never a funded wallet.
const seed = Buffer.from(
  "5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc19a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4",
  "hex"
);
const bitcoinXpub = HDKey.fromMasterSeed(seed).derive("m/84'/0'/0'/0").publicExtendedKey;
const tipHash = "a".repeat(64);

function config(overrides: Partial<AppConfig> = {}) {
  return {
    CRYPTO_PROCESSOR_ENABLED: true,
    CRYPTO_PROCESSOR_WATCHER_ENABLED: true,
    CRYPTO_PROCESSOR_BITCOIN_WALLET_XPUB: bitcoinXpub,
    CRYPTO_PROCESSOR_BITCOIN_ESPLORA_URL: "https://blockstream.info/api",
    ...overrides
  } as unknown as AppConfig;
}

/** Esplora plus the spot price, with one BTC priced at `btcUsd`. */
function chainStub(btcUsd: number) {
  return async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/block-height/0")) return new Response(BITCOIN_GENESIS_HASH);
    if (url.endsWith("/blocks/tip/height")) return new Response("900000");
    if (url.endsWith("/block-height/900000")) return new Response(tipHash);
    if (url.endsWith(`/block/${tipHash}`)) {
      return Response.json({ id: tipHash, height: 900000, timestamp: Math.floor(Date.now() / 1000) });
    }
    if (url.endsWith("/fee-estimates")) return Response.json({ "1": 1 });
    if (url.startsWith("https://api.coinbase.com/")) {
      return Response.json({ data: { base: "BTC", currency: "USD", amount: btcUsd.toFixed(2) } });
    }
    throw new Error(`unexpected request ${url}`);
  };
}

describe("Bitcoin sending eligibility", () => {
  it("hides an order under an app's on-chain minimum and follows the BTC price", async () => {
    // At $80,000 a coin, $2.99 plus the collection fee is about 3,800 satoshis,
    // under Cash App's 5,000. At $30,000 the same pack clears it.
    const expensive = await listBitcoinSendingEligibility(config(), chainStub(80_000));
    expect(expensive.products.ping_3).toEqual([]);
    expect(expensive.products.ping_10).toEqual(["Cash App"]);
    expect(expensive.products.plus_weekly).toEqual(["Cash App"]);

    const cheap = await listBitcoinSendingEligibility(config(), chainStub(30_000));
    expect(cheap.products.ping_3).toEqual(["Cash App"]);
  });

  it("clears the PayPal and Venmo minimum only once an order reaches 0.001 BTC", async () => {
    const eligibility = await listBitcoinSendingEligibility(config(), chainStub(80_000));

    // At $80,000 a coin, 0.001 BTC is $80: the annual plan clears it and the
    // weekly one does not.
    expect(eligibility.products.plus_annual).toEqual(["Cash App", "PayPal", "Venmo"]);
    expect(eligibility.products.plus_weekly).toEqual(["Cash App"]);
    expect(eligibility.products.plus_6_month).toEqual(["Cash App"]);
  });

  it("evaluates nothing while the Bitcoin rail is not configured", async () => {
    const eligibility = await listBitcoinSendingEligibility(
      config({ CRYPTO_PROCESSOR_BITCOIN_ESPLORA_URL: "" } as Partial<AppConfig>),
      async () => {
        throw new Error("the chain must not be sampled");
      }
    );

    expect(eligibility.products).toEqual({});
  });
});
