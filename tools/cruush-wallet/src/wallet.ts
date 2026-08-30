import { ECDH, createHash, randomBytes } from "node:crypto";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { HDKey } from "@scure/bip32";
import {
  entropyToMnemonic,
  mnemonicToSeedSync,
  validateMnemonic
} from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import {
  MAX_NON_HARDENED_CHILD_INDEX,
  PUBLIC_DESCRIPTOR_SAMPLE_INDICES,
  RECEIVE_CHAIN_PATH,
  TREASURY_DERIVATION_INDEX
} from "./constants.js";

export type WalletPublicDescriptor = {
  version: 1;
  receiveChainPath: typeof RECEIVE_CHAIN_PATH;
  receiveChainXpub: string;
  xpubFingerprint: string;
  treasuryDerivationIndex: typeof TREASURY_DERIVATION_INDEX;
  treasuryAddress: string;
  sampleAddresses: Array<{
    derivationIndex: number;
    address: string;
  }>;
};

export function normalizeWalletMnemonic(value: string) {
  return value.trim().split(/\s+/u).join(" ");
}

export function assertValidWalletMnemonic(value: string) {
  const normalized = normalizeWalletMnemonic(value);
  if (!validateMnemonic(normalized, wordlist)) {
    throw new Error("Recovery words are not a valid English BIP-39 wallet backup.");
  }
  return normalized;
}

export function generateWalletMnemonic(
  entropySource: (size: number) => Uint8Array = (size) => randomBytes(size)
) {
  const entropy = Uint8Array.from(entropySource(32));
  if (entropy.length !== 32) {
    entropy.fill(0);
    throw new Error("Wallet entropy source must return exactly 32 bytes.");
  }

  try {
    return entropyToMnemonic(entropy, wordlist);
  } finally {
    entropy.fill(0);
  }
}

export function fingerprintReceiveChainXpub(receiveChainXpub: string) {
  return createHash("sha256").update(receiveChainXpub.trim(), "utf8").digest("hex");
}

export function toChecksumEthereumAddress(address: string) {
  const normalized = address.toLowerCase().replace(/^0x/, "");
  if (!/^[a-f0-9]{40}$/.test(normalized)) {
    throw new Error("Ethereum address must contain exactly 20 bytes.");
  }

  const hash = Buffer.from(keccak_256(Buffer.from(normalized, "ascii"))).toString("hex");
  const checksummed = Array.from(normalized, (character, index) => {
    if (!/[a-f]/.test(character)) {
      return character;
    }

    return Number.parseInt(hash[index] ?? "0", 16) >= 8
      ? character.toUpperCase()
      : character;
  }).join("");

  return `0x${checksummed}`;
}

export function ethereumAddressFromPublicKey(publicKey: Uint8Array) {
  const converted = ECDH.convertKey(
    Buffer.from(publicKey),
    "secp256k1",
    undefined,
    undefined,
    "uncompressed"
  );
  const uncompressed = typeof converted === "string"
    ? Buffer.from(converted, "hex")
    : converted;
  const digest = Buffer.from(keccak_256(uncompressed.subarray(1)));
  return toChecksumEthereumAddress(digest.subarray(-20).toString("hex"));
}

export function assertWalletDerivationIndex(derivationIndex: number) {
  if (
    !Number.isSafeInteger(derivationIndex) ||
    derivationIndex < 0 ||
    derivationIndex > MAX_NON_HARDENED_CHILD_INDEX
  ) {
    throw new Error("Wallet derivation index must be a non-hardened 31-bit integer.");
  }
  return derivationIndex;
}

export function deriveAddressFromReceiveChainXpub(
  receiveChainXpub: string,
  derivationIndex: number
) {
  assertWalletDerivationIndex(derivationIndex);
  const receiveChain = HDKey.fromExtendedKey(receiveChainXpub.trim());
  if (receiveChain.privateKey || !receiveChain.publicKey || receiveChain.depth !== 4) {
    throw new Error("Receive-chain xpub must be a depth-4 public node.");
  }

  const child = receiveChain.deriveChild(derivationIndex);
  if (child.privateKey || !child.publicKey) {
    throw new Error("Wallet derivation did not produce a public child.");
  }

  return ethereumAddressFromPublicKey(child.publicKey);
}

export function deriveWalletPublicDescriptor(mnemonicValue: string): WalletPublicDescriptor {
  const mnemonic = assertValidWalletMnemonic(mnemonicValue);
  const seed = mnemonicToSeedSync(mnemonic);
  const root = HDKey.fromMasterSeed(seed);
  const receiveChain = root.derive(RECEIVE_CHAIN_PATH);

  try {
    const receiveChainXpub = receiveChain.publicExtendedKey;
    const sampleAddresses = PUBLIC_DESCRIPTOR_SAMPLE_INDICES.map((derivationIndex) => ({
      derivationIndex,
      address: deriveAddressFromReceiveChainXpub(receiveChainXpub, derivationIndex)
    }));
    const treasuryAddress = sampleAddresses.find(
      ({ derivationIndex }) => derivationIndex === TREASURY_DERIVATION_INDEX
    )?.address;
    if (!treasuryAddress) {
      throw new Error("Wallet descriptor did not derive the treasury address.");
    }

    return {
      version: 1,
      receiveChainPath: RECEIVE_CHAIN_PATH,
      receiveChainXpub,
      xpubFingerprint: fingerprintReceiveChainXpub(receiveChainXpub),
      treasuryDerivationIndex: TREASURY_DERIVATION_INDEX,
      treasuryAddress,
      sampleAddresses
    };
  } finally {
    receiveChain.wipePrivateData();
    root.wipePrivateData();
    seed.fill(0);
  }
}
