import { requestApi } from './apiClient';

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
