import { getAddress } from "viem";
import { describe, expect, it, vi } from "vitest";
import { OPERATOR_WALLET_RAILS } from "./networks.js";
import {
  broadcastSignedWalletSweepBundle,
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
    getFeeQuote: vi.fn().mockResolvedValue({
      maxFeePerGas: 100_000_000n,
      maxPriorityFeePerGas: 1_000_000n
    }),
    estimateGas: vi.fn().mockResolvedValue(50_000n),
    sendRawTransaction: vi.fn(),
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
  });
});
