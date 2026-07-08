import { beforeEach, describe, expect, it, vi } from 'vitest';
import { blockUser, getBlockedUsers, unblockUser } from './blockApi';

describe('blockApi', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue(JSON.stringify({
        data: {
          userId: 'user-2',
          blocked: true,
        },
      })),
    }));
  });

  it('blocks a user through the blocks endpoint', async () => {
    await expect(blockUser('user-2')).resolves.toEqual({
      userId: 'user-2',
      blocked: true,
    });

    expect(fetch).toHaveBeenCalledWith('/api/blocks', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ userId: 'user-2' }),
      credentials: 'include',
    }));
  });

  it('unblocks a user through the encoded user-specific endpoint', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: vi.fn().mockResolvedValue(''),
    } as unknown as Response);

    await expect(unblockUser('user/2')).resolves.toBeUndefined();

    expect(fetch).toHaveBeenCalledWith('/api/blocks/user%2F2', expect.objectContaining({
      method: 'DELETE',
      credentials: 'include',
    }));
  });

  it('loads blocked users without exposing request body data', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: vi.fn().mockResolvedValue(JSON.stringify({
        data: {
          blockedUsers: [{
            userId: 'user-2',
            displayName: 'River',
            photo: null,
            createdAt: '2026-07-08T12:00:00.000Z',
          }],
        },
      })),
    } as unknown as Response);

    await expect(getBlockedUsers()).resolves.toEqual({
      blockedUsers: [{
        userId: 'user-2',
        displayName: 'River',
        photo: null,
        createdAt: '2026-07-08T12:00:00.000Z',
      }],
    });

    expect(fetch).toHaveBeenCalledWith('/api/blocks', expect.objectContaining({
      credentials: 'include',
    }));
  });
});
