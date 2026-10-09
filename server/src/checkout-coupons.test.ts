import { describe, expect, it, vi } from "vitest";
import {
  applyCheckoutCoupon,
  getCheckoutCoupon,
  normalizeCheckoutCouponCode,
  reserveCheckoutCoupon,
  validateCheckoutCoupon
} from "./checkout-coupons.js";

describe("checkout coupons", () => {
  it("normalizes CLUBS20 and calculates twenty percent off in integer cents", () => {
    expect(normalizeCheckoutCouponCode(" clubs20 ")).toBe("CLUBS20");
    expect(applyCheckoutCoupon(999, getCheckoutCoupon("clubs20"))).toEqual({
      code: "CLUBS20",
      percentOff: 20,
      originalAmountUsdCents: 999,
      discountAmountUsdCents: 200,
      amountUsdCents: 799
    });
  });

  it("rejects unknown and already redeemed codes", async () => {
    expect(() => getCheckoutCoupon("wrong")).toThrow("That coupon code is not valid.");
    const db = {
      query: vi.fn(async () => ({
        rows: [{
          status: "redeemed",
          crypto_payment_intent_id: "intent-1",
          intent_status: "paid",
          reservation_released: false
        }]
      }))
    };
    await expect(validateCheckoutCoupon(db as never, "user-1", "CLUBS20"))
      .rejects.toThrow("already been used");
  });

  it("moves a released reservation to a fresh order but protects an active order", async () => {
    const releasedQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [{
        status: "reserved",
        crypto_payment_intent_id: "intent-old",
        intent_status: "cancelled",
        reservation_released: true
      }] })
      .mockResolvedValueOnce({ rows: [] });
    await reserveCheckoutCoupon({ query: releasedQuery } as never, "user-1", "CLUBS20", "intent-new");
    expect(releasedQuery.mock.calls[1]?.[0]).toContain("set crypto_payment_intent_id = $3");

    const activeDb = {
      query: vi.fn(async () => ({ rows: [{
        status: "reserved",
        crypto_payment_intent_id: "intent-active",
        intent_status: "awaiting_payment",
        reservation_released: false
      }] }))
    };
    await expect(reserveCheckoutCoupon(activeDb as never, "user-1", "CLUBS20", "intent-new"))
      .rejects.toThrow("active order");
  });
});
