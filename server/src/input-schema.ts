import { z } from "zod";

const UNSAFE_CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const SINGLE_LINE_WHITESPACE = /[\t\r\n]+/g;

export function normalizeMultilineText(value: string) {
  return value.replace(UNSAFE_CONTROL_CHARACTERS, "").trim();
}

export function normalizeSingleLineText(value: string) {
  return normalizeMultilineText(value).replace(SINGLE_LINE_WHITESPACE, " ").trim();
}

export function multilineTextSchema(options: { min?: number; max: number }) {
  return z.string()
    .transform(normalizeMultilineText)
    .pipe(z.string().min(options.min ?? 0).max(options.max));
}

export function singleLineTextSchema(options: { min?: number; max: number }) {
  return z.string()
    .transform(normalizeSingleLineText)
    .pipe(z.string().min(options.min ?? 0).max(options.max));
}

export function optionalSingleLineTextSchema(max: number) {
  return singleLineTextSchema({ max }).optional().default("");
}

function normalizeUrlHostname(hostname: string) {
  return hostname.toLowerCase().replace(/^\[|\]$/g, "");
}

function isPrivateIpv4(hostname: string) {
  const match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);

  if (!match) {
    return false;
  }

  const octets = match.slice(1).map(Number);

  if (octets.some((octet) => octet < 0 || octet > 255)) {
    return false;
  }

  const [first, second] = octets;

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254)
  );
}

function isUnsafePublicUrlHostname(hostname: string) {
  const normalized = normalizeUrlHostname(hostname);
  const isIpv6Literal = normalized.includes(":");

  return (
    normalized === "localhost" ||
    normalized === "metadata.google.internal" ||
    normalized === "169.254.169.254" ||
    normalized.endsWith(".local") ||
    normalized === "::1" ||
    (isIpv6Literal && (
      normalized.startsWith("fe80:") ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd")
    )) ||
    isPrivateIpv4(normalized)
  );
}

export function publicHttpsUrlSchema(options: { max?: number; message?: string } = {}) {
  return z.string()
    .trim()
    .url()
    .max(options.max ?? 2000)
    .refine((value) => {
      try {
        const url = new URL(value);

        return (
          url.protocol === "https:" &&
          !url.username &&
          !url.password &&
          !isUnsafePublicUrlHostname(url.hostname)
        );
      } catch {
        return false;
      }
    }, options.message ?? "URL must be a public HTTPS URL.");
}

export const uuidSchema = z.uuid();
