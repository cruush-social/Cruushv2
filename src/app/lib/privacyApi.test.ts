import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as privacyApi from './privacyApi';

const { getMyPrivacySettings, saveMyPrivacySettings } = privacyApi;

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
      ghostRotationExpiresAtMs: 1786316460000,
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

  it('keeps the server-authoritative Ghost rotation deadline on reads', async () => {
    await expect(getMyPrivacySettings()).resolves.toEqual(expect.objectContaining({
      baseMode: 'GHOST',
      ghostRotationExpiresAtMs: 1786316460000,
    }));
  });

  it('exposes the ghost pin countdown as its own opt-out setting', () => {
    // The countdown is a per-profile setting rather than a field on the privacy
    // policy, so the policy payload still carries no animation state.
    expect(privacyApi.DEFAULT_PRIVACY_SETTINGS).not.toHaveProperty('animationHint');
    expect(privacyApi.DEFAULT_GHOST_PULSE_SETTINGS).toEqual({ enabled: true });
    expect(typeof privacyApi.getMyGhostPulseSettings).toBe('function');
    expect(typeof privacyApi.saveMyGhostPulseSettings).toBe('function');
  });
});
