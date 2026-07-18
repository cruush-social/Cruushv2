import { createHmac, timingSafeEqual } from "node:crypto";
import type { AppConfig } from "./config.js";

export const MEDIA_MODERATION_PURPOSE = "moderation_inspection";
export const MEDIA_MODERATION_VARIANT = "display";
export const DEFAULT_MEDIA_MODERATION_URL_TTL_SECONDS = 120;
export const MAX_MEDIA_MODERATION_URL_TTL_SECONDS = 300;
const MIN_MEDIA_MODERATION_URL_TTL_SECONDS = 30;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

type MediaModerationUrlConfig = Pick<
  AppConfig,
  | "MEDIA_PUBLIC_BASE_URL"
  | "MEDIA_MODERATION_URL_SECRET"
  | "MEDIA_MODERATION_URL_TTL_SECONDS"
>;

type ModerationInspectionClaims = {
  assetId: string;
  method: string;
  variant: string;
  purpose: string;
  expires: string;
};

type SignedModerationInspectionClaims = ModerationInspectionClaims & {
  signature: string;
};

function requireSigningConfig(config: MediaModerationUrlConfig) {
  const secret = config.MEDIA_MODERATION_URL_SECRET ?? "";
  const publicBaseUrl = config.MEDIA_PUBLIC_BASE_URL ?? "";
  const ttlSeconds = config.MEDIA_MODERATION_URL_TTL_SECONDS ?? DEFAULT_MEDIA_MODERATION_URL_TTL_SECONDS;

  if (secret.length < 32) {
    throw new Error("MEDIA_MODERATION_URL_SECRET must contain at least 32 characters.");
  }

  if (!Number.isInteger(ttlSeconds) || ttlSeconds < MIN_MEDIA_MODERATION_URL_TTL_SECONDS || ttlSeconds > MAX_MEDIA_MODERATION_URL_TTL_SECONDS) {
    throw new Error(`MEDIA_MODERATION_URL_TTL_SECONDS must be between ${MIN_MEDIA_MODERATION_URL_TTL_SECONDS} and ${MAX_MEDIA_MODERATION_URL_TTL_SECONDS}.`);
  }

  let origin: URL;

  try {
    origin = new URL(publicBaseUrl);
  } catch {
    throw new Error("MEDIA_PUBLIC_BASE_URL must be an absolute API origin.");
  }

  if (origin.origin !== publicBaseUrl) {
    throw new Error("MEDIA_PUBLIC_BASE_URL must contain only the API origin.");
  }

  return { origin, secret, ttlSeconds };
}

function canonicalClaims(claims: ModerationInspectionClaims) {
  return [
    "version=v1",
    `method=${claims.method}`,
    `assetId=${claims.assetId}`,
    `variant=${claims.variant}`,
    `purpose=${claims.purpose}`,
    `expires=${claims.expires}`
  ].join("\n");
}

function signClaims(secret: string, claims: ModerationInspectionClaims) {
  return createHmac("sha256", secret)
    .update(canonicalClaims(claims))
    .digest("base64url");
}

export function createMediaModerationInspectionUrl(
  config: MediaModerationUrlConfig,
  assetId: string,
  nowMs = Date.now()
) {
  const { origin, secret, ttlSeconds } = requireSigningConfig(config);
  const expires = String(Math.floor(nowMs / 1000) + ttlSeconds);
  const claims = {
    assetId,
    method: "GET",
    variant: MEDIA_MODERATION_VARIANT,
    purpose: MEDIA_MODERATION_PURPOSE,
    expires
  };
  const url = new URL(`/api/media/moderation/${encodeURIComponent(assetId)}/display`, origin);

  url.searchParams.set("purpose", claims.purpose);
  url.searchParams.set("expires", expires);
  url.searchParams.set("signature", signClaims(secret, claims));

  return url.toString();
}

export function verifyMediaModerationInspectionSignature(
  config: MediaModerationUrlConfig,
  claims: SignedModerationInspectionClaims,
  nowMs = Date.now()
) {
  if (
    claims.method !== "GET" ||
    claims.variant !== MEDIA_MODERATION_VARIANT ||
    claims.purpose !== MEDIA_MODERATION_PURPOSE ||
    !/^\d{1,12}$/.test(claims.expires)
  ) {
    return false;
  }

  const expires = Number(claims.expires);
  const nowSeconds = Math.floor(nowMs / 1000);

  if (
    !Number.isSafeInteger(expires) ||
    expires <= nowSeconds ||
    expires > nowSeconds + MAX_MEDIA_MODERATION_URL_TTL_SECONDS
  ) {
    return false;
  }

  const signature = claims.signature;

  if (!SIGNATURE_PATTERN.test(signature)) {
    return false;
  }

  let secret: string;

  try {
    secret = requireSigningConfig(config).secret;
  } catch {
    return false;
  }

  const expected = Buffer.from(signClaims(secret, claims), "base64url");
  const provided = Buffer.from(signature, "base64url");

  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
