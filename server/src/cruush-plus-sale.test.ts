import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CRUUSH_PLUS_PLANS, getPublicCruushPlusPlans } from "./billing.js";
import { CRUUSH_PLUS_SALE, cruushPlusOrderSale, cruushPlusSaleFromMetadata, getActiveCruushPlusSale, getCruushPlusSalePrice } from "./cruush-plus-sale.js";
import type { FastifyInstance } from "fastify";

describe("automatic cruush+ sale", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-10T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());
  it("removes the promotion and restores every plan to its list price", async () => {
    const app = { db: { query: async () => ({ rows: [] }) } } as unknown as FastifyInstance;
    const catalog = await getPublicCruushPlusPlans(app);
    for (const plan of catalog) {
      const original = CRUUSH_PLUS_PLANS.find((candidate) => candidate.id === plan.id)!;
      expect(plan.originalAmountCents).toBe(original.amountCents);
      expect(plan.amountCents).toBe(original.amountCents);
      expect(plan.sale).toBeNull();
      expect(plan.supplyLimit).toBe(original.supplyLimit);
    }
    expect(getCruushPlusSalePrice(199999).amountCents).toBe(199999);
    expect(getCruushPlusSalePrice(1899).amountCents).toBe(1899);
    expect(CRUUSH_PLUS_SALE).toMatchObject({ endsAt: "2026-10-12T03:59:00Z", couponStacking: false });
  });

  it("restores list prices when the sale is switched off without mutating stored snapshots", () => {
    const recorded = { ...CRUUSH_PLUS_SALE, originalAmountUsdCents: 1899, discountAmountUsdCents: 949, amountUsdCents: 950 };
    expect(getCruushPlusSalePrice(1899, null)).toEqual({ amountCents: 1899, originalAmountCents: 1899, sale: null });
    expect(cruushPlusSaleFromMetadata({ sale: recorded })).toEqual({
      ...CRUUSH_PLUS_SALE, originalAmountUsdCents: 1899, discountAmountUsdCents: 949, amountUsdCents: 950
    });
    expect(cruushPlusSaleFromMetadata({})).toBeNull();
  });

  it("keeps new quotes at list price before and after the former deadline", async () => {
    const deadline = Date.parse("2026-10-12T03:59:00Z");
    vi.setSystemTime(deadline - 1);
    expect(getActiveCruushPlusSale()).toBeNull();
    expect(getCruushPlusSalePrice(1899).amountCents).toBe(1899);
    for (const time of [deadline, deadline + 1, deadline + 60_000]) {
      vi.setSystemTime(time);
      expect(getActiveCruushPlusSale()).toBeNull();
      expect(getCruushPlusSalePrice(1899)).toMatchObject({ amountCents: 1899, sale: null });
      expect(cruushPlusOrderSale(1899)).toBeNull();
    }
    const app = { db: { query: async () => ({ rows: [] }) } } as unknown as FastifyInstance;
    for (const plan of await getPublicCruushPlusPlans(app)) {
      expect(plan.amountCents).toBe(CRUUSH_PLUS_PLANS.find(candidate => candidate.id === plan.id)!.amountCents);
      expect(plan.sale).toBeNull();
    }
  });

  it("reads both dated and legacy unbounded order snapshots after the sale ends", () => {
    const recorded = { ...CRUUSH_PLUS_SALE, originalAmountUsdCents: 1899, discountAmountUsdCents: 949, amountUsdCents: 950 };
    const legacy = { ...recorded, endsAt: null };
    vi.setSystemTime(new Date("2026-10-13T00:00:00Z"));
    expect(cruushPlusSaleFromMetadata({ sale: recorded })).toEqual(recorded);
    expect(cruushPlusSaleFromMetadata({ sale: legacy })).toEqual(legacy);
    expect(cruushPlusSaleFromMetadata({ sale: { ...recorded, endsAt: "invalid" } })).toBeNull();
  });
});
