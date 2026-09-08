import { ELLIPAL_DESTINATION } from "./constants.js";
import { mnemonicToSeedSync } from "@scure/bip39";
import {
  decodeFunctionData,
  encodeFunctionData,
  getAddress,
  keccak256,
  parseTransaction,
  recoverTransactionAddress,
  type Address,
  type Hex,
  type TransactionSerialized
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
import {
  getOperatorWalletNetwork,
  getOperatorWalletRail,
  type OperatorWalletNetworkId,
  type OperatorWalletRailId
} from "./networks.js";

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

const WALLET_GAS_FUNDING_KEYS = [
  "version",
  "kind",
  "network",
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

const WALLET_TOKEN_SWEEP_KEYS = [
  "version",
  "kind",
  "rail",
  "chainId",
  "walletXpubFingerprint",
  "fromDerivationIndex",
  "treasuryDerivationIndex",
  "fromAddress",
  "treasuryAddress",
  "tokenContract",
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

export type WalletGasFundingPlan = {
  version: 1;
  kind: "wallet-gas-funding";
  network: OperatorWalletNetworkId;
  chainId: number;
  walletXpubFingerprint: string;
  fromDerivationIndex: typeof TREASURY_DERIVATION_INDEX;
  toDerivationIndex: number;
  fromAddress: Address;
  toAddress: Address;
  valueWei: bigint;
} & ParsedTransactionFees;

export type WalletTokenSweepPlan = {
  destinationAddress?: Address;
  version: 1;
  kind: "wallet-token-sweep";
  rail: OperatorWalletRailId;
  chainId: number;
  walletXpubFingerprint: string;
  fromDerivationIndex: number;
  treasuryDerivationIndex: typeof TREASURY_DERIVATION_INDEX;
  fromAddress: Address;
  treasuryAddress: Address;
  tokenContract: Address;
  amountAtomic: bigint;
} & ParsedTransactionFees;

export type SignedOperatorWalletTransaction = {
  destinationAddress?: Address;
  version: 1;
  network: OperatorWalletNetworkId;
  rail: OperatorWalletRailId | null;
  kind: WalletGasFundingPlan["kind"] | WalletTokenSweepPlan["kind"];
  chainId: number;
  walletXpubFingerprint: string;
  sourceDerivationIndex: number;
  recipientDerivationIndex: number | null;
  fromAddress: Address;
  transactionTo: Address;
  recipientAddress: Address;
  amountAtomic: string;
  maximumFeeWei: string;
  transactionHash: Hex;
  rawTransaction: Hex;
};

const SIGNED_OPERATOR_TRANSACTION_KEYS = [
  "version",
  "network",
  "rail",
  "kind",
  "chainId",
  "walletXpubFingerprint",
  "sourceDerivationIndex",
  "recipientDerivationIndex",
  "fromAddress",
  "transactionTo",
  "recipientAddress",
  "amountAtomic",
  "maximumFeeWei",
  "transactionHash",
  "rawTransaction"
] as const;

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

function parseFees(
  record: Record<string, unknown>,
  maximumTransactionFeeWei = MAX_SIGNED_TRANSACTION_FEE_WEI
): ParsedTransactionFees {
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
  if (gasLimit * maxFeePerGas > maximumTransactionFeeWei) {
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
  plan: { walletXpubFingerprint: string }
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

export async function parseSignedOperatorWalletTransaction(
  value: unknown,
  descriptor?: {
    receiveChainXpub: string;
    xpubFingerprint: string;
    treasuryAddress: string;
  }
): Promise<SignedOperatorWalletTransaction> {
  assertRecord(value, "Signed transaction");
  assertExactKeys(value, "destinationAddress" in value ? [...SIGNED_OPERATOR_TRANSACTION_KEYS, "destinationAddress"] : SIGNED_OPERATOR_TRANSACTION_KEYS, "Signed transaction");
  const destinationAddress = parseColdDestination(value);
  parseExactNumber(value.version, 1, "version");
  if (typeof value.network !== "string") {
    throw new Error("Signed transaction network is invalid.");
  }
  const network = getOperatorWalletNetwork(value.network);
  parseExactNumber(value.chainId, network.chainId, "chainId");
  const walletXpubFingerprint = parseFingerprint(value.walletXpubFingerprint);
  const sourceDerivationIndex = parseDerivationIndex(
    value.sourceDerivationIndex,
    "sourceDerivationIndex",
    0
  );
  const recipientDerivationIndex = destinationAddress && value.recipientDerivationIndex === null ? null : parseDerivationIndex(
    value.recipientDerivationIndex,
    "recipientDerivationIndex",
    0
  );
  const fromAddress = parseAddress(value.fromAddress, "fromAddress");
  const transactionTo = parseAddress(value.transactionTo, "transactionTo");
  const recipientAddress = parseAddress(value.recipientAddress, "recipientAddress");
  const amountAtomicValue = parseDecimalBigInt(value.amountAtomic, "amountAtomic", {
    maximum: MAX_UINT256
  });
  const amountAtomic = amountAtomicValue.toString();
  const maximumFeeWeiValue = parseDecimalBigInt(value.maximumFeeWei, "maximumFeeWei", {
    maximum: network.maxSignedTransactionFeeWei
  });
  const maximumFeeWei = maximumFeeWeiValue.toString();
  if (typeof value.rawTransaction !== "string" || !/^0x[0-9a-fA-F]+$/.test(value.rawTransaction)) {
    throw new Error("Signed transaction rawTransaction is invalid.");
  }
  const rawTransaction = value.rawTransaction as Hex;
  const transactionHash = keccak256(rawTransaction);
  if (value.transactionHash !== transactionHash) {
    throw new Error("Signed transaction hash does not match its raw transaction.");
  }

  const serializedTransaction = rawTransaction as TransactionSerialized;
  let parsed: ReturnType<typeof parseTransaction>;
  try {
    parsed = parseTransaction(serializedTransaction);
  } catch {
    throw new Error("Signed transaction rawTransaction cannot be decoded.");
  }
  if (
    parsed.chainId !== network.chainId
    || !parsed.to
    || getAddress(parsed.to) !== transactionTo
    || !parsed.gas
    || parsed.gas > MAX_GAS_LIMIT
    || parsed.maxFeePerGas === undefined
    || parsed.maxPriorityFeePerGas === undefined
    || parsed.maxPriorityFeePerGas > parsed.maxFeePerGas
    || parsed.gas * parsed.maxFeePerGas !== maximumFeeWeiValue
  ) {
    throw new Error("Signed transaction fields do not match its raw transaction.");
  }
  const recoveredFrom = await recoverTransactionAddress({ serializedTransaction });
  if (recoveredFrom !== fromAddress) {
    throw new Error("Signed transaction sender does not match its signature.");
  }

  let rail: OperatorWalletRailId | null;
  let kind: SignedOperatorWalletTransaction["kind"];
  if (value.kind === "wallet-gas-funding") {
    if (destinationAddress || value.rail !== null || sourceDerivationIndex !== TREASURY_DERIVATION_INDEX) {
      throw new Error("Signed gas-funding transaction has invalid wallet paths.");
    }
    if (
      recipientDerivationIndex === null || recipientDerivationIndex < FIRST_PAYMENT_DERIVATION_INDEX
      || recipientAddress !== transactionTo
      || amountAtomicValue > network.maxGasFundingValueWei
      || (parsed.value ?? 0n) !== amountAtomicValue
      || (parsed.data !== undefined && parsed.data !== "0x")
    ) {
      throw new Error("Signed gas-funding transaction payload is invalid.");
    }
    rail = null;
    kind = "wallet-gas-funding";
  } else if (value.kind === "wallet-token-sweep" && typeof value.rail === "string") {
    const configuredRail = getOperatorWalletRail(value.rail);
    if (
      configuredRail.network !== network.id
      || configuredRail.tokenAddress !== transactionTo
      || sourceDerivationIndex < (destinationAddress ? 0 : FIRST_PAYMENT_DERIVATION_INDEX)
      || (destinationAddress ? recipientDerivationIndex !== null || recipientAddress !== destinationAddress : recipientDerivationIndex !== TREASURY_DERIVATION_INDEX)
      || (parsed.value ?? 0n) !== 0n
      || !parsed.data
    ) {
      throw new Error("Signed token-sweep transaction payload is invalid.");
    }
    let decoded: ReturnType<typeof decodeFunctionData>;
    try {
      decoded = decodeFunctionData({ abi: ERC20_TRANSFER_ABI, data: parsed.data });
    } catch {
      throw new Error("Signed token-sweep transaction data is invalid.");
    }
    if (
      decoded.functionName !== "transfer"
      || !Array.isArray(decoded.args)
      || getAddress(decoded.args[0] as string) !== recipientAddress
      || (decoded.args[1] as bigint) !== amountAtomicValue
    ) {
      throw new Error("Signed token-sweep recipient or amount is invalid.");
    }
    rail = configuredRail.id;
    kind = "wallet-token-sweep";
  } else {
    throw new Error("Signed transaction kind or rail is invalid.");
  }

  if (descriptor) {
    if (descriptor.xpubFingerprint !== walletXpubFingerprint) {
      throw new Error("Signed transaction does not belong to the active wallet.");
    }
    const expectedFrom = getAddress(
      deriveAddressFromReceiveChainXpub(descriptor.receiveChainXpub, sourceDerivationIndex)
    );
    const expectedRecipient = destinationAddress ?? getAddress(
      deriveAddressFromReceiveChainXpub(descriptor.receiveChainXpub, recipientDerivationIndex!)
    );
    if (fromAddress !== expectedFrom || recipientAddress !== expectedRecipient) {
      throw new Error("Signed transaction addresses do not match the active wallet paths.");
    }
  }

  return {
    version: 1,
    network: network.id,
    rail,
    kind,
    chainId: network.chainId,
    walletXpubFingerprint,
    sourceDerivationIndex,
    recipientDerivationIndex,
    ...(destinationAddress ? { destinationAddress } : {}),
    fromAddress,
    transactionTo,
    recipientAddress,
    amountAtomic,
    maximumFeeWei,
    transactionHash,
    rawTransaction
  };
}

export function parseWalletGasFundingPlan(value: unknown): WalletGasFundingPlan {
  assertRecord(value, "Gas-funding plan");
  assertExactKeys(value, WALLET_GAS_FUNDING_KEYS, "Gas-funding plan");
  parseExactNumber(value.version, 1, "version");
  if (value.kind !== "wallet-gas-funding") {
    throw new Error("kind must be wallet-gas-funding.");
  }
  if (typeof value.network !== "string") {
    throw new Error("network must name a supported operator-wallet network.");
  }
  const network = getOperatorWalletNetwork(value.network);
  parseExactNumber(value.chainId, network.chainId, "chainId");

  return {
    version: 1,
    kind: "wallet-gas-funding",
    network: network.id,
    chainId: network.chainId,
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
      maximum: network.maxGasFundingValueWei
    }),
    ...parseFees(value, network.maxSignedTransactionFeeWei)
  };
}

function parseColdDestination(value: Record<string, unknown>): Address | undefined {
  if (!("destinationAddress" in value)) return undefined;
  if (parseAddress(value.destinationAddress, "destinationAddress") !== ELLIPAL_DESTINATION) {
    throw new Error("Destination must match the approved ELLIPAL address.");
  }
  return ELLIPAL_DESTINATION;
}

export function parseWalletTokenSweepPlan(value: unknown): WalletTokenSweepPlan {
  assertRecord(value, "Token-sweep plan");
  assertExactKeys(value, "destinationAddress" in value ? [...WALLET_TOKEN_SWEEP_KEYS, "destinationAddress"] : WALLET_TOKEN_SWEEP_KEYS, "Token-sweep plan");
  const destinationAddress = parseColdDestination(value);
  parseExactNumber(value.version, 1, "version");
  if (value.kind !== "wallet-token-sweep") {
    throw new Error("kind must be wallet-token-sweep.");
  }
  if (typeof value.rail !== "string") {
    throw new Error("rail must name a supported operator-wallet rail.");
  }
  const rail = getOperatorWalletRail(value.rail);
  const network = getOperatorWalletNetwork(rail.network);
  parseExactNumber(value.chainId, rail.chainId, "chainId");
  const tokenContract = parseAddress(value.tokenContract, "tokenContract");
  if (tokenContract !== rail.tokenAddress) {
    throw new Error("tokenContract does not match the pinned issuer contract for this rail.");
  }

  return {
    version: 1,
    kind: "wallet-token-sweep",
    rail: rail.id,
    chainId: rail.chainId,
    walletXpubFingerprint: parseFingerprint(value.walletXpubFingerprint),
    fromDerivationIndex: parseDerivationIndex(
      value.fromDerivationIndex,
      "fromDerivationIndex",
      destinationAddress ? 0 : FIRST_PAYMENT_DERIVATION_INDEX
    ),
    treasuryDerivationIndex: parseExactNumber(
      value.treasuryDerivationIndex,
      TREASURY_DERIVATION_INDEX,
      "treasuryDerivationIndex"
    ),
    fromAddress: parseAddress(value.fromAddress, "fromAddress"),
    treasuryAddress: parseAddress(value.treasuryAddress, "treasuryAddress"),
    tokenContract,
    ...(destinationAddress ? { destinationAddress } : {}),
    amountAtomic: parseDecimalBigInt(value.amountAtomic, "amountAtomic", {
      maximum: MAX_UINT256
    }),
    ...parseFees(value, network.maxSignedTransactionFeeWei)
  };
}

export async function signWalletGasFundingPlan(
  mnemonicValue: string,
  input: unknown
): Promise<SignedOperatorWalletTransaction> {
  const plan = parseWalletGasFundingPlan(input);
  const network = getOperatorWalletNetwork(plan.network);
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
      chainId: network.chainId,
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
    network: network.id,
    rail: null,
    kind: plan.kind,
    chainId: network.chainId,
    walletXpubFingerprint: plan.walletXpubFingerprint,
    sourceDerivationIndex: TREASURY_DERIVATION_INDEX,
    recipientDerivationIndex: plan.toDerivationIndex,
    fromAddress: expectedFrom,
    transactionTo: expectedTo,
    recipientAddress: expectedTo,
    amountAtomic: plan.valueWei.toString(),
    maximumFeeWei: (plan.gasLimit * plan.maxFeePerGas).toString(),
    transactionHash: keccak256(signed.rawTransaction),
    rawTransaction: signed.rawTransaction
  };
}

export async function signWalletTokenSweepPlan(
  mnemonicValue: string,
  input: unknown
): Promise<SignedOperatorWalletTransaction> {
  const plan = parseWalletTokenSweepPlan(input);
  const rail = getOperatorWalletRail(plan.rail);
  const descriptor = assertWalletMatchesPlan(mnemonicValue, plan);
  const expectedFrom = getAddress(
    deriveAddressFromReceiveChainXpub(
      descriptor.receiveChainXpub,
      plan.fromDerivationIndex
    )
  );
  const expectedTreasury = getAddress(descriptor.treasuryAddress);
  if (plan.fromAddress !== expectedFrom || plan.treasuryAddress !== expectedTreasury) {
    throw new Error("Token-sweep plan addresses do not match the derived wallet paths.");
  }

  const data = encodeFunctionData({
    abi: ERC20_TRANSFER_ABI,
    functionName: "transfer",
    args: [plan.destinationAddress ?? expectedTreasury, plan.amountAtomic]
  });
  const signed = await signAtDerivationIndex(
    mnemonicValue,
    plan.fromDerivationIndex,
    {
      chainId: rail.chainId,
      type: "eip1559",
      nonce: plan.nonce,
      gas: plan.gasLimit,
      maxFeePerGas: plan.maxFeePerGas,
      maxPriorityFeePerGas: plan.maxPriorityFeePerGas,
      to: rail.tokenAddress,
      value: 0n,
      data
    }
  );
  if (signed.address !== expectedFrom) {
    throw new Error("Token-sweep signer address does not match the payment path.");
  }

  return {
    version: 1,
    network: rail.network,
    rail: rail.id,
    kind: plan.kind,
    chainId: rail.chainId,
    walletXpubFingerprint: plan.walletXpubFingerprint,
    sourceDerivationIndex: plan.fromDerivationIndex,
    recipientDerivationIndex: plan.destinationAddress ? null : TREASURY_DERIVATION_INDEX,
    ...(plan.destinationAddress ? { destinationAddress: plan.destinationAddress } : {}),
    fromAddress: expectedFrom,
    transactionTo: rail.tokenAddress,
    recipientAddress: plan.destinationAddress ?? expectedTreasury,
    amountAtomic: plan.amountAtomic.toString(),
    maximumFeeWei: (plan.gasLimit * plan.maxFeePerGas).toString(),
    transactionHash: keccak256(signed.rawTransaction),
    rawTransaction: signed.rawTransaction
  };
}
