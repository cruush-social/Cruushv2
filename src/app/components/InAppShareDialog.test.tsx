import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
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

const { openConversationOrInbox } = vi.hoisted(() => ({
  openConversationOrInbox: vi.fn(),
}));

vi.mock('../lib/messagesApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/messagesApi')>('../lib/messagesApi');
  return { ...actual, createMessage, getConversations, openDirectConversation };
});

vi.mock('../lib/cruushApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/cruushApi')>('../lib/cruushApi');
  return { ...actual, getMyCruushActivity };
});

vi.mock('../lib/openConversation', () => ({ openConversationOrInbox }));

describe('InAppShareDialog', () => {
  beforeEach(() => {
    createMessage.mockReset().mockResolvedValue({});
    openDirectConversation.mockReset();
    openConversationOrInbox.mockReset().mockResolvedValue('older-dm-conversation');
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

  it('opens the selected chat from a Profile share without sending the profile', async () => {
    getConversations.mockResolvedValue([{
      id: 'older-dm-conversation',
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
    }, {
      id: 'newer-group-conversation',
      kind: 'group',
      user: {
        id: 'newer-group-conversation',
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
      id: 'club-conversation',
      kind: 'group',
      clubId: '33333333-3333-4333-8333-333333333333',
      user: {
        id: 'club-conversation',
        name: 'Brooklyn techno',
        pronouns: '',
        photo: null,
      },
      distance: 'Nearby',
      updatedAt: '2026-10-01T12:00:00.000Z',
      lastMessage: 'Meet at midnight',
      unreadCount: 0,
      pinned: false,
      mutual: false,
      tags: [],
      closed: false,
    }]);
    const onOpenChange = vi.fn();
    render(
      <MemoryRouter>
        <InAppShareDialog
          open
          onOpenChange={onOpenChange}
          share={{ kind: 'profile', id: '11111111-1111-4111-8111-111111111111', label: 'Jordan' }}
        />
      </MemoryRouter>,
    );

    const recipients = await screen.findAllByTestId('share-recipient-profile-card');
    expect(recipients.map((recipient) => recipient.getAttribute('aria-label'))).toEqual([
      'Open Weekend crew chat',
      'Open Brooklyn techno chat',
      'Open messages with River',
    ]);
    const recipient = screen.getByRole('button', { name: 'Open messages with River' });
    expect(recipient).toHaveClass('cruush-user-activity-capsule');
    expect(within(recipient).getByTestId('profile-action-trio')).toBeInTheDocument();

    fireEvent.click(recipient);
    await waitFor(() => expect(openConversationOrInbox).toHaveBeenCalledWith(
      expect.any(Function),
      '22222222-2222-4222-8222-222222222222',
    ));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(createMessage).not.toHaveBeenCalled();
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
      <MemoryRouter>
        <InAppShareDialog
          open
          onOpenChange={vi.fn()}
          share={{ kind: 'club', id: '11111111-1111-4111-8111-111111111111', label: 'Brooklyn techno' }}
        />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Select River' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select Ash' }));
    expect(screen.queryByRole('button', { name: 'Select Grey' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Send Coven' }));

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
    }, {
      id: 'other-club-conversation',
      kind: 'group',
      clubId: '22222222-2222-4222-8222-222222222222',
      user: {
        id: 'other-club-conversation',
        name: 'Queens queer cinema',
        pronouns: '',
        photo: null,
      },
      distance: 'Nearby',
      updatedAt: '2026-10-01T12:00:00.000Z',
      lastMessage: 'Film starts at eight',
      unreadCount: 0,
      pinned: false,
      mutual: false,
      tags: [],
      closed: false,
    }]);

    render(
      <MemoryRouter>
        <InAppShareDialog
          open
          onOpenChange={vi.fn()}
          share={{ kind: 'club', id: '11111111-1111-4111-8111-111111111111', label: 'Brooklyn techno' }}
        />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Send to Weekend crew' }));
    expect(screen.queryByRole('button', { name: 'Send to Brooklyn techno' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send to Queens queer cinema' })).toBeInTheDocument();

    await waitFor(() => expect(createMessage).toHaveBeenCalledWith(
      'group-conversation-1',
      '[[cruush:club:11111111-1111-4111-8111-111111111111]] Brooklyn techno',
    ));
  });
});
