import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPingPackPaymentIntent,
  getCurrentPingPackPaymentIntent,
  getPingPacks,
} from './pingPackApi';

describe('pingPackApi', () => {
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

  it('loads the exact catalog and member current order', async () => {
    await getPingPacks();
    await getCurrentPingPackPaymentIntent();

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/billing/ping-packs', expect.objectContaining({
      credentials: 'include',
    }));
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/crypto/ping-pack-intents/current', expect.objectContaining({
      credentials: 'include',
    }));
  });

  it('creates an account-linked order without a client-controlled price', async () => {
    await createPingPackPaymentIntent({
      packId: 'ping_10',
      idempotencyKey: 'ping-pack-client-1',
      rail: 'usdc_arbitrum',
    });

    expect(fetch).toHaveBeenCalledWith('/api/crypto/ping-pack-intents', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({
        packId: 'ping_10',
        idempotencyKey: 'ping-pack-client-1',
        rail: 'usdc_arbitrum',
      }),
    }));
  });
});
