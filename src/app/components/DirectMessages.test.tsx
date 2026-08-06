import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DirectMessages from './DirectMessages';

const { createGroupConversation, deleteConversationForEveryone, getConversations, getMyCruushActivity } = vi.hoisted(() => ({
  createGroupConversation: vi.fn(),
  deleteConversationForEveryone: vi.fn(),
  getConversations: vi.fn(),
  getMyCruushActivity: vi.fn(),
}));

const { getNearbyUsers } = vi.hoisted(() => ({
  getNearbyUsers: vi.fn(),
}));

const { openConversationOrInbox } = vi.hoisted(() => ({
  openConversationOrInbox: vi.fn(),
}));

vi.mock('../lib/messagesApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/messagesApi')>('../lib/messagesApi');

  return {
    ...actual,
    createGroupConversation,
    deleteConversationForEveryone,
    getConversations,
  };
});

vi.mock('../lib/cruushApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/cruushApi')>('../lib/cruushApi');

  return {
    ...actual,
    getMyCruushActivity,
  };
});

vi.mock('../lib/usersApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/usersApi')>('../lib/usersApi');

  return {
    ...actual,
    getNearbyUsers,
  };
});

vi.mock('../lib/openConversation', () => ({
  openConversationOrInbox,
}));

describe('DirectMessages', () => {
  beforeEach(() => {
    createGroupConversation.mockReset();
    deleteConversationForEveryone.mockReset();
    getConversations.mockReset();
    getMyCruushActivity.mockReset();
    getNearbyUsers.mockReset();
    openConversationOrInbox.mockReset();
  });

  it('shows an empty live inbox without preview conversations', async () => {
    getConversations.mockResolvedValue([]);

    render(
      <MemoryRouter>
        <DirectMessages />
      </MemoryRouter>,
    );

    expect(await screen.findByText('No messages yet.')).toBeInTheDocument();
    expect(screen.queryByText('Preview mode')).not.toBeInTheDocument();
    expect(screen.queryByText('Alex')).not.toBeInTheDocument();
  });

  it('shows a real error state when conversations fail to load', async () => {
    getConversations.mockRejectedValue(new Error('Messages unavailable'));

    render(
      <MemoryRouter>
        <DirectMessages />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('Messages unavailable')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByText('Preview mode')).not.toBeInTheDocument();
  });

  it('shows group admin role and 1h disappearing timer metadata', async () => {
    getConversations.mockResolvedValue([{
      id: 'group-1',
      kind: 'group',
      user: {
        id: 'group-1',
        name: 'Beta crew',
        pronouns: '',
        photo: null,
      },
      distance: 'Nearby',
      updatedAt: new Date().toISOString(),
      lastMessage: 'see you there',
      unreadCount: 0,
      pinned: false,
      muted: false,
      membersLabel: '3 people',
      currentUserRole: 'owner',
      disappearingTimer: '1h',
      closed: false,
      tags: [],
    }]);

    render(
      <MemoryRouter>
        <DirectMessages />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Beta crew')).toBeInTheDocument();
    expect(screen.getByText('owner')).toBeInTheDocument();
    expect(screen.getByText('1h')).toBeInTheDocument();
  });

  it('deletes a conversation for everyone from the inbox list', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    getConversations.mockResolvedValue([{
      id: 'conversation-1',
      kind: 'dm',
      user: {
        id: 'user-2',
        name: 'River',
        pronouns: 'they/them',
        photo: null,
      },
      distance: 'Nearby',
      updatedAt: new Date().toISOString(),
      lastMessage: 'meet by the door',
      unreadCount: 0,
      pinned: false,
      muted: false,
      mutual: true,
      tags: [],
    }]);
    deleteConversationForEveryone.mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <DirectMessages />
      </MemoryRouter>,
    );

    expect(await screen.findByText('River')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete River chat for everyone' }));

    expect(confirmSpy).toHaveBeenCalledWith('Delete chat with River for everyone? This removes the chat and its messages for all participants.');
    await waitFor(() => {
      expect(deleteConversationForEveryone).toHaveBeenCalledWith('conversation-1');
    });
    expect(screen.queryByText('River')).not.toBeInTheDocument();
    expect(await screen.findByText('No messages yet.')).toBeInTheDocument();

    confirmSpy.mockRestore();
  });

  it('creates a group from mutual cruushes only', async () => {
    getConversations.mockResolvedValue([]);
    getMyCruushActivity.mockResolvedValue({
      mutual: [{
        id: 'mutual-row-1',
        matchId: 'match-1',
        createdAt: '2026-04-29T12:00:00.000Z',
        locked: false,
        user: {
          id: '53fd68d7-24fc-4cff-8cd7-a97ec0cadf97',
          name: 'River',
          pronouns: 'they/them',
          photo: null,
        },
        mutualCrowds: [],
        vibes: [],
        distance: 'Nearby',
        lastActive: 'now',
        canMessage: true,
        canRevealPreciseLocation: false,
        coordinates: null,
      }],
    });
    createGroupConversation.mockResolvedValue({
      id: 'group-1',
      kind: 'group',
      user: {
        id: 'group-1',
        name: 'Beta crew',
        pronouns: '',
        photo: null,
      },
      distance: 'Nearby',
      updatedAt: new Date().toISOString(),
      lastMessage: '',
      unreadCount: 0,
      pinned: false,
      tags: [],
    });

    render(
      <MemoryRouter>
        <DirectMessages />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'New message' }));
    fireEvent.click(screen.getByRole('button', { name: /^Create group message/ }));
    expect(await screen.findByText('River')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Group name'), {
      target: { value: 'Beta crew' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /River/ }));
    fireEvent.change(screen.getByLabelText('Disappearing timer'), {
      target: { value: '1h' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create group' }));

    await waitFor(() => {
      expect(createGroupConversation).toHaveBeenCalledWith({
        title: 'Beta crew',
        memberIds: ['53fd68d7-24fc-4cff-8cd7-a97ec0cadf97'],
        disappearingTimer: '1h',
      });
    });
  });

  it('starts a direct chat with a mutual from the plus menu', async () => {
    getConversations.mockResolvedValue([]);
    getNearbyUsers.mockResolvedValue([{
      id: '53fd68d7-24fc-4cff-8cd7-a97ec0cadf97',
      name: 'River',
      display_name: 'River',
      age: 29,
      pronouns: 'they/them',
      lat: 40.71,
      lng: -73.92,
      lastActive: 'now',
      distance: 'Nearby',
      lookingFor: [],
      vibes: [],
      position: [],
      role: [],
      hostingTravel: [],
      photo: null,
      relationship: {
        mutualCruush: false,
        canMessage: true,
      },
    }]);
    getMyCruushActivity.mockResolvedValue({
      mutual: [{
        id: 'mutual-row-1',
        matchId: 'match-1',
        createdAt: '2026-04-29T12:00:00.000Z',
        locked: false,
        user: {
          id: '53fd68d7-24fc-4cff-8cd7-a97ec0cadf97',
          name: 'River',
          pronouns: 'they/them',
          photo: null,
        },
        mutualCrowds: [],
        vibes: [],
        distance: 'Nearby',
        lastActive: 'now',
        canMessage: true,
        canRevealPreciseLocation: false,
        coordinates: null,
      }],
    });

    render(
      <MemoryRouter>
        <DirectMessages />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'New message' }));
    fireEvent.click(screen.getByRole('button', { name: /^Start chat with someone/ }));
    fireEvent.click(await screen.findByRole('button', { name: /River/ }));

    expect(openConversationOrInbox).toHaveBeenCalledWith(expect.any(Function), '53fd68d7-24fc-4cff-8cd7-a97ec0cadf97');
  });
});
