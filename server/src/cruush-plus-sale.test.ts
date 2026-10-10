import { describe, expect, it } from "vitest";
import { CRUUSH_PLUS_PLANS, getPublicCruushPlusPlans } from "./billing.js";
import { CRUUSH_PLUS_SALE, cruushPlusOrderSale, cruushPlusSaleFromMetadata, getCruushPlusSalePrice } from "./cruush-plus-sale.js";
import type { FastifyInstance } from "fastify";

describe("automatic cruush+ sale", () => {
  it("prices every plan at 50% without an account-age or membership condition", async () => {
    const app = { db: { query: async () => ({ rows: [] }) } } as unknown as FastifyInstance;
    const catalog = await getPublicCruushPlusPlans(app);
    for (const plan of catalog) {
      const original = CRUUSH_PLUS_PLANS.find((candidate) => candidate.id === plan.id)!;
      expect(plan.originalAmountCents).toBe(original.amountCents);
      expect(plan.amountCents).toBe(Math.round(original.amountCents / 2));
      expect(plan.sale).toEqual(CRUUSH_PLUS_SALE);
      expect(plan.supplyLimit).toBe(original.supplyLimit);
    }
    expect(getCruushPlusSalePrice(199999).amountCents).toBe(100000);
    expect(getCruushPlusSalePrice(1899).amountCents).toBe(950);
    expect(CRUUSH_PLUS_SALE).toMatchObject({ endsAt: null, couponStacking: false });
  });

  it("restores list prices when the sale is switched off without mutating stored snapshots", () => {
    const recorded = cruushPlusOrderSale(1899);
    expect(getCruushPlusSalePrice(1899, null)).toEqual({ amountCents: 1899, originalAmountCents: 1899, sale: null });
    expect(cruushPlusSaleFromMetadata({ sale: recorded })).toEqual({
      ...CRUUSH_PLUS_SALE, originalAmountUsdCents: 1899, discountAmountUsdCents: 949, amountUsdCents: 950
    });
    expect(cruushPlusSaleFromMetadata({})).toBeNull();
  });
});
