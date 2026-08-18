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

const { getMyProfile } = vi.hoisted(() => ({
  getMyProfile: vi.fn(),
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

vi.mock('../lib/profileApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/profileApi')>('../lib/profileApi');

  return {
    ...actual,
    getMyProfile,
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
    getMyProfile.mockReset();
    getMyProfile.mockResolvedValue({ location: null });
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
    fireEvent.click((await screen.findAllByRole('button', { name: /River/ }))[0]);

    expect(openConversationOrInbox).toHaveBeenCalledWith(expect.any(Function), '53fd68d7-24fc-4cff-8cd7-a97ec0cadf97');
  });

  it('shows messageable mutuals on Public when no public profiles are available', async () => {
    getConversations.mockResolvedValue([]);
    getNearbyUsers.mockResolvedValue([]);
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

    expect(await screen.findByText('River')).toBeInTheDocument();
    expect(screen.queryByText('Showing messageable mutuals because no public profiles are available.')).not.toBeInTheDocument();
    expect(screen.queryByText('No nearby people are available right now.')).not.toBeInTheDocument();
  });

  it('filters public message options by seeking and sorts by online recency or distance', async () => {
    getConversations.mockResolvedValue([]);
    getMyCruushActivity.mockResolvedValue({ mutual: [] });
    getMyProfile.mockResolvedValue({
      location: {
        fuzzy_lat: 40.75,
        fuzzy_lng: -73.98,
        lat: 40.75,
        lng: -73.98,
      },
    });
    getNearbyUsers.mockResolvedValue([
      {
        id: 'river',
        name: 'River',
        display_name: 'River',
        age: 29,
        pronouns: 'they/them',
        lat: 40.71,
        lng: -73.92,
        lastActive: '2h ago',
        distance: '0.2 mi',
        lookingFor: ['dates'],
        vibes: [],
        position: [],
        role: [],
        hostingTravel: [],
        photo: null,
        relationship: { mutualCruush: false, canMessage: true },
      },
      {
        id: 'alex',
        name: 'Alex',
        display_name: 'Alex',
        age: 31,
        pronouns: 'he/him',
        lat: 40.72,
        lng: -73.93,
        lastActive: 'now',
        distance: '5 mi',
        lookingFor: ['right now'],
        vibes: [],
        position: [],
        role: [],
        hostingTravel: [],
        photo: null,
        relationship: { mutualCruush: false, canMessage: true },
      },
      {
        id: 'blake',
        name: 'Blake',
        display_name: 'Blake',
        age: 27,
        pronouns: 'he/him',
        lat: 40.73,
        lng: -73.94,
        lastActive: '5m ago',
        distance: '1 mi',
        lookingFor: ['right now'],
        vibes: [],
        position: [],
        role: [],
        hostingTravel: [],
        photo: null,
        relationship: { mutualCruush: false, canMessage: true },
      },
    ]);

    render(
      <MemoryRouter>
        <DirectMessages />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'New message' }));
    fireEvent.click(screen.getByRole('button', { name: /^Start chat with someone/ }));

    await waitFor(() => {
      expect(getNearbyUsers).toHaveBeenCalledWith(
        { lat: 40.75, lng: -73.98 },
        undefined,
        { limit: 500 },
      );
    });

    expect(await screen.findByText('Alex')).toBeInTheDocument();
    expect(screen.getByText('River')).toBeInTheDocument();
    expect(screen.getByText('Sort people by')).toBeInTheDocument();
    expect(screen.queryByText('Choose the order people appear in.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sort by Recently online' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Sort by Distance' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Seeking filters' }));
    const lookingTab = await screen.findByRole('tab', { name: 'Looking' });
    fireEvent.mouseDown(lookingTab);
    fireEvent.mouseUp(lookingTab);
    fireEvent.click(lookingTab);
    fireEvent.click(screen.getByRole('button', { name: 'Looking For' }));
    fireEvent.click(await screen.findByRole('option', { name: 'right now' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(screen.queryByText('River')).not.toBeInTheDocument();
    const alex = screen.getByText('Alex');
    const blake = screen.getByText('Blake');
    expect(alex.compareDocumentPosition(blake) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Distance/ }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sort by Recently online' })).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByRole('button', { name: 'Sort by Distance' })).toHaveAttribute('aria-pressed', 'true');
      const sortedBlake = screen.getByText('Blake');
      const sortedAlex = screen.getByText('Alex');
      expect(sortedBlake.compareDocumentPosition(sortedAlex) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });
});
