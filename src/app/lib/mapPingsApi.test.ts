import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMapPingStatus, sendMapPing } from './mapPingsApi';

describe('mapPingsApi', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        allowance: {
          limit: 1,
          used: 0,
          remaining: 1,
          nextEligibleAt: null,
        },
        activePing: null,
        receivedPings: [],
      },
    }), { status: 200 })));
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => '7f1e349d-9645-47b8-8b7f-b05da21f999a'),
    });
  });

  it('loads the caller-authorized Ping status', async () => {
    await getMapPingStatus();

    expect(fetch).toHaveBeenCalledWith('/api/map-pings/status', expect.objectContaining({
      credentials: 'include',
    }));
  });

  it('sends an allowed radius with a fresh idempotency key', async () => {
    await sendMapPing(15);

    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('/api/map-pings', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        radiusMiles: 15,
        idempotencyKey: '7f1e349d-9645-47b8-8b7f-b05da21f999a',
      }),
      credentials: 'include',
    }));
  });

  it('reuses a caller-provided idempotency key for a delivery retry', async () => {
    const idempotencyKey = '10000000-0000-4000-8000-000000000001';
    vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({ data: {} }), { status: 200 }));

    await sendMapPing(3, idempotencyKey);
    await sendMapPing(3, idempotencyKey);

    expect(crypto.randomUUID).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenNthCalledWith(1, '/api/map-pings', expect.objectContaining({
      body: JSON.stringify({
        radiusMiles: 3,
        idempotencyKey,
      }),
    }));
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/map-pings', expect.objectContaining({
      body: JSON.stringify({
        radiusMiles: 3,
        idempotencyKey,
      }),
    }));
  });
});
