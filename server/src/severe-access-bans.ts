import { createHmac, randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { parseCookies, shouldUseSecureCookies } from "./auth.js";
import type { AppConfig } from "./config.js";
import type { DbClient } from "./db.js";
import { ApiError } from "./errors.js";

export const DEVICE_COOKIE_NAME = "cruush_device";
const DEVICE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 * 2;
const DEVICE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type SevereAccessBanIdentity = {
  deviceHash: string | null;
  ipHash: string | null;
};

function identityHash(
  config: Pick<AppConfig, "SEVERE_ACCESS_BAN_HMAC_KEY">,
  type: "device" | "ip",
  value: string
) {
  return createHmac("sha256", config.SEVERE_ACCESS_BAN_HMAC_KEY ?? "")
    .update(`${type}:${value}`)
    .digest("hex");
}

function requestDeviceToken(request: FastifyRequest) {
  const token = parseCookies(request.headers.cookie)[DEVICE_COOKIE_NAME]?.trim() ?? "";
  return DEVICE_TOKEN_PATTERN.test(token) ? token : null;
}

export function severeAccessBanIdentity(
  config: Pick<AppConfig, "SEVERE_ACCESS_BANS_ENABLED" | "SEVERE_ACCESS_BAN_HMAC_KEY" | "TRUST_PROXY_HOPS">,
  request: FastifyRequest
): SevereAccessBanIdentity {
  if (!config.SEVERE_ACCESS_BANS_ENABLED || !config.SEVERE_ACCESS_BAN_HMAC_KEY) {
    return { deviceHash: null, ipHash: null };
  }

  const deviceToken = requestDeviceToken(request);
  const requestIp = (config.TRUST_PROXY_HOPS ?? 0) > 0 ? request.ip.trim() : "";

  return {
    deviceHash: deviceToken ? identityHash(config, "device", deviceToken) : null,
    ipHash: requestIp ? identityHash(config, "ip", requestIp) : null
  };
}

function appendSetCookie(reply: FastifyReply, cookie: string) {
  const current = reply.getHeader("set-cookie");
  const cookies = Array.isArray(current)
    ? current.map(String)
    : current ? [String(current)] : [];
  reply.header("set-cookie", [...cookies, cookie]);
}

export function ensureDeviceCookie(reply: FastifyReply, request: FastifyRequest) {
  const existing = requestDeviceToken(request);

  if (existing) {
    return existing;
  }

  const token = randomBytes(32).toString("base64url");
  const cookie = [
    `${DEVICE_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${DEVICE_COOKIE_MAX_AGE_SECONDS}`,
    shouldUseSecureCookies(request) ? "Secure" : null
  ].filter(Boolean).join("; ");
  appendSetCookie(reply, cookie);
  return token;
}

export async function assertRequestNotSeverelyBanned(app: FastifyInstance, request: FastifyRequest) {
  const identity = severeAccessBanIdentity(app.config, request);

  if (!identity.deviceHash && !identity.ipHash) {
    return;
  }

  const result = await app.db.query<{ banned: boolean }>(
    `select exists (
       select 1
       from severe_access_bans
       where permanent = true
         and (
           (identity_type = 'device' and identity_hash = $1)
           or (identity_type = 'ip' and identity_hash = $2)
         )
     ) as banned`,
    [identity.deviceHash, identity.ipHash]
  );

  if (result.rows[0]?.banned) {
    throw new ApiError(403, "FORBIDDEN", "Access is permanently denied.");
  }
}

export async function persistSevereAccessBan(
  db: DbClient,
  userId: string,
  reasonCode: string,
  identity: SevereAccessBanIdentity | undefined
) {
  const entries = [
    identity?.deviceHash ? { type: "device" as const, hash: identity.deviceHash } : null,
    identity?.ipHash ? { type: "ip" as const, hash: identity.ipHash } : null
  ].filter((entry): entry is { type: "device" | "ip"; hash: string } => Boolean(entry));

  for (const entry of entries) {
    await db.query(
      `insert into severe_access_bans (user_id, identity_type, identity_hash, reason_code, permanent)
       values ($1, $2, $3, $4, true)
       on conflict (identity_type, identity_hash) do update
       set user_id = excluded.user_id,
           reason_code = excluded.reason_code,
           permanent = true`,
      [userId, entry.type, entry.hash, reasonCode]
    );
  }
}
