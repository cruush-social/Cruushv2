import { ECDH, createHash } from "node:crypto";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { HDKey } from "@scure/bip32";

const RECEIVE_CHAIN_DEPTH = 4;
const MAX_NON_HARDENED_CHILD_INDEX = 0x7fffffff;
const USDC_ATOMIC_UNITS_PER_USD_CENT = 10_000n;

function parseReceiveChainXpub(value: string) {
  const normalized = value.trim();
  const validationError = getCryptoWalletXpubValidationError(normalized);
  if (validationError) {
    throw new Error(validationError);
  }

  return HDKey.fromExtendedKey(normalized);
}

export function getCryptoWalletXpubValidationError(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return "CRYPTO_PROCESSOR_WALLET_XPUB is required when crypto payments are enabled.";
  }

  if (/^(?:xprv|tprv)/i.test(normalized)) {
    return "CRYPTO_PROCESSOR_WALLET_XPUB must never contain an extended private key.";
  }

  let node: HDKey;
  try {
    node = HDKey.fromExtendedKey(normalized);
  } catch {
    return "CRYPTO_PROCESSOR_WALLET_XPUB must be a valid extended public key.";
  }

  if (node.privateKey) {
    return "CRYPTO_PROCESSOR_WALLET_XPUB must never contain an extended private key.";
  }

  if (!node.publicKey || node.depth !== RECEIVE_CHAIN_DEPTH) {
    return "CRYPTO_PROCESSOR_WALLET_XPUB must be the receive-chain xpub at depth 4.";
  }

  return null;
}

export function isValidCryptoWalletXpub(value: string) {
  return getCryptoWalletXpubValidationError(value) === null;
}

export function fingerprintCryptoWalletXpub(value: string) {
  const normalized = value.trim();
  if (!isValidCryptoWalletXpub(normalized)) {
    throw new Error("Cannot fingerprint an invalid crypto wallet xpub.");
  }

  return createHash("sha256").update(normalized, "utf8").digest("hex");
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

    return Number.parseInt(hash[index] ?? "0", 16) >= 8 ? character.toUpperCase() : character;
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
  const uncompressed = typeof converted === "string" ? Buffer.from(converted, "hex") : converted;
  const digest = Buffer.from(keccak_256(uncompressed.subarray(1)));
  return toChecksumEthereumAddress(digest.subarray(-20).toString("hex"));
}

export function deriveCryptoReceivingAddress(receiveChainXpub: string, derivationIndex: number) {
  if (
    !Number.isSafeInteger(derivationIndex) ||
    derivationIndex < 0 ||
    derivationIndex > MAX_NON_HARDENED_CHILD_INDEX
  ) {
    throw new Error("Crypto wallet derivation index must be a non-hardened 31-bit integer.");
  }

  const child = parseReceiveChainXpub(receiveChainXpub).deriveChild(derivationIndex);
  if (!child.publicKey || child.privateKey) {
    throw new Error("Crypto wallet derivation did not produce a watch-only public child.");
  }

  return ethereumAddressFromPublicKey(child.publicKey);
}

export function quoteUsdCentsAsStablecoinAtomic(amountUsdCents: number) {
  if (!Number.isSafeInteger(amountUsdCents) || amountUsdCents <= 0) {
    throw new Error("Stablecoin quote amount must be a positive integer number of USD cents.");
  }

  return (BigInt(amountUsdCents) * USDC_ATOMIC_UNITS_PER_USD_CENT).toString();
}

export const quoteUsdCentsAsUsdcAtomic = quoteUsdCentsAsStablecoinAtomic;
