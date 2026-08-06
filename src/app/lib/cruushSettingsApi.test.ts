import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveCruushMatchSettings } from './cruushSettingsApi';

describe('cruushSettingsApi', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue(JSON.stringify({
        data: {
          messageVisibility: 'mutual_cruushes',
          nsfwMessageVisibility: 'public',
          nsfwSendVisibility: 'mutual_cruushes',
          updatedAt: '2026-07-31T05:57:00.000Z',
        },
      })),
    }));
  });

  it('does not send read-only cruush match settings fields when saving', async () => {
    const loadedSettings = {
      messageVisibility: 'mutual_cruushes',
      nsfwMessageVisibility: 'public',
      nsfwSendVisibility: 'mutual_cruushes',
      updatedAt: '2026-07-31T05:57:00.000Z',
    } as const;

    await saveCruushMatchSettings(loadedSettings);

    expect(fetch).toHaveBeenCalledWith('/api/cruush/settings', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({
        messageVisibility: 'mutual_cruushes',
        nsfwMessageVisibility: 'public',
        nsfwSendVisibility: 'mutual_cruushes',
      }),
    }));
  });
});
