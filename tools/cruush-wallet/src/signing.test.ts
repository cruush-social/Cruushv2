import { ELLIPAL_DESTINATION } from "./constants.js";
import {
  encodeFunctionData,
  getAddress,
  keccak256,
  parseTransaction,
  recoverTransactionAddress
} from "viem";
import { describe, expect, it } from "vitest";
import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC_ADDRESS
} from "./constants.js";
import {
  parseBaseSepoliaGasFundingPlan,
  parseBaseSepoliaUsdcSweepPlan,
  parseSignedOperatorWalletTransaction,
  parseWalletGasFundingPlan,
  parseWalletTokenSweepPlan,
  signBaseSepoliaGasFundingPlan,
  signBaseSepoliaUsdcSweepPlan,
  signWalletGasFundingPlan,
  signWalletTokenSweepPlan
} from "./signing.js";
import { OPERATOR_WALLET_NETWORKS, OPERATOR_WALLET_RAILS } from "./networks.js";
import { deriveWalletPublicDescriptor } from "./wallet.js";

// Public development mnemonic used by local Ethereum test tools. Never use it for funds.
const PUBLIC_TEST_MNEMONIC =
  "test test test test test test test test test test test junk";
const descriptor = deriveWalletPublicDescriptor(PUBLIC_TEST_MNEMONIC);
const treasuryAddress = getAddress(descriptor.treasuryAddress);
const paymentAddress = getAddress(descriptor.sampleAddresses[1]!.address);

function gasFundingPlan(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    kind: "base-sepolia-gas-funding",
    chainId: BASE_SEPOLIA_CHAIN_ID,
    walletXpubFingerprint: descriptor.xpubFingerprint,
    fromDerivationIndex: 0,
    toDerivationIndex: 1,
    fromAddress: treasuryAddress,
    toAddress: paymentAddress,
    valueWei: "1000000000000",
    nonce: "0",
    gasLimit: "21000",
    maxFeePerGas: "1000000",
    maxPriorityFeePerGas: "100000",
    ...overrides
  };
}

function usdcSweepPlan(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    kind: "base-sepolia-usdc-sweep",
    chainId: BASE_SEPOLIA_CHAIN_ID,
    walletXpubFingerprint: descriptor.xpubFingerprint,
    fromDerivationIndex: 1,
    treasuryDerivationIndex: 0,
    fromAddress: paymentAddress,
    treasuryAddress,
    usdcContract: BASE_SEPOLIA_USDC_ADDRESS,
    amountAtomic: "18990000",
    nonce: "0",
    gasLimit: "100000",
    maxFeePerGas: "1000000",
    maxPriorityFeePerGas: "100000",
    ...overrides
  };
}

describe("Base Sepolia constrained signing", () => {
  it("signs only a treasury-to-child gas-funding transaction", async () => {
    const artifact = await signBaseSepoliaGasFundingPlan(
      PUBLIC_TEST_MNEMONIC,
      gasFundingPlan()
    );
    const parsed = parseTransaction(artifact.rawTransaction);

    expect(await recoverTransactionAddress({
      serializedTransaction: artifact.rawTransaction
    })).toBe(treasuryAddress);
    expect(parsed).toMatchObject({
      chainId: BASE_SEPOLIA_CHAIN_ID,
      nonce: 0,
      gas: 21_000n,
      maxFeePerGas: 1_000_000n,
      maxPriorityFeePerGas: 100_000n,
      value: 1_000_000_000_000n
    });
    expect(getAddress(parsed.to!)).toBe(paymentAddress);
    expect(artifact.transactionHash).toBe(keccak256(artifact.rawTransaction));
    expect(artifact).not.toHaveProperty("privateKey");
    expect(artifact).not.toHaveProperty("mnemonic");
  });

  it("signs only a child-to-treasury transfer through the pinned test USDC contract", async () => {
    const artifact = await signBaseSepoliaUsdcSweepPlan(
      PUBLIC_TEST_MNEMONIC,
      usdcSweepPlan()
    );
    const parsed = parseTransaction(artifact.rawTransaction);
    const expectedData = encodeFunctionData({
      abi: [{
        type: "function",
        name: "transfer",
        stateMutability: "nonpayable",
        inputs: [
          { name: "to", type: "address" },
          { name: "value", type: "uint256" }
        ],
        outputs: [{ name: "", type: "bool" }]
      }],
      functionName: "transfer",
      args: [treasuryAddress, 18_990_000n]
    });

    expect(await recoverTransactionAddress({
      serializedTransaction: artifact.rawTransaction
    })).toBe(paymentAddress);
    expect(parsed).toMatchObject({
      chainId: BASE_SEPOLIA_CHAIN_ID,
      nonce: 0,
      gas: 100_000n,
      data: expectedData
    });
    expect(getAddress(parsed.to!)).toBe(BASE_SEPOLIA_USDC_ADDRESS);
    expect(parsed.value ?? 0n).toBe(0n);
    expect(artifact.recipientAddress).toBe(treasuryAddress);
    expect(artifact.amountAtomic).toBe("18990000");
  });

  it("rejects mainnet, an unpinned token contract, excessive fees, and unknown fields", () => {
    expect(() => parseBaseSepoliaGasFundingPlan(gasFundingPlan({ chainId: 8453 }))).toThrow(
      /84532/
    );
    expect(() => parseBaseSepoliaUsdcSweepPlan(usdcSweepPlan({
      usdcContract: "0x0000000000000000000000000000000000000001"
    }))).toThrow(/pinned Circle USDC/);
    expect(() => parseBaseSepoliaGasFundingPlan(gasFundingPlan({
      gasLimit: "250000",
      maxFeePerGas: "10000000000"
    }))).toThrow(/maximum fee/);
    expect(() => parseBaseSepoliaGasFundingPlan(gasFundingPlan({ unexpected: true }))).toThrow(
      /unsupported fields/
    );
  });

  it("rejects a different wallet fingerprint or mismatched derived addresses before signing", async () => {
    await expect(signBaseSepoliaGasFundingPlan(PUBLIC_TEST_MNEMONIC, gasFundingPlan({
      walletXpubFingerprint: "0".repeat(64)
    }))).rejects.toThrow(/do not match/);
    await expect(signBaseSepoliaUsdcSweepPlan(PUBLIC_TEST_MNEMONIC, usdcSweepPlan({
      fromAddress: treasuryAddress
    }))).rejects.toThrow(/addresses do not match/);
  });
});

function mainnetGasPlan(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    kind: "wallet-gas-funding",
    network: "arbitrum",
    chainId: 42161,
    walletXpubFingerprint: descriptor.xpubFingerprint,
    fromDerivationIndex: 0,
    toDerivationIndex: 1,
    fromAddress: treasuryAddress,
    toAddress: paymentAddress,
    valueWei: "100000000000000",
    nonce: "7",
    gasLimit: "21000",
    maxFeePerGas: "100000000",
    maxPriorityFeePerGas: "1000000",
    ...overrides
  };
}

function mainnetSweepPlan(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    kind: "wallet-token-sweep",
    rail: "usdc_arbitrum",
    chainId: 42161,
    walletXpubFingerprint: descriptor.xpubFingerprint,
    fromDerivationIndex: 1,
    treasuryDerivationIndex: 0,
    fromAddress: paymentAddress,
    treasuryAddress,
    tokenContract: OPERATOR_WALLET_RAILS.usdc_arbitrum.tokenAddress,
    amountAtomic: "65940000",
    nonce: "0",
    gasLimit: "100000",
    maxFeePerGas: "100000000",
    maxPriorityFeePerGas: "1000000",
    ...overrides
  };
}

describe("mainnet-pinned operator signing", () => {
  it("signs only treasury-to-child gas funding on the selected pinned chain", async () => {
    const artifact = await signWalletGasFundingPlan(PUBLIC_TEST_MNEMONIC, mainnetGasPlan());
    const parsed = parseTransaction(artifact.rawTransaction);

    expect(await recoverTransactionAddress({ serializedTransaction: artifact.rawTransaction }))
      .toBe(treasuryAddress);
    expect(parsed).toMatchObject({ chainId: 42161, nonce: 7 });
    expect(getAddress(parsed.to!)).toBe(paymentAddress);
    expect(artifact).toMatchObject({ network: "arbitrum", rail: null });
  });

  it("signs an exact pinned stablecoin transfer from one child to treasury", async () => {
    const artifact = await signWalletTokenSweepPlan(PUBLIC_TEST_MNEMONIC, mainnetSweepPlan());
    const parsed = parseTransaction(artifact.rawTransaction);

    expect(await recoverTransactionAddress({ serializedTransaction: artifact.rawTransaction }))
      .toBe(paymentAddress);
    expect(getAddress(parsed.to!)).toBe(OPERATOR_WALLET_RAILS.usdc_arbitrum.tokenAddress);
    expect(artifact).toMatchObject({
      network: "arbitrum",
      rail: "usdc_arbitrum",
      recipientAddress: treasuryAddress,
      amountAtomic: "65940000"
    });
  });

  it("rejects chain, contract, fee-cap, derivation, and unknown-field drift", () => {
    expect(() => parseWalletGasFundingPlan(mainnetGasPlan({ chainId: 8453 })))
      .toThrow(/chainId/);
    expect(() => parseWalletTokenSweepPlan(mainnetSweepPlan({
      tokenContract: OPERATOR_WALLET_RAILS.pyusd_arbitrum.tokenAddress
    }))).toThrow(/pinned issuer contract/);
    expect(() => parseWalletTokenSweepPlan(mainnetSweepPlan({
      gasLimit: "250000",
      maxFeePerGas: "10000000000"
    }))).toThrow(/maximum fee/);
    expect(() => parseWalletTokenSweepPlan(mainnetSweepPlan({ fromDerivationIndex: 0 })))
      .toThrow(/fromDerivationIndex/);
    expect(() => parseWalletTokenSweepPlan(mainnetSweepPlan({ surprise: true })))
      .toThrow(/unsupported fields/);
  });

  it("rechecks the network fee cap when loading a signed artifact for broadcast", async () => {
    const artifact = await signWalletTokenSweepPlan(PUBLIC_TEST_MNEMONIC, mainnetSweepPlan());

    await expect(parseSignedOperatorWalletTransaction({
      ...artifact,
      maximumFeeWei: (OPERATOR_WALLET_NETWORKS.arbitrum.maxSignedTransactionFeeWei + 1n)
        .toString()
    })).rejects.toThrow(/maximumFeeWei/);
  });
});


describe("explicit ELLIPAL sweeps", () => {
  it("signs a treasury withdrawal to only the approved destination and rejects tampering", async () => {
    const plan = mainnetSweepPlan({ fromDerivationIndex: 0, fromAddress: treasuryAddress,
      destinationAddress: ELLIPAL_DESTINATION });
    const signed = await signWalletTokenSweepPlan(PUBLIC_TEST_MNEMONIC, plan);
    const verified = await parseSignedOperatorWalletTransaction(signed, descriptor);
    expect(verified.recipientAddress).toBe(ELLIPAL_DESTINATION);
    expect(verified.recipientDerivationIndex).toBeNull();
    expect(verified.sourceDerivationIndex).toBe(0);
    await expect(parseSignedOperatorWalletTransaction({ ...signed,
      recipientAddress: treasuryAddress }, descriptor)).rejects.toThrow();
    expect(() => parseWalletTokenSweepPlan({ ...plan, destinationAddress: treasuryAddress }))
      .toThrow(/approved ELLIPAL/);
    await expect(signWalletTokenSweepPlan(PUBLIC_TEST_MNEMONIC, {
      ...plan, destinationAddress: undefined })).rejects.toThrow();
  });

  it("keeps legacy treasury validation and supports explicit child-to-ELLIPAL sweeps", async () => {
    const legacy = await signWalletTokenSweepPlan(PUBLIC_TEST_MNEMONIC, mainnetSweepPlan());
    expect((await parseSignedOperatorWalletTransaction(legacy, descriptor)).recipientAddress)
      .toBe(treasuryAddress);
    await expect(parseSignedOperatorWalletTransaction({ ...legacy,
      destinationAddress: ELLIPAL_DESTINATION, recipientDerivationIndex: null }, descriptor))
      .rejects.toThrow();
    const cold = await signWalletTokenSweepPlan(PUBLIC_TEST_MNEMONIC,
      mainnetSweepPlan({ destinationAddress: ELLIPAL_DESTINATION }));
    expect((await parseSignedOperatorWalletTransaction(cold, descriptor)).recipientAddress)
      .toBe(ELLIPAL_DESTINATION);
    expect(() => parseWalletTokenSweepPlan(mainnetSweepPlan({
      fromDerivationIndex: 0, fromAddress: treasuryAddress }))).toThrow();
  });
});
