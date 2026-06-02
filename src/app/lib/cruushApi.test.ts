import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendCruush } from './cruushApi';

describe('cruushApi', () => {
  beforeEach(() => {
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
});
