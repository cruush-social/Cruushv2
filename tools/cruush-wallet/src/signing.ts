import { mnemonicToSeedSync } from "@scure/bip39";
import {
  encodeFunctionData,
  getAddress,
  keccak256,
  type Address,
  type Hex
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { HDKey } from "@scure/bip32";
import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC_ADDRESS,
  FIRST_PAYMENT_DERIVATION_INDEX,
  MAX_GAS_FUNDING_VALUE_WEI,
  MAX_GAS_LIMIT,
  MAX_NON_HARDENED_CHILD_INDEX,
  MAX_SIGNED_TRANSACTION_FEE_WEI,
  MAX_UINT256,
  RECEIVE_CHAIN_PATH,
  TREASURY_DERIVATION_INDEX
} from "./constants.js";
import {
  assertValidWalletMnemonic,
  deriveAddressFromReceiveChainXpub,
  deriveWalletPublicDescriptor
} from "./wallet.js";

const ERC20_TRANSFER_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }]
  }
] as const;

const GAS_FUNDING_KEYS = [
  "version",
  "kind",
  "chainId",
  "walletXpubFingerprint",
  "fromDerivationIndex",
  "toDerivationIndex",
  "fromAddress",
  "toAddress",
  "valueWei",
  "nonce",
  "gasLimit",
  "maxFeePerGas",
  "maxPriorityFeePerGas"
] as const;

const USDC_SWEEP_KEYS = [
  "version",
  "kind",
  "chainId",
  "walletXpubFingerprint",
  "fromDerivationIndex",
  "treasuryDerivationIndex",
  "fromAddress",
  "treasuryAddress",
  "usdcContract",
  "amountAtomic",
  "nonce",
  "gasLimit",
  "maxFeePerGas",
  "maxPriorityFeePerGas"
] as const;

type ParsedTransactionFees = {
  nonce: number;
  gasLimit: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
};

export type BaseSepoliaGasFundingPlan = {
  version: 1;
  kind: "base-sepolia-gas-funding";
  chainId: typeof BASE_SEPOLIA_CHAIN_ID;
  walletXpubFingerprint: string;
  fromDerivationIndex: typeof TREASURY_DERIVATION_INDEX;
  toDerivationIndex: number;
  fromAddress: Address;
  toAddress: Address;
  valueWei: bigint;
} & ParsedTransactionFees;

export type BaseSepoliaUsdcSweepPlan = {
  version: 1;
  kind: "base-sepolia-usdc-sweep";
  chainId: typeof BASE_SEPOLIA_CHAIN_ID;
  walletXpubFingerprint: string;
  fromDerivationIndex: number;
  treasuryDerivationIndex: typeof TREASURY_DERIVATION_INDEX;
  fromAddress: Address;
  treasuryAddress: Address;
  usdcContract: Address;
  amountAtomic: bigint;
} & ParsedTransactionFees;

export type SignedWalletTransaction = {
  version: 1;
  network: "base-sepolia";
  kind: BaseSepoliaGasFundingPlan["kind"] | BaseSepoliaUsdcSweepPlan["kind"];
  chainId: typeof BASE_SEPOLIA_CHAIN_ID;
  walletXpubFingerprint: string;
  sourceDerivationIndex: number;
  fromAddress: Address;
  transactionTo: Address;
  recipientAddress: Address;
  amountAtomic: string;
  transactionHash: Hex;
  rawTransaction: Hex;
};

function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
}

function assertExactKeys(
  record: Record<string, unknown>,
  expectedKeys: readonly string[],
  label: string
) {
  const actual = Object.keys(record).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} contains missing or unsupported fields.`);
  }
}

function parseExactNumber<const Expected extends number>(
  value: unknown,
  expected: Expected,
  label: string
): Expected {
  if (value !== expected) {
    throw new Error(`${label} must be ${expected}.`);
  }
  return expected;
}

function parseDerivationIndex(value: unknown, label: string, minimum: number) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > MAX_NON_HARDENED_CHILD_INDEX
  ) {
    throw new Error(`${label} must be an integer from ${minimum} through ${MAX_NON_HARDENED_CHILD_INDEX}.`);
  }
  return value;
}

function parseDecimalBigInt(
  value: unknown,
  label: string,
  options: { allowZero?: boolean; maximum?: bigint } = {}
) {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${label} must be a canonical unsigned decimal string.`);
  }

  const parsed = BigInt(value);
  if (!options.allowZero && parsed === 0n) {
    throw new Error(`${label} must be greater than zero.`);
  }
  if (options.maximum !== undefined && parsed > options.maximum) {
    throw new Error(`${label} exceeds the software-wallet safety limit.`);
  }
  return parsed;
}

function parseNonce(value: unknown) {
  const nonce = parseDecimalBigInt(value, "nonce", {
    allowZero: true,
    maximum: BigInt(Number.MAX_SAFE_INTEGER)
  });
  return Number(nonce);
}

function parseAddress(value: unknown, label: string) {
  if (typeof value !== "string") {
    throw new Error(`${label} must be an Ethereum address.`);
  }

  try {
    return getAddress(value);
  } catch {
    throw new Error(`${label} must be an Ethereum address.`);
  }
}

function parseFingerprint(value: unknown) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error("walletXpubFingerprint must be a lowercase SHA-256 digest.");
  }
  return value;
}

function parseFees(record: Record<string, unknown>): ParsedTransactionFees {
  const gasLimit = parseDecimalBigInt(record.gasLimit, "gasLimit", {
    maximum: MAX_GAS_LIMIT
  });
  const maxFeePerGas = parseDecimalBigInt(record.maxFeePerGas, "maxFeePerGas");
  const maxPriorityFeePerGas = parseDecimalBigInt(
    record.maxPriorityFeePerGas,
    "maxPriorityFeePerGas",
    { allowZero: true }
  );

  if (maxPriorityFeePerGas > maxFeePerGas) {
    throw new Error("maxPriorityFeePerGas cannot exceed maxFeePerGas.");
  }
  if (gasLimit * maxFeePerGas > MAX_SIGNED_TRANSACTION_FEE_WEI) {
    throw new Error("Transaction maximum fee exceeds the software-wallet safety limit.");
  }

  return {
    nonce: parseNonce(record.nonce),
    gasLimit,
    maxFeePerGas,
    maxPriorityFeePerGas
  };
}

function assertPlanHeader(record: Record<string, unknown>, expectedKind: string) {
  parseExactNumber(record.version, 1, "version");
  if (record.kind !== expectedKind) {
    throw new Error(`kind must be ${expectedKind}.`);
  }
  parseExactNumber(record.chainId, BASE_SEPOLIA_CHAIN_ID, "chainId");
}

export function parseBaseSepoliaGasFundingPlan(value: unknown): BaseSepoliaGasFundingPlan {
  assertRecord(value, "Gas-funding plan");
  assertExactKeys(value, GAS_FUNDING_KEYS, "Gas-funding plan");
  assertPlanHeader(value, "base-sepolia-gas-funding");

  return {
    version: 1,
    kind: "base-sepolia-gas-funding",
    chainId: BASE_SEPOLIA_CHAIN_ID,
    walletXpubFingerprint: parseFingerprint(value.walletXpubFingerprint),
    fromDerivationIndex: parseExactNumber(
      value.fromDerivationIndex,
      TREASURY_DERIVATION_INDEX,
      "fromDerivationIndex"
    ),
    toDerivationIndex: parseDerivationIndex(
      value.toDerivationIndex,
      "toDerivationIndex",
      FIRST_PAYMENT_DERIVATION_INDEX
    ),
    fromAddress: parseAddress(value.fromAddress, "fromAddress"),
    toAddress: parseAddress(value.toAddress, "toAddress"),
    valueWei: parseDecimalBigInt(value.valueWei, "valueWei", {
      maximum: MAX_GAS_FUNDING_VALUE_WEI
    }),
    ...parseFees(value)
  };
}

export function parseBaseSepoliaUsdcSweepPlan(value: unknown): BaseSepoliaUsdcSweepPlan {
  assertRecord(value, "USDC sweep plan");
  assertExactKeys(value, USDC_SWEEP_KEYS, "USDC sweep plan");
  assertPlanHeader(value, "base-sepolia-usdc-sweep");

  const usdcContract = parseAddress(value.usdcContract, "usdcContract");
  if (usdcContract !== BASE_SEPOLIA_USDC_ADDRESS) {
    throw new Error("usdcContract must be the pinned Circle USDC contract on Base Sepolia.");
  }

  return {
    version: 1,
    kind: "base-sepolia-usdc-sweep",
    chainId: BASE_SEPOLIA_CHAIN_ID,
    walletXpubFingerprint: parseFingerprint(value.walletXpubFingerprint),
    fromDerivationIndex: parseDerivationIndex(
      value.fromDerivationIndex,
      "fromDerivationIndex",
      FIRST_PAYMENT_DERIVATION_INDEX
    ),
    treasuryDerivationIndex: parseExactNumber(
      value.treasuryDerivationIndex,
      TREASURY_DERIVATION_INDEX,
      "treasuryDerivationIndex"
    ),
    fromAddress: parseAddress(value.fromAddress, "fromAddress"),
    treasuryAddress: parseAddress(value.treasuryAddress, "treasuryAddress"),
    usdcContract,
    amountAtomic: parseDecimalBigInt(value.amountAtomic, "amountAtomic", {
      maximum: MAX_UINT256
    }),
    ...parseFees(value)
  };
}

function assertWalletMatchesPlan(
  mnemonic: string,
  plan: Pick<
    BaseSepoliaGasFundingPlan | BaseSepoliaUsdcSweepPlan,
    "walletXpubFingerprint"
  >
) {
  const descriptor = deriveWalletPublicDescriptor(mnemonic);
  if (descriptor.xpubFingerprint !== plan.walletXpubFingerprint) {
    throw new Error("Recovery words do not match the wallet fingerprint in the plan.");
  }
  return descriptor;
}

async function signAtDerivationIndex(
  mnemonicValue: string,
  derivationIndex: number,
  transaction: Parameters<ReturnType<typeof privateKeyToAccount>["signTransaction"]>[0]
) {
  const mnemonic = assertValidWalletMnemonic(mnemonicValue);
  const seed = mnemonicToSeedSync(mnemonic);
  const root = HDKey.fromMasterSeed(seed);
  const child = root.derive(`${RECEIVE_CHAIN_PATH}/${derivationIndex}`);
  let account: ReturnType<typeof privateKeyToAccount> | undefined;
  let privateKeyHex: Hex | undefined;

  try {
    if (!child.privateKey || !child.publicKey) {
      throw new Error("Wallet child derivation did not produce signing material.");
    }
    privateKeyHex = `0x${Buffer.from(child.privateKey).toString("hex")}`;
    account = privateKeyToAccount(privateKeyHex);
    return {
      address: account.address,
      rawTransaction: await account.signTransaction(transaction)
    };
  } finally {
    account = undefined;
    privateKeyHex = undefined;
    child.wipePrivateData();
    root.wipePrivateData();
    seed.fill(0);
  }
}

export async function signBaseSepoliaGasFundingPlan(
  mnemonicValue: string,
  input: unknown
): Promise<SignedWalletTransaction> {
  const plan = parseBaseSepoliaGasFundingPlan(input);
  const descriptor = assertWalletMatchesPlan(mnemonicValue, plan);
  const expectedFrom = getAddress(descriptor.treasuryAddress);
  const expectedTo = getAddress(
    deriveAddressFromReceiveChainXpub(
      descriptor.receiveChainXpub,
      plan.toDerivationIndex
    )
  );

  if (plan.fromAddress !== expectedFrom || plan.toAddress !== expectedTo) {
    throw new Error("Gas-funding plan addresses do not match the derived wallet paths.");
  }

  const signed = await signAtDerivationIndex(
    mnemonicValue,
    TREASURY_DERIVATION_INDEX,
    {
      chainId: BASE_SEPOLIA_CHAIN_ID,
      type: "eip1559",
      nonce: plan.nonce,
      gas: plan.gasLimit,
      maxFeePerGas: plan.maxFeePerGas,
      maxPriorityFeePerGas: plan.maxPriorityFeePerGas,
      to: expectedTo,
      value: plan.valueWei
    }
  );
  if (signed.address !== expectedFrom) {
    throw new Error("Gas-funding signer address does not match the treasury path.");
  }

  return {
    version: 1,
    network: "base-sepolia",
    kind: plan.kind,
    chainId: BASE_SEPOLIA_CHAIN_ID,
    walletXpubFingerprint: plan.walletXpubFingerprint,
    sourceDerivationIndex: TREASURY_DERIVATION_INDEX,
    fromAddress: expectedFrom,
    transactionTo: expectedTo,
    recipientAddress: expectedTo,
    amountAtomic: plan.valueWei.toString(),
    transactionHash: keccak256(signed.rawTransaction),
    rawTransaction: signed.rawTransaction
  };
}

export async function signBaseSepoliaUsdcSweepPlan(
  mnemonicValue: string,
  input: unknown
): Promise<SignedWalletTransaction> {
  const plan = parseBaseSepoliaUsdcSweepPlan(input);
  const descriptor = assertWalletMatchesPlan(mnemonicValue, plan);
  const expectedFrom = getAddress(
    deriveAddressFromReceiveChainXpub(
      descriptor.receiveChainXpub,
      plan.fromDerivationIndex
    )
  );
  const expectedTreasury = getAddress(descriptor.treasuryAddress);

  if (plan.fromAddress !== expectedFrom || plan.treasuryAddress !== expectedTreasury) {
    throw new Error("USDC sweep plan addresses do not match the derived wallet paths.");
  }

  const data = encodeFunctionData({
    abi: ERC20_TRANSFER_ABI,
    functionName: "transfer",
    args: [expectedTreasury, plan.amountAtomic]
  });
  const signed = await signAtDerivationIndex(
    mnemonicValue,
    plan.fromDerivationIndex,
    {
      chainId: BASE_SEPOLIA_CHAIN_ID,
      type: "eip1559",
      nonce: plan.nonce,
      gas: plan.gasLimit,
      maxFeePerGas: plan.maxFeePerGas,
      maxPriorityFeePerGas: plan.maxPriorityFeePerGas,
      to: BASE_SEPOLIA_USDC_ADDRESS,
      value: 0n,
      data
    }
  );
  if (signed.address !== expectedFrom) {
    throw new Error("USDC sweep signer address does not match the payment path.");
  }

  return {
    version: 1,
    network: "base-sepolia",
    kind: plan.kind,
    chainId: BASE_SEPOLIA_CHAIN_ID,
    walletXpubFingerprint: plan.walletXpubFingerprint,
    sourceDerivationIndex: plan.fromDerivationIndex,
    fromAddress: expectedFrom,
    transactionTo: BASE_SEPOLIA_USDC_ADDRESS,
    recipientAddress: expectedTreasury,
    amountAtomic: plan.amountAtomic.toString(),
    transactionHash: keccak256(signed.rawTransaction),
    rawTransaction: signed.rawTransaction
  };
}
