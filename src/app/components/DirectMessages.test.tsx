import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
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

const { decryptDisplayLocationToken } = vi.hoisted(() => ({
  decryptDisplayLocationToken: vi.fn(),
}));

const { getMyBillingStatus } = vi.hoisted(() => ({
  getMyBillingStatus: vi.fn(),
}));

const { openConversationOrInbox } = vi.hoisted(() => ({
  openConversationOrInbox: vi.fn(),
}));

const { createClub } = vi.hoisted(() => ({
  createClub: vi.fn(),
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

vi.mock('../lib/displayLocationTokens', async () => {
  const actual = await vi.importActual<typeof import('../lib/displayLocationTokens')>('../lib/displayLocationTokens');
  return { ...actual, decryptDisplayLocationToken };
});

vi.mock('../lib/billingApi', async () => ({
  ...(await vi.importActual<typeof import('../lib/billingApi')>('../lib/billingApi')),
  getMyBillingStatus,
}));

vi.mock('../lib/openConversation', () => ({
  openConversationOrInbox,
}));

vi.mock('../lib/clubsApi', async () => ({
  ...(await vi.importActual<typeof import('../lib/clubsApi')>('../lib/clubsApi')),
  createClub,
}));

describe('DirectMessages', () => {
  beforeEach(() => {
    createGroupConversation.mockReset();
    deleteConversationForEveryone.mockReset();
    getConversations.mockReset();
    getMyCruushActivity.mockReset();
    getNearbyUsers.mockReset();
    getMyProfile.mockReset();
    decryptDisplayLocationToken.mockReset();
    getMyProfile.mockResolvedValue({ location: null });
    getMyBillingStatus.mockReset().mockResolvedValue({ cruushPlus: true });
    openConversationOrInbox.mockReset();
    createClub.mockReset();
  });

  it('browses Clubs without a tag and creates an owner-only Club before choosing cruushes', async () => {
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
          badges: ['founder'],
          vibes: ['Night owl'],
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
    createClub.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      title: 'Brooklyn techno',
      summary: 'A Club for local dancers.',
      tags: ['techno', 'leather'],
      currentUserRole: 'owner',
      conversationId: '44444444-4444-4444-8444-444444444444',
      memberCount: 1,
      joinRequestStatus: 'member',
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: vi.fn().mockResolvedValue(JSON.stringify({ data: [] })),
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      render(
        <MemoryRouter initialEntries={['/messages']}>
          <Routes>
            <Route path="/messages" element={<DirectMessages />} />
            <Route path="/chat/:conversationId" element={<div>Created Club chat</div>} />
          </Routes>
        </MemoryRouter>,
      );

      fireEvent.click(await screen.findByRole('tab', { name: 'Clubs' }));
      fireEvent.click(await screen.findByRole('tab', { name: 'Browse Clubs' }));
      expect(screen.queryByRole('heading', { name: 'Browse Clubs' })).not.toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledWith('/api/clubs', expect.objectContaining({ credentials: 'include' }));
      fireEvent.click(screen.getByRole('button', { name: 'New message' }));
      fireEvent.click(screen.getByRole('button', { name: /^Create Club/ }));

      expect(await screen.findByRole('heading', { name: 'New Club' })).toBeInTheDocument();
      const clubProfileCard = screen.getByTestId('club-mutual-53fd68d7-24fc-4cff-8cd7-a97ec0cadf97');
      expect(clubProfileCard).toHaveClass('bg-black/72', 'hover:bg-black/86', 'min-h-[7.5rem]', 'content-center');
      expect(clubProfileCard).toHaveAttribute('aria-pressed', 'false');
      expect(within(clubProfileCard).getByText('founder')).toBeInTheDocument();
      expect(within(clubProfileCard).getByText('Night owl')).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('Club name'), { target: { value: 'Brooklyn techno' } });
      fireEvent.change(screen.getByLabelText('Short description'), { target: { value: 'A Club for local dancers.' } });
      fireEvent.change(screen.getByLabelText('Club tags'), { target: { value: '#Techno' } });
      fireEvent.keyDown(screen.getByLabelText('Club tags'), { key: 'Enter' });
      fireEvent.change(screen.getByLabelText('Club tags'), { target: { value: '#Leather' } });
      fireEvent.keyDown(screen.getByLabelText('Club tags'), { key: 'Enter' });
      const clubComposer = screen.getByRole('heading', { name: 'New Club' }).closest('.fixed');
      const createButton = within(clubComposer as HTMLElement).getByRole('button', { name: 'Create Club' });
      const cruushSearch = within(clubComposer as HTMLElement).getByLabelText('Search cruushes for Club');
      expect(createButton.compareDocumentPosition(cruushSearch) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      fireEvent.click(createButton);

      await waitFor(() => expect(createClub).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Brooklyn techno',
        summary: 'A Club for local dancers.',
        tags: ['techno', 'leather'],
        memberIds: [],
        visibilityRules: expect.any(Object),
      })));
      expect(screen.getByText('Created Club chat')).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps full-width message controls clear of the fixed bug reporter', async () => {
    getConversations.mockResolvedValue([]);

    render(
      <MemoryRouter>
        <DirectMessages />
      </MemoryRouter>,
    );

    expect(await screen.findByText('No messages yet.')).toBeInTheDocument();
    expect(screen.getByTestId('direct-messages-header')).not.toHaveClass('px-4');
    expect(screen.getByTestId('direct-messages-header-content')).toHaveClass('max-w-2xl', 'px-4');
    const slot = screen.getByTestId('direct-messages-bug-button-slot');
    expect(slot.parentElement?.lastElementChild).toBe(slot);
    expect(screen.getByRole('button', { name: 'Message settings' }).getBoundingClientRect().right)
      .toBeLessThanOrEqual(slot.getBoundingClientRect().left);
    expect(screen.getByTestId('direct-messages-header-row')).not.toContainElement(
      screen.getByPlaceholderText('Search people, threads, vibes'),
    );
  });

  it('opens Message settings as the shared-header settings page', async () => {
    getConversations.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={['/messages']}>
        <Routes>
          <Route path="/messages" element={<DirectMessages />} />
          <Route path="/cruush/settings" element={<div>Message settings route</div>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Message settings' }));
    expect(screen.getByText('Message settings route')).toBeInTheDocument();
  });

  it('shows an empty live inbox without preview conversations', async () => {
    getConversations.mockResolvedValue([]);

    render(
      <MemoryRouter>
        <DirectMessages />
      </MemoryRouter>,
    );

    expect(await screen.findByText('No messages yet.')).toBeInTheDocument();
    expect(screen.getByTestId('messages-empty-card')).toHaveAttribute('data-slot', 'card');
    expect(screen.getByTestId('messages-empty-card')).toHaveClass('bg-card/70');
    expect(screen.getByTestId('messages-empty-card')).not.toHaveClass('border-dashed');
    expect(screen.getByTestId('direct-messages-root')).toHaveClass('h-[100dvh]', 'overflow-hidden');
    expect(screen.getByTestId('direct-messages-root')).not.toHaveClass('pb-[calc(7rem+env(safe-area-inset-bottom))]');
    expect(screen.queryByText('Preview mode')).not.toBeInTheDocument();
    expect(screen.queryByText('Alex')).not.toBeInTheDocument();
  });

  it('searches Clubs by tag from the Clubs tab and opens a result', async () => {
    getConversations.mockResolvedValue([]);
    getMyCruushActivity.mockResolvedValue({ mutual: [], sent: [] });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: vi.fn().mockResolvedValue(JSON.stringify({
        data: [{
          id: '22222222-2222-4222-8222-222222222222',
          title: 'Brooklyn techno',
          summary: 'A Club for local dancers.',
          tags: ['leather', 'techno'],
          currentUserRole: null,
          conversationId: null,
          pendingJoinRequestCount: 0,
          memberCount: 8,
          lastActiveAt: '2026-10-02T12:00:00.000Z',
        }],
      })),
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      render(
        <MemoryRouter initialEntries={['/messages']}>
          <Routes>
            <Route path="/messages" element={<DirectMessages />} />
            <Route path="/clubs/:clubId" element={<div>Club detail route</div>} />
          </Routes>
        </MemoryRouter>,
      );

      fireEvent.click(await screen.findByRole('tab', { name: 'Clubs' }));
      fireEvent.click(await screen.findByRole('tab', { name: 'Browse Clubs' }));
      const search = screen.getByPlaceholderText('Search Clubs by name, description, or tag');
      fireEvent.change(search, { target: { value: 'techno' } });

      expect(await screen.findByText('Brooklyn techno')).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledWith('/api/clubs?sort=recent&q=techno&tags=techno', expect.objectContaining({ credentials: 'include' }));
      const openButton = screen.getAllByRole('button', { name: 'Open Brooklyn techno Club' })
        .find((button) => button.classList.contains('size-10')) as HTMLElement;
      expect(openButton).toHaveStyle({ background: 'var(--cruush-gradient)' });
      expect(openButton).toHaveClass('size-10', 'rounded-full');
      expect(openButton).not.toHaveTextContent('Open');
      fireEvent.click(screen.getByTestId('club-directory-card'));
      expect(screen.getByText('Club detail route')).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('shows joined Club message and request previews and opens its chat directly', async () => {
    getConversations.mockResolvedValue([{
      id: '44444444-4444-4444-8444-444444444444',
      kind: 'group',
      clubId: '22222222-2222-4222-8222-222222222222',
      user: { id: '44444444-4444-4444-8444-444444444444', name: 'Brooklyn techno', pronouns: '', photo: null },
      distance: 'Nearby',
      updatedAt: '2026-10-02T12:00:00.000Z',
      lastMessage: 'Meet at 10 tonight',
      unreadCount: 0,
      pinned: false,
      currentUserRole: 'owner',
      tags: ['techno'],
    }]);
    getMyCruushActivity.mockResolvedValue({ mutual: [], sent: [] });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: vi.fn().mockResolvedValue(JSON.stringify({
        data: [{
          id: '22222222-2222-4222-8222-222222222222',
          title: 'Brooklyn techno',
          summary: 'A Club for local dancers.',
          tags: ['techno'],
          currentUserRole: 'owner',
          conversationId: '44444444-4444-4444-8444-444444444444',
          pendingJoinRequestCount: 2,
          memberCount: 8,
          lastActiveAt: '2026-10-02T12:00:00.000Z',
        }],
      })),
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      render(
        <MemoryRouter initialEntries={['/messages']}>
          <Routes>
            <Route path="/messages" element={<DirectMessages />} />
            <Route path="/chat/:conversationId" element={<div>Joined Club chat</div>} />
          </Routes>
        </MemoryRouter>,
      );

      fireEvent.click(await screen.findByRole('tab', { name: 'Clubs' }));
      expect(await screen.findByRole('tab', { name: 'My Clubs' })).toHaveAttribute('data-state', 'active');
      expect(screen.queryByRole('heading', { name: 'My Clubs' })).not.toBeInTheDocument();
      expect(screen.getByText('Meet at 10 tonight')).toBeInTheDocument();
      expect(screen.getByText('2 new requests')).toBeInTheDocument();
      expect(screen.getAllByText('8 members')).toHaveLength(1);
      fireEvent.click(screen.getByTestId('club-directory-card'));
      expect(screen.getByText('Joined Club chat')).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps an owned Club visible in Browse Clubs', async () => {
    getConversations.mockResolvedValue([]);
    getMyCruushActivity.mockResolvedValue({ mutual: [], sent: [] });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: vi.fn().mockResolvedValue(JSON.stringify({
        data: [{
          id: '22222222-2222-4222-8222-222222222222',
          title: 'Kink NYC',
          summary: 'For kinky queers in NYC',
          tags: ['kink', 'nyc'],
          currentUserRole: 'owner',
          conversationId: '44444444-4444-4444-8444-444444444444',
          pendingJoinRequestCount: 0,
          memberCount: 1,
          lastActiveAt: '2026-10-07T03:14:16.217Z',
        }],
      })),
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      render(
        <MemoryRouter initialEntries={['/messages']}>
          <Routes>
            <Route path="/messages" element={<DirectMessages />} />
          </Routes>
        </MemoryRouter>,
      );

      fireEvent.click(await screen.findByRole('tab', { name: 'Clubs' }));
      fireEvent.click(await screen.findByRole('tab', { name: 'Browse Clubs' }));

      expect(await screen.findByText('Kink NYC')).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps Club conversations out of the Groups tab', async () => {
    getConversations.mockResolvedValue([{
      id: 'group-1',
      kind: 'group',
      user: { id: 'group-1', name: 'Weekend crew', pronouns: '', photo: null },
      distance: 'Nearby',
      updatedAt: '2026-10-02T12:00:00.000Z',
      lastMessage: 'See you Saturday',
      unreadCount: 0,
      pinned: false,
      currentUserRole: 'member',
      tags: [],
    }, {
      id: '44444444-4444-4444-8444-444444444444',
      kind: 'group',
      clubId: '22222222-2222-4222-8222-222222222222',
      user: { id: '44444444-4444-4444-8444-444444444444', name: 'Brooklyn techno', pronouns: '', photo: null },
      distance: 'Nearby',
      updatedAt: '2026-10-02T12:01:00.000Z',
      lastMessage: 'Meet at 10',
      unreadCount: 0,
      pinned: true,
      currentUserRole: 'member',
      tags: ['techno'],
    }]);

    render(
      <MemoryRouter initialEntries={['/messages']}>
        <Routes><Route path="/messages" element={<DirectMessages />} /></Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Weekend crew')).toBeInTheDocument();
    expect(screen.queryByText('Brooklyn techno')).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('tab', { name: 'Groups' }));
    expect(screen.queryByText('Brooklyn techno')).not.toBeInTheDocument();
  });

  it('shows unread dots for each message scope', async () => {
    getConversations.mockResolvedValue([{
      id: 'dm-1',
      kind: 'dm',
      user: { id: 'user-2', name: 'River', pronouns: '', photo: null },
      distance: 'Nearby',
      updatedAt: '2026-10-02T12:00:00.000Z',
      lastMessage: 'hey',
      unreadCount: 1,
      pinned: false,
      tags: [],
    }, {
      id: 'group-1',
      kind: 'group',
      user: { id: 'group-1', name: 'Weekend crew', pronouns: '', photo: null },
      distance: 'Nearby',
      updatedAt: '2026-10-02T12:01:00.000Z',
      lastMessage: 'Saturday',
      unreadCount: 2,
      pinned: false,
      currentUserRole: 'member',
      tags: [],
    }, {
      id: 'club-chat-1',
      kind: 'group',
      clubId: '22222222-2222-4222-8222-222222222222',
      user: { id: 'club-chat-1', name: 'Brooklyn techno', pronouns: '', photo: null },
      distance: 'Nearby',
      updatedAt: '2026-10-02T12:02:00.000Z',
      lastMessage: 'Tonight',
      unreadCount: 3,
      pinned: false,
      currentUserRole: 'member',
      tags: ['techno'],
    }]);

    render(<MemoryRouter><DirectMessages /></MemoryRouter>);

    expect(await screen.findByTestId('all-unread-dot')).toBeInTheDocument();
    expect(screen.getByTestId('unread-unread-dot')).toBeInTheDocument();
    expect(screen.getByTestId('groups-unread-dot')).toBeInTheDocument();
    expect(screen.getByTestId('clubs-unread-dot')).toBeInTheDocument();
  });

  it('opens New Club instead of redirecting to checkout', async () => {
    getConversations.mockResolvedValue([]);
    getMyBillingStatus.mockResolvedValue({ cruushPlus: false });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: vi.fn().mockResolvedValue(JSON.stringify({ data: [] })),
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      render(
        <MemoryRouter initialEntries={['/messages']}>
          <Routes>
            <Route path="/messages" element={<DirectMessages />} />
            <Route path="/store" element={<div>cruush+ checkout</div>} />
          </Routes>
        </MemoryRouter>,
      );

      fireEvent.click(await screen.findByRole('tab', { name: 'Clubs' }));
      fireEvent.click(await screen.findByRole('tab', { name: 'Browse Clubs' }));
      expect(screen.queryByRole('button', { name: 'Create Club' })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'New message' }));
      fireEvent.click(screen.getByRole('button', { name: /^Create Club/ }));
      expect(await screen.findByRole('heading', { name: 'New Club' })).toBeInTheDocument();
      expect(screen.queryByText('cruush+ checkout')).not.toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('shows a real error state when conversations fail to load', async () => {
    getConversations.mockRejectedValue(new Error('Messages unavailable'));

    render(
      <MemoryRouter>
        <DirectMessages />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('Messages unavailable')).toBeInTheDocument());
    expect(screen.getByTestId('messages-error-card')).toHaveAttribute('data-slot', 'card');
    expect(screen.getByTestId('messages-error-card')).toHaveClass('bg-destructive/10');
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

  it('uses the Cruushes card structure without vibe capsules', async () => {
    getConversations.mockResolvedValue([{
      id: 'conversation-vibes',
      kind: 'dm',
      user: {
        id: 'user-vibes',
        name: 'River',
        pronouns: 'they/them',
        photo: null,
        lastActive: '12m ago',
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
    getMyCruushActivity.mockResolvedValue({
      mutual: [{
        user: { id: 'user-vibes' },
        vibes: ['Soft', 'Chill', 'Artsy', 'Extra'],
      }],
    });

    render(
      <MemoryRouter>
        <DirectMessages />
      </MemoryRouter>,
    );

    const row = await screen.findByTestId('conversation-preview-row');
    // The card carries the surface and the grid lives in a child, so the vibe
    // row above it cannot become a grid row.
    expect(row).toHaveClass('cruush-user-activity-capsule', 'flex', 'bg-card/70');
    expect(row.querySelector('.cruush-user-activity-grid')).toHaveClass('grid');
    expect(screen.queryByTestId('activity-vibes')).not.toBeInTheDocument();
    expect(screen.getByText('meet by the door')).toBeInTheDocument();
    expect(screen.getByText('12m ago')).toBeInTheDocument();
    expect(screen.queryByText('Nearby')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete River chat for everyone' })).toBeInTheDocument();
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

  it('creates a group from cruushes only', async () => {
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
          badges: ['founder'],
          vibes: ['Night owl'],
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

    const groupProfileCard = screen.getByTestId('group-mutual-53fd68d7-24fc-4cff-8cd7-a97ec0cadf97');
    expect(groupProfileCard).toHaveClass('bg-black/72', 'hover:bg-black/86', 'min-h-[7.5rem]', 'content-center');
    expect(groupProfileCard).toHaveAttribute('aria-pressed', 'false');
    expect(within(groupProfileCard).getByText('founder')).toBeInTheDocument();
    expect(within(groupProfileCard).getByText('Night owl')).toBeInTheDocument();

    const groupComposer = screen.getByRole('heading', { name: 'New group' }).closest('.fixed');
    expect(groupComposer).toHaveClass(
      'overflow-y-auto',
      'overscroll-contain',
      'pb-[calc(7rem+env(safe-area-inset-bottom))]',
    );
    expect(groupComposer?.style.getPropertyValue('-webkit-overflow-scrolling')).toBe('touch');

    fireEvent.change(screen.getByLabelText('Group name'), {
      target: { value: 'Beta crew' },
    });
    const riverOption = screen.getByRole('button', { name: 'Add River to group' });
    fireEvent.click(riverOption);
    expect(riverOption).toHaveAttribute('aria-pressed', 'true');
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
          badges: ['founder'],
          vibes: ['Night owl'],
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
    const directProfileCard = await screen.findByTestId('message-mutual-discovery-53fd68d7-24fc-4cff-8cd7-a97ec0cadf97');
    expect(directProfileCard).toHaveClass('bg-black/72', 'hover:bg-black/86', 'min-h-[7.5rem]', 'content-center');
    expect(within(directProfileCard).getByText('founder')).toBeInTheDocument();
    expect(within(directProfileCard).getByText('Night owl')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Message River' }));

    expect(openConversationOrInbox).toHaveBeenCalledWith(expect.any(Function), '53fd68d7-24fc-4cff-8cd7-a97ec0cadf97', undefined);
  });

  it('shows messageable cruushes on Public when no public profiles are available', async () => {
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
    expect(screen.queryByText('Showing messageable cruushes because no public profiles are available.')).not.toBeInTheDocument();
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
      {
        id: 'ghosted',
        name: 'Ghosted',
        display_name: 'Ghosted',
        age: 30,
        pronouns: 'they/them',
        lat: 40.74,
        lng: -73.95,
        lastActive: '1m ago',
        distance: 'Nearby',
        displayMode: 'GHOST',
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
        expect.objectContaining({
          preferredSpots: [],
          protectionBoundaries: [],
          searchQuery: '',
          zodiac: [],
        }),
        { limit: 500 },
      );
    });

    expect(await screen.findByText('Alex')).toBeInTheDocument();
    expect(screen.getByText('River')).toBeInTheDocument();
    expect(screen.queryByText('0.2 mi')).not.toBeInTheDocument();
    expect(screen.queryByText('5 mi')).not.toBeInTheDocument();
    expect(screen.getByText('Sort people by')).toBeInTheDocument();
    const sortPicker = screen.getByRole('button', { name: /Sort people by Recently online/ });
    expect(sortPicker).toHaveAttribute('data-slot', 'accordion-trigger');
    fireEvent.click(sortPicker);
    expect(screen.queryByText('Choose the order people appear in.')).not.toBeInTheDocument();
    expect(screen.queryByText('Most recent first')).not.toBeInTheDocument();
    expect(screen.queryByText('Closest first')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sort by Recently online' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Sort by Distance' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Seeking filters' }));
    const lookingTab = await screen.findByRole('tab', { name: 'Intimacy' });
    fireEvent.mouseDown(lookingTab);
    fireEvent.mouseUp(lookingTab);
    fireEvent.click(lookingTab);
    fireEvent.click(screen.getByRole('button', { name: 'Looking For' }));
    fireEvent.click(await screen.findByRole('option', { name: 'right now' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(screen.queryByText('River')).not.toBeInTheDocument();
    const alex = screen.getByText('Alex');
    const ghosted = screen.getByText('Ghosted');
    const blake = screen.getByText('Blake');
    expect(alex.compareDocumentPosition(ghosted) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(ghosted.compareDocumentPosition(blake) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(alex.compareDocumentPosition(blake) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Distance/ }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sort by Recently online' })).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByRole('button', { name: 'Sort by Distance' })).toHaveAttribute('aria-pressed', 'true');
      const sortedBlake = screen.getByText('Blake');
      const sortedAlex = screen.getByText('Alex');
      const sortedGhosted = screen.getByText('Ghosted');
      // ee9d870: a row with no numeric label now falls back to its own display
      // coordinates independently, instead of only when the row it is compared
      // against is also unlabelled. Ghosted reads "Nearby", and its displayed
      // coordinates put it about 1.7 mi out, so it sorts between Blake's 1 mi
      // and Alex's 5 mi rather than dropping to the end of the list.
      expect(sortedBlake.compareDocumentPosition(sortedGhosted) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(sortedGhosted.compareDocumentPosition(sortedAlex) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(sortedBlake.compareDocumentPosition(sortedAlex) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  it('uses the current display-location token so Distance differs from Recently online for a new message', async () => {
    getConversations.mockResolvedValue([]);
    const selfLocationToken = { tokenId: 'self-location-token' };
    getMyProfile.mockResolvedValue({
      location: {
        display_location_token: selfLocationToken,
        location_updated_at: '2026-04-28T12:00:00.000Z',
      },
    });
    decryptDisplayLocationToken.mockResolvedValue({ latitude: 40.75, longitude: -73.98 });
    getMyCruushActivity.mockResolvedValue({ mutual: [] });
    getNearbyUsers.mockResolvedValue([
      {
        id: 'recent-far', name: 'Recent far', display_name: 'Recent far', age: 30, pronouns: 'they/them',
        lat: 40.80, lng: -73.98, lastActive: 'now', distance: 'Nearby', lookingFor: [], vibes: [], position: [], role: [], hostingTravel: [], photo: null,
      },
      {
        id: 'older-close', name: 'Older close', display_name: 'Older close', age: 30, pronouns: 'they/them',
        lat: 40.751, lng: -73.98, lastActive: '2h ago', distance: 'Nearby', lookingFor: [], vibes: [], position: [], role: [], hostingTravel: [], photo: null,
      },
    ]);

    render(<MemoryRouter><DirectMessages /></MemoryRouter>);

    fireEvent.click(await screen.findByRole('button', { name: 'New message' }));
    fireEvent.click(screen.getByRole('button', { name: /^Start chat with someone/ }));
    await screen.findByText('Recent far');
    expect(screen.getByTestId('message-discovery-recent-far')).toHaveClass('bg-black/72', 'hover:bg-black/86', 'min-h-[7.5rem]', 'content-center');
    expect(decryptDisplayLocationToken).toHaveBeenCalledWith(selfLocationToken);
    expect(getNearbyUsers).toHaveBeenCalledWith({ lat: 40.75, lng: -73.98 }, expect.any(Object), { limit: 500 });

    const recentFar = screen.getByText('Recent far');
    const olderClose = screen.getByText('Older close');
    expect(recentFar.compareDocumentPosition(olderClose) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Sort people by Recently online/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Sort by Distance' }));

    await waitFor(() => {
      expect(olderClose.compareDocumentPosition(recentFar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  it('uses safe mutual coordinates when sorting new-group members by Distance', async () => {
    getConversations.mockResolvedValue([]);
    const selfLocationToken = { tokenId: 'self-location-token' };
    getMyProfile.mockResolvedValue({
      location: {
        display_location_token: selfLocationToken,
        location_updated_at: '2026-04-28T12:00:00.000Z',
      },
    });
    decryptDisplayLocationToken.mockResolvedValue({ latitude: 40.75, longitude: -73.98 });
    getMyCruushActivity.mockResolvedValue({
      mutual: [
        {
          id: 'recent-far', matchId: 'match-recent-far', createdAt: '2026-04-28T12:00:00.000Z', locked: false,
          user: { id: 'recent-far', name: 'Recent far', pronouns: 'they/them', photo: null },
          mutualCrowds: [], vibes: [], distance: 'Nearby', lastActive: 'now', canMessage: true, canRevealPreciseLocation: false,
          coordinates: { lat: 40.80, lng: -73.98, precision: 'fuzzy' },
        },
        {
          id: 'older-close', matchId: 'match-older-close', createdAt: '2026-04-28T11:00:00.000Z', locked: false,
          user: { id: 'older-close', name: 'Older close', pronouns: 'they/them', photo: null },
          mutualCrowds: [], vibes: [], distance: 'Nearby', lastActive: '2h ago', canMessage: true, canRevealPreciseLocation: false,
          coordinates: { lat: 40.751, lng: -73.98, precision: 'fuzzy' },
        },
      ],
    });

    render(<MemoryRouter><DirectMessages /></MemoryRouter>);

    fireEvent.click(await screen.findByRole('button', { name: 'New message' }));
    fireEvent.click(screen.getByRole('button', { name: /^Create group message/ }));
    await screen.findByText('Recent far');
    expect(screen.queryByText('Nearby')).not.toBeInTheDocument();
    const recentFar = screen.getByText('Recent far');
    const olderClose = screen.getByText('Older close');
    expect(recentFar.compareDocumentPosition(olderClose) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Sort cruushes by Distance' }));

    await waitFor(() => {
      expect(olderClose.compareDocumentPosition(recentFar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });
});
