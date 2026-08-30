import { requestApi } from './apiClient';

export const CRUUSH_PLUS_CHANGED_EVENT = 'cruush-plus-changed';

export type CruushBadge = 'founder' | 'lifetime_founder';

export type CruushPlusPlanId =
  | 'plus_weekly'
  | 'plus_monthly'
  | 'plus_3_month'
  | 'plus_6_month'
  | 'plus_annual'
  | 'founder_annual'
  | 'lifetime_founder';

export type CruushPlusPlan = {
  id: CruushPlusPlanId;
  name: string;
  description: string;
  amountCents: number;
  currency: 'USD';
  interval: 'week' | 'month' | '3_months' | '6_months' | 'year' | 'lifetime';
  durationMonths?: number;
  durationDays?: number;
  supplyLimit?: number;
  supplyRemaining: number | null;
  isFounder: boolean;
  isLifetime: boolean;
  badgeKeys: CruushBadge[];
};

/** 'fake' is the local test processor; 'verotel' is live card processing. */
export type BillingProcessor = 'fake' | 'verotel';

export type BillingPlansResponse = {
  processor: BillingProcessor;
  testCheckout: boolean;
  testWarning: string | null;
  currency: 'USD';
  plans: CruushPlusPlan[];
};

export type BillingStatus = {
  cruushPlus: boolean;
  expiresAt: string | null;
  badges: CruushBadge[];
  processor: BillingProcessor;
  testCheckout: boolean;
};

export type CheckoutSession = {
  id: string;
  userId: string;
  planId: CruushPlusPlanId;
  plan: CruushPlusPlan;
  processor: BillingProcessor;
  status: 'pending' | 'completed' | 'cancelled' | 'failed';
  testMode: boolean;
  amountCents: number;
  currency: string;
  createdAt: string | null;
  expiresAt: string | null;
  completedAt: string | null;
  testWarning: string | null;
  /**
   * Present only for a live processor. The hosted order page the buyer must be
   * sent to. Absent on a test session, which is completed in-app instead.
   */
  orderUrl?: string;
};

export type CheckoutCompletion = {
  cruushPlus: boolean;
  expiresAt: string | null;
  badges: CruushBadge[];
  testMode: boolean;
};

export async function getBillingPlans() {
  return requestApi<BillingPlansResponse>('/api/billing/plans');
}

export async function getMyBillingStatus() {
  return requestApi<BillingStatus>('/api/billing/me');
}

export async function createCheckoutSession(planId: CruushPlusPlanId) {
  return requestApi<CheckoutSession>('/api/billing/checkout-sessions', {
    method: 'POST',
    body: JSON.stringify({ planId }),
  });
}

export async function getCheckoutSession(sessionId: string) {
  return requestApi<CheckoutSession>(`/api/billing/checkout-sessions/${sessionId}`);
}

export async function completeTestCheckoutSession(sessionId: string) {
  return requestApi<CheckoutCompletion>(`/api/billing/checkout-sessions/${sessionId}/complete-test`, {
    method: 'POST',
  });
}

/**
 * Starts a cruush+ purchase and hands back what the caller should do next.
 *
 * On a live processor the buyer must leave cruush for the processor's hosted
 * order page, so this returns `redirect` with that URL. On the local test
 * processor there is nowhere to go and the caller completes the session in-app.
 *
 * This deliberately does not navigate on its own. Where the buyer is sent from,
 * and what they see on the way, is a product decision.
 */
export async function startCheckout(planId: CruushPlusPlanId): Promise<
  | { action: 'redirect'; session: CheckoutSession; orderUrl: string }
  | { action: 'complete_in_app'; session: CheckoutSession }
> {
  const session = await createCheckoutSession(planId);

  if (session.orderUrl) {
    return { action: 'redirect', session, orderUrl: session.orderUrl };
  }

  return { action: 'complete_in_app', session };
}
