import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAppMeta, type AppMetaPayload } from './metaApi';

const metaPayload: AppMetaPayload = {
  service: 'cruush-server',
  auth: 'session-cookie',
  storage: 'postgres',
  migratedFromSupabase: true,
  alphaTest: {
    enabled: true,
    active: true,
    endsAt: '2026-08-07T07:59:00.000Z',
    ended: false,
  },
  betaAccess: {
    enabled: false,
    center: {
      lat: 40.70982,
      lng: -73.92256,
    },
    radiusMiles: 15,
    venueName: '70 Scott Ave',
  },
  photoUploads: {
    profilePhotos: true,
    messagePhotos: true,
  },
};

describe('metaApi', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses the raw deployed /api/meta response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(JSON.stringify(metaPayload)),
    }));

    await expect(getAppMeta()).resolves.toEqual(metaPayload);
    expect(fetch).toHaveBeenCalledWith('/api/meta', expect.objectContaining({
      credentials: 'include',
    }));
  });

  it('also accepts a wrapped meta response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(JSON.stringify({ data: metaPayload })),
    }));

    await expect(getAppMeta()).resolves.toEqual(metaPayload);
  });
});
