import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { AppConfig } from "./config.js";
import {
  createMediaModerationInspectionUrl,
  MEDIA_MODERATION_PURPOSE,
  verifyMediaModerationInspectionSignature
} from "./media-moderation-url.js";

const assetId = "59e01d61-4a76-4359-915a-1f25b7815ff4";
const nowMs = Date.parse("2026-07-14T12:00:00.000Z");
const secret = "0123456789abcdef0123456789abcdef";
const config = {
  MEDIA_PUBLIC_BASE_URL: "https://api.cruush.test",
  MEDIA_MODERATION_URL_SECRET: secret,
  MEDIA_MODERATION_URL_TTL_SECONDS: 900
} as AppConfig;

function claimsFromUrl(value: string) {
  const url = new URL(value);

  return {
    assetId,
    method: "GET",
    variant: "display",
    purpose: url.searchParams.get("purpose") ?? "",
    expires: url.searchParams.get("expires") ?? "",
    signature: url.searchParams.get("signature") ?? ""
  };
}

describe("media moderation inspection URLs", () => {
  it("creates a canonical fifteen-minute signed display URL", () => {
    const value = createMediaModerationInspectionUrl(config, assetId, nowMs);
    const url = new URL(value);
    const expires = String(Math.floor(nowMs / 1000) + 900);
    const canonical = [
      "version=v1",
      "method=GET",
      `assetId=${assetId}`,
      "variant=display",
      `purpose=${MEDIA_MODERATION_PURPOSE}`,
      `expires=${expires}`
    ].join("\n");
    const expectedSignature = createHmac("sha256", secret).update(canonical).digest("base64url");

    expect(url.origin).toBe("https://api.cruush.test");
    expect(url.pathname).toBe(`/api/media/moderation/${assetId}/display`);
    expect(url.searchParams.get("purpose")).toBe(MEDIA_MODERATION_PURPOSE);
    expect(url.searchParams.get("expires")).toBe(expires);
    expect(url.searchParams.get("signature")).toBe(expectedSignature);
    expect(verifyMediaModerationInspectionSignature(config, claimsFromUrl(value), nowMs)).toBe(true);
  });

  it("rejects expired, excessively future-dated, and incorrectly signed URLs", () => {
    const value = createMediaModerationInspectionUrl(config, assetId, nowMs);
    const claims = claimsFromUrl(value);
    const futureValue = createMediaModerationInspectionUrl(config, assetId, nowMs + 4_000_000);

    expect(verifyMediaModerationInspectionSignature(config, claims, nowMs + 900_000)).toBe(false);
    expect(verifyMediaModerationInspectionSignature(config, claimsFromUrl(futureValue), nowMs)).toBe(false);
    expect(verifyMediaModerationInspectionSignature(config, {
      ...claims,
      signature: "A".repeat(43)
    }, nowMs)).toBe(false);
    expect(verifyMediaModerationInspectionSignature(config, {
      ...claims,
      signature: "not-a-valid-signature"
    }, nowMs)).toBe(false);
  });

  it("binds the signature to method, asset, display variant, purpose, and expiration", () => {
    const claims = claimsFromUrl(createMediaModerationInspectionUrl(config, assetId, nowMs));
    const tampered = [
      { ...claims, method: "POST" },
      { ...claims, assetId: "70c66c6f-a476-47a3-af2e-cc47b1d9a39e" },
      { ...claims, variant: "thumbnail" },
      { ...claims, purpose: "profile_display" },
      { ...claims, expires: String(Number(claims.expires) + 1) }
    ];

    for (const candidate of tampered) {
      expect(verifyMediaModerationInspectionSignature(config, candidate, nowMs)).toBe(false);
    }
  });

  it("invalidates URLs after signing-secret rotation", () => {
    const claims = claimsFromUrl(createMediaModerationInspectionUrl(config, assetId, nowMs));

    expect(verifyMediaModerationInspectionSignature({
      ...config,
      MEDIA_MODERATION_URL_SECRET: "abcdef0123456789abcdef0123456789"
    }, claims, nowMs)).toBe(false);
  });
});
