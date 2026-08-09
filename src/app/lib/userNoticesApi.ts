import { requestApi } from './apiClient';
import { hasPersistentNoticeFlag, setPersistentNoticeFlag } from './persistentNotice';

export type UserNoticeState = {
  dismissed: boolean;
  dismissedAt: string | null;
};

export function getUserNoticeDismissal(noticeKey: string) {
  return requestApi<UserNoticeState>(`/api/users/me/notices/${encodeURIComponent(noticeKey)}`);
}

export function dismissUserNotice(noticeKey: string) {
  return requestApi<UserNoticeState>(`/api/users/me/notices/${encodeURIComponent(noticeKey)}`, {
    method: 'PUT',
  });
}

export type ResolvedNoticeDismissal = {
  dismissed: boolean;
  // True when the notice API could not be reached and the answer came from this device
  // alone. Callers that write a server-side dismissal should skip it in that case.
  offline: boolean;
};

/**
 * Decides whether a one-time notice has already been seen.
 *
 * Every first-run popup used to inline this, and every one of them ended in
 * `.catch(() => setOpen(false))` - so any 4xx/5xx from the notices API silently
 * suppressed the popup forever rather than for that request. A first-run notice the
 * user has never seen on this device is shown when the server cannot be asked; the
 * local flag is set at the same time, so it stays one-time per device either way.
 */
export async function resolveNoticeDismissal(noticeKey: string): Promise<ResolvedNoticeDismissal> {
  if (hasPersistentNoticeFlag(noticeKey)) {
    return { dismissed: true, offline: false };
  }

  try {
    const notice = await getUserNoticeDismissal(noticeKey);

    if (notice.dismissed) {
      setPersistentNoticeFlag(noticeKey);
    }

    return { dismissed: notice.dismissed, offline: false };
  } catch {
    return { dismissed: false, offline: true };
  }
}

/**
 * Records a dismissal on this device and, when reachable, on the server. Safe to call
 * while the notices API is down: the device flag still keeps the notice one-time.
 */
export function markNoticeDismissed(noticeKey: string, options: { offline?: boolean } = {}) {
  setPersistentNoticeFlag(noticeKey);

  if (options.offline) {
    return;
  }

  void dismissUserNotice(noticeKey).catch(() => {});
}
