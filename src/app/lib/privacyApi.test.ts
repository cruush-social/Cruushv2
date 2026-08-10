import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMyGhostPulseSettings, getMyPrivacySettings, saveMyGhostPulseSettings, saveMyPrivacySettings } from './privacyApi';

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
      animationHint: 'FADE_LAST_MINUTE',
      baseMode: 'GHOST',
      ghostModeEnabled: true,
      ghostRadiusMeters: 1609,
      ghostRadiusLabel: '1 mi',
      ghostRotationExpiresAtMs: 1786316460000,
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

  it('loads the server Ghost rotation deadline for the signed-in heart', async () => {
    await expect(getMyPrivacySettings()).resolves.toEqual(expect.objectContaining({
      animationHint: 'FADE_LAST_MINUTE',
      ghostRotationExpiresAtMs: 1786316460000,
    }));
  });

  it('loads and saves the Ghost Mode heartbeat preference through its dedicated route', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: vi.fn().mockResolvedValue(JSON.stringify({ data: { enabled: true } })),
    } as unknown as Response);

    await expect(getMyGhostPulseSettings()).resolves.toEqual({ enabled: true });
    expect(fetch).toHaveBeenLastCalledWith('/api/privacy/ghost-pulse', expect.any(Object));

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: vi.fn().mockResolvedValue(JSON.stringify({ data: { enabled: false } })),
    } as unknown as Response);

    await expect(saveMyGhostPulseSettings(false)).resolves.toEqual({ enabled: false });
    expect(fetch).toHaveBeenLastCalledWith('/api/privacy/ghost-pulse', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ enabled: false }),
    }));
  });
});
