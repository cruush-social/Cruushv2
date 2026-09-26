import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import InAppShareDialog from './InAppShareDialog';

const { createMessage, getConversations } = vi.hoisted(() => ({
  createMessage: vi.fn(),
  getConversations: vi.fn(),
}));

vi.mock('../lib/messagesApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/messagesApi')>('../lib/messagesApi');
  return { ...actual, createMessage, getConversations };
});

describe('InAppShareDialog', () => {
  beforeEach(() => {
    createMessage.mockReset().mockResolvedValue({});
    getConversations.mockReset().mockResolvedValue([{
      id: 'conversation-1',
      kind: 'dm',
      user: {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'River',
        pronouns: 'they/them',
        photo: null,
      },
      distance: '1 mi',
      updatedAt: '2026-09-26T12:00:00.000Z',
      lastMessage: 'Hey',
      unreadCount: 0,
      pinned: false,
      mutual: true,
      tags: [],
    }]);
  });

  it('uses the shared profile-card treatment for recipients and sends from the card', async () => {
    render(
      <InAppShareDialog
        open
        onOpenChange={vi.fn()}
        share={{ kind: 'profile', id: '11111111-1111-4111-8111-111111111111', label: 'Jordan' }}
      />,
    );

    const recipient = await screen.findByRole('button', { name: 'Send to River' });
    expect(recipient).toHaveClass('cruush-user-activity-capsule');
    expect(screen.getByTestId('share-recipient-profile-card')).toBe(recipient);

    fireEvent.click(recipient);
    await waitFor(() => expect(createMessage).toHaveBeenCalledWith(
      'conversation-1',
      '[[cruush:profile:11111111-1111-4111-8111-111111111111]] Jordan',
    ));
    expect(await screen.findByRole('status')).toHaveTextContent('Sent to River.');
  });
});
