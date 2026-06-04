import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getNearbyUsers } from './usersApi';

const { decryptDisplayLocationToken } = vi.hoisted(() => ({
  decryptDisplayLocationToken: vi.fn(),
}));

vi.mock('./displayLocationTokens', () => ({
  decryptDisplayLocationToken,
}));

describe('usersApi', () => {
  beforeEach(() => {
    decryptDisplayLocationToken.mockReset();
    decryptDisplayLocationToken.mockResolvedValue({
      version: 1,
      subjectUserId: 'npc-02',
      viewerUserId: 'admin',
      displayMode: 'GHOST',
      latE7: 407140000,
      lonE7: -740040000,
      accuracyDisplayM: 1609,
      rotationEpoch: 1780520000000,
      subjectPolicyVersion: 1,
      relationshipGrantVersion: 0,
      expiresAtMs: 1780520060000,
      animationHint: 'FADE_LAST_MINUTE',
      renderNonce: 'render-nonce',
      latitude: 40.714,
      longitude: -74.004,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue(JSON.stringify({
        data: {
          mapEpochMs: 1780520000000,
          profiles: [],
        },
      })),
    }));
  });

  it('sends the NPC Ghost demo flag only when enabled', async () => {
    await getNearbyUsers(
      { lat: 40.7128, lng: -74.006 },
      { vibes: ['Goth'] },
      { limit: 50, npcGhostDemo: true },
    );

    const enabledPath = vi.mocked(fetch).mock.calls[0]?.[0] as string;
    const enabledParams = new URLSearchParams(enabledPath.split('?')[1]);
    expect(enabledPath.startsWith('/api/users?')).toBe(true);
    expect(enabledParams.get('lat')).toBe('40.7128');
    expect(enabledParams.get('lng')).toBe('-74.006');
    expect(enabledParams.get('limit')).toBe('50');
    expect(enabledParams.get('npcGhostDemo')).toBe('1');
    expect(enabledParams.getAll('vibes')).toEqual(['Goth']);

    await getNearbyUsers(null, undefined, { limit: 50 });

    const disabledPath = vi.mocked(fetch).mock.calls[1]?.[0] as string;
    const disabledParams = new URLSearchParams(disabledPath.split('?')[1]);
    expect(disabledPath.startsWith('/api/users?')).toBe(true);
    expect(disabledParams.get('limit')).toBe('50');
    expect(disabledParams.has('npcGhostDemo')).toBe(false);
  });

  it('maps tokenized NPC Ghost demo profiles to in-memory demo markers', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: vi.fn().mockResolvedValue(JSON.stringify({
        data: {
          mapEpochMs: 1780520000000,
          profiles: [{
            profileToken: 'npc-02',
            name: 'NPC Ghost 02',
            display_name: 'NPC Ghost 02',
            age: 26,
            pronouns: 'they/them',
            lastActive: '2m ago',
            distanceLabel: '0.2 mi',
            displayLocationToken: {
              version: 1,
              tokenId: 'token-id',
              keyId: 'key-id',
              ciphertext: 'ciphertext',
              nonce: 'nonce',
              expiresAtMs: 1780520060000,
              tokenVersion: 1,
            },
            displayExpiresAtMs: 1780520060000,
            animationHint: 'FADE_LAST_MINUTE',
            demoDisplayMode: 'NPC_GHOST_TEST',
            relationshipContext: 'PUBLIC',
            lookingFor: ['Testing'],
            vibes: ['Goth'],
            position: ['Top'],
            role: [],
            hostingTravel: [],
            photo: null,
            relationship: null,
          }],
        },
      })),
    } as Response);

    const users = await getNearbyUsers({ lat: 40.7128, lng: -74.006 });

    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      id: 'npc-02',
      lat: 40.714,
      lng: -74.004,
      displayMode: 'GHOST',
      animationHint: 'FADE_LAST_MINUTE',
      privacyRadiusMeters: 1609,
      npcGhostDemo: true,
    });
  });
});
