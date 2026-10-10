// Julien, October 9: automatic 50% off for all users, no coupon stacking,
// October 10: end Sunday October 11 at 23:59 America/New_York.
// This switch and deadline control new prices only, never stored orders.
export const CRUUSH_PLUS_SALE_ACTIVE = true;

export const CRUUSH_PLUS_SALE = {
  id: "cruush-plus-50",
  percentOff: 50,
  endsAt: "2026-10-12T03:59:00Z",
  couponStacking: false
} as const;

export type CruushPlusSale = Omit<typeof CRUUSH_PLUS_SALE, "endsAt"> & { endsAt: string | null };
export type CruushPlusOrderSale = CruushPlusSale & {
  originalAmountUsdCents: number;
  discountAmountUsdCents: number;
  amountUsdCents: number;
};

export function getActiveCruushPlusSale(): CruushPlusSale | null {
  return CRUUSH_PLUS_SALE_ACTIVE && Date.now() < Date.parse(CRUUSH_PLUS_SALE.endsAt)
    ? CRUUSH_PLUS_SALE : null;
}

export function getCruushPlusSalePrice(
  originalAmountCents: number,
  sale = getActiveCruushPlusSale()
) {
  if (!Number.isSafeInteger(originalAmountCents) || originalAmountCents < 1) {
    throw new Error("Checkout amount must be a positive integer number of cents.");
  }
  const amountCents = sale
    ? Math.max(1, Math.round(originalAmountCents * (100 - sale.percentOff) / 100))
    : originalAmountCents;
  return { originalAmountCents, amountCents, sale };
}

export function cruushPlusOrderSale(originalAmountCents: number): CruushPlusOrderSale | null {
  const price = getCruushPlusSalePrice(originalAmountCents);
  return price.sale ? {
    ...price.sale,
    originalAmountUsdCents: originalAmountCents,
    discountAmountUsdCents: originalAmountCents - price.amountCents,
    amountUsdCents: price.amountCents
  } : null;
}

export function cruushPlusSaleFromMetadata(metadata: Record<string, unknown> | null | undefined): CruushPlusOrderSale | null {
  const value = metadata?.sale;
  if (!value || typeof value !== "object") return null;
  const sale = value as Partial<CruushPlusOrderSale>;
  if (sale.id !== CRUUSH_PLUS_SALE.id || sale.percentOff !== 50 || sale.couponStacking !== false
    || !(sale.endsAt === null || (typeof sale.endsAt === "string" && Number.isFinite(Date.parse(sale.endsAt))))
    || !Number.isSafeInteger(sale.originalAmountUsdCents)
    || !Number.isSafeInteger(sale.discountAmountUsdCents) || !Number.isSafeInteger(sale.amountUsdCents)
    || Number(sale.originalAmountUsdCents) < 1 || Number(sale.amountUsdCents) < 1
    || Number(sale.originalAmountUsdCents) - Number(sale.amountUsdCents) !== sale.discountAmountUsdCents) return null;
  return sale as CruushPlusOrderSale;
}
