import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { deriveKey } from "./crypto-keys.js";

export const NEWSLETTER_UNSUBSCRIBE_PATH = "/api/newsletter/unsubscribe";
const CONTACT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TOKEN_PATTERN = /^v1\.([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/;
const TOKEN_PURPOSE = "newsletter-unsubscribe";

type NewsletterConfig = {
  SESSION_SECRET: string;
  RESEND_CRUUSH_APP_AUDIENCE_ID?: string;
  RESEND_API_KEY?: string;
};

function signingKey(config: NewsletterConfig) {
  if (Buffer.byteLength(config.SESSION_SECRET, "utf8") < 32 || !config.RESEND_CRUUSH_APP_AUDIENCE_ID?.trim()) {
    throw new Error("newsletter_unsubscribe_not_configured");
  }
  return deriveKey(config.SESSION_SECRET, TOKEN_PURPOSE, "v2");
}

function signature(config: NewsletterConfig, contactId: string) {
  return createHmac("sha256", signingKey(config))
    .update(`cruush:${TOKEN_PURPOSE}:v1:${config.RESEND_CRUUSH_APP_AUDIENCE_ID}:${contactId}`)
    .digest();
}

// This is an unsubscribe-only capability, never an app session or an email
// address. Bind the opaque provider contact ID to the existing cruush audience.
export function createNewsletterUnsubscribeToken(config: NewsletterConfig, contactId: string) {
  if (!CONTACT_ID_PATTERN.test(contactId)) throw new Error("invalid_newsletter_contact_id");
  return `v1.${contactId}.${signature(config, contactId).toString("base64url")}`;
}

export function readNewsletterUnsubscribeToken(config: NewsletterConfig, token: unknown): string | null {
  if (typeof token !== "string") return null;
  const match = TOKEN_PATTERN.exec(token);
  if (!match || !CONTACT_ID_PATTERN.test(match[1])) return null;
  try {
    const supplied = Buffer.from(match[2], "base64url");
    const expected = signature(config, match[1]);
    if (supplied.length !== expected.length || supplied.toString("base64url") !== match[2]) return null;
    return timingSafeEqual(supplied, expected) ? match[1] : null;
  } catch {
    return null;
  }
}

export function createNewsletterUnsubscribeUrl(config: NewsletterConfig, contactId: string, apiOrigin: string) {
  const origin = new URL(apiOrigin);
  if (origin.protocol !== "https:" || origin.origin !== apiOrigin) {
    throw new Error("newsletter_unsubscribe_requires_https_origin");
  }
  const url = new URL(NEWSLETTER_UNSUBSCRIBE_PATH, origin);
  url.searchParams.set("token", createNewsletterUnsubscribeToken(config, contactId));
  return url.toString();
}

export function newsletterUnsubscribeRateLimitKey(token: string) {
  return `${TOKEN_PURPOSE}:${createHash("sha256").update(token).digest("hex")}`;
}

export async function unsubscribeNewsletterContact(input: {
  config: NewsletterConfig;
  contactId: string;
  logger: { warn: (context: unknown, message: string) => void };
}): Promise<boolean> {
  if (!input.config.RESEND_API_KEY || !CONTACT_ID_PATTERN.test(input.contactId)) return false;
  try {
    // PATCH never recreates a missing contact, resubscribes it, deletes it, or
    // adds a transactional suppression. Discard provider bodies and fetch errors.
    const response = await fetch(`https://api.resend.com/contacts/${input.contactId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${input.config.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ unsubscribed: true }),
      signal: AbortSignal.timeout(10_000)
    });
    await response.body?.cancel().catch(() => undefined);
    if (response.ok) return true;
    input.logger.warn({ status: response.status }, "newsletter unsubscribe provider update failed");
  } catch {
    input.logger.warn({ failure: "provider_request_failed" }, "newsletter unsubscribe provider update failed");
  }
  return false;
}
