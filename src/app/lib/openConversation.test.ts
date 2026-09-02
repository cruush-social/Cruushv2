import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from './apiClient';
import { openConversationOrInbox } from './openConversation';

const { openDirectConversation } = vi.hoisted(() => ({
  openDirectConversation: vi.fn(),
}));

const { toastInfo } = vi.hoisted(() => ({
  toastInfo: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    info: toastInfo,
  },
}));

vi.mock('./messagesApi', () => ({
  openDirectConversation,
}));

describe('openConversationOrInbox', () => {
  beforeEach(() => {
    openDirectConversation.mockReset();
    toastInfo.mockReset();
  });

  it('uses a toast instead of a browser alert when a mutual is required', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const navigate = vi.fn();

    openDirectConversation.mockRejectedValue(new ApiClientError(
      403,
      'MUTUAL_CRUUSH_REQUIRED',
      'You can message after a mutual.',
    ));

    await expect(openConversationOrInbox(navigate, 'user-1')).resolves.toBeNull();

    expect(toastInfo).toHaveBeenCalledWith('You can message after a mutual.');
    expect(alertSpy).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });

  it('marks a conversation opened from a profile with its return origin', async () => {
    const navigate = vi.fn();
    openDirectConversation.mockResolvedValue({ id: 'conversation-1' });

    await expect(
      openConversationOrInbox(navigate, 'user-1', undefined, 'profile'),
    ).resolves.toBe('conversation-1');

    expect(navigate).toHaveBeenCalledWith('/chat/conversation-1', {
      state: { conversationOrigin: 'profile' },
    });
  });
});
