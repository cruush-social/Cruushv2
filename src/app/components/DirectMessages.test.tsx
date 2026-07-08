import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DirectMessages from './DirectMessages';

const { createGroupConversation, getConversations, getMyCruushActivity } = vi.hoisted(() => ({
  createGroupConversation: vi.fn(),
  getConversations: vi.fn(),
  getMyCruushActivity: vi.fn(),
}));

vi.mock('../lib/messagesApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/messagesApi')>('../lib/messagesApi');

  return {
    ...actual,
    createGroupConversation,
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

describe('DirectMessages', () => {
  beforeEach(() => {
    createGroupConversation.mockReset();
    getConversations.mockReset();
    getMyCruushActivity.mockReset();
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

    fireEvent.click(await screen.findByRole('button', { name: 'Create group chat' }));
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
});
