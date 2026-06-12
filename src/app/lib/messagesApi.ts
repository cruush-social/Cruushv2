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
  tags: string[];
};

export type ChatMessageRecord = {
  id: string;
  author: 'self' | 'other' | 'system';
  content: string;
  timestamp: string;
};

export type RemoteChatMessage = {
  id: string;
  userId: string;
  content: string;
  timestamp: string;
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
