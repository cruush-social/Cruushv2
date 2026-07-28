import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { FastifyRequest } from "fastify";

const scrypt = promisify(scryptCallback);

export const SESSION_COOKIE_NAME = "cruush_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
export const SESSION_TOKEN_BYTES = 32;
export const SESSION_TOKEN_HASH_BYTES = 32;

type SessionCookieOptions = {
  secure: boolean;
  expiresAt?: Date;
  maxAgeSeconds?: number;
};

function toBase64Url(buffer: Buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derivedKey = await scrypt(password, salt, 64) as Buffer;
  return `scrypt$${salt.toString("hex")}$${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, passwordHash: string) {
  const [algorithm, saltHex, hashHex] = passwordHash.split("$");

  if (algorithm !== "scrypt" || !saltHex || !hashHex) {
    return false;
  }

  const derivedKey = await scrypt(password, Buffer.from(saltHex, "hex"), 64) as Buffer;
  const storedHash = Buffer.from(hashHex, "hex");

  if (storedHash.length !== derivedKey.length) {
    return false;
  }

  return timingSafeEqual(storedHash, derivedKey);
}

export function generateSessionToken() {
  return toBase64Url(randomBytes(SESSION_TOKEN_BYTES));
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function getSessionExpiryDate() {
  return new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
}

export function shouldUseSecureCookies(request: FastifyRequest) {
  if (request.server.config.NODE_ENV === "production") {
    return true;
  }

  const forwardedProto = request.headers["x-forwarded-proto"];
  const origin = request.headers.origin;

  if (typeof forwardedProto === "string" && forwardedProto.includes("https")) {
    return true;
  }

  if (typeof origin === "string" && origin.startsWith("https://")) {
    return true;
  }

  return false;
}

function serializeCookieValue(value: string) {
  return encodeURIComponent(value);
}

export function createSessionCookie(token: string, options: SessionCookieOptions) {
  const parts = [
    `${SESSION_COOKIE_NAME}=${serializeCookieValue(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${options.maxAgeSeconds ?? SESSION_TTL_SECONDS}`,
  ];

  if (options.expiresAt) {
    parts.push(`Expires=${options.expiresAt.toUTCString()}`);
  }

  if (options.secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function createClearedSessionCookie(secure: boolean) {
  return [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    secure ? "Secure" : null,
  ]
    .filter(Boolean)
    .join("; ");
}

export function parseCookies(header: string | undefined) {
  if (!header) {
    return {};
  }

  return header.split(";").reduce<Record<string, string>>((cookies, chunk) => {
    const [name, ...rest] = chunk.trim().split("=");

    if (!name) {
      return cookies;
    }

    cookies[name] = decodeURIComponent(rest.join("="));
    return cookies;
  }, {});
}

export function getSessionTokenFromRequest(request: FastifyRequest) {
  const cookies = parseCookies(request.headers.cookie);
  return cookies[SESSION_COOKIE_NAME]?.trim() || null;
}
