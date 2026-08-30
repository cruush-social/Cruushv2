import type { FastifyInstance } from "fastify";
import { ApiError } from "./errors.js";
import { getCruushPlusPlan, mapCheckoutSession, type BillingCheckoutSessionRow } from "./billing.js";
import { buildFlexPayOrderUrl } from "./verotel-flexpay.js";

/**
 * Creates a real Verotel checkout session and the order URL the buyer is sent to.
 *
 * The session row is written first so its id can be the FlexPay referenceID.
 * That is what lets the postback find the session again without trusting
 * anything the buyer could have edited on the way through.
 *
 * Nothing here grants access. Entitlement only ever comes from a verified
 * postback, handled in verotel-webhook.ts.
 */
export async function createVerotelCheckoutSession(
  app: FastifyInstance,
  userId: string,
  planId: string
) {
  const credentials = {
    shopId: app.config.VEROTEL_SHOP_ID ?? "",
    signatureKey: app.config.VEROTEL_SIGNATURE_KEY ?? ""
  };

  if (!credentials.shopId || !credentials.signatureKey) {
    throw new ApiError(503, "PROCESSOR_NOT_CONFIGURED", "Payments are not available right now.");
  }

  const plan = getCruushPlusPlan(planId);

  const row = (await app.db.query<BillingCheckoutSessionRow>(
    `insert into billing_checkout_sessions (
       user_id,
       plan_id,
       processor,
       status,
       test_mode,
       amount_cents,
       currency,
       expires_at
     )
     values ($1, $2, 'verotel', 'pending', false, $3, $4, now() + interval '30 minutes')
     returning id, user_id, plan_id, processor, status, test_mode, amount_cents, currency, created_at, expires_at, completed_at`,
    [userId, plan.id, plan.amountCents, plan.currency]
  )).rows[0];

  if (!row) {
    throw new ApiError(500, "INTERNAL_ERROR", "Unable to create checkout session.");
  }

  const session = mapCheckoutSession(row);

  const orderUrl = buildFlexPayOrderUrl({
    planId: plan.id,
    credentials,
    referenceId: session.id,
    userId
  });

  await app.db.query(
    `update billing_checkout_sessions set verotel_reference_id = $2, updated_at = now() where id = $1`,
    [session.id, session.id]
  );

  return { ...session, orderUrl };
}

/** True when both Verotel secrets are present, which is what switches cruush off the test processor. */
export function isVerotelConfigured(app: FastifyInstance) {
  return Boolean(app.config.VEROTEL_SHOP_ID && app.config.VEROTEL_SIGNATURE_KEY);
}
