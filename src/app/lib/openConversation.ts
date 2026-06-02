import type { NavigateFunction } from 'react-router';
import { ApiClientError } from './apiClient';
import { openDirectConversation } from './messagesApi';

export async function openConversationOrInbox(navigate: NavigateFunction, otherUserId: string) {
  try {
    const conversation = await openDirectConversation(otherUserId);
    navigate(`/chat/${conversation.id}`);
    return conversation.id;
  } catch (error) {
    if (error instanceof ApiClientError && error.code === 'MUTUAL_CRUUSH_REQUIRED') {
      alert('You can message after a mutual cruush.');
      return null;
    }

    console.error('Error opening conversation:', error);
    navigate('/messages');
    return null;
  }
}
