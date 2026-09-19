import { getAddress, type Address } from "viem";

export const OPERATOR_WALLET_NETWORKS = {
  "base-sepolia": {
    id: "base-sepolia",
    label: "Base Sepolia",
    chainId: 84_532,
    mainnet: false,
    maxSignedTransactionFeeWei: 1_000_000_000_000_000n,
    maxGasFundingValueWei: 10_000_000_000_000_000n
  },
  arbitrum: {
    id: "arbitrum",
    label: "Arbitrum One",
    chainId: 42_161,
    mainnet: true,
    maxSignedTransactionFeeWei: 1_000_000_000_000_000n,
    maxGasFundingValueWei: 1_000_000_000_000_000n
  },
  base: {
    id: "base",
    label: "Base Mainnet",
    chainId: 8_453,
    mainnet: true,
    maxSignedTransactionFeeWei: 1_000_000_000_000_000n,
    maxGasFundingValueWei: 1_000_000_000_000_000n
  },
  ethereum: {
    id: "ethereum",
    label: "Ethereum Mainnet",
    chainId: 1,
    mainnet: true,
    maxSignedTransactionFeeWei: 5_000_000_000_000_000n,
    maxGasFundingValueWei: 5_000_000_000_000_000n
  }
} as const;

export type OperatorWalletNetworkId = keyof typeof OPERATOR_WALLET_NETWORKS;

export const OPERATOR_WALLET_RAILS = {
  usdc_base_sepolia: {
    id: "usdc_base_sepolia",
    asset: "USDC",
    network: "base-sepolia",
    chainId: OPERATOR_WALLET_NETWORKS["base-sepolia"].chainId,
    tokenAddress: getAddress("0x036CbD53842c5426634e7929541eC2318f3dCF7e"),
    decimals: 6
  },
  usdc_arbitrum: {
    id: "usdc_arbitrum",
    asset: "USDC",
    network: "arbitrum",
    chainId: OPERATOR_WALLET_NETWORKS.arbitrum.chainId,
    tokenAddress: getAddress("0xaf88d065e77c8cC2239327C5EDb3A432268e5831"),
    decimals: 6
  },
  pyusd_arbitrum: {
    id: "pyusd_arbitrum",
    asset: "PYUSD",
    network: "arbitrum",
    chainId: OPERATOR_WALLET_NETWORKS.arbitrum.chainId,
    tokenAddress: getAddress("0x46850aD61C2B7d64d08c9C754F45254596696984"),
    decimals: 6
  },
  usdc_base: {
    id: "usdc_base",
    asset: "USDC",
    network: "base",
    chainId: OPERATOR_WALLET_NETWORKS.base.chainId,
    tokenAddress: getAddress("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"),
    decimals: 6
  },
  pyusd_ethereum: {
    id: "pyusd_ethereum",
    asset: "PYUSD",
    network: "ethereum",
    chainId: OPERATOR_WALLET_NETWORKS.ethereum.chainId,
    tokenAddress: getAddress("0x6c3ea9036406852006290770BEdFcAbA0e23A0e8"),
    decimals: 6
  }
} as const satisfies Record<string, {
  id: string;
  asset: "USDC" | "PYUSD";
  network: OperatorWalletNetworkId;
  chainId: number;
  tokenAddress: Address;
  decimals: 6;
}>;

export type OperatorWalletRailId = keyof typeof OPERATOR_WALLET_RAILS;

export function getOperatorWalletNetwork(value: string) {
  if (!(value in OPERATOR_WALLET_NETWORKS)) {
    throw new Error("Unsupported operator-wallet network.");
  }
  return OPERATOR_WALLET_NETWORKS[value as OperatorWalletNetworkId];
}

export function getOperatorWalletRail(value: string) {
  if (!(value in OPERATOR_WALLET_RAILS)) {
    throw new Error("Unsupported operator-wallet rail.");
  }
  return OPERATOR_WALLET_RAILS[value as OperatorWalletRailId];
}

export function getOperatorWalletNetworkByChainId(chainId: number) {
  const network = Object.values(OPERATOR_WALLET_NETWORKS)
    .find((candidate) => candidate.chainId === chainId);
  if (!network) {
    throw new Error("Unsupported operator-wallet chain ID.");
  }
  return network;
}
