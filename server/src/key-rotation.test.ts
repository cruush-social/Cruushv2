import { describe, expect, it } from "vitest";
import type { AppConfig } from "./config.js";
import { resolveSecretForVersion } from "./crypto-keys.js";
import { decryptMediaBytes, encryptMediaBytes } from "./media-encryption.js";

const oldSecret = "0123456789abcdef0123456789abcdef";
const newSecret = "fedcba9876543210fedcba9876543210";

function mediaConfig(overrides: Partial<AppConfig>) {
  return {
    NODE_ENV: "test",
    SESSION_SECRET: "unused-session-secret",
    MEDIA_ENCRYPTION_KEY: oldSecret,
    MEDIA_ENCRYPTION_KEY_VERSION: "v1",
    MEDIA_ENCRYPTION_KEY_PREVIOUS: "",
    ...overrides
  } as AppConfig;
}

describe("resolveSecretForVersion", () => {
  it("returns the current secret when nothing has been rotated", () => {
    expect(resolveSecretForVersion({
      currentSecret: oldSecret,
      currentVersion: "v1",
      storedVersion: "v1"
    })).toBe(oldSecret);
  });

  it("returns the previous secret for a version written before the rotation", () => {
    expect(resolveSecretForVersion({
      currentSecret: newSecret,
      previousSecret: oldSecret,
      currentVersion: "v2",
      storedVersion: "v1"
    })).toBe(oldSecret);
  });

  it("keeps the pre-rotation behaviour when no previous secret is retained", () => {
    expect(resolveSecretForVersion({
      currentSecret: newSecret,
      currentVersion: "v2",
      storedVersion: "v1"
    })).toBe(newSecret);
  });
});

describe("media key rotation", () => {
  it("still decrypts media sealed before the rotation", () => {
    const before = mediaConfig({});
    const plaintext = Buffer.from("a photo sealed under the old key");
    const sealed = encryptMediaBytes(before, plaintext);

    expect(sealed.keyVersion).toBe("v1");

    const after = mediaConfig({
      MEDIA_ENCRYPTION_KEY: newSecret,
      MEDIA_ENCRYPTION_KEY_VERSION: "v2",
      MEDIA_ENCRYPTION_KEY_PREVIOUS: oldSecret
    });

    expect(decryptMediaBytes(after, sealed).equals(plaintext)).toBe(true);
  });

  it("seals new media under the new version and reads it back", () => {
    const after = mediaConfig({
      MEDIA_ENCRYPTION_KEY: newSecret,
      MEDIA_ENCRYPTION_KEY_VERSION: "v2",
      MEDIA_ENCRYPTION_KEY_PREVIOUS: oldSecret
    });
    const plaintext = Buffer.from("a photo sealed after the rotation");
    const sealed = encryptMediaBytes(after, plaintext);

    expect(sealed.keyVersion).toBe("v2");
    expect(decryptMediaBytes(after, sealed).equals(plaintext)).toBe(true);
  });

  it("fails closed when the outgoing secret was not retained", () => {
    const before = mediaConfig({});
    const sealed = encryptMediaBytes(before, Buffer.from("unrecoverable"));

    const rotatedWithoutRetaining = mediaConfig({
      MEDIA_ENCRYPTION_KEY: newSecret,
      MEDIA_ENCRYPTION_KEY_VERSION: "v2",
      MEDIA_ENCRYPTION_KEY_PREVIOUS: ""
    });

    expect(() => decryptMediaBytes(rotatedWithoutRetaining, sealed)).toThrow();
  });
});
