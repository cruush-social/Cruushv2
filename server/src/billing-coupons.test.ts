import { describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { createFakeCheckoutSession } from "./billing.js";

function appWithQueries(...responses: Array<{ rows: Array<Record<string, unknown>> }>) {
  const query = vi.fn();
  for (const response of responses) {
    query.mockResolvedValueOnce(response);
  }

  return {
    app: { db: { query, end: vi.fn() } } as unknown as FastifyInstance,
    query
  };
}

describe("new-member billing coupons", () => {
  it("applies NEW50 to a fresh member and records the one-time redemption", async () => {
    const { app, query } = appWithQueries(
      { rows: [] },
      { rows: [{ id: "coupon-1", code: "NEW50", percent_off: 50, new_member_only: true }] },
      { rows: [{ created_at: new Date().toISOString() }] },
      { rows: [] },
      { rows: [{
        id: "session-1",
        user_id: "user-1",
        plan_id: "plus_weekly",
        processor: "fake",
        status: "pending",
        test_mode: true,
        amount_cents: 500,
        original_amount_cents: 999,
        discount_cents: 499,
        coupon_code: "NEW50",
        currency: "USD"
      }] },
      { rows: [] },
      { rows: [] }
    );

    const session = await createFakeCheckoutSession(app, "user-1", "plus_weekly", "new50");

    expect(session).toMatchObject({
      amountCents: 500,
      originalAmountCents: 999,
      discountCents: 499,
      couponCode: "NEW50"
    });
    expect(query.mock.calls.some(([sql, params]) =>
      String(sql).includes("billing_coupon_redemptions") && params?.[2] === "session-1"
    )).toBe(true);
  });

  it("rejects NEW50 after the 24-hour new-member window", async () => {
    const { app } = appWithQueries(
      { rows: [] },
      { rows: [{ id: "coupon-1", code: "NEW50", percent_off: 50, new_member_only: true }] },
      { rows: [{ created_at: new Date(Date.now() - 24 * 60 * 60 * 1000 - 1).toISOString() }] },
      { rows: [] }
    );

    await expect(createFakeCheckoutSession(app, "user-1", "plus_weekly", "NEW50"))
      .rejects.toThrow("only available during your first 24 hours");
  });
});
