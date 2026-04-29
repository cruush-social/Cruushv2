import type { NavigateFunction } from 'react-router';
import { openDirectConversation } from './messagesApi';

export async function openConversationOrInbox(navigate: NavigateFunction, otherUserId: string) {
  try {
    const conversation = await openDirectConversation(otherUserId);
    navigate(`/chat/${conversation.id}`);
    return conversation.id;
  } catch (error) {
    console.error('Error opening conversation:', error);
    navigate('/messages');
    return null;
  }
}
