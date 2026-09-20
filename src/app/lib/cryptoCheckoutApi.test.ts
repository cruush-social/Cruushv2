import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cancelCryptoPaymentIntent,
  createCryptoPaymentIntent,
  createPulsePaymentIntent,
  getBitcoinSendingEligibility,
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

  it('sends the chosen app alongside the Bitcoin rail for cruush+ and Pulse orders', async () => {
    await createCryptoPaymentIntent({
      planId: 'plus_annual',
      idempotencyKey: 'checkout-client-2',
      rail: 'btc_bitcoin',
      sendingApp: 'paypal',
    });
    await createPulsePaymentIntent({
      packId: 'ping_10',
      idempotencyKey: 'checkout-client-3',
      rail: 'btc_bitcoin',
      sendingApp: 'cash_app',
    });

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/crypto/payment-intents', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        planId: 'plus_annual',
        idempotencyKey: 'checkout-client-2',
        rail: 'btc_bitcoin',
        sendingApp: 'paypal',
      }),
    }));
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/crypto/ping-pack-intents', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        packId: 'ping_10',
        idempotencyKey: 'checkout-client-3',
        rail: 'btc_bitcoin',
        sendingApp: 'cash_app',
      }),
    }));
  });

  it('reads the per-app Bitcoin sending eligibility with the member session', async () => {
    await getBitcoinSendingEligibility();

    expect(fetch).toHaveBeenCalledWith('/api/crypto/bitcoin-sending-eligibility', expect.objectContaining({
      credentials: 'include',
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
