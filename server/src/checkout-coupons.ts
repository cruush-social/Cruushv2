import type { DbClient } from "./db.js";
import { ApiError } from "./errors.js";

export const CHECKOUT_COUPON_CODES = ["CLUBS20"] as const;
export type CheckoutCouponCode = typeof CHECKOUT_COUPON_CODES[number];

export type CheckoutCoupon = {
  code: CheckoutCouponCode;
  percentOff: number;
};

export type CheckoutDiscount = CheckoutCoupon & {
  originalAmountUsdCents: number;
  discountAmountUsdCents: number;
  amountUsdCents: number;
};

const COUPONS: Record<CheckoutCouponCode, CheckoutCoupon> = {
  CLUBS20: { code: "CLUBS20", percentOff: 20 }
};

type RedemptionRow = {
  status: "reserved" | "redeemed";
  crypto_payment_intent_id: string;
  intent_status: string;
  reservation_released: boolean;
};

export function normalizeCheckoutCouponCode(value: string) {
  return value.normalize("NFKC").trim().toUpperCase();
}

export function getCheckoutCoupon(value: string): CheckoutCoupon {
  const code = normalizeCheckoutCouponCode(value) as CheckoutCouponCode;
  const coupon = COUPONS[code];
  if (!coupon) {
    throw new ApiError(400, "VALIDATION_ERROR", "That coupon code is not valid.");
  }
  return coupon;
}

export function applyCheckoutCoupon(amountUsdCents: number, coupon: CheckoutCoupon): CheckoutDiscount {
  if (!Number.isSafeInteger(amountUsdCents) || amountUsdCents < 1) {
    throw new Error("Checkout amount must be a positive integer number of cents.");
  }
  const discountedAmount = Math.max(1, Math.round(amountUsdCents * (100 - coupon.percentOff) / 100));
  return {
    ...coupon,
    originalAmountUsdCents: amountUsdCents,
    discountAmountUsdCents: amountUsdCents - discountedAmount,
    amountUsdCents: discountedAmount
  };
}

async function loadRedemption(db: Pick<DbClient, "query">, userId: string, code: CheckoutCouponCode, forUpdate = false) {
  const result = await db.query<RedemptionRow>(
    `select redemption.status,
            redemption.crypto_payment_intent_id::text as crypto_payment_intent_id,
            intent.status as intent_status,
            (
              intent.status in ('cancelled', 'failed')
              or (intent.status = 'expired' and intent.expires_at <= now() - interval '7 days')
            ) as reservation_released
     from checkout_coupon_redemptions redemption
     join crypto_payment_intents intent on intent.id = redemption.crypto_payment_intent_id
     where redemption.user_id = $1 and redemption.coupon_code = $2
     ${forUpdate ? "for update of redemption" : ""}`,
    [userId, code]
  );
  return result.rows[0] ?? null;
}

function assertRedemptionAvailable(row: RedemptionRow | null, intentId?: string) {
  if (!row || row.crypto_payment_intent_id === intentId) return;
  if (row.status === "redeemed" || ["paid", "refunded"].includes(row.intent_status)) {
    throw new ApiError(409, "VALIDATION_ERROR", "This coupon code has already been used.");
  }
  if (!row.reservation_released) {
    throw new ApiError(409, "VALIDATION_ERROR", "This coupon code is attached to an active order.");
  }
}

export async function validateCheckoutCoupon(
  db: Pick<DbClient, "query">,
  userId: string,
  value: string
) {
  const coupon = getCheckoutCoupon(value);
  assertRedemptionAvailable(await loadRedemption(db, userId, coupon.code));
  return coupon;
}

export async function reserveCheckoutCoupon(
  db: Pick<DbClient, "query">,
  userId: string,
  value: string,
  intentId: string
) {
  const coupon = getCheckoutCoupon(value);
  const existing = await loadRedemption(db, userId, coupon.code, true);
  assertRedemptionAvailable(existing, intentId);
  if (existing?.crypto_payment_intent_id === intentId) return coupon;

  if (existing) {
    await db.query(
      `update checkout_coupon_redemptions
       set crypto_payment_intent_id = $3,
           status = 'reserved',
           reserved_at = now(),
           redeemed_at = null
       where user_id = $1 and coupon_code = $2`,
      [userId, coupon.code, intentId]
    );
  } else {
    await db.query(
      `insert into checkout_coupon_redemptions (
         user_id, coupon_code, crypto_payment_intent_id, status
       ) values ($1, $2, $3, 'reserved')`,
      [userId, coupon.code, intentId]
    );
  }
  return coupon;
}

export async function redeemCheckoutCouponForIntent(db: Pick<DbClient, "query">, intentId: string) {
  await db.query(
    `update checkout_coupon_redemptions
     set status = 'redeemed', redeemed_at = coalesce(redeemed_at, now())
     where crypto_payment_intent_id = $1 and status = 'reserved'`,
    [intentId]
  );
}
