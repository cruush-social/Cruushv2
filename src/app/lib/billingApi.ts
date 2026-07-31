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

export type BillingPlansResponse = {
  processor: 'fake';
  testCheckout: boolean;
  testWarning: string;
  currency: 'USD';
  plans: CruushPlusPlan[];
};

export type BillingStatus = {
  cruushPlus: boolean;
  expiresAt: string | null;
  badges: CruushBadge[];
  processor: 'fake';
  testCheckout: boolean;
};

export type CheckoutSession = {
  id: string;
  userId: string;
  planId: CruushPlusPlanId;
  plan: CruushPlusPlan;
  processor: 'fake';
  status: 'pending' | 'completed' | 'cancelled' | 'failed';
  testMode: boolean;
  amountCents: number;
  currency: string;
  createdAt: string | null;
  expiresAt: string | null;
  completedAt: string | null;
  testWarning: string | null;
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
