import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearConversationForEveryone,
  closeGroupConversation,
  createMessagePhoto,
  demoteGroupAdmin,
  removeGroupMember,
  setConversationDisappearingTimer,
  viewMessageAttachment,
} from './messagesApi';

describe('messagesApi', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: vi.fn().mockResolvedValue(JSON.stringify({ data: { accepted: true } })),
      blob: vi.fn().mockResolvedValue(new Blob(['photo'], { type: 'image/png' })),
    }));
  });

  it('calls the timer and clear-for-everyone conversation endpoints', async () => {
    await setConversationDisappearingTimer('conversation-1', '1h');
    await clearConversationForEveryone('conversation-1');

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/conversations/conversation-1/disappearing-timer', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ disappearingTimer: '1h' }),
    }));
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/conversations/conversation-1/clear-for-everyone', expect.objectContaining({
      method: 'POST',
    }));
  });

  it('calls the missing group admin helper endpoints', async () => {
    await removeGroupMember('conversation-1', 'user-2');
    await demoteGroupAdmin('conversation-1', 'user-2');
    await closeGroupConversation('conversation-1');

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/conversations/groups/conversation-1/members/user-2', expect.objectContaining({
      method: 'DELETE',
    }));
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/conversations/groups/conversation-1/admins/user-2', expect.objectContaining({
      method: 'DELETE',
    }));
    expect(fetch).toHaveBeenNthCalledWith(3, '/api/conversations/groups/conversation-1/close', expect.objectContaining({
      method: 'POST',
    }));
  });

  it('includes viewOnce when uploading a message photo', async () => {
    const file = new File(['image-bytes'], 'photo.png', { type: 'image/png' });

    await createMessagePhoto('conversation-1', file, 'caption', { viewOnce: true });

    const body = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]?.body as FormData;
    expect(fetch).toHaveBeenCalledWith('/api/messages/photos', expect.objectContaining({
      method: 'POST',
      body: expect.any(FormData),
    }));
    expect(body.get('conversationId')).toBe('conversation-1');
    expect(body.get('content')).toBe('caption');
    expect(body.get('viewOnce')).toBe('true');
  });

  it('opens view-once attachments through the binary view endpoint', async () => {
    const objectUrl = 'blob:message-photo';
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn().mockReturnValue(objectUrl),
    });
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'image/png' }),
      blob: vi.fn().mockResolvedValue(new Blob(['photo'], { type: 'image/png' })),
    } as unknown as Response);

    await expect(viewMessageAttachment('message-1', 'media-1')).resolves.toBe(objectUrl);

    expect(fetch).toHaveBeenCalledWith('/api/messages/message-1/attachments/media-1/view', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
    }));
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
  });
});
