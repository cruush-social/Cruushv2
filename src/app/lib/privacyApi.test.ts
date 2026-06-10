import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveMyPrivacySettings } from './privacyApi';

describe('privacyApi', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue(JSON.stringify({
        data: {
          baseMode: 'GHOST',
          ghostModeEnabled: true,
          ghostRadiusMeters: 1609,
          ghostRadiusLabel: '1 mi',
          preciseToMutualCruushes: false,
          preciseToMutualCrowds: [],
          preciseLocationVisibility: 'none',
          updatedAtMs: 1780520000000,
        },
      })),
    }));
  });

  it('does not send read-only privacy settings fields when saving', async () => {
    await saveMyPrivacySettings({
      baseMode: 'GHOST',
      ghostModeEnabled: true,
      ghostRadiusMeters: 1609,
      ghostRadiusLabel: '1 mi',
      preciseToMutualCruushes: false,
      preciseToMutualCrowds: [],
      preciseLocationVisibility: 'none',
      updatedAtMs: 1780520000000,
    });

    expect(fetch).toHaveBeenCalledWith('/api/profiles/me/privacy-settings', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({
        baseMode: 'GHOST',
        ghostModeEnabled: true,
        ghostRadiusMeters: 1609,
        preciseToMutualCruushes: false,
        preciseToMutualCrowds: [],
        preciseLocationVisibility: 'none',
      }),
    }));
  });
});
