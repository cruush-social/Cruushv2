import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import InAppShareDialog from './InAppShareDialog';

const { createMessage, getConversations, openDirectConversation } = vi.hoisted(() => ({
  createMessage: vi.fn(),
  getConversations: vi.fn(),
  openDirectConversation: vi.fn(),
}));

const { getMyCruushActivity } = vi.hoisted(() => ({
  getMyCruushActivity: vi.fn(),
}));

vi.mock('../lib/messagesApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/messagesApi')>('../lib/messagesApi');
  return { ...actual, createMessage, getConversations, openDirectConversation };
});

vi.mock('../lib/cruushApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/cruushApi')>('../lib/cruushApi');
  return { ...actual, getMyCruushActivity };
});

describe('InAppShareDialog', () => {
  beforeEach(() => {
    createMessage.mockReset().mockResolvedValue({});
    openDirectConversation.mockReset();
    getMyCruushActivity.mockReset().mockResolvedValue({ mutual: [] });
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

  it('sends a Club DM card to multiple selected messageable mutual cruushes', async () => {
    getMyCruushActivity.mockResolvedValue({
      mutual: [{
        user: { id: '22222222-2222-4222-8222-222222222222', name: 'River', pronouns: 'they/them', photo: null },
        canMessage: true,
        mutualCrowds: [],
        vibes: [],
      }, {
        user: { id: '33333333-3333-4333-8333-333333333333', name: 'Ash', pronouns: 'he/him', photo: null },
        canMessage: true,
        mutualCrowds: [],
        vibes: [],
      }, {
        user: { id: '44444444-4444-4444-8444-444444444444', name: 'Grey', pronouns: 'she/her', photo: null },
        canMessage: false,
        mutualCrowds: [],
        vibes: [],
      }],
    });
    openDirectConversation
      .mockResolvedValueOnce({ id: 'conversation-river' })
      .mockResolvedValueOnce({ id: 'conversation-ash' });

    render(
      <InAppShareDialog
        open
        onOpenChange={vi.fn()}
        share={{ kind: 'club', id: '11111111-1111-4111-8111-111111111111', label: 'Brooklyn techno' }}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Select River' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select Ash' }));
    expect(screen.queryByRole('button', { name: 'Select Grey' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Send Club' }));

    await waitFor(() => expect(openDirectConversation).toHaveBeenCalledTimes(2));
    expect(openDirectConversation).toHaveBeenNthCalledWith(1, '22222222-2222-4222-8222-222222222222');
    expect(openDirectConversation).toHaveBeenNthCalledWith(2, '33333333-3333-4333-8333-333333333333');
    expect(createMessage).toHaveBeenNthCalledWith(1, 'conversation-river', '[[cruush:club:11111111-1111-4111-8111-111111111111]] Brooklyn techno');
    expect(createMessage).toHaveBeenNthCalledWith(2, 'conversation-ash', '[[cruush:club:11111111-1111-4111-8111-111111111111]] Brooklyn techno');
  });

  it('sends a Club card to an existing Group chat', async () => {
    getConversations.mockResolvedValue([{
      id: 'group-conversation-1',
      kind: 'group',
      user: {
        id: 'group-conversation-1',
        name: 'Weekend crew',
        pronouns: '',
        photo: null,
      },
      distance: 'Nearby',
      updatedAt: '2026-10-02T12:00:00.000Z',
      lastMessage: 'See you there',
      unreadCount: 0,
      pinned: false,
      mutual: false,
      tags: [],
      closed: false,
    }, {
      id: 'current-club-conversation',
      kind: 'group',
      clubId: '11111111-1111-4111-8111-111111111111',
      user: {
        id: 'current-club-conversation',
        name: 'Brooklyn techno',
        pronouns: '',
        photo: null,
      },
      distance: 'Nearby',
      updatedAt: '2026-10-02T12:00:00.000Z',
      lastMessage: 'Current Club',
      unreadCount: 0,
      pinned: false,
      mutual: false,
      tags: [],
      closed: false,
    }]);

    render(
      <InAppShareDialog
        open
        onOpenChange={vi.fn()}
        share={{ kind: 'club', id: '11111111-1111-4111-8111-111111111111', label: 'Brooklyn techno' }}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Send to Weekend crew' }));
    expect(screen.queryByRole('button', { name: 'Send to Brooklyn techno' })).not.toBeInTheDocument();

    await waitFor(() => expect(createMessage).toHaveBeenCalledWith(
      'group-conversation-1',
      '[[cruush:club:11111111-1111-4111-8111-111111111111]] Brooklyn techno',
    ));
  });
});
