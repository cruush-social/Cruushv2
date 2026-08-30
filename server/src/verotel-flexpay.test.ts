import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildFlexPayOrderUrl,
  buildFlexPayParams,
  computeFlexPaySignature,
  isGrantingEvent,
  isRevokingEvent,
  normalizePostbackQuery,
  verifyFlexPaySignature
} from "./verotel-flexpay.js";

const CREDENTIALS = { shopId: "12345", signatureKey: "test-signature-key" };

describe("FlexPay signature", () => {
  it("hashes the signature key followed by key=value pairs ordered by key", () => {
    const params = { version: "3.2", shopID: "12345", priceAmount: "9.99" };
    const expected = createHash("sha256")
      .update("test-signature-key:priceAmount=9.99:shopID=12345:version=3.2", "utf8")
      .digest("hex");

    expect(computeFlexPaySignature(params, CREDENTIALS.signatureKey)).toBe(expected);
  });

  it("excludes the signature parameter from its own input", () => {
    const params = { version: "3", shopID: "12345" };
    const withSignature = { ...params, signature: "whatever" };

    expect(computeFlexPaySignature(withSignature, CREDENTIALS.signatureKey)).toBe(
      computeFlexPaySignature(params, CREDENTIALS.signatureKey)
    );
  });

  it("orders keys case-sensitively, matching Verotel's ksort(SORT_REGULAR)", () => {
    // Upper case sorts before lower case in byte order, which a case-folding
    // sort would get wrong.
    const params = { bravo: "2", Alpha: "1", charlie: "3", Zulu: "4" };
    const expected = createHash("sha256")
      .update("test-signature-key:Alpha=1:Zulu=4:bravo=2:charlie=3", "utf8")
      .digest("hex");

    expect(computeFlexPaySignature(params, CREDENTIALS.signatureKey)).toBe(expected);
  });

  it("accepts a legacy sha1 signature, as Verotel's own client does", () => {
    const params: Record<string, string> = { version: "3", shopID: "12345", saleID: "abc" };
    params.signature = computeFlexPaySignature(params, CREDENTIALS.signatureKey, "sha1");

    expect(verifyFlexPaySignature(params, CREDENTIALS.signatureKey)).toBe(true);
  });

  it("still rejects a tampered sha1 signature", () => {
    const params: Record<string, string> = { version: "3.2", shopID: "12345", priceAmount: "9.99" };
    params.signature = computeFlexPaySignature(params, CREDENTIALS.signatureKey, "sha1");
    params.priceAmount = "0.01";

    expect(verifyFlexPaySignature(params, CREDENTIALS.signatureKey)).toBe(false);
  });

  it("refuses to sign without a signature key", () => {
    expect(() => computeFlexPaySignature({ version: "3" }, "")).toThrow();
  });
});

describe("FlexPay signature verification", () => {
  it("accepts a correctly signed set of parameters", () => {
    const params: Record<string, string> = { version: "3", shopID: "12345", saleID: "abc" };
    params.signature = computeFlexPaySignature(params, CREDENTIALS.signatureKey);

    expect(verifyFlexPaySignature(params, CREDENTIALS.signatureKey)).toBe(true);
  });

  it("rejects a tampered parameter", () => {
    const params: Record<string, string> = { version: "3.2", shopID: "12345", priceAmount: "9.99" };
    params.signature = computeFlexPaySignature(params, CREDENTIALS.signatureKey);
    params.priceAmount = "0.01";

    expect(verifyFlexPaySignature(params, CREDENTIALS.signatureKey)).toBe(false);
  });

  it("rejects an added parameter", () => {
    const params: Record<string, string> = { version: "3", shopID: "12345" };
    params.signature = computeFlexPaySignature(params, CREDENTIALS.signatureKey);
    params.custom1 = "injected-user-id";

    expect(verifyFlexPaySignature(params, CREDENTIALS.signatureKey)).toBe(false);
  });

  it("rejects a missing signature", () => {
    expect(verifyFlexPaySignature({ version: "3" }, CREDENTIALS.signatureKey)).toBe(false);
  });

  it("rejects an empty signature", () => {
    expect(verifyFlexPaySignature({ version: "3", signature: "" }, CREDENTIALS.signatureKey)).toBe(false);
  });

  it("rejects a signature of the wrong length rather than throwing", () => {
    expect(verifyFlexPaySignature({ version: "3", signature: "abc" }, CREDENTIALS.signatureKey)).toBe(false);
  });

  it("rejects every signature when no signature key is configured", () => {
    const params: Record<string, string> = { version: "3" };
    params.signature = computeFlexPaySignature(params, CREDENTIALS.signatureKey);

    expect(verifyFlexPaySignature(params, "")).toBe(false);
  });

  it("rejects a signature produced with a different key", () => {
    const params: Record<string, string> = { version: "3", shopID: "12345" };
    params.signature = computeFlexPaySignature(params, "some-other-key");

    expect(verifyFlexPaySignature(params, CREDENTIALS.signatureKey)).toBe(false);
  });
});

describe("FlexPay order parameters", () => {
  it("sells a recurring plan as a subscription with an ISO 8601 period", () => {
    const params = buildFlexPayParams({
      planId: "plus_monthly",
      credentials: CREDENTIALS,
      referenceId: "session-1",
      userId: "user-1"
    });

    expect(params).toMatchObject({
      version: "3.2",
      shopID: "12345",
      type: "subscription",
      subscriptionType: "recurring",
      period: "P1M",
      priceCurrency: "USD",
      referenceID: "session-1",
      custom1: "user-1",
      custom2: "plus_monthly"
    });
  });

  it("sells a lifetime plan as a one-off purchase with no period", () => {
    const params = buildFlexPayParams({
      planId: "lifetime_founder",
      credentials: CREDENTIALS,
      referenceId: "session-2",
      userId: "user-2"
    });

    expect(params.type).toBe("purchase");
    expect(params.period).toBeUndefined();
    expect(params.subscriptionType).toBeUndefined();
  });

  it("formats the price in major units with two decimals", () => {
    const params = buildFlexPayParams({
      planId: "plus_weekly",
      credentials: CREDENTIALS,
      referenceId: "session-3",
      userId: "user-3"
    });

    expect(params.priceAmount).toBe("9.99");
  });

  it("signs the parameters it produces", () => {
    const params = buildFlexPayParams({
      planId: "plus_monthly",
      credentials: CREDENTIALS,
      referenceId: "session-4",
      userId: "user-4"
    });

    expect(verifyFlexPaySignature(params, CREDENTIALS.signatureKey)).toBe(true);
  });

  it("refuses to build an order without credentials", () => {
    expect(() =>
      buildFlexPayParams({
        planId: "plus_monthly",
        credentials: { shopId: "", signatureKey: "" },
        referenceId: "session-5",
        userId: "user-5"
      })
    ).toThrow();
  });

  it("builds an order URL whose query verifies", () => {
    const url = new URL(
      buildFlexPayOrderUrl({
        planId: "plus_annual",
        credentials: CREDENTIALS,
        referenceId: "session-6",
        userId: "user-6"
      })
    );

    expect(url.origin + url.pathname).toBe("https://secure.verotel.com/startorder");
    expect(verifyFlexPaySignature(Object.fromEntries(url.searchParams), CREDENTIALS.signatureKey)).toBe(true);
  });
});

describe("postback event classification", () => {
  it("treats initial and rebill as granting events", () => {
    expect(isGrantingEvent("initial")).toBe(true);
    expect(isGrantingEvent("rebill")).toBe(true);
  });

  it("treats chargeback, credit and expiry as revoking events", () => {
    expect(isRevokingEvent("chargeback")).toBe(true);
    expect(isRevokingEvent("credit")).toBe(true);
    expect(isRevokingEvent("expiry")).toBe(true);
  });

  it("treats an unknown event as neither granting nor revoking", () => {
    expect(isGrantingEvent("something-new")).toBe(false);
    expect(isRevokingEvent("something-new")).toBe(false);
  });

  it("does not grant on a cancellation, which only stops future rebills", () => {
    expect(isGrantingEvent("cancel")).toBe(false);
    expect(isRevokingEvent("cancel")).toBe(false);
  });
});

describe("postback query normalisation", () => {
  it("keeps string values and stringifies numbers and booleans", () => {
    expect(normalizePostbackQuery({ a: "one", b: 2, c: true })).toEqual({ a: "one", b: "2", c: "true" });
  });

  it("drops nested values that could not have been signed", () => {
    expect(normalizePostbackQuery({ a: "one", nested: { b: "two" }, list: ["x"] })).toEqual({ a: "one" });
  });

  it("returns an empty object for a non-object query", () => {
    expect(normalizePostbackQuery(null)).toEqual({});
    expect(normalizePostbackQuery("string")).toEqual({});
  });
});
