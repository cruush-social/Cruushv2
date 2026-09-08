import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  completeTestCheckoutSession,
  createCheckoutSession,
  getBillingPlans,
  getMyBillingStatus,
  getCheckoutSession,
} from './billingApi';

describe('billingApi', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue(JSON.stringify({ data: {} })),
    }));
  });

  it('loads cruush+ plans and the current billing status', async () => {
    await getBillingPlans();
    await getMyBillingStatus();

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/billing/plans', expect.objectContaining({
      credentials: 'include',
    }));
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/billing/me', expect.objectContaining({
      credentials: 'include',
    }));
  });

  it('creates, loads, and completes fake checkout sessions', async () => {
    await createCheckoutSession('lifetime_founder');
    await getCheckoutSession('7d39c89e-e816-4684-82e0-b48e3f8127d4');
    await completeTestCheckoutSession('7d39c89e-e816-4684-82e0-b48e3f8127d4');

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/billing/checkout-sessions', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ planId: 'lifetime_founder' }),
      credentials: 'include',
    }));
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/billing/checkout-sessions/7d39c89e-e816-4684-82e0-b48e3f8127d4', expect.objectContaining({
      credentials: 'include',
    }));
    expect(fetch).toHaveBeenNthCalledWith(3, '/api/billing/checkout-sessions/7d39c89e-e816-4684-82e0-b48e3f8127d4/complete-test', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
    }));
  });
});
