import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cancelCryptoPaymentIntent,
  createCryptoPaymentIntent,
  getCurrentCryptoPaymentIntent,
  getCryptoPaymentIntent,
  getCryptoProcessorStatus,
} from './cryptoCheckoutApi';

describe('cryptoCheckoutApi', () => {
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

  it('loads authenticated processor and intent status', async () => {
    await getCryptoProcessorStatus();
    await getCurrentCryptoPaymentIntent();
    await getCryptoPaymentIntent('00000000-0000-4000-8000-000000000010');

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/crypto/status', expect.objectContaining({
      credentials: 'include',
    }));
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/crypto/payment-intents/current',
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      '/api/crypto/payment-intents/00000000-0000-4000-8000-000000000010',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('creates one account-linked intent without client pricing, asset, network, or voucher fields', async () => {
    await createCryptoPaymentIntent({
      planId: 'plus_monthly',
      idempotencyKey: 'checkout-client-1',
    });

    expect(fetch).toHaveBeenCalledWith('/api/crypto/payment-intents', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({
        planId: 'plus_monthly',
        idempotencyKey: 'checkout-client-1',
      }),
    }));
  });

  it('cancels one member-owned intent through its dedicated action', async () => {
    await cancelCryptoPaymentIntent('00000000-0000-4000-8000-000000000010');

    expect(fetch).toHaveBeenCalledWith(
      '/api/crypto/payment-intents/00000000-0000-4000-8000-000000000010/cancel',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      }),
    );
  });
});
