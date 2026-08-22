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

// A notice whose key carries a version needs every earlier key to count as
// dismissed, otherwise shipping a new version replays it for everyone who
// already dismissed the old one.
export async function resolveAnyNoticeDismissal(
  noticeKeys: string[],
): Promise<ResolvedNoticeDismissal> {
  const [primaryKey, ...legacyKeys] = noticeKeys;
  const primary = await resolveNoticeDismissal(primaryKey);

  if (primary.dismissed || legacyKeys.length === 0) {
    return primary;
  }

  const legacy = await Promise.all(legacyKeys.map((key) => resolveNoticeDismissal(key)));
  const dismissed = legacy.some((notice) => notice.dismissed);

  if (dismissed) {
    // Carry the old dismissal forward so later loads settle on the current key.
    markNoticeDismissed(primaryKey, { offline: primary.offline });
  }

  return {
    dismissed,
    offline: primary.offline && legacy.every((notice) => notice.offline),
  };
}
