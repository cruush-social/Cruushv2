import {
  encodeFunctionData,
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

export type OperatorWalletRpc = {
  getChainId(): Promise<number>;
  getTransactionCount(address: Address): Promise<bigint>;
  getNativeBalance(address: Address): Promise<bigint>;
  getTokenBalance(tokenAddress: Address, address: Address): Promise<bigint>;
  getFeeQuote(): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }>;
  estimateGas(input: { from: Address; to: Address; data?: Hex; value?: bigint }): Promise<bigint>;
  sendRawTransaction(rawTransaction: Hex, expectedHash: Hex): Promise<Hex>;
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
      throw new Error(`Operator wallet RPC rejected ${method}.`);
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
    async waitForSuccessfulReceipt(transactionHash) {
      const deadline = Date.now() + (input.receiptTimeoutMs ?? 300_000);
      const pollMs = input.receiptPollMs ?? 3_000;
      while (Date.now() <= deadline) {
        const result = await call("eth_getTransactionReceipt", [transactionHash]);
        if (result !== null) {
          assertRecord(result, "Transaction receipt");
          if (
            typeof result.transactionHash !== "string"
            || result.transactionHash.toLowerCase() !== transactionHash.toLowerCase()
          ) {
            throw new Error("Operator wallet RPC returned a receipt for another transaction.");
          }
          const status = parseHexQuantity(result.status, "receipt status");
          if (status !== 1n) {
            throw new Error("Operator wallet transaction reverted.");
          }
          return;
        }
        await new Promise<void>((resolve) => setTimeout(resolve, pollMs));
      }
      throw new Error("Timed out waiting for the operator wallet transaction receipt.");
    }
  };
  return rpc;
}

export async function prepareWalletSweepPlanBundle(input: {
  descriptor: WalletPublicDescriptor;
  rail: OperatorWalletRailId;
  derivationIndex: number;
  rpc: Pick<OperatorWalletRpc,
    "getChainId" | "getTransactionCount" | "getNativeBalance" |
    "getTokenBalance" | "getFeeQuote" | "estimateGas">;
}): Promise<WalletSweepPlanBundle> {
  const rail = getOperatorWalletRail(input.rail);
  const network = getOperatorWalletNetwork(rail.network);
  const derivationIndex = assertWalletDerivationIndex(input.derivationIndex);
  if (derivationIndex === TREASURY_DERIVATION_INDEX) {
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
    args: [treasuryAddress, tokenBalance]
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
    amountAtomic: tokenBalance.toString(),
    nonce: sourceNonce.toString(),
    gasLimit: gasLimit.toString(),
    maxFeePerGas: fees.maxFeePerGas.toString(),
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas.toString()
  });

  const sourceNativeBalance = await input.rpc.getNativeBalance(paymentAddress);
  const maximumSweepFee = tokenSweepPlan.gasLimit * tokenSweepPlan.maxFeePerGas;
  const requiredFunding = maximumSweepFee > sourceNativeBalance
    ? maximumSweepFee - sourceNativeBalance
    : 0n;
  let gasFundingPlan: WalletGasFundingPlan | null = null;
  if (requiredFunding > 0n) {
    const treasuryNativeBalance = await input.rpc.getNativeBalance(treasuryAddress);
    const gasFundingMaximumFee = 21_000n * fees.maxFeePerGas;
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
      gasLimit: "21000",
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
  rpc: Pick<OperatorWalletRpc, "getChainId" | "sendRawTransaction" | "waitForSuccessfulReceipt">,
  bundle: SignedWalletSweepBundle
) {
  const network = getOperatorWalletNetwork(bundle.network);
  if (await rpc.getChainId() !== network.chainId) {
    throw new Error("Operator wallet RPC is connected to the wrong network.");
  }
  const transactionHashes: Hex[] = [];
  if (bundle.gasFundingTransaction) {
    const gasHash = await rpc.sendRawTransaction(
      bundle.gasFundingTransaction.rawTransaction,
      bundle.gasFundingTransaction.transactionHash
    );
    transactionHashes.push(gasHash);
    await rpc.waitForSuccessfulReceipt(gasHash);
  }
  const sweepHash = await rpc.sendRawTransaction(
    bundle.tokenSweepTransaction.rawTransaction,
    bundle.tokenSweepTransaction.transactionHash
  );
  transactionHashes.push(sweepHash);
  await rpc.waitForSuccessfulReceipt(sweepHash);
  return transactionHashes;
}

export function signedTransactionHash(rawTransaction: Hex) {
  return keccak256(rawTransaction);
}
