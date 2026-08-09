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
  offline: boolean;
};

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

export function markNoticeDismissed(noticeKey: string, options: { offline?: boolean } = {}) {
  setPersistentNoticeFlag(noticeKey);

  if (!options.offline) {
    void dismissUserNotice(noticeKey).catch(() => {});
  }
}
