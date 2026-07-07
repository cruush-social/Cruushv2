import { requestApi } from './apiClient';

export type ConversationThread = {
  id: string;
  kind: 'dm' | 'group';
  user: {
    id: string;
    name: string;
    pronouns: string;
    photo: string | null;
  };
  distance: string;
  updatedAt: string;
  lastMessage: string;
  unreadCount: number;
  pinned: boolean;
  muted?: boolean;
  mutual?: boolean;
  membersLabel?: string;
  currentUserRole?: 'owner' | 'admin' | 'member';
  disappearingTimer?: 'off' | '24h' | '7d' | '30d';
  closed?: boolean;
  tags: string[];
};

export type ChatMessageRecord = {
  id: string;
  author: 'self' | 'other' | 'system';
  content: string;
  timestamp: string;
  expiresAt?: string;
  attachments?: MessageAttachment[];
};

export type RemoteChatMessage = {
  id: string;
  userId: string;
  content: string;
  timestamp: string;
  expiresAt?: string;
  attachments?: MessageAttachment[];
};

export type MessageAttachment = {
  id: string;
  url: string;
  mediaType: string;
  mimeType: string;
};

export type ConversationMessagesPayload = {
  conversation: ConversationThread;
  messages: RemoteChatMessage[];
};

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
  disappearingTimer?: 'off' | '24h' | '7d' | '30d';
}) {
  return requestApi<ConversationThread>('/api/conversations/groups', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateGroupConversation(conversationId: string, input: {
  title?: string;
  disappearingTimer?: 'off' | '24h' | '7d' | '30d';
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

export function promoteGroupAdmin(conversationId: string, userId: string) {
  return requestApi<void>(`/api/conversations/groups/${conversationId}/admins`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
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

export function createMessagePhoto(conversationId: string, photo: File, content = '') {
  const body = new FormData();
  body.set('conversationId', conversationId);
  body.set('content', content);
  body.set('photo', photo);

  return requestApi<RemoteChatMessage>('/api/messages/photos', {
    method: 'POST',
    body,
  });
}
