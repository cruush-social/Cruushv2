import type { FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { computeFlexPaySignature } from "./verotel-flexpay.js";

const { grantCruushPlusForCheckoutSession, recordPaymentEvent, checkChargebackRatioAndAlert } = vi.hoisted(() => ({
  grantCruushPlusForCheckoutSession: vi.fn(),
  recordPaymentEvent: vi.fn(),
  checkChargebackRatioAndAlert: vi.fn().mockResolvedValue({})
}));

vi.mock("./billing.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./billing.js")>();
  return { ...actual, grantCruushPlusForCheckoutSession };
});

vi.mock("./payment-monitoring.js", () => ({ recordPaymentEvent, checkChargebackRatioAndAlert }));

const { handleVerotelPostback } = await import("./verotel-webhook.js");

const SIGNATURE_KEY = "test-signature-key";

const APP_LOG = { warn: () => {}, error: () => {}, info: () => {} };

const SESSION_ROW = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "22222222-2222-4222-8222-222222222222",
  plan_id: "plus_monthly",
  processor: "verotel",
  status: "pending",
  test_mode: false,
  amount_cents: 1999,
  currency: "USD"
};

/**
 * Routes each query to a response by matching the statement, so a test can say
 * "the insert conflicted" or "no session exists" without depending on call order.
 */
function createDb(options: { insertReturnsRow?: boolean; sessionRow?: unknown } = {}) {
  const insertReturnsRow = options.insertReturnsRow ?? true;
  const sessionRow = "sessionRow" in options ? options.sessionRow : SESSION_ROW;
  const calls: string[] = [];

  const query = vi.fn(async (sql: string) => {
    calls.push(sql);

    if (sql.includes("insert into billing_processor_events")) {
      return { rows: insertReturnsRow ? [{ id: "event-1" }] : [] };
    }

    if (sql.includes("from billing_checkout_sessions")) {
      return { rows: sessionRow ? [sessionRow] : [] };
    }

    return { rows: [] };
  });

  return { app: { db: { query }, log: APP_LOG } as unknown as FastifyInstance, query, calls };
}

function signedPostback(overrides: Record<string, string> = {}) {
  const params: Record<string, string> = {
    saleID: "sale-1",
    referenceID: SESSION_ROW.id,
    event: "initial",
    transactionID: "txn-1",
    priceAmount: "19.99",
    ...overrides
  };

  params.signature = computeFlexPaySignature(params, SIGNATURE_KEY);
  return params;
}

beforeEach(() => {
  grantCruushPlusForCheckoutSession.mockReset();
  recordPaymentEvent.mockReset();
});

describe("Verotel postback handling", () => {
  it("grants cruush+ for a signed initial sale", async () => {
    const { app } = createDb();

    await expect(
      handleVerotelPostback(app, { query: signedPostback(), signatureKey: SIGNATURE_KEY })
    ).resolves.toMatchObject({ outcome: "granted", eventType: "initial" });

    expect(grantCruushPlusForCheckoutSession).toHaveBeenCalledTimes(1);
    expect(recordPaymentEvent).toHaveBeenCalledWith(app, expect.objectContaining({ outcome: "approved" }));
  });

  it("grants again on a rebill, which is how a renewal extends access", async () => {
    const { app } = createDb();

    await expect(
      handleVerotelPostback(app, {
        query: signedPostback({ event: "rebill", transactionID: "txn-2" }),
        signatureKey: SIGNATURE_KEY
      })
    ).resolves.toMatchObject({ outcome: "granted" });

    expect(grantCruushPlusForCheckoutSession).toHaveBeenCalledTimes(1);
  });

  it("rejects an invalid signature without granting anything", async () => {
    const { app } = createDb();
    const params = signedPostback();
    params.priceAmount = "0.01";

    await expect(
      handleVerotelPostback(app, { query: params, signatureKey: SIGNATURE_KEY })
    ).resolves.toMatchObject({ outcome: "rejected" });

    expect(grantCruushPlusForCheckoutSession).not.toHaveBeenCalled();
  });

  it("rejects a postback with no signature at all", async () => {
    const { app } = createDb();

    await expect(
      handleVerotelPostback(app, {
        query: { saleID: "sale-1", event: "initial" },
        signatureKey: SIGNATURE_KEY
      })
    ).resolves.toMatchObject({ outcome: "rejected" });

    expect(grantCruushPlusForCheckoutSession).not.toHaveBeenCalled();
  });

  it("records an unverified postback so tampering leaves a trail", async () => {
    const { app, calls } = createDb();

    await handleVerotelPostback(app, {
      query: { saleID: "sale-1", event: "initial", signature: "bogus" },
      signatureKey: SIGNATURE_KEY
    });

    expect(calls.some((sql) => sql.includes("insert into billing_processor_events"))).toBe(true);
  });

  it("treats a redelivered postback as a duplicate and does not grant twice", async () => {
    const { app } = createDb({ insertReturnsRow: false });

    await expect(
      handleVerotelPostback(app, { query: signedPostback(), signatureKey: SIGNATURE_KEY })
    ).resolves.toMatchObject({ outcome: "duplicate" });

    expect(grantCruushPlusForCheckoutSession).not.toHaveBeenCalled();
  });

  it("revokes on a chargeback", async () => {
    const { app } = createDb();

    await expect(
      handleVerotelPostback(app, {
        query: signedPostback({ event: "chargeback", transactionID: "txn-3" }),
        signatureKey: SIGNATURE_KEY
      })
    ).resolves.toMatchObject({ outcome: "revoked" });

    expect(grantCruushPlusForCheckoutSession).not.toHaveBeenCalled();
    expect(recordPaymentEvent).toHaveBeenCalledWith(app, expect.objectContaining({ outcome: "chargeback" }));
  });

  it("records a credit as a refund rather than a chargeback", async () => {
    const { app } = createDb();

    await handleVerotelPostback(app, {
      query: signedPostback({ event: "credit", transactionID: "txn-4" }),
      signatureKey: SIGNATURE_KEY
    });

    expect(recordPaymentEvent).toHaveBeenCalledWith(app, expect.objectContaining({ outcome: "refund" }));
  });

  it("ignores an event type it does not understand", async () => {
    const { app } = createDb();

    await expect(
      handleVerotelPostback(app, {
        query: signedPostback({ event: "something-new", transactionID: "txn-5" }),
        signatureKey: SIGNATURE_KEY
      })
    ).resolves.toMatchObject({ outcome: "ignored" });

    expect(grantCruushPlusForCheckoutSession).not.toHaveBeenCalled();
  });

  it("does not grant or revoke on a cancellation", async () => {
    const { app } = createDb();

    await expect(
      handleVerotelPostback(app, {
        query: signedPostback({ event: "cancel", transactionID: "txn-6" }),
        signatureKey: SIGNATURE_KEY
      })
    ).resolves.toMatchObject({ outcome: "ignored" });
  });

  it("reports an unknown checkout session instead of inventing one", async () => {
    const { app } = createDb({ sessionRow: null });

    await expect(
      handleVerotelPostback(app, { query: signedPostback(), signatureKey: SIGNATURE_KEY })
    ).resolves.toMatchObject({ outcome: "unknown_session" });

    expect(grantCruushPlusForCheckoutSession).not.toHaveBeenCalled();
  });

  it("rejects everything when the signature key is empty", async () => {
    const { app } = createDb();

    await expect(
      handleVerotelPostback(app, { query: signedPostback(), signatureKey: "" })
    ).resolves.toMatchObject({ outcome: "rejected" });
  });
});
