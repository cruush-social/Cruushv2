import { ELLIPAL_DESTINATION } from "./constants.js";
import { getAddress } from "viem";
import { describe, expect, it, vi } from "vitest";
import { OPERATOR_WALLET_RAILS } from "./networks.js";
import {
  broadcastSignedWalletSweepBundle,
  createOperatorWalletRpc,
  prepareWalletSweepPlanBundle,
  type OperatorWalletRpc,
  type SignedWalletSweepBundle
} from "./wallet-rpc.js";
import { deriveWalletPublicDescriptor } from "./wallet.js";

const PUBLIC_TEST_MNEMONIC =
  "test test test test test test test test test test test junk";
const descriptor = deriveWalletPublicDescriptor(PUBLIC_TEST_MNEMONIC);

function rpc(overrides: Partial<OperatorWalletRpc> = {}): OperatorWalletRpc {
  return {
    getChainId: vi.fn().mockResolvedValue(42161),
    getTransactionCount: vi.fn(async (address: string) =>
      getAddress(address) === getAddress(descriptor.treasuryAddress) ? 7n : 0n),
    getNativeBalance: vi.fn(async (address: string) =>
      getAddress(address) === getAddress(descriptor.treasuryAddress)
        ? 1_000_000_000_000_000n
        : 1_000_000_000_000n),
    getTokenBalance: vi.fn().mockResolvedValue(65_940_000n),
    estimateAdditionalFeeReserve: vi.fn().mockResolvedValue(0n),
    getFeeQuote: vi.fn().mockResolvedValue({
      maxFeePerGas: 100_000_000n,
      maxPriorityFeePerGas: 1_000_000n
    }),
    estimateGas: vi.fn().mockResolvedValue(50_000n),
    sendRawTransaction: vi.fn(),
    hasSuccessfulReceipt: vi.fn().mockResolvedValue(false),
    waitForSuccessfulReceipt: vi.fn(),
    ...overrides
  };
}

describe("operator wallet sweep planning", () => {
  it("plans full-balance child-to-treasury sweep and only the missing native gas", async () => {
    const source = rpc();
    const plan = await prepareWalletSweepPlanBundle({
      descriptor,
      rail: "usdc_arbitrum",
      derivationIndex: 1,
      rpc: source
    });

    expect(plan).toMatchObject({
      network: "arbitrum",
      rail: "usdc_arbitrum",
      derivationIndex: 1,
      tokenSweepPlan: {
        tokenContract: OPERATOR_WALLET_RAILS.usdc_arbitrum.tokenAddress,
        amountAtomic: 65_940_000n,
        gasLimit: 60_000n,
        nonce: 0
      },
      gasFundingPlan: {
        fromDerivationIndex: 0,
        toDerivationIndex: 1,
        valueWei: 5_000_000_000_000n,
        nonce: 7
      }
    });
  });

  it("omits gas funding when the child already has enough and rejects a wrong-chain RPC", async () => {
    const funded = rpc({ getNativeBalance: vi.fn().mockResolvedValue(10_000_000_000_000n) });
    const plan = await prepareWalletSweepPlanBundle({
      descriptor,
      rail: "usdc_arbitrum",
      derivationIndex: 2,
      rpc: funded
    });
    expect(plan.gasFundingPlan).toBeNull();

    await expect(prepareWalletSweepPlanBundle({
      descriptor,
      rail: "usdc_arbitrum",
      derivationIndex: 2,
      rpc: rpc({ getChainId: vi.fn().mockResolvedValue(8453) })
    })).rejects.toThrow(/wrong network/);
  });
});

describe("operator wallet sweep broadcast", () => {
  it("waits for successful gas funding before broadcasting the token sweep", async () => {
    const order: string[] = [];
    const source = rpc({
      sendRawTransaction: vi.fn(async (_raw, hash) => {
        order.push(`send:${hash}`);
        return hash;
      }),
      waitForSuccessfulReceipt: vi.fn(async (hash) => {
        order.push(`wait:${hash}`);
      })
    });
    const gasHash = `0x${"1".repeat(64)}` as const;
    const sweepHash = `0x${"2".repeat(64)}` as const;
    const baseArtifact = {
      version: 1,
      network: "arbitrum",
      chainId: 42161,
      walletXpubFingerprint: descriptor.xpubFingerprint,
      maximumFeeWei: "1",
      rawTransaction: "0x02"
    } as const;
    const bundle = {
      version: 1,
      kind: "wallet-sweep-signed-bundle",
      network: "arbitrum",
      rail: "usdc_arbitrum",
      walletXpubFingerprint: descriptor.xpubFingerprint,
      derivationIndex: 1,
      gasFundingTransaction: {
        ...baseArtifact,
        rail: null,
        kind: "wallet-gas-funding",
        sourceDerivationIndex: 0,
        recipientDerivationIndex: 1,
        fromAddress: descriptor.treasuryAddress,
        transactionTo: descriptor.sampleAddresses[1]!.address,
        recipientAddress: descriptor.sampleAddresses[1]!.address,
        amountAtomic: "1",
        transactionHash: gasHash
      },
      tokenSweepTransaction: {
        ...baseArtifact,
        rail: "usdc_arbitrum",
        kind: "wallet-token-sweep",
        sourceDerivationIndex: 1,
        recipientDerivationIndex: 0,
        fromAddress: descriptor.sampleAddresses[1]!.address,
        transactionTo: OPERATOR_WALLET_RAILS.usdc_arbitrum.tokenAddress,
        recipientAddress: descriptor.treasuryAddress,
        amountAtomic: "65940000",
        transactionHash: sweepHash
      }
    } as SignedWalletSweepBundle;

    await expect(broadcastSignedWalletSweepBundle(source, bundle))
      .resolves.toEqual([gasHash, sweepHash]);
    expect(order).toEqual([
      `send:${gasHash}`,
      `wait:${gasHash}`,
      `send:${sweepHash}`,
      `wait:${sweepHash}`
    ]);

    order.length = 0;
    source.hasSuccessfulReceipt = vi.fn(async (hash) => hash === gasHash);
    await broadcastSignedWalletSweepBundle(source, bundle);
    expect(order).toEqual([`send:${sweepHash}`, `wait:${sweepHash}`]);

    order.length = 0;
    source.hasSuccessfulReceipt = vi.fn(async (hash) => hash === sweepHash);
    await expect(broadcastSignedWalletSweepBundle(source, bundle)).resolves.toEqual([sweepHash]);
    expect(order).toEqual([]);

    source.hasSuccessfulReceipt = vi.fn().mockRejectedValue(new Error("receipt unavailable"));
    await expect(broadcastSignedWalletSweepBundle(source, bundle)).rejects.toThrow("receipt unavailable");
    expect(order).toEqual([]);

  });
});


describe("operator wallet RPC diagnostics", () => {
  it("reports the node rejection without exposing long hex payloads", async () => {
    const client = createOperatorWalletRpc({
      endpointUrl: "https://sepolia.base.org",
      transport: async () => ({ status: 200, text: async () => JSON.stringify({
        error: { code: -32000, message: `transaction rejected 0x${"a".repeat(128)}` }
      }) })
    });
    await expect(client.getChainId()).rejects.toThrow(
      "Operator wallet RPC rejected eth_chainId (-32000): transaction rejected [redacted hex]"
    );
  });
});


describe("ELLIPAL sweep planning", () => {
  it("requires explicit selection for treasury withdrawals and refuses self funding", async () => {
    const source = rpc({getNativeBalance: vi.fn().mockResolvedValue(1000000000000000n)});
    await expect(prepareWalletSweepPlanBundle({ descriptor, rail: "usdc_arbitrum",
      derivationIndex: 0, rpc: source })).rejects.toThrow(/not a payment address/);
    const plan = await prepareWalletSweepPlanBundle({ descriptor, rail: "usdc_arbitrum",
      derivationIndex: 0, ellipal: true, rpc: source });
    expect(plan.tokenSweepPlan.destinationAddress).toBe(ELLIPAL_DESTINATION);
    expect(plan.gasFundingPlan).toBeNull();
    await expect(prepareWalletSweepPlanBundle({ descriptor, rail: "usdc_arbitrum",
      derivationIndex: 0, ellipal: true,
      rpc: rpc({getNativeBalance: vi.fn().mockResolvedValue(0n)}) }))
      .rejects.toThrow(/Treasury needs more native gas/);
  });
});


describe("receipt validation", () => {
  it("accepts only a successful receipt for the requested transaction", async () => {
    const hash = `0x${"1".repeat(64)}` as const;
    let result: unknown = null;
    const client = createOperatorWalletRpc({ endpointUrl: "https://sepolia.base.org",
      transport: async () => ({status: 200, text: async () => JSON.stringify({result})}) });
    expect(await client.hasSuccessfulReceipt(hash)).toBe(false);
    result = {transactionHash: hash, status: "0x1"};
    expect(await client.hasSuccessfulReceipt(hash)).toBe(true);
    result = {transactionHash: hash, status: "0x0"};
    await expect(client.hasSuccessfulReceipt(hash)).rejects.toThrow(/reverted/);
    result = {transactionHash: `0x${"2".repeat(64)}`, status: "0x1"};
    await expect(client.hasSuccessfulReceipt(hash)).rejects.toThrow(/another transaction/);
  });
});


describe("network fee budgets", () => {
  it("includes extra sweep and funding fees and estimates the native transfer gas", async () => {
    const source = rpc({
      getNativeBalance: vi.fn(async (address) => getAddress(address) === descriptor.treasuryAddress
        ? 1000000000000000n : 0n),
      estimateAdditionalFeeReserve: vi.fn().mockResolvedValue(1000000000000n),
      estimateGas: vi.fn().mockResolvedValueOnce(50000n).mockResolvedValueOnce(30000n)
    });
    const plan = await prepareWalletSweepPlanBundle({descriptor, rail: "usdc_arbitrum",
      derivationIndex: 1, rpc: source});
    expect(plan.gasFundingPlan?.valueWei).toBe(7000000000000n);
    expect(plan.gasFundingPlan?.gasLimit).toBe(36000n);
    expect(source.estimateAdditionalFeeReserve).toHaveBeenCalledTimes(2);
    const lowTreasury = rpc({
      getNativeBalance: vi.fn(async (address) => getAddress(address) === descriptor.treasuryAddress
        ? 12000000000000n : 0n),
      estimateAdditionalFeeReserve: vi.fn().mockResolvedValue(1000000000000n)
    });
    await expect(prepareWalletSweepPlanBundle({descriptor, rail: "usdc_arbitrum",
      derivationIndex: 1, rpc: lowTreasury})).rejects.toThrow(/Treasury needs more/);
  });

  it("uses Base oracle reserves and fails closed when the oracle is unavailable", async () => {
    const methods: string[] = [];
    const client = createOperatorWalletRpc({endpointUrl: "https://sepolia.base.org",
      transport: async (_url, body) => {
        methods.push(JSON.parse(body).method);
        return {status:200, text:async () => JSON.stringify({result:"0x64"})};
      }});
    const transaction = {chainId:84532, nonce:0, gas:21000n, maxFeePerGas:10000000n,
      maxPriorityFeePerGas:1000000n, to:descriptor.treasuryAddress as `0x${string}`, value:1n};
    expect(await client.estimateAdditionalFeeReserve(transaction)).toBe(400n);
    expect(methods).toEqual(["eth_call", "eth_call"]);
    const failing = createOperatorWalletRpc({endpointUrl:"https://sepolia.base.org",
      transport:async () => ({status:200,text:async () => JSON.stringify({error:{code:-32000,message:"oracle unavailable"}})})});
    await expect(failing.estimateAdditionalFeeReserve(transaction)).rejects.toThrow(/oracle unavailable/);
    expect(await client.estimateAdditionalFeeReserve({...transaction,chainId:1})).toBe(0n);
    expect(await client.estimateAdditionalFeeReserve({...transaction,chainId:42161})).toBe(0n);
  });
});
