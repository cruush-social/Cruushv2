import { requestApi } from './apiClient';

export type BlockedUser = {
  userId: string;
  displayName: string;
  photo: string | null;
  createdAt: string;
};

export function blockUser(userId: string) {
  return requestApi<{ userId: string; blocked: true }>('/api/blocks', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

export function unblockUser(userId: string) {
  return requestApi<void>(`/api/blocks/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  });
}

export function getBlockedUsers() {
  return requestApi<{ blockedUsers: BlockedUser[] }>('/api/blocks');
}
