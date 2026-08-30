import { describe, expect, it } from "vitest";
import {
  deriveCryptoReceivingAddress,
  ethereumAddressFromPublicKey,
  fingerprintCryptoWalletXpub,
  getCryptoWalletXpubValidationError,
  isValidCryptoWalletXpub,
  quoteUsdCentsAsUsdcAtomic,
  toChecksumEthereumAddress
} from "./crypto-wallet.js";

// Public-only BIP-0032 test vector at depth 4. It contains no signing material.
const RECEIVE_CHAIN_XPUB = "xpub6FHa3pjLCk84BayeJxFW2SP4XRrFd1JYnxeLeU8EqN3vDfZmbqBqaGJAyiLjTAwm6ZLRQUMv1ZACTj37sR62cfN7fe5JnJ7dh8zL4fiyLHV";
const ROOT_XPUB = "xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8";

describe("watch-only crypto wallet", () => {
  it("accepts only a depth-4 public receive-chain key", () => {
    expect(isValidCryptoWalletXpub(RECEIVE_CHAIN_XPUB)).toBe(true);
    expect(getCryptoWalletXpubValidationError(ROOT_XPUB)).toMatch(/depth 4/);
    expect(getCryptoWalletXpubValidationError("xprv-not-accepted")).toMatch(/private key/);
    expect(getCryptoWalletXpubValidationError("not-an-xpub")).toMatch(/valid extended public key/);
  });

  it("derives the expected Ethereum address from the official BIP-0032 public vector", () => {
    expect(deriveCryptoReceivingAddress(RECEIVE_CHAIN_XPUB, 1_000_000_000)).toBe(
      "0x73659c60270d326c06Ac204F1A9C63f889a3D14B"
    );
  });

  it("derives the known Ethereum address for the secp256k1 generator public key", () => {
    const publicKey = Buffer.from(
      "0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798" +
      "483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8",
      "hex"
    );

    expect(ethereumAddressFromPublicKey(publicKey)).toBe(
      "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf"
    );
  });

  it("applies the EIP-55 checksum and rejects malformed addresses", () => {
    expect(toChecksumEthereumAddress("0xfb6916095ca1df60bb79ce92ce3ea74c37c5d359")).toBe(
      "0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359"
    );
    expect(() => toChecksumEthereumAddress("0x1234")).toThrow(/20 bytes/);
  });

  it("quotes USD cents exactly in six-decimal USDC atomic units", () => {
    expect(quoteUsdCentsAsUsdcAtomic(1899)).toBe("18990000");
    expect(() => quoteUsdCentsAsUsdcAtomic(0)).toThrow(/positive integer/);
  });

  it("fingerprints the xpub without returning the key", () => {
    const fingerprint = fingerprintCryptoWalletXpub(RECEIVE_CHAIN_XPUB);
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(fingerprint).not.toContain(RECEIVE_CHAIN_XPUB);
  });
});
