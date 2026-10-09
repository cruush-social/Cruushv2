import { describe, expect, it } from "vitest";
import { decryptMediaBytes, encryptMediaBytes } from "./media-encryption.js";
import type { AppConfig } from "./config.js";

const config = {
  SESSION_SECRET: "test-secret-for-media-encryption",
  MEDIA_ENCRYPTION_KEY: "media-encryption-secret-for-tests",
  MEDIA_ENCRYPTION_KEY_VERSION: "v1"
} as AppConfig;

describe("media encryption", () => {
  it("encrypts media bytes with envelope metadata and decrypts them", () => {
    const plaintext = Buffer.from("fake image bytes");
    const encrypted = encryptMediaBytes(config, plaintext);

    expect(encrypted.ciphertext.equals(plaintext)).toBe(false);
    expect(encrypted.encryptedDataKey).toEqual(expect.any(String));
    expect(encrypted.keyVersion).toBe("v1");
    expect(decryptMediaBytes(config, encrypted).equals(plaintext)).toBe(true);
  });
});
