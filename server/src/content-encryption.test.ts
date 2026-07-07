import { describe, expect, it } from "vitest";
import { decryptTextContent, encryptTextContent } from "./content-encryption.js";
import type { AppConfig } from "./config.js";

const config = {
  SESSION_SECRET: "test-secret-for-content-encryption",
  MESSAGE_ENCRYPTION_KEY: "message-encryption-secret-for-tests",
  MESSAGE_ENCRYPTION_KEY_VERSION: "v1",
  FEED_ENCRYPTION_KEY: "feed-encryption-secret-for-tests",
  FEED_ENCRYPTION_KEY_VERSION: "v1"
} as AppConfig;

describe("content encryption", () => {
  it("encrypts and decrypts message text without storing plaintext", () => {
    const encrypted = encryptTextContent(config, "message", "private message about boundaries");

    expect(encrypted.ciphertext).not.toContain("private");
    expect(encrypted.ciphertext).not.toContain("boundaries");
    expect(decryptTextContent(config, "message", encrypted)).toBe("private message about boundaries");
  });

  it("uses a fresh nonce for each encrypted feed post", () => {
    const first = encryptTextContent(config, "feed", "same public post");
    const second = encryptTextContent(config, "feed", "same public post");

    expect(first.nonce).not.toBe(second.nonce);
    expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(decryptTextContent(config, "feed", first)).toBe("same public post");
    expect(decryptTextContent(config, "feed", second)).toBe("same public post");
  });
});
