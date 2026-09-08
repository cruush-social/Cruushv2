import { keccak_256 } from "@noble/hashes/sha3.js";
import type { AppConfig } from "./config.js";
import { ApiError } from "./errors.js";

export type CollectionFeeQuote = {
  version: 1;
  feeUsdCents: number;
  estimatedCostWei: string;
  ethUsd: string;
  sampledAt: string;
};

const ORACLE = "0x420000000000000000000000000000000000000f";
const quantity = (value: unknown): bigint => {
  if (typeof value !== "string" || !/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(value)) {
    throw new Error("Invalid fee quantity");
  }
  return BigInt(value);
};
function oracleData(name: string, value: bigint) {
  return "0x" + Buffer.from(keccak_256(Buffer.from(name))).toString("hex").slice(0, 8)
    + value.toString(16).padStart(64, "0");
}
function uintResult(value: unknown) {
  if (typeof value !== "string" || !/^0x[0-9a-f]{64}$/i.test(value)) throw new Error("Invalid oracle fee");
  return BigInt(value);
}

/** Quotes collection only, not the purchaser's sending gas. No signing or writes.
 * ETH/USD: https://docs.cdp.coinbase.com/coinbase-app/track-apis/prices
 * Base fees: https://specs.optimism.io/protocol/fjord/predeploys.html
 * Gas model: zero-value ERC-20 transfer simulation plus 40,000 gas for balance
 * storage changes, and a separately estimated native funding transfer. This
 * conservative estimate is locked per order, not reconciled to actual gas.
 */
export async function quoteCollectionFee(
  config: AppConfig,
  rail: { network: string; chainId: number; tokenAddress: string },
  paymentAddress: string,
  treasuryAddress: string,
  request: typeof fetch = fetch
): Promise<CollectionFeeQuote> {
  try {
    const endpoints: Record<string, string | undefined> = {
      base: config.CRYPTO_PROCESSOR_BASE_RPC_URL,
      "base-sepolia": config.CRYPTO_PROCESSOR_BASE_SEPOLIA_RPC_URL,
      arbitrum: config.CRYPTO_PROCESSOR_ARBITRUM_RPC_URL,
      ethereum: config.CRYPTO_PROCESSOR_ETHEREUM_RPC_URL
    };
    const endpoint = endpoints[rail.network];
    if (!endpoint || ![1, 42161, 8453, 84532].includes(rail.chainId)) throw new Error("Unsupported fee source");
    async function rpc(method: string, params: unknown[]) {
      const response = await request(endpoint!, {method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({jsonrpc:"2.0",id:1,method,params}), signal:AbortSignal.timeout(8000)});
      if (!response.ok) throw new Error("Fee source unavailable");
      const body = await response.json() as {error?:unknown;result?:unknown};
      if (body.error || !("result" in body)) throw new Error("Fee source rejected request");
      return body.result;
    }
    if (quantity(await rpc("eth_chainId", [])) !== BigInt(rail.chainId)) throw new Error("Wrong fee chain");
    const block = await rpc("eth_getBlockByNumber", ["latest", false]) as Record<string, unknown>;
    const blockTime = Number(quantity(block.timestamp));
    if (Math.abs(Date.now()/1000-blockTime) > 120) throw new Error("Stale fee block");
    const gasPrice = 2n * quantity(block.baseFeePerGas) + quantity(await rpc("eth_maxPriorityFeePerGas", []));
    if (gasPrice <= 0n) throw new Error("Invalid gas price");
    const data = "0xa9059cbb" + treasuryAddress.slice(2).toLowerCase().padStart(64,"0") + "0".repeat(64);
    const tokenGas = quantity(await rpc("eth_estimateGas", [{from:paymentAddress,to:rail.tokenAddress,data}])) + 40000n;
    const fundingGas = quantity(await rpc("eth_estimateGas", [{from:treasuryAddress,to:paymentAddress,value:"0x0"}])) + 5000n;
    if (tokenGas > 250000n || fundingGas > 250000n) throw new Error("Fee simulation exceeds supported budget");
    let extra = 0n;
    if (rail.chainId === 8453 || rail.chainId === 84532) {
      async function oracle(name: string, argument: bigint) {
        return uintResult(await rpc("eth_call", [{to:ORACLE,data:oracleData(name,argument)},"latest"]));
      }
      // 256 unsigned bytes bounds each supported fixed-shape transfer. The
      // oracle adds the signature size itself. Include both collection legs.
      extra = 2n * await oracle("getL1FeeUpperBound(uint256)",256n)
        + await oracle("getOperatorFee(uint256)",tokenGas)
        + await oracle("getOperatorFee(uint256)",fundingGas);
    }
    const totalWei = (tokenGas + fundingGas) * gasPrice + extra;
    const priceResponse = await request("https://api.coinbase.com/v2/prices/ETH-USD/spot", {
      headers:{"Cache-Control":"no-cache"},signal:AbortSignal.timeout(8000)});
    if (!priceResponse.ok) throw new Error("Price unavailable");
    const price = await priceResponse.json() as {data?:{base?:string;currency?:string;amount?:string}};
    const amount = price.data?.amount;
    if (price.data?.base !== "ETH" || price.data.currency !== "USD" || !amount || !/^[0-9]+(?:\.[0-9]{1,8})?$/.test(amount)) throw new Error("Invalid price");
    const [whole, fraction=""] = amount.split(".");
    const usdScaled = BigInt(whole!) * 100000000n + BigInt(fraction.padEnd(8,"0"));
    if (usdScaled <= 0n) throw new Error("Invalid price");
    const divisor = 10n ** 24n; // wei * USD(1e8) to USD cents
    const fee = (totalWei * usdScaled + divisor - 1n) / divisor;
    if (fee <= 0n || fee > 100000n) throw new Error("Fee exceeds supported quote range");
    if (Math.abs(Date.now()/1000 - blockTime) > 120) throw new Error("Stale fee quote");
    return {version:1,feeUsdCents:Number(fee),estimatedCostWei:totalWei.toString(),ethUsd:amount,sampledAt:new Date().toISOString()};
  } catch {
    throw new ApiError(503,"CRYPTO_CHAIN_SOURCE_UNAVAILABLE","The gas fee could not be estimated. Please try again.");
  }
}
