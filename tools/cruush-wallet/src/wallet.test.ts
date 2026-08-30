import { describe, expect, it } from "vitest";
import { getSecretSessionSafetyError } from "./interactive.js";
import {
  deriveAddressFromReceiveChainXpub,
  deriveWalletPublicDescriptor,
  generateWalletMnemonic
} from "./wallet.js";

// Public development mnemonic used by local Ethereum test tools. Never use it for funds.
const PUBLIC_TEST_MNEMONIC =
  "test test test test test test test test test test test junk";

const PUBLIC_BIP32_RECEIVE_CHAIN_XPUB =
  "xpub6FHa3pjLCk84BayeJxFW2SP4XRrFd1JYnxeLeU8EqN3vDfZmbqBqaGJAyiLjTAwm6ZLRQUMv1ZACTj37sR62cfN7fe5JnJ7dh8zL4fiyLHV";

describe("local software wallet public derivation", () => {
  it("derives the standard Ethereum addresses and a depth-4 public descriptor", () => {
    const descriptor = deriveWalletPublicDescriptor(PUBLIC_TEST_MNEMONIC);

    expect(descriptor).toMatchObject({
      version: 1,
      receiveChainPath: "m/44'/60'/0'/0",
      treasuryDerivationIndex: 0,
      treasuryAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      sampleAddresses: [
        {
          derivationIndex: 0,
          address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
        },
        {
          derivationIndex: 1,
          address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
        },
        {
          derivationIndex: 2,
          address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
        }
      ]
    });
    expect(descriptor.receiveChainXpub).toMatch(/^xpub/);
    expect(descriptor.xpubFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(descriptor).not.toHaveProperty("mnemonic");
    expect(descriptor).not.toHaveProperty("privateKey");
    expect(descriptor).not.toHaveProperty("xprv");
  });

  it("matches the public-only BIP-0032 vector used by the cruush server", () => {
    expect(
      deriveAddressFromReceiveChainXpub(PUBLIC_BIP32_RECEIVE_CHAIN_XPUB, 1_000_000_000)
    ).toBe("0x73659c60270d326c06Ac204F1A9C63f889a3D14B");
  });

  it("generates the published 256-bit zero-entropy BIP-39 vector without random output", () => {
    expect(generateWalletMnemonic(() => new Uint8Array(32))).toBe(
      `${"abandon ".repeat(23)}art`
    );
    expect(() => generateWalletMnemonic(() => new Uint8Array(31))).toThrow(/32 bytes/);
  });

  it("rejects invalid recovery words and invalid public derivation input", () => {
    expect(() => deriveWalletPublicDescriptor("not a wallet backup")).toThrow(/not a valid/);
    expect(() => deriveAddressFromReceiveChainXpub("not-an-xpub", 1)).toThrow();
    expect(() => deriveAddressFromReceiveChainXpub(PUBLIC_BIP32_RECEIVE_CHAIN_XPUB, -1)).toThrow(
      /31-bit integer/
    );
  });
});

describe("secret-bearing command boundary", () => {
  it("requires an interactive terminal", () => {
    expect(getSecretSessionSafetyError({
      stdinIsTty: false,
      stdoutIsTty: true,
      environment: {}
    })).toMatch(/interactive terminal/);
  });

  it("refuses Codex, Claude, and CI environments", () => {
    expect(getSecretSessionSafetyError({
      stdinIsTty: true,
      stdoutIsTty: true,
      environment: { CODEX_SESSION_ID: "public-test-session" }
    })).toMatch(/CODEX_SESSION_ID/);
    expect(getSecretSessionSafetyError({
      stdinIsTty: true,
      stdoutIsTty: true,
      environment: { CLAUDECODE: "1" }
    })).toMatch(/CLAUDECODE/);
    expect(getSecretSessionSafetyError({
      stdinIsTty: true,
      stdoutIsTty: true,
      environment: { CI: "true" }
    })).toMatch(/CI/);
  });

  it("allows a normal direct terminal", () => {
    expect(getSecretSessionSafetyError({
      stdinIsTty: true,
      stdoutIsTty: true,
      environment: {}
    })).toBeNull();
  });
});
