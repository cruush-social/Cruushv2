import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMutualCruushMap, sendCruush } from './cruushApi';

const { decryptDisplayLocationToken } = vi.hoisted(() => ({
  decryptDisplayLocationToken: vi.fn(),
}));

vi.mock('./displayLocationTokens', () => ({
  decryptDisplayLocationToken,
}));

describe('cruushApi', () => {
  beforeEach(() => {
    decryptDisplayLocationToken.mockReset();
    decryptDisplayLocationToken.mockResolvedValue({
      displayMode: 'GHOST',
      latitude: 40.714,
      longitude: -74.004,
      animationHint: 'FADE_LAST_MINUTE',
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue(JSON.stringify({
        data: {
          id: 'cruush-1',
          fromUserId: 'me',
          toUserId: 'user-1',
          createdAt: '2026-06-01T12:00:00.000Z',
          mutual: false,
        },
      })),
    }));
  });

  it('drops non-http snapshot photos before sending a cruush', async () => {
    await sendCruush('53fd68d7-24fc-4cff-8cd7-a97ec0cadf97', {
      name: 'jay',
      pronouns: 'he/him',
      photo: 'data:image/svg+xml,%3Csvg%3E%3C/svg%3E',
    });

    expect(fetch).toHaveBeenCalledWith('/api/cruush', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        toUserId: '53fd68d7-24fc-4cff-8cd7-a97ec0cadf97',
        targetUser: {
          name: 'jay',
          pronouns: 'he/him',
          photo: null,
        },
      }),
    }));
  });

  it('rejects non-profile ids before sending a cruush request', async () => {
    await expect(sendCruush('demo-nyc-connected-pin', {
      name: 'Mika Demo',
    })).rejects.toThrow('This profile cannot receive cruushes.');

    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps the server Ghost rotation deadline on mutual map profiles', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: vi.fn().mockResolvedValue(JSON.stringify({
        data: {
          mapEpochMs: 1780520000000,
          profiles: [{
            profileToken: '53fd68d7-24fc-4cff-8cd7-a97ec0cadf97',
            matchId: 'match-1',
            createdAt: '2026-08-09T16:00:00.000Z',
            locked: false,
            user: {
              id: '53fd68d7-24fc-4cff-8cd7-a97ec0cadf97',
              name: 'River',
              pronouns: 'they/them',
              photo: null,
            },
            mutualCrowds: [],
            vibes: [],
            distanceLabel: 'Nearby',
            lastActive: 'Now',
            canMessage: true,
            canRevealPreciseLocation: false,
            displayLocationToken: { tokenId: 'display-token' },
            displayExpiresAtMs: 1780520060000,
            animationHint: 'FADE_LAST_MINUTE',
            ghostRotationExpiresAtMs: 1780520030000,
          }],
        },
      })),
    } as Response);

    const profiles = await getMutualCruushMap();

    expect(profiles[0]).toMatchObject({
      animationHint: 'FADE_LAST_MINUTE',
      ghostRotationExpiresAtMs: 1780520030000,
      coordinates: {
        lat: 40.714,
        lng: -74.004,
        precision: 'fuzzy',
      },
    });
  });
});
