import { createHash, timingSafeEqual } from "node:crypto";
import { getCruushPlusPlan, type CruushPlusPlan, type CruushPlusPlanId } from "./billing.js";

/**
 * Verotel FlexPay v3.2 order URLs and postback signature handling.
 *
 * Ported from Verotel's own PHP client, `Verotel\FlexPay\Client`, not from
 * memory or from a summary of the spec:
 *
 *   _signature($params):    array($this->secret) then each "$key=$value" after
 *                           ksort($params, SORT_REGULAR), joined with ":",
 *                           hashed and strtolower()'d.
 *   validate_signature():   unsets `signature`, compares against the SHA-256
 *                           digest and also against a legacy SHA-1 digest.
 *
 * Two details here are easy to get wrong and both are load-bearing: the key
 * ordering is case-sensitive, and SHA-1 must still be accepted or legitimate
 * postbacks are rejected. Both are pinned by vectors in verotel-flexpay.test.ts.
 */

export const FLEXPAY_VERSION = "3.2";
export const FLEXPAY_START_ORDER_URL = "https://secure.verotel.com/startorder";

/** Parameters Verotel signs, per the FlexPay specification. */
export type FlexPayParams = Record<string, string>;

export type FlexPayCredentials = {
  shopId: string;
  signatureKey: string;
};

export type FlexPaySaleType = "purchase" | "subscription";

/**
 * Verotel expresses recurring periods as ISO 8601 durations. `lifetime` has no
 * period because it is sold as a one-off purchase rather than a subscription.
 */
const PLAN_PERIODS: Record<CruushPlusPlan["interval"], string | null> = {
  week: "P7D",
  month: "P1M",
  "3_months": "P3M",
  "6_months": "P6M",
  year: "P1Y",
  lifetime: null
};

function assertCredentials(credentials: FlexPayCredentials) {
  if (!credentials.shopId || !credentials.signatureKey) {
    throw new Error("Verotel FlexPay is not configured.");
  }
}

/**
 * Orders keys the way Verotel's own PHP client does: `ksort($params, SORT_REGULAR)`,
 * which is case-sensitive. Plain byte ordering, not a locale or case-folded sort.
 */
function orderedKeys(params: FlexPayParams) {
  return Object.keys(params).sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

/**
 * Mirrors `Verotel\FlexPay\Client::_signature`: the secret, then every remaining
 * `key=value` pair in case-sensitive key order, joined with colons, hashed and
 * lowercased.
 */
export function computeFlexPaySignature(
  params: FlexPayParams,
  signatureKey: string,
  algorithm: "sha256" | "sha1" = "sha256"
) {
  if (!signatureKey) {
    throw new Error("Verotel FlexPay signature key is not configured.");
  }

  const parts = orderedKeys(params)
    .filter((key) => key !== "signature")
    .filter((key) => params[key] !== undefined && params[key] !== null)
    .map((key) => `${key}=${params[key]}`);

  return createHash(algorithm).update([signatureKey, ...parts].join(":"), "utf8").digest("hex").toLowerCase();
}

function signatureMatches(provided: string, expected: string) {
  const providedBuffer = Buffer.from(provided, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

/**
 * Fail-closed signature check. Returns false for a missing, malformed, or
 * mismatched signature; never throws on attacker-controlled input.
 *
 * Accepts SHA-1 as well as SHA-256 because Verotel's own `validate_signature`
 * does, for backward compatibility. Rejecting SHA-1 outright would drop
 * legitimate postbacks.
 */
export function verifyFlexPaySignature(params: FlexPayParams, signatureKey: string) {
  const provided = params.signature;

  if (typeof provided !== "string" || provided.length === 0) {
    return false;
  }

  const normalized = provided.toLowerCase();

  for (const algorithm of ["sha256", "sha1"] as const) {
    let expected: string;

    try {
      expected = computeFlexPaySignature(params, signatureKey, algorithm);
    } catch {
      return false;
    }

    if (signatureMatches(normalized, expected)) {
      return true;
    }
  }

  return false;
}

function formatAmount(amountCents: number) {
  return (amountCents / 100).toFixed(2);
}

export function buildFlexPayParams(options: {
  planId: CruushPlusPlanId;
  credentials: FlexPayCredentials;
  /** Our checkout session id, echoed back on every postback for this sale. */
  referenceId: string;
  /** Our user id, echoed back so a postback can be attributed without a lookup. */
  userId: string;
}): FlexPayParams {
  assertCredentials(options.credentials);

  const plan = getCruushPlusPlan(options.planId);
  const period = PLAN_PERIODS[plan.interval];
  const saleType: FlexPaySaleType = period === null ? "purchase" : "subscription";

  const params: FlexPayParams = {
    version: FLEXPAY_VERSION,
    shopID: options.credentials.shopId,
    priceAmount: formatAmount(plan.amountCents),
    priceCurrency: plan.currency,
    description: plan.name,
    referenceID: options.referenceId,
    custom1: options.userId,
    custom2: plan.id,
    type: saleType
  };

  if (period !== null) {
    params.subscriptionType = "recurring";
    params.period = period;
  }

  params.signature = computeFlexPaySignature(params, options.credentials.signatureKey);

  return params;
}

export function buildFlexPayOrderUrl(options: {
  planId: CruushPlusPlanId;
  credentials: FlexPayCredentials;
  referenceId: string;
  userId: string;
}) {
  const params = buildFlexPayParams(options);
  const url = new URL(FLEXPAY_START_ORDER_URL);

  for (const key of orderedKeys(params)) {
    url.searchParams.set(key, params[key]);
  }

  return url.toString();
}

/**
 * Verotel postback event names we act on. Anything else is recorded and ignored
 * rather than guessed at.
 */
export type VerotelEventType =
  | "initial"
  | "rebill"
  | "cancel"
  | "uncancel"
  | "chargeback"
  | "credit"
  | "expiry";

const GRANTING_EVENTS = new Set<VerotelEventType>(["initial", "rebill"]);
const REVOKING_EVENTS = new Set<VerotelEventType>(["chargeback", "credit", "expiry"]);

export function isGrantingEvent(event: string): event is VerotelEventType {
  return GRANTING_EVENTS.has(event as VerotelEventType);
}

export function isRevokingEvent(event: string): event is VerotelEventType {
  return REVOKING_EVENTS.has(event as VerotelEventType);
}

export function normalizePostbackQuery(query: unknown): FlexPayParams {
  if (typeof query !== "object" || query === null) {
    return {};
  }

  const normalized: FlexPayParams = {};

  for (const [key, value] of Object.entries(query as Record<string, unknown>)) {
    if (typeof value === "string") {
      normalized[key] = value;
    } else if (typeof value === "number" || typeof value === "boolean") {
      normalized[key] = String(value);
    }
  }

  return normalized;
}
