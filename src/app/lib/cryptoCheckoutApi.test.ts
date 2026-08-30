import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCryptoPaymentIntent,
  getCryptoPaymentIntent,
  getCryptoProcessorStatus,
} from './cryptoCheckoutApi';

describe('cryptoCheckoutApi', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue(JSON.stringify({ data: {} })),
    }));
  });

  it('loads authenticated processor and intent status', async () => {
    await getCryptoProcessorStatus();
    await getCryptoPaymentIntent('00000000-0000-4000-8000-000000000010');

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/crypto/status', expect.objectContaining({
      credentials: 'include',
    }));
    expect(fetch).toHaveBeenNthCalledWith(
      2,
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
});
