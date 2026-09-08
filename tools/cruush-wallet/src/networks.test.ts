import { describe, expect, it } from "vitest";
import {
  OPERATOR_WALLET_NETWORKS,
  OPERATOR_WALLET_RAILS,
  getOperatorWalletNetworkByChainId
} from "./networks.js";

describe("operator wallet pinned networks", () => {
  it("pins every server rail to its production chain and issuer contract", () => {
    expect(OPERATOR_WALLET_RAILS).toMatchObject({
      usdc_arbitrum: {
        chainId: 42161,
        tokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"
      },
      pyusd_arbitrum: {
        chainId: 42161,
        tokenAddress: "0x46850aD61C2B7d64d08c9C754F45254596696984"
      },
      usdc_base: {
        chainId: 8453,
        tokenAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
      },
      pyusd_ethereum: {
        chainId: 1,
        tokenAddress: "0x6c3ea9036406852006290770BEdFcAbA0e23A0e8"
      }
    });
  });

  it("uses tighter L2 hard caps and rejects every unknown chain", () => {
    expect(OPERATOR_WALLET_NETWORKS.arbitrum.maxSignedTransactionFeeWei)
      .toBeLessThan(OPERATOR_WALLET_NETWORKS.ethereum.maxSignedTransactionFeeWei);
    expect(getOperatorWalletNetworkByChainId(8453).id).toBe("base");
    expect(() => getOperatorWalletNetworkByChainId(10)).toThrow(/Unsupported/);
  });
});
