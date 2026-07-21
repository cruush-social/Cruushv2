import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createReport } from './reportApi';

describe('reportApi', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue(JSON.stringify({
        data: {
          id: 'report-1',
          status: 'open',
          createdAt: '2026-07-11T12:00:00.000Z',
        },
      })),
    }));
  });

  it.each([
    ['profile', 'targetUserId'],
    ['user', 'targetUserId'],
    ['post', 'postId'],
    ['conversation', 'conversationId'],
    ['message', 'messageId'],
  ] as const)('sends a %s report with the correct target field', async (targetType, targetField) => {
    await createReport({
      targetType,
      targetId: '11111111-1111-4111-8111-111111111111',
      reason: 'harassment',
      details: '  Repeated unwanted contact.  ',
    });

    const expectedPayload = {
      targetType,
      [targetField]: '11111111-1111-4111-8111-111111111111',
      reason: 'harassment',
      details: 'Repeated unwanted contact.',
    };

    expect(fetch).toHaveBeenCalledWith('/api/reports', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify(expectedPayload),
      credentials: 'include',
    }));
  });

  it('sends a profile-photo report with both owner and photo context', async () => {
    await createReport({
      targetType: 'profile_photo',
      targetId: '/api/media/assets/photo-1/display',
      targetUserId: '11111111-1111-4111-8111-111111111111',
      reason: 'non_consensual_imagery',
    });

    expect(fetch).toHaveBeenCalledWith('/api/reports', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        targetType: 'profile_photo',
        profilePhotoUrl: '/api/media/assets/photo-1/display',
        targetUserId: '11111111-1111-4111-8111-111111111111',
        reason: 'non_consensual_imagery',
        details: '',
      }),
    }));
  });
});
