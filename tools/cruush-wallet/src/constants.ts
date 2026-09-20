import { getAddress, type Address } from "viem";

export const RECEIVE_CHAIN_PATH = "m/44'/60'/0'/0";
export const TREASURY_DERIVATION_INDEX = 0;
export const FIRST_PAYMENT_DERIVATION_INDEX = 1;
export const MAX_NON_HARDENED_CHILD_INDEX = 0x7fffffff;

export const BASE_SEPOLIA_CHAIN_ID = 84_532;
export const BASE_SEPOLIA_USDC_ADDRESS: Address = getAddress(
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
);

export const MAX_SIGNED_TRANSACTION_FEE_WEI = 1_000_000_000_000_000n;
export const MAX_GAS_FUNDING_VALUE_WEI = 10_000_000_000_000_000n;
export const MAX_GAS_LIMIT = 250_000n;
export const MAX_UINT256 = (1n << 256n) - 1n;

export const PUBLIC_DESCRIPTOR_SAMPLE_INDICES = [
  TREASURY_DERIVATION_INDEX,
  FIRST_PAYMENT_DERIVATION_INDEX,
  FIRST_PAYMENT_DERIVATION_INDEX + 1
] as const;

// Bitcoin Core's default -minrelaytxfee. A node drops anything cheaper, so a
// collection is never built below this rate whatever a fee estimator returns.
export const BITCOIN_MIN_RELAY_FEE_RATE = 1;
export const BITCOIN_DUST_LIMIT = 546n;

// Explicitly approved cold destination. Never selected by default.
export const ELLIPAL_DESTINATION: Address = getAddress("0x929dbb0E43D1CfD62632c21387f1a248c4c85501");
