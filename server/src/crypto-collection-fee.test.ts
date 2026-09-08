import { describe, expect, it, vi } from "vitest";
import { quoteCollectionFee } from "./crypto-collection-fee.js";
import type { AppConfig } from "./config.js";
const config = {CRYPTO_PROCESSOR_BASE_RPC_URL:"https://rpc.example"} as AppConfig;
const rail = {network:"base",chainId:8453,tokenAddress:"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"};
const payment = "0x929dbb0E43D1CfD62632c21387f1a248c4c85501";
const treasury = "0x9e374Cf4A9e41784FA2FEE33dDDfEC8b8fbb366A";
function source(overrides: Record<string,unknown>={}) {
  return vi.fn(async (url: string|URL|Request, options?:RequestInit) => {
    if(String(url).includes("coinbase.com")) return new Response(JSON.stringify({data:{base:"ETH",currency:"USD",amount:"2000.00"}}));
    const {method} = JSON.parse(String(options?.body));
    const result = ({eth_chainId:"0x2105",eth_getBlockByNumber:{timestamp:"0x"+Math.floor(Date.now()/1000).toString(16),baseFeePerGas:"0x3b9aca00"},eth_maxPriorityFeePerGas:"0x3b9aca00",eth_estimateGas:"0x5208",eth_call:"0x"+"0".repeat(64),...overrides} as Record<string,unknown>)[method];
    return new Response(JSON.stringify({result}));
  }) as typeof fetch;
}
describe("mandatory live gas quote",()=>{
  it("rounds collection cost upward and records price provenance",async()=>{
    const quote=await quoteCollectionFee(config,rail,payment,treasury,source());
    expect(quote.estimatedCostWei).toBe("261000000000000");
    expect(quote.feeUsdCents).toBe(53);
    expect(quote.ethUsd).toBe("2000.00");
  });
  it("rejects a block sample that becomes stale while fetching the price", async () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    const provider = source();
    const delayedPrice = (async (url, options) => {
      const response = await provider(url, options);
      if (String(url).includes("coinbase.com")) clock.mockReturnValue(now + 121000);
      return response;
    }) as typeof fetch;
    try {
      await expect(quoteCollectionFee(config, rail, payment, treasury, delayedPrice)).rejects.toThrow(/could not be estimated/);
    } finally {
      clock.mockRestore();
    }
  });
  it("refuses wrong-chain, stale, and unavailable sources without a free fallback",async()=>{
    for(const overrides of [{eth_chainId:"0x1"},{eth_getBlockByNumber:{timestamp:"0x1",baseFeePerGas:"0x1"}},{eth_call:null}]){
      await expect(quoteCollectionFee(config,rail,payment,treasury,source(overrides))).rejects.toThrow(/could not be estimated/);
    }
  });
});
