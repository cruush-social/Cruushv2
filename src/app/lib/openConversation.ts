import type { NavigateFunction } from 'react-router';
import { ApiClientError } from './apiClient';
import { openDirectConversation } from './messagesApi';
import { notifyMutualCruushRequired } from './cruushNotifications';

export type ConversationRouteOrigin = 'profile';

export async function openConversationOrInbox(
  navigate: NavigateFunction,
  otherUserId: string,
  onOpenConversation?: (conversationId: string) => void,
  routeOrigin?: ConversationRouteOrigin,
) {
  try {
    const conversation = await openDirectConversation(otherUserId);
    if (onOpenConversation) {
      onOpenConversation(conversation.id);
    } else if (routeOrigin) {
      navigate(`/chat/${conversation.id}`, {
        state: { conversationOrigin: routeOrigin },
      });
    } else {
      navigate(`/chat/${conversation.id}`);
    }
    return conversation.id;
  } catch (error) {
    if (error instanceof ApiClientError && error.code === 'MUTUAL_CRUUSH_REQUIRED') {
      notifyMutualCruushRequired();
      return null;
    }

    console.error('Error opening conversation:', error);
    if (!onOpenConversation) {
      navigate('/messages');
    }
    return null;
  }
}
