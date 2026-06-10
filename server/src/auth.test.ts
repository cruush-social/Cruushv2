import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { hashSessionToken, SESSION_TOKEN_BYTES, SESSION_TOKEN_HASH_BYTES, generateSessionToken } from "./auth.js";

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url");
}

describe("auth tokens", () => {
  it("generates 256-bit session tokens and 256-bit stored token hashes", () => {
    const token = generateSessionToken();
    const hash = hashSessionToken(token);

    expect(decodeBase64Url(token)).toHaveLength(SESSION_TOKEN_BYTES);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(Buffer.from(hash, "hex")).toHaveLength(SESSION_TOKEN_HASH_BYTES);
  });
});
