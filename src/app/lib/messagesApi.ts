import { requestApi, requestApiWithUploadRetry } from './apiClient';
import { ApiClientError, getApiBaseUrl } from './apiClient';
import type { SideBadges } from './profileApi';
import type { MapPingStatus } from './mapPingsApi';
import type { DlModePhotoRelationship } from './dlMode';

export type ConversationTimer = 'off' | '1h' | '24h' | '7d' | '30d';

export type ConversationThread = {
  id: string;
  kind: 'dm' | 'group';
  user: {
    id: string;
    name: string;
    pronouns: string;
    photo: string | null;
    photoExplicit?: boolean;
    photoRelationship?: DlModePhotoRelationship;
    sideBadges?: SideBadges;
    travelling?: boolean;
    vibes?: string[];
    lastActive?: string;
  };
  distance: string;
  updatedAt: string;
  lastMessage: string;
  unreadCount: number;
  pinned: boolean;
  muted?: boolean;
  mutual?: boolean;
  canMessage?: boolean;
  membersLabel?: string;
  currentUserRole?: 'owner' | 'admin' | 'member';
  disappearingTimer?: ConversationTimer;
  closed?: boolean;
  tags: string[];
};

export type ChatMessageRecord = {
  id: string;
  userId?: string;
  author: 'self' | 'other' | 'system';
  content: string;
  timestamp: string;
  readAt?: string;
  expiresAt?: string;
  attachments?: MessageAttachment[];
  user?: MessageSender;
};

export type MessageSender = {
  id: string;
  name: string;
  pronouns: string;
  photo: string | null;
  photoExplicit?: boolean;
  photoRelationship?: DlModePhotoRelationship;
};

export type RemoteChatMessage = {
  id: string;
  userId: string;
  content: string;
  timestamp: string;
  readAt?: string;
  expiresAt?: string;
  attachments?: MessageAttachment[];
  user?: MessageSender;
};

export type PendingPhotoReview = {
  status: 'pending_review';
  assetId: string;
};

export type MessageAttachment = {
  id: string;
  url: string;
  mediaType: string;
  mimeType: string;
  viewOnce?: boolean;
  viewedAt?: string | null;
  explicit?: boolean;
  photoRelationship?: DlModePhotoRelationship;
};

export type FavoriteMessageImage = {
  id: string;
  mediaObjectId: string;
  label: string;
  url: string;
  thumbnailUrl: string;
  mediaType: string;
  mimeType: string;
  explicit: boolean;
  createdAt: string;
  updatedAt: string;
};

export type GroupMemberRecord = {
  id: string;
  name: string;
  pronouns: string;
  photo: string | null;
  photoExplicit?: boolean;
  photoRelationship?: DlModePhotoRelationship;
  role: 'owner' | 'admin' | 'member';
  joinedAt: string;
};

export type ConversationMessagesPayload = {
  conversation: ConversationThread;
  messages: RemoteChatMessage[];
};

export type InAppShare = {
  kind: 'place' | 'profile';
  id: string;
  label: string;
};

const IN_APP_SHARE_PATTERN = /^\[\[cruush:(place|profile):([0-9a-f-]{36})\]\]\s+(.+)$/i;

export function createInAppShareMessage(share: InAppShare) {
  return `[[cruush:${share.kind}:${share.id}]] ${share.label.trim()}`;
}

export function parseInAppShareMessage(content: string): InAppShare | null {
  const match = content.match(IN_APP_SHARE_PATTERN);
  return match ? { kind: match[1].toLowerCase() as InAppShare['kind'], id: match[2], label: match[3].trim() } : null;
}

export function getConversations() {
  return requestApi<ConversationThread[]>('/api/conversations');
}

export function openDirectConversation(otherUserId: string) {
  return requestApi<ConversationThread>('/api/conversations/dm', {
    method: 'POST',
    body: JSON.stringify({
      otherUserId,
    }),
  });
}

export function createGroupConversation(input: {
  title: string;
  memberIds: string[];
  disappearingTimer?: ConversationTimer;
}) {
  return requestApi<ConversationThread>('/api/conversations/groups', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateGroupConversation(conversationId: string, input: {
  title?: string;
  disappearingTimer?: ConversationTimer;
}) {
  return requestApi<ConversationThread>(`/api/conversations/groups/${conversationId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function addGroupMember(conversationId: string, userId: string) {
  return requestApi<void>(`/api/conversations/groups/${conversationId}/members`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

export function getGroupMembers(conversationId: string) {
  return requestApi<GroupMemberRecord[]>(`/api/conversations/groups/${conversationId}/members`);
}

export function removeGroupMember(conversationId: string, userId: string) {
  return requestApi<void>(`/api/conversations/groups/${conversationId}/members/${userId}`, {
    method: 'DELETE',
  });
}

export function promoteGroupAdmin(conversationId: string, userId: string) {
  return requestApi<void>(`/api/conversations/groups/${conversationId}/admins`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

export function demoteGroupAdmin(conversationId: string, userId: string) {
  return requestApi<void>(`/api/conversations/groups/${conversationId}/admins/${userId}`, {
    method: 'DELETE',
  });
}

export function closeGroupConversation(conversationId: string) {
  return requestApi<void>(`/api/conversations/groups/${conversationId}/close`, {
    method: 'POST',
  });
}

export function sendGroupPulse(
  conversationId: string,
  idempotencyKey = crypto.randomUUID(),
) {
  return requestApi<MapPingStatus>(`/api/conversations/groups/${conversationId}/pulse`, {
    method: 'POST',
    body: JSON.stringify({ idempotencyKey }),
  });
}

export function setConversationDisappearingTimer(conversationId: string, disappearingTimer: ConversationTimer) {
  return requestApi<ConversationThread>(`/api/conversations/${conversationId}/disappearing-timer`, {
    method: 'PATCH',
    body: JSON.stringify({ disappearingTimer }),
  });
}

export function clearConversationForEveryone(conversationId: string) {
  return requestApi<ConversationThread>(`/api/conversations/${conversationId}/clear-for-everyone`, {
    method: 'POST',
  });
}

export function deleteConversationForEveryone(conversationId: string) {
  return requestApi<void>(`/api/conversations/${conversationId}`, {
    method: 'DELETE',
  });
}

export function getConversationMessages(conversationId: string) {
  return requestApi<ConversationMessagesPayload>(`/api/messages/${conversationId}`);
}

export function createMessage(conversationId: string, content: string) {
  return requestApi<RemoteChatMessage>('/api/messages', {
    method: 'POST',
    body: JSON.stringify({
      conversationId,
      content,
    }),
  });
}

export function deleteMessage(messageId: string) {
  return requestApi<void>(`/api/messages/${messageId}`, {
    method: 'DELETE',
  });
}

export function createMessagePhoto(
  conversationId: string,
  photo: File,
  content = '',
  options: { viewOnce?: boolean } = {},
) {
  const body = new FormData();
  body.set('conversationId', conversationId);
  body.set('content', content);
  body.set('viewOnce', options.viewOnce ? 'true' : 'false');
  body.set('photo', photo);

  return requestApiWithUploadRetry<RemoteChatMessage | PendingPhotoReview>('/api/messages/photos', {
    method: 'POST',
    body,
  });
}

export function getFavoriteMessageImages() {
  return requestApi<{ images: FavoriteMessageImage[] }>('/api/messages/favorite-images');
}

export function uploadFavoriteMessageImage(photo: File, label = '') {
  const body = new FormData();
  body.set('photo', photo);
  body.set('label', label);

  return requestApi<FavoriteMessageImage | PendingPhotoReview>('/api/messages/favorite-images', {
    method: 'POST',
    body,
  });
}

export function removeFavoriteMessageImage(favoriteId: string) {
  return requestApi<void>(`/api/messages/favorite-images/${favoriteId}`, {
    method: 'DELETE',
  });
}

export function sendFavoriteMessageImage(
  favoriteId: string,
  input: {
    conversationId: string;
    content?: string;
    viewOnce?: boolean;
  },
) {
  return requestApi<RemoteChatMessage>(`/api/messages/favorite-images/${favoriteId}/send`, {
    method: 'POST',
    body: JSON.stringify({
      conversationId: input.conversationId,
      content: input.content ?? '',
      viewOnce: input.viewOnce ?? false,
    }),
  });
}

export async function viewMessageAttachment(messageId: string, mediaObjectId: string) {
  const response = await fetch(`${getApiBaseUrl()}/api/messages/${messageId}/attachments/${mediaObjectId}/view`, {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok) {
    let apiError: { error?: { code?: string; message?: string; details?: unknown } } = {};

    try {
      apiError = await response.json();
    } catch {
      apiError = {};
    }

    throw new ApiClientError(
      response.status,
      apiError.error?.code ?? 'INTERNAL_ERROR',
      apiError.error?.message ?? 'Request failed.',
      apiError.error?.details ?? null,
    );
  }

  return URL.createObjectURL(await response.blob());
}
