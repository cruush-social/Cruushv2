import { ELLIPAL_DESTINATION } from "./constants.js";
import {
  encodeFunctionData,
  serializeTransaction,
  getAddress,
  keccak256,
  type Address,
  type Hex
} from "viem";
import {
  MAX_GAS_LIMIT,
  TREASURY_DERIVATION_INDEX
} from "./constants.js";
import {
  getOperatorWalletNetwork,
  getOperatorWalletRail,
  type OperatorWalletNetworkId,
  type OperatorWalletRailId
} from "./networks.js";
import {
  parseSignedOperatorWalletTransaction,
  parseWalletGasFundingPlan,
  parseWalletTokenSweepPlan,
  type SignedOperatorWalletTransaction,
  type WalletGasFundingPlan,
  type WalletTokenSweepPlan
} from "./signing.js";
import {
  assertWalletDerivationIndex,
  deriveAddressFromReceiveChainXpub,
  type WalletPublicDescriptor
} from "./wallet.js";

const ERC20_BALANCE_OF_ABI = [{
  type: "function",
  name: "balanceOf",
  stateMutability: "view",
  inputs: [{ name: "account", type: "address" }],
  outputs: [{ name: "balance", type: "uint256" }]
}] as const;

const ERC20_TRANSFER_ABI = [{
  type: "function",
  name: "transfer",
  stateMutability: "nonpayable",
  inputs: [
    { name: "to", type: "address" },
    { name: "value", type: "uint256" }
  ],
  outputs: [{ name: "", type: "bool" }]
}] as const;

const HEX_QUANTITY = /^0x(?:0|[1-9a-f][0-9a-f]*)$/i;
const TRANSACTION_HASH = /^0x[0-9a-f]{64}$/i;

export type OperatorWalletRpcTransport = (
  url: string,
  body: string,
  signal: AbortSignal
) => Promise<{ status: number; text(): Promise<string> }>;

export type AdditionalFeeInput = {
  chainId: number;
  nonce: number;
  gas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  to: Address;
  value: bigint;
  data?: Hex;
};

export type OperatorWalletRpc = {
  getChainId(): Promise<number>;
  getTransactionCount(address: Address): Promise<bigint>;
  getNativeBalance(address: Address): Promise<bigint>;
  getTokenBalance(tokenAddress: Address, address: Address): Promise<bigint>;
  estimateAdditionalFeeReserve(transaction: AdditionalFeeInput): Promise<bigint>;
  getFeeQuote(): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }>;
  estimateGas(input: { from: Address; to: Address; data?: Hex; value?: bigint }): Promise<bigint>;
  sendRawTransaction(rawTransaction: Hex, expectedHash: Hex): Promise<Hex>;
  hasSuccessfulReceipt(transactionHash: Hex): Promise<boolean>;
  waitForSuccessfulReceipt(transactionHash: Hex): Promise<void>;
};

export type WalletSweepPlanBundle = {
  version: 1;
  kind: "wallet-sweep-plan-bundle";
  network: OperatorWalletNetworkId;
  rail: OperatorWalletRailId;
  walletXpubFingerprint: string;
  derivationIndex: number;
  gasFundingPlan: WalletGasFundingPlan | null;
  tokenSweepPlan: WalletTokenSweepPlan;
};

export type SignedWalletSweepBundle = {
  version: 1;
  kind: "wallet-sweep-signed-bundle";
  network: OperatorWalletNetworkId;
  rail: OperatorWalletRailId;
  walletXpubFingerprint: string;
  derivationIndex: number;
  gasFundingTransaction: SignedOperatorWalletTransaction | null;
  tokenSweepTransaction: SignedOperatorWalletTransaction;
};

function parseHexQuantity(value: unknown, label: string) {
  if (typeof value !== "string" || !HEX_QUANTITY.test(value)) {
    throw new Error(`Operator wallet RPC returned an invalid ${label}.`);
  }
  return BigInt(value);
}

function parseHexDataInteger(value: unknown, label: string) {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value)) {
    throw new Error(`Operator wallet RPC returned invalid ${label} data.`);
  }
  return BigInt(value);
}

function toHexQuantity(value: bigint) {
  if (value < 0n) {
    throw new Error("Operator wallet RPC quantity cannot be negative.");
  }
  return `0x${value.toString(16)}`;
}

function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
}

function assertExactKeys(record: Record<string, unknown>, expected: readonly string[], label: string) {
  const actual = Object.keys(record).sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length
    || actual.some((key, index) => key !== sortedExpected[index])
  ) {
    throw new Error(`${label} contains missing or unsupported fields.`);
  }
}

const defaultTransport: OperatorWalletRpcTransport = async (url, body, signal) => fetch(url, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body,
  signal
});

export function createOperatorWalletRpc(input: {
  endpointUrl: string;
  timeoutMs?: number;
  receiptTimeoutMs?: number;
  receiptPollMs?: number;
  transport?: OperatorWalletRpcTransport;
}): OperatorWalletRpc {
  let endpoint: URL;
  try {
    endpoint = new URL(input.endpointUrl);
  } catch {
    throw new Error("Operator wallet RPC URL is invalid.");
  }
  if (endpoint.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(endpoint.hostname)) {
    throw new Error("Operator wallet RPC must use HTTPS outside localhost.");
  }
  const transport = input.transport ?? defaultTransport;
  const timeoutMs = input.timeoutMs ?? 10_000;
  let nextId = 1;

  async function call(method: string, params: unknown[]) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response: Awaited<ReturnType<OperatorWalletRpcTransport>>;
    try {
      response = await transport(
        input.endpointUrl,
        JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
        controller.signal
      );
    } catch {
      throw new Error(`Operator wallet RPC did not answer ${method}.`);
    } finally {
      clearTimeout(timeout);
    }
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Operator wallet RPC answered ${method} with HTTP ${response.status}.`);
    }
    let body: unknown;
    try {
      body = JSON.parse(await response.text()) as unknown;
    } catch {
      throw new Error(`Operator wallet RPC returned invalid JSON for ${method}.`);
    }
    assertRecord(body, "Operator wallet RPC response");
    if (body.error !== undefined && body.error !== null) {
      const error = body.error as { code?: unknown; message?: unknown };
      const code = typeof error?.code === "number" ? ` (${error.code})` : "";
      const detail = typeof error?.message === "string"
        ? error.message.replace(/0x[0-9a-f]{64,}/gi, "[redacted hex]").replace(/[\x00-\x1f\x7f]/g, " ").slice(0, 300)
        : "No error message provided";
      throw new Error(`Operator wallet RPC rejected ${method}${code}: ${detail}`);
    }
    if (!("result" in body)) {
      throw new Error(`Operator wallet RPC returned no result for ${method}.`);
    }
    return body.result;
  }

  const rpc: OperatorWalletRpc = {
    async getChainId() {
      const value = parseHexQuantity(await call("eth_chainId", []), "chain ID");
      if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error("Operator wallet RPC returned an unsafe chain ID.");
      }
      return Number(value);
    },
    getTransactionCount: async (address) =>
      parseHexQuantity(await call("eth_getTransactionCount", [address, "pending"]), "nonce"),
    getNativeBalance: async (address) =>
      parseHexQuantity(await call("eth_getBalance", [address, "pending"]), "native balance"),
    async getTokenBalance(tokenAddress, address) {
      const data = encodeFunctionData({
        abi: ERC20_BALANCE_OF_ABI,
        functionName: "balanceOf",
        args: [address]
      });
      return parseHexDataInteger(
        await call("eth_call", [{ to: tokenAddress, data }, "latest"]),
        "token balance"
      );
    },
    async getFeeQuote() {
      const block = await call("eth_getBlockByNumber", ["latest", false]);
      assertRecord(block, "Latest block");
      const baseFeePerGas = parseHexQuantity(block.baseFeePerGas, "base fee");
      const maxPriorityFeePerGas = parseHexQuantity(
        await call("eth_maxPriorityFeePerGas", []),
        "priority fee"
      );
      return {
        maxPriorityFeePerGas,
        maxFeePerGas: baseFeePerGas * 2n + maxPriorityFeePerGas
      };
    },
    async estimateGas(transaction) {
      return parseHexQuantity(await call("eth_estimateGas", [{
        from: transaction.from,
        to: transaction.to,
        ...(transaction.data ? { data: transaction.data } : {}),
        ...(transaction.value === undefined ? {} : { value: toHexQuantity(transaction.value) })
      }]), "gas estimate");
    },
    async estimateAdditionalFeeReserve(transaction) {
      // Ethereum has no separate L1 posting fee. Arbitrum includes its data
      // component in eth_estimateGas, including for native funding transfers.
      if (transaction.chainId === 1 || transaction.chainId === 42161) return 0n;
      if (transaction.chainId !== 8453 && transaction.chainId !== 84532) {
        throw new Error("Unsupported network for fee reserve estimation.");
      }
      const unsigned = serializeTransaction({ ...transaction, type: "eip1559" });
      const oracle = "0x420000000000000000000000000000000000000F";
      async function oracleFee(name: "getL1FeeUpperBound" | "getOperatorFee", argument: bigint) {
        const data = encodeFunctionData({ abi: [{type: "function", name,
          inputs: [{name: "value", type: "uint256"}],
          outputs: [{type: "uint256"}], stateMutability: "view"}],
          functionName: name, args: [argument] });
        return parseHexDataInteger(await call("eth_call", [{to: oracle, data}, "latest"]), name);
      }
      // The oracle accounts for the absent signature. Add a 100% reserve for
      // changing L1/operator fees; this is a budget, not a protocol fee cap.
      const l1 = await oracleFee("getL1FeeUpperBound", BigInt((unsigned.length - 2) / 2));
      const operator = await oracleFee("getOperatorFee", transaction.gas);
      return 2n * (l1 + operator);
    },
    async sendRawTransaction(rawTransaction, expectedHash) {
      const result = await call("eth_sendRawTransaction", [rawTransaction]);
      if (typeof result !== "string" || !TRANSACTION_HASH.test(result)) {
        throw new Error("Operator wallet RPC returned an invalid transaction hash.");
      }
      if (result.toLowerCase() !== expectedHash.toLowerCase()) {
        throw new Error("Operator wallet RPC returned a different transaction hash.");
      }
      return result.toLowerCase() as Hex;
    },
    async hasSuccessfulReceipt(transactionHash) {
      const result = await call("eth_getTransactionReceipt", [transactionHash]);
      if (result === null) return false;
      assertRecord(result, "Transaction receipt");
      if (
        typeof result.transactionHash !== "string"
        || result.transactionHash.toLowerCase() !== transactionHash.toLowerCase()
      ) {
        throw new Error("Operator wallet RPC returned a receipt for another transaction.");
      }
      const status = parseHexQuantity(result.status, "receipt status");
      if (status !== 1n) throw new Error("Operator wallet transaction reverted.");
      return true;
    },
    async waitForSuccessfulReceipt(transactionHash) {
      const deadline = Date.now() + (input.receiptTimeoutMs ?? 300_000);
      const pollMs = input.receiptPollMs ?? 3_000;
      while (Date.now() <= deadline) {
        if (await rpc.hasSuccessfulReceipt(transactionHash)) return;
        await new Promise<void>((resolve) => setTimeout(resolve, pollMs));
      }
      throw new Error("Timed out waiting for the operator wallet transaction receipt.");
    }
  };
  return rpc;
}

export async function prepareWalletSweepPlanBundle(input: {
  descriptor: WalletPublicDescriptor;
  ellipal?: boolean;
  rail: OperatorWalletRailId;
  derivationIndex: number;
  rpc: Pick<OperatorWalletRpc,
    "getChainId" | "getTransactionCount" | "getNativeBalance" |
    "getTokenBalance" | "getFeeQuote" | "estimateGas" | "estimateAdditionalFeeReserve">;
}): Promise<WalletSweepPlanBundle> {
  const rail = getOperatorWalletRail(input.rail);
  const network = getOperatorWalletNetwork(rail.network);
  const derivationIndex = assertWalletDerivationIndex(input.derivationIndex);
  if (derivationIndex === TREASURY_DERIVATION_INDEX && !input.ellipal) {
    throw new Error("Treasury index 0 is not a payment address.");
  }
  if (await input.rpc.getChainId() !== rail.chainId) {
    throw new Error("Operator wallet RPC is connected to the wrong network.");
  }

  const paymentAddress = getAddress(deriveAddressFromReceiveChainXpub(
    input.descriptor.receiveChainXpub,
    derivationIndex
  ));
  const treasuryAddress = getAddress(input.descriptor.treasuryAddress);
  const tokenBalance = await input.rpc.getTokenBalance(rail.tokenAddress, paymentAddress);
  if (tokenBalance <= 0n) {
    throw new Error(`Payment address has no ${rail.asset} balance on ${network.label}.`);
  }
  const fees = await input.rpc.getFeeQuote();
  const tokenData = encodeFunctionData({
    abi: ERC20_TRANSFER_ABI,
    functionName: "transfer",
    args: [input.ellipal ? ELLIPAL_DESTINATION : treasuryAddress, tokenBalance]
  });
  const estimatedGas = await input.rpc.estimateGas({
    from: paymentAddress,
    to: rail.tokenAddress,
    data: tokenData,
    value: 0n
  });
  const gasLimit = (estimatedGas * 120n + 99n) / 100n;
  if (gasLimit <= 0n || gasLimit > MAX_GAS_LIMIT) {
    throw new Error("Token sweep gas estimate exceeds the wallet safety limit.");
  }
  const sourceNonce = await input.rpc.getTransactionCount(paymentAddress);
  const treasuryNonce = await input.rpc.getTransactionCount(treasuryAddress);
  if (sourceNonce > BigInt(Number.MAX_SAFE_INTEGER) || treasuryNonce > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Operator wallet nonce exceeds the supported range.");
  }

  const tokenSweepPlan = parseWalletTokenSweepPlan({
    version: 1,
    kind: "wallet-token-sweep",
    rail: rail.id,
    chainId: rail.chainId,
    walletXpubFingerprint: input.descriptor.xpubFingerprint,
    fromDerivationIndex: derivationIndex,
    treasuryDerivationIndex: TREASURY_DERIVATION_INDEX,
    fromAddress: paymentAddress,
    treasuryAddress,
    tokenContract: rail.tokenAddress,
    ...(input.ellipal ? { destinationAddress: ELLIPAL_DESTINATION } : {}),
    amountAtomic: tokenBalance.toString(),
    nonce: sourceNonce.toString(),
    gasLimit: gasLimit.toString(),
    maxFeePerGas: fees.maxFeePerGas.toString(),
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas.toString()
  });

  const sourceNativeBalance = await input.rpc.getNativeBalance(paymentAddress);
  const extraSweepReserve = await input.rpc.estimateAdditionalFeeReserve({
    chainId: rail.chainId, nonce: tokenSweepPlan.nonce, gas: gasLimit,
    ...fees, to: rail.tokenAddress, value: 0n, data: tokenData
  });
  const maximumSweepFee = tokenSweepPlan.gasLimit * tokenSweepPlan.maxFeePerGas + extraSweepReserve;
  if (maximumSweepFee > network.maxSignedTransactionFeeWei) {
    throw new Error("Sweep fee budget including network reserve exceeds the wallet safety limit.");
  }
  const requiredFunding = maximumSweepFee > sourceNativeBalance
    ? maximumSweepFee - sourceNativeBalance
    : 0n;
  let gasFundingPlan: WalletGasFundingPlan | null = null;
  if (requiredFunding > 0n) {
    if (derivationIndex === TREASURY_DERIVATION_INDEX) {
      throw new Error("Treasury needs more native gas before its ELLIPAL transfer.");
    }
    const treasuryNativeBalance = await input.rpc.getNativeBalance(treasuryAddress);
    const gasFundingEstimate = await input.rpc.estimateGas({
      from: treasuryAddress, to: paymentAddress, value: requiredFunding
    });
    const fundingGasLimit = (gasFundingEstimate * 120n + 99n) / 100n;
    if (fundingGasLimit <= 0n || fundingGasLimit > MAX_GAS_LIMIT) {
      throw new Error("Gas funding estimate exceeds the wallet safety limit.");
    }
    const fundingReserve = await input.rpc.estimateAdditionalFeeReserve({
      chainId: network.chainId, nonce: Number(treasuryNonce), gas: fundingGasLimit,
      ...fees, to: paymentAddress, value: requiredFunding
    });
    const gasFundingMaximumFee = fundingGasLimit * fees.maxFeePerGas + fundingReserve;
    if (gasFundingMaximumFee > network.maxSignedTransactionFeeWei) {
      throw new Error("Gas funding fee budget exceeds the wallet safety limit.");
    }
    if (treasuryNativeBalance < requiredFunding + gasFundingMaximumFee) {
      throw new Error(`Treasury needs more native gas on ${network.label} before this sweep.`);
    }
    gasFundingPlan = parseWalletGasFundingPlan({
      version: 1,
      kind: "wallet-gas-funding",
      network: network.id,
      chainId: network.chainId,
      walletXpubFingerprint: input.descriptor.xpubFingerprint,
      fromDerivationIndex: TREASURY_DERIVATION_INDEX,
      toDerivationIndex: derivationIndex,
      fromAddress: treasuryAddress,
      toAddress: paymentAddress,
      valueWei: requiredFunding.toString(),
      nonce: treasuryNonce.toString(),
      gasLimit: fundingGasLimit.toString(),
      maxFeePerGas: fees.maxFeePerGas.toString(),
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas.toString()
    });
  }

  return {
    version: 1,
    kind: "wallet-sweep-plan-bundle",
    network: network.id,
    rail: rail.id,
    walletXpubFingerprint: input.descriptor.xpubFingerprint,
    derivationIndex,
    gasFundingPlan,
    tokenSweepPlan
  };
}

export function parseWalletSweepPlanBundle(value: unknown): WalletSweepPlanBundle {
  assertRecord(value, "Wallet sweep plan bundle");
  assertExactKeys(value, [
    "version", "kind", "network", "rail", "walletXpubFingerprint",
    "derivationIndex", "gasFundingPlan", "tokenSweepPlan"
  ], "Wallet sweep plan bundle");
  if (value.version !== 1 || value.kind !== "wallet-sweep-plan-bundle") {
    throw new Error("Wallet sweep plan bundle header is invalid.");
  }
  if (typeof value.rail !== "string" || typeof value.network !== "string") {
    throw new Error("Wallet sweep plan bundle rail or network is invalid.");
  }
  const rail = getOperatorWalletRail(value.rail);
  const network = getOperatorWalletNetwork(value.network);
  if (rail.network !== network.id) {
    throw new Error("Wallet sweep plan bundle rail does not match its network.");
  }
  const tokenSweepPlan = parseWalletTokenSweepPlan(value.tokenSweepPlan);
  const gasFundingPlan = value.gasFundingPlan === null
    ? null
    : parseWalletGasFundingPlan(value.gasFundingPlan);
  if (
    typeof value.walletXpubFingerprint !== "string"
    || !Number.isSafeInteger(value.derivationIndex)
    || tokenSweepPlan.rail !== rail.id
    || tokenSweepPlan.walletXpubFingerprint !== value.walletXpubFingerprint
    || tokenSweepPlan.fromDerivationIndex !== value.derivationIndex
    || (gasFundingPlan && (
      gasFundingPlan.network !== network.id
      || gasFundingPlan.walletXpubFingerprint !== value.walletXpubFingerprint
      || gasFundingPlan.toDerivationIndex !== value.derivationIndex
    ))
  ) {
    throw new Error("Wallet sweep plan bundle contents do not match its header.");
  }
  return {
    version: 1,
    kind: "wallet-sweep-plan-bundle",
    network: network.id,
    rail: rail.id,
    walletXpubFingerprint: value.walletXpubFingerprint,
    derivationIndex: value.derivationIndex as number,
    gasFundingPlan,
    tokenSweepPlan
  };
}

export async function parseSignedWalletSweepBundle(
  value: unknown,
  descriptor: WalletPublicDescriptor
): Promise<SignedWalletSweepBundle> {
  assertRecord(value, "Signed wallet sweep bundle");
  assertExactKeys(value, [
    "version", "kind", "network", "rail", "walletXpubFingerprint",
    "derivationIndex", "gasFundingTransaction", "tokenSweepTransaction"
  ], "Signed wallet sweep bundle");
  if (value.version !== 1 || value.kind !== "wallet-sweep-signed-bundle") {
    throw new Error("Signed wallet sweep bundle header is invalid.");
  }
  if (typeof value.rail !== "string" || typeof value.network !== "string") {
    throw new Error("Signed wallet sweep bundle rail or network is invalid.");
  }
  const rail = getOperatorWalletRail(value.rail);
  const network = getOperatorWalletNetwork(value.network);
  const tokenSweepTransaction = await parseSignedOperatorWalletTransaction(
    value.tokenSweepTransaction,
    descriptor
  );
  const gasFundingTransaction = value.gasFundingTransaction === null
    ? null
    : await parseSignedOperatorWalletTransaction(value.gasFundingTransaction, descriptor);
  if (
    rail.network !== network.id
    || value.walletXpubFingerprint !== descriptor.xpubFingerprint
    || !Number.isSafeInteger(value.derivationIndex)
    || tokenSweepTransaction.kind !== "wallet-token-sweep"
    || tokenSweepTransaction.rail !== rail.id
    || tokenSweepTransaction.sourceDerivationIndex !== value.derivationIndex
    || (gasFundingTransaction && (
      gasFundingTransaction.kind !== "wallet-gas-funding"
      || gasFundingTransaction.network !== network.id
      || gasFundingTransaction.recipientDerivationIndex !== value.derivationIndex
    ))
  ) {
    throw new Error("Signed wallet sweep bundle contents do not match its header.");
  }
  return {
    version: 1,
    kind: "wallet-sweep-signed-bundle",
    network: network.id,
    rail: rail.id,
    walletXpubFingerprint: descriptor.xpubFingerprint,
    derivationIndex: value.derivationIndex as number,
    gasFundingTransaction,
    tokenSweepTransaction
  };
}

export async function broadcastSignedWalletSweepBundle(
  rpc: Pick<OperatorWalletRpc, "getChainId" | "sendRawTransaction" | "hasSuccessfulReceipt" | "waitForSuccessfulReceipt">,
  bundle: SignedWalletSweepBundle
) {
  const network = getOperatorWalletNetwork(bundle.network);
  if (await rpc.getChainId() !== network.chainId) {
    throw new Error("Operator wallet RPC is connected to the wrong network.");
  }
  const transactionHashes: Hex[] = [];
  const sweep = bundle.tokenSweepTransaction;
  // A completed sweep needs no further funding, even if an older funding
  // transaction is absent from the node or was superseded.
  if (await rpc.hasSuccessfulReceipt(sweep.transactionHash)) {
    return [sweep.transactionHash];
  }
  if (bundle.gasFundingTransaction) {
    const gas = bundle.gasFundingTransaction;
    if (!(await rpc.hasSuccessfulReceipt(gas.transactionHash))) {
      await rpc.sendRawTransaction(gas.rawTransaction, gas.transactionHash);
      await rpc.waitForSuccessfulReceipt(gas.transactionHash);
    }
    transactionHashes.push(gas.transactionHash);
  }
  await rpc.sendRawTransaction(sweep.rawTransaction, sweep.transactionHash);
  await rpc.waitForSuccessfulReceipt(sweep.transactionHash);
  transactionHashes.push(sweep.transactionHash);
  return transactionHashes;
}

export function signedTransactionHash(rawTransaction: Hex) {
  return keccak256(rawTransaction);
}
