import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearPersistentNoticeFlag, hasPersistentNoticeFlag, setPersistentNoticeFlag } from './persistentNotice';

const { requestApi } = vi.hoisted(() => ({ requestApi: vi.fn() }));

vi.mock('./apiClient', () => ({ requestApi }));

const { markNoticeDismissed, resolveNoticeDismissal } = await import('./userNoticesApi');

const KEY = 'cruush:test-notice-seen';

describe('one-time notice resolution', () => {
  beforeEach(() => {
    requestApi.mockReset();
    clearPersistentNoticeFlag(KEY);
  });

  afterEach(() => {
    clearPersistentNoticeFlag(KEY);
  });

  it('answers from this device without calling the API once the flag is set', async () => {
    setPersistentNoticeFlag(KEY);

    await expect(resolveNoticeDismissal(KEY)).resolves.toEqual({ dismissed: true, offline: false });
    expect(requestApi).not.toHaveBeenCalled();
  });

  it('mirrors a server dismissal onto the device so the API is asked once', async () => {
    requestApi.mockResolvedValue({ dismissed: true, dismissedAt: '2026-08-06T00:00:00.000Z' });

    await expect(resolveNoticeDismissal(KEY)).resolves.toEqual({ dismissed: true, offline: false });
    expect(hasPersistentNoticeFlag(KEY)).toBe(true);
  });

  it('reports not-dismissed without setting the flag when the notice is still pending', async () => {
    requestApi.mockResolvedValue({ dismissed: false, dismissedAt: null });

    await expect(resolveNoticeDismissal(KEY)).resolves.toEqual({ dismissed: false, offline: false });
    expect(hasPersistentNoticeFlag(KEY)).toBe(false);
  });

  // Regression: every first-run popup ended its lookup in `.catch(() => setOpen(false))`,
  // so a single 4xx/5xx from the notices API silently suppressed the popup instead of
  // failing that one request. A notice never seen on this device now still shows.
  it('shows a never-seen notice when the API is unreachable', async () => {
    requestApi.mockRejectedValue(new Error('notices API down'));

    await expect(resolveNoticeDismissal(KEY)).resolves.toEqual({ dismissed: false, offline: true });
  });

  it('still trusts the device flag while the API is unreachable', async () => {
    requestApi.mockRejectedValue(new Error('notices API down'));
    setPersistentNoticeFlag(KEY);

    await expect(resolveNoticeDismissal(KEY)).resolves.toEqual({ dismissed: true, offline: false });
  });
});

describe('recording a dismissal', () => {
  beforeEach(() => {
    requestApi.mockReset();
    requestApi.mockResolvedValue({ dismissed: true, dismissedAt: null });
    clearPersistentNoticeFlag(KEY);
  });

  afterEach(() => {
    clearPersistentNoticeFlag(KEY);
  });

  it('writes the device flag and the server dismissal', () => {
    markNoticeDismissed(KEY);

    expect(hasPersistentNoticeFlag(KEY)).toBe(true);
    expect(requestApi).toHaveBeenCalledWith(
      `/api/users/me/notices/${encodeURIComponent(KEY)}`,
      { method: 'PUT' }
    );
  });

  it('keeps the notice one-time on this device without calling an API known to be down', () => {
    markNoticeDismissed(KEY, { offline: true });

    expect(hasPersistentNoticeFlag(KEY)).toBe(true);
    expect(requestApi).not.toHaveBeenCalled();
  });

  it('does not reject when the dismissal write fails', () => {
    requestApi.mockRejectedValue(new Error('notices API down'));

    expect(() => markNoticeDismissed(KEY)).not.toThrow();
    expect(hasPersistentNoticeFlag(KEY)).toBe(true);
  });
});
