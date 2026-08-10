import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as privacyApi from './privacyApi';

const { saveMyPrivacySettings } = privacyApi;

describe('privacyApi', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue(JSON.stringify({
        data: {
          baseMode: 'GHOST',
          animationHint: 'FADE_LAST_MINUTE',
          ghostModeEnabled: true,
          ghostRadiusMeters: 1609,
          ghostRadiusLabel: '1 mi',
          ghostRotationExpiresAtMs: 1786316460000,
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

  it('does not expose V2 Ghost heartbeat or deadline APIs in v1.2', () => {
    expect(privacyApi.DEFAULT_PRIVACY_SETTINGS).not.toHaveProperty('animationHint');
    expect(privacyApi).not.toHaveProperty('DEFAULT_GHOST_PULSE_SETTINGS');
    expect(privacyApi).not.toHaveProperty('getMyGhostPulseSettings');
    expect(privacyApi).not.toHaveProperty('saveMyGhostPulseSettings');
  });
});
