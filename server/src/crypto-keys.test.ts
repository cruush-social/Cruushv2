import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { deriveKey } from "./crypto-keys.js";

describe("deriveKey", () => {
  it("keeps v1 compatible with the legacy SHA-256 derivation", () => {
    const secret = "encryption-secret-32-byte-value";
    const purpose = "profile-sensitive";
    const legacyKey = createHash("sha256")
      .update(`${purpose}:v1:${secret}`)
      .digest();

    expect(deriveKey(secret, purpose, "v1")).toEqual(legacyKey);
  });

  it("uses version-separated HKDF keys for newer key versions", () => {
    const secret = "encryption-secret-32-byte-value";
    const purpose = "profile-sensitive";
    const v2Key = deriveKey(secret, purpose, "v2");
    const v3Key = deriveKey(secret, purpose, "v3");

    expect(v2Key).toHaveLength(32);
    expect(v3Key).toHaveLength(32);
    expect(v2Key).not.toEqual(deriveKey(secret, purpose, "v1"));
    expect(v2Key).not.toEqual(v3Key);
    expect(v2Key).not.toEqual(deriveKey(secret, "profile-visibility", "v2"));
  });
});
