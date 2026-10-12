import { refreshContentVisibility } from '../lib/contentVisibilityRevision';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PHOTO_UPLOAD_ACCEPT } from '../lib/photoUploadFormats';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PrivateGroupChat from './PrivateGroupChat';
import { setDlModeEnabled, setDlModeShowOnlyException, type NsfwPhotoRestriction } from '../lib/dlMode';
import * as trustRestrictions from '../lib/trustRestrictions';
import { ApiClientError } from '../lib/apiClient';

const {
  clearConversationForEveryone,
  createMessage,
  createMessagePhoto,
  deleteConversationForEveryone,
  getFavoriteMessageImages,
  getConversationMessages,
  getCurrentUserId,
  getGroupMembers,
  leaveGroupConversation,
  removeFavoriteMessageImage,
  sendFavoriteMessageImage,
  sendGroupPulse,
  setClubMemberRole,
  setConversationDisappearingTimer,
  setConversationNotifications,
  uploadFavoriteMessageImage,
  viewMessageAttachment,
} = vi.hoisted(() => ({
  clearConversationForEveryone: vi.fn(),
  createMessage: vi.fn(),
  createMessagePhoto: vi.fn(),
  deleteConversationForEveryone: vi.fn(),
  getFavoriteMessageImages: vi.fn(),
  getConversationMessages: vi.fn(),
  getCurrentUserId: vi.fn(),
  getGroupMembers: vi.fn(),
  leaveGroupConversation: vi.fn(),
  removeFavoriteMessageImage: vi.fn(),
  sendFavoriteMessageImage: vi.fn(),
  sendGroupPulse: vi.fn(),
  setClubMemberRole: vi.fn(),
  setConversationDisappearingTimer: vi.fn(),
  setConversationNotifications: vi.fn(),
  uploadFavoriteMessageImage: vi.fn(),
  viewMessageAttachment: vi.fn(),
}));

const serviceArea = vi.hoisted(() => ({ profilePinsAllowed: true }));
vi.mock('./MapServiceAreaContext', () => ({ useMapServiceArea: () => serviceArea }));

const { blockUser } = vi.hoisted(() => ({
  blockUser: vi.fn(),
}));

const { getProfileById } = vi.hoisted(() => ({
  getProfileById: vi.fn(),
}));

const { createReport } = vi.hoisted(() => ({
  createReport: vi.fn(),
}));

const { getClub, getClubJoinRequests, reviewClubJoinRequest, updateClub } = vi.hoisted(() => ({
  getClub: vi.fn(),
  getClubJoinRequests: vi.fn(),
  reviewClubJoinRequest: vi.fn(),
  updateClub: vi.fn(),
}));

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: toastSuccess,
    error: toastError,
  },
}));

vi.mock('../lib/sessionUser', () => ({
  getCurrentUserId,
}));

vi.mock('../lib/messagesApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/messagesApi')>('../lib/messagesApi');

  return {
    ...actual,
    clearConversationForEveryone,
    createMessage,
    createMessagePhoto,
    deleteConversationForEveryone,
    getFavoriteMessageImages,
    getConversationMessages,
    getGroupMembers,
    leaveGroupConversation,
    removeFavoriteMessageImage,
    sendFavoriteMessageImage,
    sendGroupPulse,
    setClubMemberRole,
    setConversationDisappearingTimer,
    setConversationNotifications,
    uploadFavoriteMessageImage,
    viewMessageAttachment,
  };
});

vi.mock('../lib/blockApi', () => ({
  blockUser,
}));

vi.mock('../lib/profileApi', async () => ({
  ...(await vi.importActual<typeof import('../lib/profileApi')>('../lib/profileApi')),
  getProfileById,
}));

vi.mock('../lib/reportApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/reportApi')>('../lib/reportApi');
  return { ...actual, createReport };
});

vi.mock('../lib/clubsApi', async () => ({
  ...(await vi.importActual<typeof import('../lib/clubsApi')>('../lib/clubsApi')),
  getClub,
  getClubJoinRequests,
  reviewClubJoinRequest,
  updateClub,
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{location.pathname}</div>;
}

function mockVisualViewport({
  height,
  innerHeight,
  offsetTop = 0,
}: {
  height: number;
  innerHeight: number;
  offsetTop?: number;
}) {
  const originalVisualViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport');
  const originalInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');
  const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  const viewport = {
    height,
    offsetTop,
    width: 390,
    scale: 1,
    pageLeft: 0,
    pageTop: 0,
    addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      const typeListeners = listeners.get(type) ?? new Set<EventListenerOrEventListenerObject>();
      typeListeners.add(listener);
      listeners.set(type, typeListeners);
    }),
    removeEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      listeners.get(type)?.delete(listener);
    }),
  };

  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: innerHeight,
  });
  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: viewport,
  });

  return {
    viewport,
    dispatch(type: string) {
      const event = new Event(type);
      listeners.get(type)?.forEach((listener) => {
        if (typeof listener === 'function') {
          listener(event);
        } else {
          listener.handleEvent(event);
        }
      });
    },
    restore() {
      if (originalVisualViewport) {
        Object.defineProperty(window, 'visualViewport', originalVisualViewport);
      } else {
        delete (window as { visualViewport?: unknown }).visualViewport;
      }

      if (originalInnerHeight) {
        Object.defineProperty(window, 'innerHeight', originalInnerHeight);
      }
    },
  };
}

describe('PrivateGroupChat', () => {
  beforeEach(() => {
    serviceArea.profilePinsAllowed = true;
    window.localStorage.removeItem('cruush:dl-mode-show-only-exception');
    clearConversationForEveryone.mockReset();
    createMessage.mockReset();
    createMessagePhoto.mockReset();
    deleteConversationForEveryone.mockReset();
    getFavoriteMessageImages.mockReset();
    getConversationMessages.mockReset();
    getCurrentUserId.mockReset();
    getGroupMembers.mockReset();
    leaveGroupConversation.mockReset().mockResolvedValue(undefined);
    getProfileById.mockReset();
    removeFavoriteMessageImage.mockReset();
    sendFavoriteMessageImage.mockReset();
    sendGroupPulse.mockReset().mockResolvedValue({ allowance: { remaining: 0, limit: 1 } });
    setClubMemberRole.mockReset();
    setConversationDisappearingTimer.mockReset();
    setConversationNotifications.mockReset();
    uploadFavoriteMessageImage.mockReset();
    viewMessageAttachment.mockReset();
    blockUser.mockReset();
    createReport.mockReset();
    getClub.mockReset();
    getClubJoinRequests.mockReset().mockResolvedValue([]);
    reviewClubJoinRequest.mockReset();
    updateClub.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
    getCurrentUserId.mockResolvedValue('user-1');
    getGroupMembers.mockResolvedValue([]);
    getProfileById.mockResolvedValue(null);
    getFavoriteMessageImages.mockResolvedValue({ images: [] });
    blockUser.mockResolvedValue({
      userId: 'user-2',
      blocked: true,
    });
    createReport.mockResolvedValue({
      id: 'report-1',
      status: 'open',
      createdAt: '2026-07-11T12:00:00.000Z',
    });
  });


  it.each([false, true])('leaves only after confirmation and returns to the correct list; Coven=%s', async (coven) => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    getConversationMessages.mockResolvedValue({ conversation: {
      id: 'leave-chat', kind: 'group', clubId: coven ? 'club-1' : undefined,
      user: { id: 'group-1', name: 'Leave test', pronouns: '', photo: null },
      distance: 'Nearby', updatedAt: '2026-10-11T00:00:00Z', lastMessage: '', unreadCount: 0,
      pinned: false, tags: [], membersLabel: '2 people', currentUserRole: 'member', disappearingTimer: 'off',
    }, messages: [] });
    const Destination = () => <div>Destination {useLocation().search}</div>;
    render(<MemoryRouter initialEntries={['/chat/leave-chat/settings']}><Routes>
      <Route path="/chat/:chatId/settings" element={<PrivateGroupChat />} />
      <Route path="/messages" element={<Destination />} />
    </Routes></MemoryRouter>);
    try {
      const button = await screen.findByRole('button', { name: coven ? 'Leave Coven' : 'Leave Group Chat' });
      fireEvent.click(button);
      expect(leaveGroupConversation).not.toHaveBeenCalled();
      confirm.mockReturnValue(true);
      leaveGroupConversation.mockRejectedValueOnce(new Error('Leave failed'));
      fireEvent.click(button);
      expect(await screen.findByText('Leave failed')).toBeVisible();
      expect(screen.queryByText(/Destination/)).not.toBeInTheDocument();
      fireEvent.click(button);
      expect(await screen.findByText(coven ? 'Destination ?tab=clubs' : 'Destination')).toBeVisible();
      expect(leaveGroupConversation).toHaveBeenLastCalledWith('leave-chat');
      expect(deleteConversationForEveryone).not.toHaveBeenCalled();
    } finally { confirm.mockRestore(); }
  });

  it('blocks restricted sends while keeping conversation settings and gallery viewing available', async () => {
    const mock = vi.spyOn(trustRestrictions, 'useTrustRestrictions').mockReturnValue({
      restricted: () => true,
      message: () => 'Messaging is temporarily restricted because of your trust score.',
    });
    getConversationMessages.mockResolvedValue({
      conversation: {
        id: 'trust-chat', kind: 'group', user: { id: 'group-1', name: 'Local group', pronouns: '', photo: null },
        distance: 'Nearby', updatedAt: '2026-09-12T12:00:00Z', lastMessage: '', unreadCount: 0,
        pinned: false, tags: [], membersLabel: '1 person', currentUserRole: 'owner', disappearingTimer: 'off',
      }, messages: [],
    });
    const view = render(<MemoryRouter initialEntries={['/chat/trust-chat']}>
      <Routes><Route path="/chat/:chatId" element={<PrivateGroupChat />} /></Routes>
    </MemoryRouter>);
    try {
      expect(await screen.findByText('Messaging is temporarily restricted because of your trust score.')).toBeVisible();
      expect(screen.queryByText('JPEG, PNG, HEIC/HEIF, AVIF, WebP, TIFF, DNG, BMP or still GIF.')).not.toBeInTheDocument();
      const input = screen.getByPlaceholderText('Drop the plan...');
      expect(input).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Attach photo' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
      expect(screen.getByRole('combobox', { name: 'Message disappearing timer' })).toBeEnabled();
      const gallery = screen.getByRole('button', { name: 'Quick access gallery' });
      expect(gallery).toBeEnabled();
      fireEvent.click(gallery);
      expect(await screen.findByLabelText('Choose favorite image')).toBeDisabled();
      fireEvent.change(input, { target: { value: 'Existing draft' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(createMessage).not.toHaveBeenCalled();
    } finally {
      view.unmount();
      mock.mockRestore();
    }
  });

  it('renders a shared profile with the literal Cruushes card in chat', async () => {
    const profileId = '53fd68d7-24fc-4cff-8cd7-a97ec0cadf97';
    getConversationMessages.mockResolvedValue({
      conversation: {
        id: 'profile-share-chat', kind: 'dm', user: { id: 'user-2', name: 'Sender', pronouns: 'they/them', photo: null },
        distance: 'Nearby', updatedAt: '2026-10-08T12:00:00Z', lastMessage: '', unreadCount: 0, pinned: false, tags: [], membersLabel: '2 people',
      },
      messages: [{
        id: 'shared-profile-message', userId: 'user-2', content: `[[cruush:profile:${profileId}]] River`, timestamp: '2026-10-08T12:00:00Z',
      }],
    });
    getProfileById.mockResolvedValue({
      id: profileId,
      display_name: 'River',
      photos: ['/river.jpg'],
      photo_metadata: [{ url: '/river.jpg', explicit: false }],
      pronouns: ['they/them'],
      custom_pronouns: '',
      side_badges: { left: null, right: null },
      badges: [],
      vibes: ['Night owl'],
      last_active: '4h ago',
      distance_label: 'Nearby',
      viewer_relationship: { mutual_cruush: true, match_id: 'match-1', can_message: true, can_reveal_precise_location: false },
    });

    render(<MemoryRouter initialEntries={['/chat/profile-share-chat']}><Routes><Route path="/chat/:chatId" element={<PrivateGroupChat />} /></Routes></MemoryRouter>);

    const card = await screen.findByTestId(`shared-profile-card-${profileId}`);
    expect(card).toHaveClass('cruush-user-activity-capsule');
    expect(within(card).getByText('River')).toBeInTheDocument();
    expect(within(card).getByText('Night owl')).toBeInTheDocument();
    expect(within(card).getByText('4h ago')).toBeInTheDocument();
    expect(within(card).getByText('Nearby')).toBeInTheDocument();
    expect(within(card).getByTestId('activity-vibes')).toBeInTheDocument();
    expect(within(card).getByTestId('profile-action-trio')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Uncruush River' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Message River' })).toBeInTheDocument();
    expect(card).toHaveAttribute('aria-label', 'Open River profile');
  });

  it('shows an empty live chat without preview messages', async () => {
    getConversationMessages.mockResolvedValue({
      conversation: {
        id: '7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2',
        kind: 'dm',
        user: {
          id: 'user-2',
          name: 'River',
          pronouns: 'they/them',
          photo: null,
          lastActive: '12m ago',
          travelling: true,
        },
        distance: 'Nearby',
        updatedAt: '2026-04-29T12:00:00.000Z',
        lastMessage: '',
        unreadCount: 0,
        pinned: false,
        muted: false,
        mutual: true,
        tags: [],
      },
      messages: [],
    });

    render(
      <MemoryRouter initialEntries={['/chat/7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2']}>
        <Routes>
          <Route path="/chat/:chatId" element={<PrivateGroupChat />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('No messages yet.')).toBeInTheDocument();
    const header = screen.getByTestId('chat-thread-header');
    const name = within(header).getByText('River');
    const lastActive = within(header).getByText('12m ago');

    expect(name.parentElement).toContainElement(lastActive);
    expect(within(header).getByRole('img', { name: 'River avatar' }).querySelector('[data-contrail-style]'))
      .toHaveAttribute('data-contrail-style', 'cluster');
    expect(within(header).queryByText('they/them')).not.toBeInTheDocument();
    expect(screen.queryByText('Nearby')).not.toBeInTheDocument();
    expect(screen.queryByText('Preview thread')).not.toBeInTheDocument();
    expect(screen.queryByText('hosting for another hour if you still want to swing by')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open River profile' })).not.toBeInTheDocument();
  });

  it('renders a Club DM card that opens the Club detail route', async () => {
    const clubId = '22222222-2222-4222-8222-222222222222';
    getConversationMessages.mockResolvedValue({
      conversation: {
        id: '7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2',
        kind: 'dm',
        user: { id: 'user-2', name: 'River', pronouns: 'they/them', photo: null },
        distance: 'Nearby',
        updatedAt: '2026-10-01T12:00:00.000Z',
        lastMessage: 'Brooklyn techno',
        unreadCount: 0,
        pinned: false,
        mutual: true,
        tags: [],
      },
      messages: [{
        id: 'club-share-message',
        userId: 'user-2',
        content: `[[cruush:club:${clubId}]] Brooklyn techno`,
        timestamp: '2026-10-01T12:00:00.000Z',
      }],
    });

    render(
      <MemoryRouter initialEntries={['/chat/7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2']}>
        <Routes>
          <Route path="/chat/:chatId" element={<PrivateGroupChat />} />
          <Route path="/clubs/:clubId" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Open Brooklyn techno Coven' }));
    expect(screen.getByTestId('location-probe')).toHaveTextContent(`/clubs/${clubId}`);
  });

  it('labels and returns to the profile that opened a full-screen conversation', async () => {
    const conversationId = '7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2';
    getConversationMessages.mockResolvedValue({
      conversation: {
        id: conversationId,
        kind: 'dm',
        user: {
          id: 'user-2',
          name: 'River',
          pronouns: 'they/them',
          photo: null,
        },
        distance: 'Nearby',
        updatedAt: '2026-04-29T12:00:00.000Z',
        lastMessage: '',
        unreadCount: 0,
        pinned: false,
        muted: false,
        mutual: true,
        tags: [],
      },
      messages: [],
    });

    render(
      <MemoryRouter
        initialEntries={[
          '/profile/user-2',
          {
            pathname: `/chat/${conversationId}`,
            state: { conversationOrigin: 'profile' },
          },
        ]}
        initialIndex={1}
      >
        <Routes>
          <Route path="/profile/:userId" element={<LocationProbe />} />
          <Route path="/chat/:chatId" element={<><PrivateGroupChat /><LocationProbe /></>} />
        </Routes>
      </MemoryRouter>,
    );

    const backButton = await screen.findByRole('button', { name: 'Back to profile' });
    expect(screen.queryByRole('button', { name: 'Back to messages' })).not.toBeInTheDocument();

    fireEvent.click(backButton);

    await waitFor(() => expect(screen.getByTestId('location-probe')).toHaveTextContent('/profile/user-2'));
  });

  it('submits a text message only once while the first send is still pending', async () => {
    const conversationId = '7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2';
    getConversationMessages.mockResolvedValue({
      conversation: {
        id: conversationId,
        kind: 'dm',
        user: {
          id: 'user-2',
          name: 'River',
          pronouns: 'they/them',
          photo: null,
        },
        distance: 'Nearby',
        updatedAt: '2026-04-29T12:00:00.000Z',
        lastMessage: '',
        unreadCount: 0,
        pinned: false,
        muted: false,
        mutual: true,
        tags: [],
      },
      messages: [],
    });
    let resolveSend!: (message: {
      id: string;
      userId: string;
      content: string;
      timestamp: string;
    }) => void;
    createMessage.mockReturnValue(new Promise((resolve) => {
      resolveSend = resolve;
    }));

    render(
      <MemoryRouter initialEntries={[`/chat/${conversationId}`]}>
        <Routes>
          <Route path="/chat/:chatId" element={<PrivateGroupChat />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('No messages yet.')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Say what you want...'), {
      target: { value: 'only once' },
    });
    const composer = screen.getByPlaceholderText('Say what you want...');
    const sendButton = screen.getByRole('button', { name: 'Send message' });

    act(() => {
      sendButton.click();
      sendButton.click();
    });

    expect(createMessage).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText('only once').filter((element) => element.classList.contains('rounded-[22px]'))).toHaveLength(1);
    expect(composer).toHaveValue('');
    expect(sendButton).toBeDisabled();

    fireEvent.change(composer, { target: { value: 'next message' } });
    await act(async () => refreshContentVisibility());
    await waitFor(() => expect(getConversationMessages).toHaveBeenCalledTimes(2));
    expect(screen.getAllByText('only once').filter((element) => element.classList.contains('rounded-[22px]'))).toHaveLength(1);
    expect(composer).toHaveValue('next message');

    await act(async () => {
      resolveSend({
        id: 'msg-1',
        userId: 'user-1',
        content: 'only once',
        timestamp: '2026-04-29T12:00:00.000Z',
      });
    });
    expect(screen.getAllByText('only once').filter((element) => element.classList.contains('rounded-[22px]'))).toHaveLength(1);
    expect(composer).toHaveValue('next message');
  });

  it('does not show suggested reply chips or a quick-reply action', async () => {
    getConversationMessages.mockResolvedValue({
      conversation: {
        id: '7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2',
        kind: 'dm',
        user: {
          id: 'user-2',
          name: 'River',
          pronouns: 'they/them',
          photo: null,
        },
        distance: 'Nearby',
        updatedAt: '2026-04-29T12:00:00.000Z',
        lastMessage: '',
        unreadCount: 0,
        pinned: false,
        muted: false,
        mutual: true,
        tags: [],
      },
      messages: [],
    });

    render(
      <MemoryRouter initialEntries={['/chat/7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2']}>
        <Routes>
          <Route path="/chat/:chatId" element={<PrivateGroupChat />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('No messages yet.')).toBeInTheDocument();
    expect(screen.queryByText('you around now?')).not.toBeInTheDocument();
    expect(screen.queryByText('hosting or traveling?')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Insert quick reply' })).not.toBeInTheDocument();
  });

  it('shows a forbidden error when a DM is blocked', async () => {
    const conversationId = '7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2';
    getConversationMessages.mockResolvedValue({
      conversation: {
        id: conversationId,
        kind: 'dm',
        user: {
          id: 'user-2',
          name: 'River',
          pronouns: 'they/them',
          photo: null,
        },
        distance: 'Nearby',
        updatedAt: '2026-04-29T12:00:00.000Z',
        lastMessage: '',
        unreadCount: 0,
        pinned: false,
        muted: false,
        mutual: false,
        tags: [],
      },
      messages: [],
    });
    createMessage.mockRejectedValue(new ApiClientError(
      403,
      'FORBIDDEN',
      'You cannot message this user.',
    ));

    render(
      <MemoryRouter initialEntries={[`/chat/${conversationId}`]}>
        <Routes>
          <Route path="/chat/:chatId" element={<><PrivateGroupChat /><LocationProbe /></>} />
          <Route path="/profile/:userId" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('No messages yet.')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Say what you want...'), {
      target: { value: 'hey' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    expect(await screen.findByText('You cannot message this user.')).toBeInTheDocument();
  });

  it('shows a text-only moderation error when a text message is rejected without a photo', async () => {
    const conversationId = '7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2';
    getConversationMessages.mockResolvedValue({
      conversation: {
        id: conversationId,
        kind: 'group',
        user: {
          id: 'group-1',
          name: 'Beta crew',
          pronouns: '',
          photo: null,
        },
        distance: 'Nearby',
        updatedAt: '2026-04-29T12:00:00.000Z',
        lastMessage: '',
        unreadCount: 0,
        pinned: false,
        tags: [],
        membersLabel: '3 people',
        currentUserRole: 'owner',
        disappearingTimer: 'off',
      },
      messages: [],
    });
    createMessage.mockRejectedValue(new ApiClientError(
      400,
      'CONTENT_REJECTED',
      'This content violates cruush safety rules and cannot be saved.',
    ));

    render(
      <MemoryRouter initialEntries={[`/chat/${conversationId}`]}>
        <Routes>
          <Route path="/chat/:chatId" element={<PrivateGroupChat />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('No messages yet.')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Drop the plan...'), {
      target: { value: 'text only' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    const composerError = await within(screen.getByTestId('chat-composer-bar')).findByRole('alert');
    expect(composerError).toHaveTextContent('This text message was rejected by text safety checks.');
    expect(composerError).not.toHaveTextContent('photo');
    expect(composerError).toHaveTextContent('Error code: TEXT_CONTENT_REJECTED');
    expect(screen.getByPlaceholderText('Drop the plan...')).toHaveValue('text only');
    expect(createMessage).toHaveBeenCalledWith(conversationId, 'text only');
    expect(createMessagePhoto).not.toHaveBeenCalled();
  });

  it('shows the server reason when text messaging is restricted', async () => {
    const conversationId = '7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2';
    getConversationMessages.mockResolvedValue({
      conversation: {
        id: conversationId,
        kind: 'group',
        user: {
          id: 'group-1',
          name: 'Beta crew',
          pronouns: '',
          photo: null,
        },
        distance: 'Nearby',
        updatedAt: '2026-04-29T12:00:00.000Z',
        lastMessage: '',
        unreadCount: 0,
        pinned: false,
        muted: false,
        tags: [],
        membersLabel: '3 people',
        currentUserRole: 'owner',
        disappearingTimer: 'off',
      },
      messages: [],
    });
    createMessage.mockRejectedValue(new ApiClientError(
      403,
      'FEATURE_RESTRICTED',
      'Text messaging is unavailable while your trust score is low.',
    ));

    render(
      <MemoryRouter initialEntries={[`/chat/${conversationId}`]}>
        <Routes>
          <Route path="/chat/:chatId" element={<PrivateGroupChat />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('No messages yet.')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Drop the plan...'), {
      target: { value: 'text only' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    const composerError = await within(screen.getByTestId('chat-composer-bar')).findByRole('alert');
    expect(composerError).toHaveTextContent('Text messaging is unavailable while your trust score is low.');
    expect(composerError).not.toHaveTextContent('photo');
    expect(composerError).toHaveTextContent('Error code: TEXT_MESSAGING_RESTRICTED');
  });

  it('keeps send disabled for control-character-only text and normalizes mixed input', async () => {
    const conversationId = '7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2';
    getConversationMessages.mockResolvedValue({
      conversation: {
        id: conversationId,
        kind: 'group',
        user: {
          id: 'group-1',
          name: 'Beta crew',
          pronouns: '',
          photo: null,
        },
        distance: 'Nearby',
        updatedAt: '2026-04-29T12:00:00.000Z',
        lastMessage: '',
        unreadCount: 0,
        pinned: false,
        tags: [],
        membersLabel: '3 people',
        currentUserRole: 'owner',
        disappearingTimer: 'off',
      },
      messages: [],
    });
    createMessage.mockResolvedValue({
      id: 'msg-1',
      userId: 'user-1',
      content: 'hello',
      timestamp: '2026-04-29T12:00:00.000Z',
    });

    render(
      <MemoryRouter initialEntries={[`/chat/${conversationId}`]}>
        <Routes>
          <Route path="/chat/:chatId" element={<PrivateGroupChat />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('No messages yet.')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Drop the plan...'), {
      target: { value: '\u0007\u0008' },
    });
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
    expect(createMessage).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText('Drop the plan...'), {
      target: { value: ' \u0007hello\u0008 ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => {
      expect(createMessage).toHaveBeenCalledWith(conversationId, 'hello');
    });
  });

  it('lets users block a DM partner from conversation settings and returns to messages', async () => {
    getConversationMessages.mockResolvedValue({
      conversation: {
        id: '7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2',
        kind: 'dm',
        user: {
          id: 'user-2',
          name: 'River',
          pronouns: 'they/them',
          photo: null,
        },
        distance: 'Nearby',
        updatedAt: '2026-04-29T12:00:00.000Z',
        lastMessage: '',
        unreadCount: 0,
        pinned: false,
        tags: [],
      },
      messages: [],
    });

    render(
      <MemoryRouter initialEntries={['/chat/7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2']}>
        <Routes>
          <Route path="/chat/:chatId" element={<><PrivateGroupChat /><LocationProbe /></>} />
          <Route path="/chat/:chatId/settings" element={<><PrivateGroupChat /><LocationProbe /></>} />
          <Route path="/messages" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Conversation settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Block River' }));

    expect(screen.getByText('Block River?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Block' }));

    await waitFor(() => expect(blockUser).toHaveBeenCalledWith('user-2'));
    await waitFor(() => expect(screen.getByTestId('location-probe')).toHaveTextContent('/messages'));
    expect(toastSuccess).toHaveBeenCalledWith('River blocked.');
  });

  it('does not show a single-user block action for group conversations', async () => {
    getConversationMessages.mockResolvedValue({
      conversation: {
        id: '7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2',
        kind: 'group',
        user: {
          id: 'group-1',
          name: 'Beta crew',
          pronouns: '',
          photo: null,
        },
        distance: 'Nearby',
        updatedAt: '2026-04-29T12:00:00.000Z',
        lastMessage: '',
        unreadCount: 0,
        pinned: false,
        tags: [],
        membersLabel: '3 people',
        currentUserRole: 'owner',
        disappearingTimer: 'off',
      },
      messages: [],
    });

    render(
      <MemoryRouter initialEntries={['/chat/7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2']}>
        <Routes>
          <Route path="/chat/:chatId" element={<PrivateGroupChat />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Conversation settings' }));

    expect(screen.queryByRole('button', { name: /Block/ })).not.toBeInTheDocument();
  });

  it('renders expiring message metadata', async () => {
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    const expirationDate = new Date(expiresAt).toLocaleDateString([], { month: 'short', day: 'numeric' });

    getConversationMessages.mockResolvedValue({
      conversation: {
        id: '7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2',
        kind: 'group',
        user: {
          id: 'group-1',
          name: 'Beta crew',
          pronouns: '',
          photo: null,
        },
        distance: 'Nearby',
        updatedAt: '2026-04-29T12:00:00.000Z',
        lastMessage: 'see you there',
        unreadCount: 0,
        pinned: false,
        tags: [],
        membersLabel: '3 people',
        currentUserRole: 'owner',
        disappearingTimer: '24h',
      },
      messages: [{
        id: 'msg-1',
        userId: 'user-2',
        content: 'see you there',
        timestamp: '2026-04-29T12:00:00.000Z',
        expiresAt,
      }],
    });

    render(
      <MemoryRouter initialEntries={['/chat/7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2']}>
        <Routes>
          <Route path="/chat/:chatId" element={<PrivateGroupChat />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('see you there')).toBeInTheDocument();
    expect(screen.getByText((content) => content.includes(`expires ${expirationDate}`))).toBeInTheDocument();
  });

  it('shows live remaining time for the sender\'s expiring text and view-once photo only', async () => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 45_000).toISOString();

    getConversationMessages.mockResolvedValue({
      conversation: {
        id: '7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2',
        kind: 'group',
        user: {
          id: 'group-1',
          name: 'Beta crew',
          pronouns: '',
          photo: null,
        },
        distance: 'Nearby',
        updatedAt: now.toISOString(),
        lastMessage: 'sender text',
        unreadCount: 0,
        pinned: false,
        tags: [],
        membersLabel: '3 people',
        currentUserRole: 'owner',
        disappearingTimer: '24h',
      },
      messages: [{
        id: 'msg-sender-text',
        userId: 'user-1',
        content: 'sender text',
        timestamp: now.toISOString(),
        expiresAt,
      }, {
        id: 'msg-sender-photo',
        userId: 'user-1',
        content: '',
        timestamp: now.toISOString(),
        expiresAt,
        attachments: [{
          id: 'media-sender-photo',
          url: '/api/media/message-photos/sender-photo.png',
          mediaType: 'image',
          mimeType: 'image/png',
          viewOnce: true,
          explicit: false,
        }],
      }, {
        id: 'msg-recipient',
        userId: 'user-2',
        content: 'recipient text',
        timestamp: now.toISOString(),
        expiresAt,
      }, {
        id: 'msg-permanent',
        userId: 'user-1',
        content: 'permanent sender text',
        timestamp: now.toISOString(),
      }],
    });

    render(
      <MemoryRouter initialEntries={['/chat/7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2']}>
        <Routes>
          <Route path="/chat/:chatId" element={<PrivateGroupChat />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('sender text')).toBeInTheDocument();
    expect(screen.getByText('View-once photo sent')).toBeInTheDocument();

    const initialTimers = screen.getAllByRole('timer');
    const initialLabel = initialTimers[0]?.getAttribute('aria-label');
    expect(initialTimers).toHaveLength(2);
    expect(initialLabel).toMatch(/^Expires in \d+s$/);
    expect(initialTimers.every((timer) => timer.getAttribute('aria-label') === initialLabel)).toBe(true);

    await waitFor(() => {
      const updatedTimers = screen.getAllByRole('timer');
      expect(updatedTimers).toHaveLength(2);
      expect(updatedTimers.every((timer) => timer.getAttribute('aria-label') !== initialLabel)).toBe(true);
    }, { timeout: 2_000 });
  });

  it('renders message photo attachments', async () => {
    getConversationMessages.mockResolvedValue({
      conversation: {
        id: '7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2',
        kind: 'group',
        user: {
          id: 'group-1',
          name: 'Beta crew',
          pronouns: '',
          photo: null,
        },
        distance: 'Nearby',
        updatedAt: '2026-04-29T12:00:00.000Z',
        lastMessage: 'photo',
        unreadCount: 0,
        pinned: false,
        tags: [],
        membersLabel: '3 people',
        currentUserRole: 'owner',
        disappearingTimer: 'off',
      },
      messages: [{
        id: 'msg-photo',
        userId: 'user-2',
        content: 'street view',
        timestamp: '2026-04-29T12:00:00.000Z',
        attachments: [{
          id: 'media-1',
          url: '/api/media/message-photos/photo.png',
          mediaType: 'message_photo',
          mimeType: 'image/png',
          explicit: false,
        }],
      }],
    });

    render(
      <MemoryRouter initialEntries={['/chat/7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2']}>
        <Routes>
          <Route path="/chat/:chatId" element={<PrivateGroupChat />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByAltText('Message photo')).toHaveAttribute('src', '/api/media/message-photos/photo.png');
    expect(screen.getByText('street view')).toBeInTheDocument();
  });

  it('uses the DL Mode icon on an explicit message photo shield', async () => {
    window.localStorage.setItem('cruush:dl-mode-enabled', 'true');
    getConversationMessages.mockResolvedValue({
      conversation: {
        id: '7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2',
        kind: 'dm',
        user: {
          id: 'user-2',
          name: 'River',
          pronouns: 'they/them',
          photo: null,
        },
        distance: 'Nearby',
        updatedAt: '2026-04-29T12:00:00.000Z',
        lastMessage: 'photo',
        unreadCount: 0,
        pinned: false,
        tags: [],
        mutual: true,
      },
      messages: [{
        id: 'msg-photo',
        userId: 'user-2',
        content: '',
        timestamp: '2026-04-29T12:00:00.000Z',
        attachments: [{
          id: 'media-explicit',
          url: '/api/media/message-photos/photo.png',
          mediaType: 'message_photo',
          mimeType: 'image/png',
          explicit: true,
          photoRelationship: { isMutualCruush: true, sharesCrowd: false },
        }],
      }],
    });

    render(
      <MemoryRouter initialEntries={['/chat/7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2']}>
        <Routes>
          <Route path="/chat/:chatId" element={<PrivateGroupChat />} />
        </Routes>
      </MemoryRouter>,
    );

    const shield = await screen.findByRole('img', { name: 'Explicit message photo hidden by DL Mode' });
    expect(shield.querySelector('[data-testid="dl-mode-mark"]')).toHaveAttribute('data-source', 'Julien supplied balaclava halo DL Mode icon');
    expect(shield.querySelector('[data-testid="dl-mode-mark"]')).toHaveAttribute('data-tone', 'white');
    expect(shield.querySelector('[data-testid="dl-mode-mark"]')).toHaveAttribute('viewBox', '0 0 1100 1430');
    act(() => setDlModeShowOnlyException('mutual_cruushes'));
    expect(screen.getByAltText('Message photo')).toBeInTheDocument();
    act(() => setDlModeShowOnlyException('mutual_crowds'));
    expect(screen.queryByAltText('Message photo')).not.toBeInTheDocument();
  });

  it('sends a selected message photo with the current caption', async () => {
    const conversationId = '7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2';
    getConversationMessages.mockResolvedValue({
      conversation: {
        id: conversationId,
        kind: 'group',
        user: {
          id: 'group-1',
          name: 'Beta crew',
          pronouns: '',
          photo: null,
        },
        distance: 'Nearby',
        updatedAt: '2026-04-29T12:00:00.000Z',
        lastMessage: '',
        unreadCount: 0,
        pinned: false,
        tags: [],
        membersLabel: '3 people',
        currentUserRole: 'owner',
        disappearingTimer: 'off',
      },
      messages: [],
    });
    createMessagePhoto.mockResolvedValue({
      id: 'msg-photo',
      userId: 'user-1',
      content: 'meet here',
      timestamp: '2026-04-29T12:00:00.000Z',
      attachments: [{
        id: 'media-1',
        url: '/api/media/message-photos/photo.png',
        mediaType: 'message_photo',
        mimeType: 'image/png',
        explicit: false,
      }],
    });

    render(
      <MemoryRouter initialEntries={[`/chat/${conversationId}`]}>
        <Routes>
          <Route path="/chat/:chatId" element={<PrivateGroupChat />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('No messages yet.')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Drop the plan...'), {
      target: { value: 'meet here' },
    });

    const file = new File(['image-bytes'], 'photo.png', { type: 'image/png' });
    const photoInput = screen.getByLabelText('Choose message photo');
    const attachPhotoControl = screen.getByRole('button', { name: 'Attach photo' });
    expect(photoInput).toHaveAttribute(
      'accept',
      PHOTO_UPLOAD_ACCEPT,
    );
    expect(photoInput).toHaveAttribute('id');
    const inputClickSpy = vi.spyOn(photoInput as HTMLInputElement, 'click').mockImplementation(() => undefined);
    fireEvent.click(attachPhotoControl);
    expect(inputClickSpy).toHaveBeenCalledTimes(1);
    inputClickSpy.mockRestore();
    const viewOnceControl = screen.getByRole('checkbox', { name: 'Send photo view once' });
    expect(viewOnceControl).toHaveClass('rounded-full');
    expect(viewOnceControl).toHaveAttribute('data-state', 'unchecked');

    fireEvent.click(viewOnceControl);

    expect(viewOnceControl).toHaveAttribute('data-state', 'checked');

    fireEvent.change(screen.getByLabelText('Choose message photo'), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(createMessagePhoto).toHaveBeenCalledWith(conversationId, file, 'meet here', { viewOnce: true });
    });
    expect(await screen.findByAltText('Message photo')).toHaveAttribute('src', '/api/media/message-photos/photo.png');
    expect(screen.getByText('meet here')).toBeInTheDocument();
  });

  it('opens and uploads favorite images from the visible gallery control', async () => {
    const conversationId = '7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2';
    getConversationMessages.mockResolvedValue({
      conversation: {
        id: conversationId,
        kind: 'group',
        user: {
          id: 'group-1',
          name: 'Beta crew',
          pronouns: '',
          photo: null,
        },
        distance: 'Nearby',
        updatedAt: '2026-04-29T12:00:00.000Z',
        lastMessage: '',
        unreadCount: 0,
        pinned: false,
        tags: [],
        membersLabel: '3 people',
        currentUserRole: 'owner',
        disappearingTimer: 'off',
      },
      messages: [],
    });
    uploadFavoriteMessageImage.mockResolvedValue({
      id: 'favorite-1',
      mediaObjectId: 'media-favorite-1',
      label: 'favorite',
      url: '/api/media/message-photos/favorite.webp',
      thumbnailUrl: '/api/media/assets/media-favorite-1/thumbnail',
      mediaType: 'image',
      mimeType: 'image/webp',
      explicit: false,
      createdAt: '2026-04-29T12:00:00.000Z',
      updatedAt: '2026-04-29T12:00:00.000Z',
    });

    render(
      <MemoryRouter initialEntries={[`/chat/${conversationId}`]}>
        <Routes>
          <Route path="/chat/:chatId" element={<PrivateGroupChat />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('No messages yet.')).toBeInTheDocument();

    const favoriteGalleryButtons = screen.getAllByRole('button', { name: 'Quick access gallery' });
    expect(favoriteGalleryButtons).toHaveLength(1);
    fireEvent.click(favoriteGalleryButtons[favoriteGalleryButtons.length - 1]);

    await waitFor(() => expect(getFavoriteMessageImages).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('No photos in your Quick access gallery yet.')).toBeInTheDocument();

    const favoriteInput = screen.getByLabelText('Choose favorite image') as HTMLInputElement;
    const favoriteUploadButton = screen.getByRole('button', { name: 'Upload' });
    const inputClickSpy = vi.spyOn(favoriteInput, 'click').mockImplementation(() => undefined);
    fireEvent.click(favoriteUploadButton);
    expect(inputClickSpy).toHaveBeenCalledTimes(1);
    inputClickSpy.mockRestore();

    const file = new File(['image-bytes'], 'favorite.png', { type: 'image/png' });
    fireEvent.change(favoriteInput, {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(uploadFavoriteMessageImage).toHaveBeenCalledWith(file, 'favorite');
    });
    expect(await screen.findByAltText('favorite')).toHaveAttribute('src', '/api/media/assets/media-favorite-1/thumbnail');
  });

  it('keeps a retained favorite image out of the gallery until automatic moderation retry approves it', async () => {
    const conversationId = '7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2';
    getConversationMessages.mockResolvedValue({
      conversation: {
        id: conversationId,
        kind: 'group',
        user: { id: 'group-1', name: 'Beta crew', pronouns: '', photo: null },
        distance: 'Nearby',
        updatedAt: '2026-04-29T12:00:00.000Z',
        lastMessage: '',
        unreadCount: 0,
        pinned: false,
        tags: [],
        membersLabel: '3 people',
        currentUserRole: 'owner',
        disappearingTimer: 'off',
      },
      messages: [],
    });
    uploadFavoriteMessageImage.mockResolvedValue({ status: 'pending_review', assetId: 'asset-favorite-pending' });

    render(
      <MemoryRouter initialEntries={[`/chat/${conversationId}`]}>
        <Routes>
          <Route path="/chat/:chatId" element={<PrivateGroupChat />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('No messages yet.')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Quick access gallery' }).at(-1)!);
    await waitFor(() => expect(getFavoriteMessageImages).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText('Choose favorite image'), {
      target: { files: [new File(['image-bytes'], 'favorite.png', { type: 'image/png' })] },
    });

    expect(await screen.findByText('Photo submitted for review. It will appear in your Quick access gallery automatically.')).toHaveAttribute('role', 'status');
    expect(screen.queryByAltText('favorite')).not.toBeInTheDocument();
  });

  it('does not render a phantom message when a photo is retained for automatic moderation retry', async () => {
    const conversationId = '7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2';
    getConversationMessages.mockResolvedValue({
      conversation: {
        id: conversationId,
        kind: 'group',
        user: { id: 'group-1', name: 'Beta crew', pronouns: '', photo: null },
        distance: 'Nearby',
        updatedAt: '2026-04-29T12:00:00.000Z',
        lastMessage: '',
        unreadCount: 0,
        pinned: false,
        tags: [],
        membersLabel: '3 people',
        currentUserRole: 'owner',
        disappearingTimer: 'off',
      },
      messages: [],
    });
    createMessagePhoto.mockResolvedValue({ status: 'pending_review', assetId: 'asset-message-pending' });

    render(
      <MemoryRouter initialEntries={[`/chat/${conversationId}`]}>
        <Routes>
          <Route path="/chat/:chatId" element={<PrivateGroupChat />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('No messages yet.')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Drop the plan...'), { target: { value: 'meet here' } });
    fireEvent.change(screen.getByLabelText('Choose message photo'), {
      target: { files: [new File(['image-bytes'], 'photo.png', { type: 'image/png' })] },
    });

    expect(await screen.findByText('Photo submitted for review. It will send automatically after safety checks complete.')).toHaveAttribute('role', 'status');
    expect(screen.getByPlaceholderText('Drop the plan...')).toHaveValue('');
    expect(screen.queryByAltText('Message photo')).not.toBeInTheDocument();
  });

  it('shows photo upload failures next to the composer controls', async () => {
    const conversationId = '7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2';
    getConversationMessages.mockResolvedValue({
      conversation: {
        id: conversationId,
        kind: 'group',
        user: {
          id: 'group-1',
          name: 'Beta crew',
          pronouns: '',
          photo: null,
        },
        distance: 'Nearby',
        updatedAt: '2026-04-29T12:00:00.000Z',
        lastMessage: '',
        unreadCount: 0,
        pinned: false,
        tags: [],
        membersLabel: '3 people',
        currentUserRole: 'owner',
        disappearingTimer: 'off',
      },
      messages: [],
    });
    createMessagePhoto.mockRejectedValueOnce(new Error('This photo format could not be opened. Try JPEG, PNG, or WebP.'));

    render(
      <MemoryRouter initialEntries={[`/chat/${conversationId}`]}>
        <Routes>
          <Route path="/chat/:chatId" element={<PrivateGroupChat />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('No messages yet.')).toBeInTheDocument();

    const file = new File(['image-bytes'], 'photo.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Choose message photo'), {
      target: { files: [file] },
    });

    const composerError = await within(screen.getByTestId('chat-composer-bar')).findByRole('alert');
    expect(composerError).toHaveTextContent('This photo format could not be opened. Try JPEG, PNG, or WebP.');
  });

  it('does not offer video upload from the message composer', async () => {
    const conversationId = '7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2';
    getConversationMessages.mockResolvedValue({
      conversation: {
        id: conversationId,
        kind: 'dm',
        user: {
          id: 'user-2',
          name: 'River',
          pronouns: '',
          photo: null,
        },
        distance: 'Nearby',
        updatedAt: '2026-04-29T12:00:00.000Z',
        lastMessage: '',
        unreadCount: 0,
        pinned: false,
        tags: [],
        mutual: true,
        disappearingTimer: '24h',
      },
      messages: [],
    });

    render(
      <MemoryRouter initialEntries={[`/chat/${conversationId}`]}>
        <Routes>
          <Route path="/chat/:chatId" element={<PrivateGroupChat />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('No messages yet.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Choose message media')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Message video')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Attach photo or video' })).not.toBeInTheDocument();
  });

  it.each([false, true])('keeps received DM avatar Purgatory styling below active MHC precedence (%s)', async (travelling) => {
    const conversationId = '7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2';
    getConversationMessages.mockResolvedValue({
      conversation: {
        id: conversationId, kind: 'dm',
        user: { id: 'user-2', name: 'River', pronouns: '', photo: null, outOfSight: true, travelling },
        distance: 'Nearby', updatedAt: '2026-04-29T12:00:00.000Z', lastMessage: 'hello',
        unreadCount: 0, pinned: false, tags: [],
      },
      messages: [{ id: 'message-mhc', author: 'other', userId: 'user-2', content: 'hello', timestamp: '2026-04-29T12:05:00.000Z' }],
    });
    render(<MemoryRouter initialEntries={[`/chat/${conversationId}`]}><Routes><Route path="/chat/:chatId" element={<PrivateGroupChat />} /></Routes></MemoryRouter>);
    const avatar = await screen.findByRole('button', { name: 'Open River profile' });
    expect(within(avatar).queryByTestId('purgatory-heart-overlay') !== null).toBe(!travelling);
    expect(avatar.querySelector('[data-contrail-style]') !== null).toBe(travelling);
  });

  it('opens a group message sender profile from their avatar', async () => {
    const conversationId = '7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2';
    getConversationMessages.mockResolvedValue({
      conversation: {
        id: conversationId,
        kind: 'group',
        user: {
          id: 'group-1',
          name: 'Beta crew',
          pronouns: '',
          photo: null,
        },
        distance: 'Nearby',
        updatedAt: '2026-04-29T12:00:00.000Z',
        lastMessage: 'pull up',
        unreadCount: 0,
        pinned: false,
        tags: [],
        membersLabel: '3 people',
        currentUserRole: 'member',
        disappearingTimer: '24h',
      },
      messages: [{
        id: 'msg-1',
        userId: 'user-2',
        user: {
          id: 'user-2',
          name: 'cas',
          pronouns: 'he/him',
          photo: 'https://example.com/cas.jpg',
        },
        content: 'pull up',
        timestamp: '2026-04-29T12:05:00.000Z',
      }],
    });

    render(
      <MemoryRouter initialEntries={[`/chat/${conversationId}`]}>
        <Routes>
          <Route path="/chat/:chatId" element={<><PrivateGroupChat /><LocationProbe /></>} />
          <Route path="/profile/:userId" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Open cas profile' }));

    expect(screen.getByTestId('location-probe')).toHaveTextContent('/profile/user-2');
  });

  it.each([false, true])('disables Pulse outside effective area without restricting existing chat (Club %s)', async (club) => {
    serviceArea.profilePinsAllowed = false;
    const conversationId = '44444444-4444-4444-8444-444444444444';
    const clubId = '22222222-2222-4222-8222-222222222222';
    getConversationMessages.mockResolvedValue({
      conversation: {
        id: conversationId, kind: 'group', clubId: club ? clubId : undefined,
        user: { id: conversationId, name: 'Existing group', pronouns: '', photo: null },
        distance: 'Nearby', updatedAt: '2026-10-09T12:00:00Z', lastMessage: '', unreadCount: 0,
        pinned: false, tags: [], membersLabel: '2 people', currentUserRole: 'owner', disappearingTimer: 'off',
      },
      messages: [{ id: 'msg-1', userId: 'user-2', content: 'Existing chat history', timestamp: '2026-10-09T12:00:00Z' }],
    });
    getClub.mockResolvedValue({
      id: clubId, title: 'Existing group', summary: '', tags: [], currentUserRole: 'owner',
      conversationId, joinRequestStatus: 'member', memberCount: 2,
    });
    createMessage.mockResolvedValue({ id: 'msg-2', userId: 'user-1', content: 'Chat still works', timestamp: '2026-10-09T12:01:00Z' });
    const view = () => <MemoryRouter initialEntries={[`/chat/${conversationId}`]}><Routes>
      <Route path="/chat/:chatId" element={<PrivateGroupChat />} />
      <Route path="/chat/group/:chatId/settings" element={<PrivateGroupChat />} />
    </Routes></MemoryRouter>;
    const { rerender } = render(view());
    expect(await screen.findByText('Existing chat history')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Drop the plan...'), { target: { value: 'Chat still works' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(createMessage).toHaveBeenCalledWith(conversationId, 'Chat still works'));
    fireEvent.click(screen.getByRole('button', { name: 'Conversation settings' }));
    const pulse = await screen.findByRole('button', { name: 'Pulse group' });
    expect(pulse).toBeDisabled();
    fireEvent.click(pulse);
    expect(sendGroupPulse).not.toHaveBeenCalled();

    // A fresh effective in-area result, including MHC, restores only Pulse access.
    serviceArea.profilePinsAllowed = true;
    rerender(view());
    expect(pulse).toBeEnabled();
    fireEvent.click(pulse);
    await waitFor(() => expect(sendGroupPulse).toHaveBeenCalledWith(conversationId));
    expect(await screen.findByText('Group Pulse sent. 0 of 1 Pulses remain.')).toBeInTheDocument();
  });

  it('keeps Club administration inside the existing Conversation settings menu', async () => {
    const conversationId = '44444444-4444-4444-8444-444444444444';
    const clubId = '22222222-2222-4222-8222-222222222222';
    getConversationMessages.mockResolvedValue({
      conversation: {
        id: conversationId,
        kind: 'group',
        clubId,
        user: { id: conversationId, name: 'Brooklyn techno', pronouns: '', photo: null },
        distance: 'Nearby',
        updatedAt: '2026-10-02T12:00:00.000Z',
        lastMessage: 'Meet at 10',
        unreadCount: 0,
        pinned: false,
        tags: ['techno'],
        membersLabel: '2 people',
        currentUserRole: 'owner',
        disappearingTimer: '24h',
      },
      messages: [],
    });
    getClub.mockResolvedValue({
      id: clubId,
      title: 'Brooklyn techno',
      summary: 'A Club for local dancers.',
      tags: ['techno'],
      currentUserRole: 'owner',
      conversationId,
      joinRequestStatus: 'member',
      memberCount: 2,
    });
    getClubJoinRequests.mockResolvedValue([{
      userId: '33333333-3333-4333-8333-333333333333',
      name: 'River',
      photo: null,
      requestedAt: '2026-10-02T12:01:00.000Z',
    }]);
    getGroupMembers.mockResolvedValue([{
      id: '33333333-3333-4333-8333-333333333333',
      name: 'River',
      pronouns: 'they/them',
      photo: null,
      role: 'member',
      joinedAt: '2026-10-02T12:00:00.000Z',
    }]);
    updateClub.mockResolvedValue({
      id: clubId,
      title: 'Brooklyn techno',
      summary: 'Updated description.',
      tags: ['techno'],
      currentUserRole: 'owner',
      conversationId,
      joinRequestStatus: 'member',
      memberCount: 2,
    });
    reviewClubJoinRequest.mockResolvedValue({ decision: 'approve' });
    setClubMemberRole.mockResolvedValue(undefined);

    render(
      <MemoryRouter initialEntries={[`/chat/${conversationId}`]}>
        <Routes>
          <Route path="/chat/:chatId" element={<PrivateGroupChat />} />
          <Route path="/chat/group/:chatId/settings" element={<PrivateGroupChat />} />
        </Routes>
      </MemoryRouter>,
    );

    const header = await screen.findByTestId('chat-thread-header');
    expect(within(header).getByText('Brooklyn techno')).toBeInTheDocument();
    expect(within(header).queryByText('Coven')).not.toBeInTheDocument();
    expect(within(header).queryByLabelText('Brooklyn techno avatar')).not.toBeInTheDocument();
    expect(screen.queryByText('#techno')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share Coven' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Coven' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Conversation settings' }));
    fireEvent.change(await screen.findByLabelText('Coven settings short description'), { target: { value: 'Updated description.' } });
    const approvalSwitch = screen.getByRole('switch', { name: 'Require approval to join' });
    expect(approvalSwitch).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(approvalSwitch);
    expect(approvalSwitch).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('button', { name: 'Visibility Controls' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save Coven' }));
    await waitFor(() => expect(updateClub).toHaveBeenCalledWith(clubId, {
      title: 'Brooklyn techno',
      summary: 'Updated description.',
      tags: ['techno'],
      requiresJoinApproval: false,
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(reviewClubJoinRequest).toHaveBeenCalledWith(
      clubId,
      '33333333-3333-4333-8333-333333333333',
      'approve',
    ));
    fireEvent.click(screen.getByRole('button', { name: 'Make moderator' }));
    await waitFor(() => expect(setClubMemberRole).toHaveBeenCalledWith(
      conversationId,
      '33333333-3333-4333-8333-333333333333',
      'moderator',
    ));
  });

  it('lets Club moderators review requests without exposing admin settings', async () => {
    const conversationId = '44444444-4444-4444-8444-444444444444';
    const clubId = '22222222-2222-4222-8222-222222222222';
    getConversationMessages.mockResolvedValue({
      conversation: {
        id: conversationId,
        kind: 'group',
        clubId,
        user: { id: conversationId, name: 'Brooklyn techno', pronouns: '', photo: null },
        distance: 'Nearby',
        updatedAt: '2026-10-02T12:00:00.000Z',
        lastMessage: 'Meet at 10',
        unreadCount: 0,
        pinned: false,
        tags: ['techno'],
        membersLabel: '2 people',
        currentUserRole: 'moderator',
        disappearingTimer: '24h',
      },
      messages: [{
        id: '55555555-5555-4555-8555-555555555555',
        userId: '33333333-3333-4333-8333-333333333333',
        content: 'Meet at 10',
        timestamp: '2026-10-02T12:00:00.000Z',
      }],
    });
    getClub.mockResolvedValue({
      id: clubId,
      title: 'Brooklyn techno',
      summary: 'A Club for local dancers.',
      tags: ['techno'],
      currentUserRole: 'moderator',
      conversationId,
      joinRequestStatus: 'member',
      memberCount: 2,
    });
    getClubJoinRequests.mockResolvedValue([{
      userId: '33333333-3333-4333-8333-333333333333',
      name: 'River',
      photo: null,
      requestedAt: '2026-10-02T12:01:00.000Z',
    }]);
    reviewClubJoinRequest.mockResolvedValue({ decision: 'approve' });

    render(
      <MemoryRouter initialEntries={[`/chat/${conversationId}`]}>
        <Routes>
          <Route path="/chat/:chatId" element={<PrivateGroupChat />} />
          <Route path="/chat/group/:chatId/settings" element={<PrivateGroupChat />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('button', { name: 'Delete message' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Conversation settings' }));
    expect(await screen.findByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Coven settings short description')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear chat for everyone' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(reviewClubJoinRequest).toHaveBeenCalledWith(
      clubId,
      '33333333-3333-4333-8333-333333333333',
      'approve',
    ));
  });

  it('lets each Club member choose @me notifications and a temporary mute', async () => {
    const conversationId = '44444444-4444-4444-8444-444444444444';
    const conversation = {
      id: conversationId,
      kind: 'group' as const,
      clubId: '22222222-2222-4222-8222-222222222222',
      user: { id: conversationId, name: 'Brooklyn techno', pronouns: '', photo: null },
      distance: 'Nearby',
      updatedAt: '2026-10-02T12:00:00.000Z',
      lastMessage: 'Meet at 10',
      unreadCount: 0,
      pinned: false,
      tags: ['techno'],
      membersLabel: '2 people',
      currentUserRole: 'member' as const,
      disappearingTimer: '24h' as const,
      notificationLevel: 'all' as const,
      muted: false,
      mutedUntil: null,
    };
    getConversationMessages.mockResolvedValue({ conversation, messages: [] });
    setConversationNotifications
      .mockResolvedValueOnce({ ...conversation, notificationLevel: 'mentions' })
      .mockResolvedValueOnce({ ...conversation, notificationLevel: 'mentions', muted: true, mutedUntil: '2026-10-02T20:00:00.000Z' });

    render(
      <MemoryRouter initialEntries={[`/chat/${conversationId}`]}>
        <Routes>
          <Route path="/chat/:chatId" element={<PrivateGroupChat />} />
          <Route path="/chat/group/:chatId/settings" element={<PrivateGroupChat />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Conversation settings' }));
    expect(screen.queryByText('Join requests')).not.toBeInTheDocument();
    expect(getClubJoinRequests).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByLabelText('Group or Coven notification level'));
    fireEvent.click(await screen.findByRole('option', { name: '@me only' }));
    await waitFor(() => expect(setConversationNotifications).toHaveBeenCalledWith(conversationId, { notificationLevel: 'mentions' }));

    fireEvent.click(screen.getByLabelText('Temporarily mute Group or Coven'));
    fireEvent.click(await screen.findByRole('option', { name: 'Mute for 8 hours' }));
    await waitFor(() => expect(setConversationNotifications).toHaveBeenCalledWith(conversationId, { muteFor: '8h' }));
  });

  it('lets group admins change timers and clear history from conversation settings', async () => {
    const conversationId = '7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2';
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    getConversationMessages.mockResolvedValue({
      conversation: {
        id: conversationId,
        kind: 'group',
        user: {
          id: 'group-1',
          name: 'Beta crew',
          pronouns: '',
          photo: null,
        },
        distance: 'Nearby',
        updatedAt: '2026-04-29T12:00:00.000Z',
        lastMessage: 'old plan',
        unreadCount: 0,
        pinned: false,
        tags: [],
        membersLabel: '3 people',
        currentUserRole: 'owner',
        disappearingTimer: '24h',
      },
      messages: [{
        id: 'msg-1',
        userId: 'user-2',
        content: 'old plan',
        timestamp: '2026-04-29T12:00:00.000Z',
      }],
    });
    setConversationDisappearingTimer.mockResolvedValue({
      id: conversationId,
      kind: 'group',
      user: {
        id: 'group-1',
        name: 'Beta crew',
        pronouns: '',
        photo: null,
      },
      distance: 'Nearby',
      updatedAt: '2026-04-29T12:01:00.000Z',
      lastMessage: 'old plan',
      unreadCount: 0,
      pinned: false,
      tags: [],
      membersLabel: '3 people',
      currentUserRole: 'owner',
      disappearingTimer: '1h',
    });
    clearConversationForEveryone.mockResolvedValue({
      id: conversationId,
      kind: 'group',
      user: {
        id: 'group-1',
        name: 'Beta crew',
        pronouns: '',
        photo: null,
      },
      distance: 'Nearby',
      updatedAt: '2026-04-29T12:02:00.000Z',
      lastMessage: '',
      unreadCount: 0,
      pinned: false,
      tags: [],
      membersLabel: '3 people',
      currentUserRole: 'owner',
      disappearingTimer: '1h',
    });

    render(
      <MemoryRouter initialEntries={[`/chat/${conversationId}`]}>
        <Routes>
          <Route path="/chat/:chatId" element={<PrivateGroupChat />} />
          <Route path="/chat/group/:chatId/settings" element={<PrivateGroupChat />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Conversation settings' }));
    const settingsTimer = await screen.findByLabelText('Disappearing timer');
    expect(settingsTimer).toHaveAttribute('data-slot', 'select-trigger');
    expect(screen.queryByRole('combobox', { name: 'Disappearing timer', hidden: true })).toBe(settingsTimer);

    fireEvent.click(settingsTimer);
    fireEvent.click(await screen.findByRole('option', { name: '1 hour' }));

    await waitFor(() => {
      expect(setConversationDisappearingTimer).toHaveBeenCalledWith(conversationId, '1h');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clear chat for everyone' }));
    await waitFor(() => {
      expect(clearConversationForEveryone).toHaveBeenCalledWith(conversationId);
    });
    expect(screen.queryByText('old plan')).not.toBeInTheDocument();

    confirmSpy.mockRestore();
  });

  it('lets users delete a DM chat for everyone from conversation settings', async () => {
    const conversationId = '7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2';
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    getConversationMessages.mockResolvedValue({
      conversation: {
        id: conversationId,
        kind: 'dm',
        user: {
          id: 'user-2',
          name: 'River',
          pronouns: 'they/them',
          photo: null,
        },
        distance: 'Nearby',
        updatedAt: '2026-04-29T12:00:00.000Z',
        lastMessage: '',
        unreadCount: 0,
        pinned: false,
        tags: [],
        mutual: true,
        disappearingTimer: 'off',
      },
      messages: [],
    });
    deleteConversationForEveryone.mockResolvedValue(undefined);

    render(
      <MemoryRouter initialEntries={[`/chat/${conversationId}`]}>
        <Routes>
          <Route path="/chat/:chatId" element={<><PrivateGroupChat /><LocationProbe /></>} />
          <Route path="/chat/:chatId/settings" element={<><PrivateGroupChat /><LocationProbe /></>} />
          <Route path="/messages" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Conversation settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete chat for everyone' }));

    expect(confirmSpy).toHaveBeenCalledWith('Delete this chat for everyone? This removes the chat and its messages for all participants.');
    await waitFor(() => {
      expect(deleteConversationForEveryone).toHaveBeenCalledWith(conversationId);
    });
    await waitFor(() => {
      expect(screen.getByTestId('location-probe')).toHaveTextContent('/messages');
    });

    confirmSpy.mockRestore();
  });

  it('lets users change the disappearing timer from the composer', async () => {
    const conversationId = '7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2';
    getConversationMessages.mockResolvedValue({
      conversation: {
        id: conversationId,
        kind: 'dm',
        user: {
          id: 'user-2',
          name: 'River',
          pronouns: '',
          photo: null,
        },
        distance: 'Nearby',
        updatedAt: '2026-04-29T12:00:00.000Z',
        lastMessage: '',
        unreadCount: 0,
        pinned: false,
        tags: [],
        mutual: true,
        disappearingTimer: 'off',
      },
      messages: [],
    });
    setConversationDisappearingTimer.mockResolvedValue({
      id: conversationId,
      kind: 'dm',
      user: {
        id: 'user-2',
        name: 'River',
        pronouns: '',
        photo: null,
      },
      distance: 'Nearby',
      updatedAt: '2026-04-29T12:01:00.000Z',
      lastMessage: '',
      unreadCount: 0,
      pinned: false,
      tags: [],
      mutual: true,
      disappearingTimer: '1h',
    });

    render(
      <MemoryRouter initialEntries={[`/chat/${conversationId}`]}>
        <Routes>
          <Route path="/chat/:chatId" element={<PrivateGroupChat />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('No messages yet.')).toBeInTheDocument();
    expect(screen.getByLabelText('Message disappearing timer')).toBeInTheDocument();
    expect(screen.queryByText('Applies to new messages.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Message disappearing timer'));
    fireEvent.click(await screen.findByRole('option', { name: '1 hour' }));

    await waitFor(() => {
      expect(setConversationDisappearingTimer).toHaveBeenCalledWith(conversationId, '1h');
    });
  });

  it('keeps the mobile composer above the bottom nav without horizontal overflow', async () => {
    let composerTop = 395;
    const originalBounds = HTMLElement.prototype.getBoundingClientRect;
    const bounds = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      if (this.dataset.testid === 'chat-composer-bar') return { ...originalBounds.call(this), top: composerTop, bottom: 630, height: 630 - composerTop } as DOMRect;
      if (this.dataset.testid === 'app-page-content') return { ...originalBounds.call(this), top: 57, bottom: 622, height: 565 } as DOMRect;
      return originalBounds.call(this);
    });
    const conversationId = '7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2';
    getConversationMessages.mockResolvedValue({
      conversation: {
        id: conversationId,
        kind: 'dm',
        user: {
          id: 'user-2',
          name: 'River',
          pronouns: '',
          photo: null,
        },
        distance: 'Nearby',
        updatedAt: '2026-04-29T12:00:00.000Z',
        lastMessage: '',
        unreadCount: 0,
        pinned: false,
        tags: [],
        mutual: true,
        disappearingTimer: 'off',
      },
      messages: [],
    });

    try {
      render(
        <div data-testid="app-page-content">
        <MemoryRouter initialEntries={[`/chat/${conversationId}`]}>
          <Routes>
            <Route path="/chat/:chatId" element={<PrivateGroupChat />} />
          </Routes>
        </MemoryRouter>
        </div>,
      );

      expect(await screen.findByText('No messages yet.')).toBeInTheDocument();

      expect(screen.getByTestId('private-group-chat-screen')).toHaveClass('max-w-full', 'overflow-x-clip');
      expect(screen.getByTestId('chat-thread-header')).toHaveClass('sticky', 'top-0', 'z-40');

      const composerBar = screen.getByTestId('chat-composer-bar');
      expect(composerBar).toHaveClass(
        'bottom-[var(--chat-composer-bottom)]',
        'max-w-[100vw]',
        'overflow-x-hidden',
      );
      expect(composerBar.style.getPropertyValue('--chat-composer-bottom')).toBe('var(--cruush-nav-clearance, calc(6rem + env(safe-area-inset-bottom)))');
      expect(composerBar).toHaveClass('pb-0');
      expect(screen.getByTestId('chat-composer-underlay').style.height).toBe(composerBar.style.getPropertyValue('--chat-composer-bottom'));
      expect(screen.getByPlaceholderText('Say what you want...')).toHaveClass('min-w-0', 'flex-1');
      expect(screen.getByRole('button', { name: 'Send message' })).toHaveClass('size-9', 'rounded-full');
      expect(screen.getByTestId('chat-thread-content')).toHaveStyle({ paddingBottom: '227px' });
      const viewport = screen.getByTestId('app-page-content');
      viewport.scrollTop = 64;
      composerTop = 450;
      fireEvent(window, new Event('resize'));
      expect(screen.getByTestId('chat-thread-content')).toHaveStyle({ paddingBottom: '172px' });
      expect(viewport.scrollTop).toBe(64);
    } finally {
      bounds.mockRestore();
    }
  });

  it.each([false, true])('keeps focus steady and recognizes layout keyboard shrink only on mobile (mobile=%s)', async (mobile) => {
    const userAgent = vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(mobile ? 'Mozilla/5.0 (Linux; Android 15)' : 'Desktop browser');
    const visualViewport = mockVisualViewport({ height: 900, innerHeight: 900 });
    const conversationId = '7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2';
    getConversationMessages.mockResolvedValue({
      conversation: {
        id: conversationId,
        kind: 'dm',
        user: { id: 'user-2', name: 'River', pronouns: '', photo: null },
        distance: 'Nearby',
        updatedAt: '2026-04-29T12:00:00.000Z',
        lastMessage: '',
        unreadCount: 0,
        pinned: false,
        tags: [],
        mutual: true,
        disappearingTimer: 'off',
      },
      messages: [],
    });

    try {
      render(
        <MemoryRouter initialEntries={[`/chat/${conversationId}`]}>
          <Routes>
            <Route path="/chat/:chatId" element={<PrivateGroupChat />} />
          </Routes>
        </MemoryRouter>,
      );

      expect(await screen.findByText('No messages yet.')).toBeInTheDocument();

      const composerBar = screen.getByTestId('chat-composer-bar');
      expect(composerBar.style.getPropertyValue('--chat-composer-bottom')).toBe('var(--cruush-nav-clearance, calc(6rem + env(safe-area-inset-bottom)))');

      // Desktop focus (and focus before a mobile keyboard appears) cannot drop
      // the composer underneath the bottom navigation.
      fireEvent.focus(screen.getByPlaceholderText('Say what you want...'));
      expect(composerBar.style.getPropertyValue('--chat-composer-bottom')).toBe('var(--cruush-nav-clearance, calc(6rem + env(safe-area-inset-bottom)))');
      expect(composerBar).toHaveClass('pb-0');

      // A mobile layout resize is a keyboard; an ordinary desktop window
      // resize with a focused textarea must keep the navigation clearance.
      visualViewport.viewport.height = 520;
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 520 });
      fireEvent(window, new Event('resize'));
      await waitFor(() => expect(composerBar.style.getPropertyValue('--chat-composer-bottom')).toBe(mobile ? '0px' : 'var(--cruush-nav-clearance, calc(6rem + env(safe-area-inset-bottom)))'));
      expect(composerBar).toHaveClass(mobile ? 'pb-3' : 'pb-0');
      expect(document.documentElement.dataset.cruushDmKeyboardOpen).toBe(mobile ? 'true' : undefined);

      visualViewport.viewport.height = 900;
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
      fireEvent(window, new Event('resize'));
      await waitFor(() => expect(composerBar.style.getPropertyValue('--chat-composer-bottom')).toBe('var(--cruush-nav-clearance, calc(6rem + env(safe-area-inset-bottom)))'));

      fireEvent.blur(screen.getByPlaceholderText('Say what you want...'));

      await waitFor(() => expect(composerBar.style.getPropertyValue('--chat-composer-bottom')).toBe('var(--cruush-nav-clearance, calc(6rem + env(safe-area-inset-bottom)))'));
    } finally {
      visualViewport.restore();
      userAgent.mockRestore();
    }
  });

  it.each([
    { name: 'Android visual inset', baseline: 900, innerHeight: 900, height: 520, offsetTop: 0, inset: '380px' },
    { name: 'Safari first native keyboard pan', baseline: 714, innerHeight: 524, height: 377, offsetTop: 190, inset: '147px' },
    { name: 'Safari second native keyboard pan', baseline: 714, innerHeight: 377, height: 377, offsetTop: 337, inset: '0px' },
  ])('positions the mobile composer using actual keyboard geometry: $name', async ({ baseline, innerHeight, height, offsetTop, inset }) => {
    const originalClientHeight = Object.getOwnPropertyDescriptor(document.documentElement, 'clientHeight');
    Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, value: baseline });
    const visualViewport = mockVisualViewport({
      height: baseline,
      innerHeight: baseline,
    });
    const conversationId = '7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2';
    getConversationMessages.mockResolvedValue({
      conversation: {
        id: conversationId,
        kind: 'dm',
        user: {
          id: 'user-2',
          name: 'River',
          pronouns: '',
          photo: null,
        },
        distance: 'Nearby',
        updatedAt: '2026-04-29T12:00:00.000Z',
        lastMessage: '',
        unreadCount: 0,
        pinned: false,
        tags: [],
        mutual: true,
        disappearingTimer: 'off',
      },
      messages: [],
    });

    try {
      render(
        <MemoryRouter initialEntries={[`/chat/${conversationId}`]}>
          <Routes>
            <Route path="/chat/:chatId" element={<PrivateGroupChat />} />
          </Routes>
        </MemoryRouter>,
      );

      expect(await screen.findByText('No messages yet.')).toBeInTheDocument();

      const composerBar = screen.getByTestId('chat-composer-bar');
      fireEvent.focus(screen.getByPlaceholderText('Say what you want...'));
      visualViewport.viewport.height = height;
      visualViewport.viewport.offsetTop = offsetTop;
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: innerHeight });
      fireEvent(window, new Event('resize'));

      await waitFor(() => expect(composerBar).toHaveAttribute('data-keyboard-open', 'true'));
      // Flush on the keyboard: no rem gap and no safe-area on top, since the
      // keyboard already covers that zone.
      expect(composerBar.style.getPropertyValue('--chat-composer-bottom')).toBe(inset);
      expect(composerBar).toHaveClass('pb-3');
      expect(screen.getByTestId('chat-composer-underlay')).toHaveStyle({ height: inset });
      expect(document.documentElement.dataset.cruushDmKeyboardOpen).toBe('true');

      visualViewport.viewport.height = baseline;
      visualViewport.viewport.offsetTop = 0;
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: baseline });
      visualViewport.dispatch('resize');

      await waitFor(() => expect(composerBar).not.toHaveAttribute('data-keyboard-open'));
      expect(composerBar.style.getPropertyValue('--chat-composer-bottom')).toBe('var(--cruush-nav-clearance, calc(6rem + env(safe-area-inset-bottom)))');
      expect(composerBar).toHaveClass('pb-0');
      expect(document.documentElement.dataset.cruushDmKeyboardOpen).toBeUndefined();
      expect(screen.getByTestId('chat-composer-underlay').style.height).toBe(composerBar.style.getPropertyValue('--chat-composer-bottom'));
    } finally {
      visualViewport.restore();
      if (originalClientHeight) Object.defineProperty(document.documentElement, 'clientHeight', originalClientHeight);
      else delete (document.documentElement as unknown as { clientHeight?: number }).clientHeight;
    }
  });

  describe('initial newest-message positioning', () => {
    function scrollHarness() {
      let frameId = 0;
      const frames = new Map<number, FrameRequestCallback>();
      const observers = new Set<{ callback: ResizeObserverCallback; targets: Set<Element> }>();
      vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId; });
      vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id); });
      vi.stubGlobal('ResizeObserver', class {
        callback: ResizeObserverCallback;
        targets = new Set<Element>();
        constructor(callback: ResizeObserverCallback) { this.callback = callback; observers.add(this); }
        observe(target: Element) { this.targets.add(target); }
        unobserve(target: Element) { this.targets.delete(target); }
        disconnect() { observers.delete(this); }
      });
      return {
        flush() { act(() => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(0)); }); },
        resize(target: Element) { act(() => { [...observers].filter(observer => observer.targets.has(target)).forEach(observer => observer.callback([], observer as unknown as ResizeObserver)); }); },
        restore() { vi.unstubAllGlobals(); },
      };
    }
    const conversationId = 'initial-scroll-conversation';
    function chatData(kind: 'dm' | 'group', extraMessage = false) {
      return {
        conversation: { id: conversationId, kind, user: { id: 'user-2', name: 'River', pronouns: '', photo: null },
          distance: 'Nearby', updatedAt: '2026-04-29T12:00:00.000Z', lastMessage: 'Newest message', unreadCount: 0, pinned: false, tags: [], mutual: true },
        messages: [{ id: 'latest-message', userId: 'user-2', content: 'Newest message', timestamp: '2026-04-29T12:05:00.000Z' },
          ...(extraMessage ? [{ id: 'later-message', userId: 'user-2', content: 'Later incoming message', timestamp: '2026-04-29T12:06:00.000Z' }] : [])],
      };
    }
    it.each([
      ['dm', 'app-page-content'], ['group', 'app-page-content'],
      ['dm', 'popup-route-content'], ['group', 'popup-route-content'],
      ['dm', 'map-side-panel-content'], ['group', 'map-side-panel-content'],
    ] as const)('positions deferred %s history in only the nearest %s viewport', async (kind, surface) => {
      const harness = scrollHarness();
      let resolveChat!: (data: ReturnType<typeof chatData>) => void;
      getConversationMessages.mockReturnValue(new Promise(resolve => { resolveChat = resolve; }));
      const chat = <PrivateGroupChat conversationId={conversationId} embedded={surface !== 'app-page-content'} />;
      const rendered = render(<MemoryRouter><div data-testid="app-page-content">{surface === 'app-page-content' ? chat : <div data-testid={surface}>{chat}</div>}</div></MemoryRouter>);
      try {
        const outer = screen.getByTestId('app-page-content');
        const viewport = screen.getByTestId(surface);
        Object.defineProperty(viewport, 'scrollHeight', { configurable: true, value: 1600 });
        Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 600 });
        outer.scrollTop = 71;
        if (viewport !== outer) viewport.scrollTop = 13;
        harness.flush();
        expect(viewport.scrollTop).toBe(viewport === outer ? 71 : 13);
        await act(async () => { resolveChat(chatData(kind)); });
        expect(await screen.findByText('Newest message')).toBeInTheDocument();
        // Parent route-reset layout effects run before this queued frame.
        viewport.scrollTop = 0;
        harness.flush();
        expect(viewport.scrollTop).toBe(1000);
        if (viewport !== outer) expect(outer.scrollTop).toBe(71);
        Object.defineProperty(viewport, 'scrollHeight', { configurable: true, value: 1800 });
        harness.resize(screen.getByTestId('chat-thread-content'));
        harness.flush();
        expect(viewport.scrollTop).toBe(1200);
        if (viewport !== outer) expect(outer.scrollTop).toBe(71);
      } finally { rendered.unmount(); harness.restore(); }
    });

    it.each(['wheel', 'scroll', 'keyboard'] as const)('preserves older history after %s through later messages and media resizing', async input => {
      const harness = scrollHarness();
      getConversationMessages.mockResolvedValue(chatData('group'));
      const rendered = render(<MemoryRouter><div data-testid="app-page-content"><PrivateGroupChat conversationId={conversationId} /></div></MemoryRouter>);
      try {
        const viewport = screen.getByTestId('app-page-content');
        Object.defineProperty(viewport, 'scrollHeight', { configurable: true, value: 1600 });
        Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 600 });
        await screen.findByText('Newest message'); harness.flush();
        expect(viewport.scrollTop).toBe(1000);
        // Queue late layout work before the reader moves, to test its cancellation.
        harness.resize(screen.getByTestId('chat-thread-content'));
        if (input === 'wheel') fireEvent.wheel(viewport, { deltaY: -100 });
        if (input === 'keyboard') fireEvent.keyDown(viewport, { key: 'PageUp' });
        viewport.scrollTop = 240;
        if (input === 'scroll') fireEvent.scroll(viewport);
        harness.flush();
        expect(viewport.scrollTop).toBe(240);
        getConversationMessages.mockResolvedValue(chatData('group', true));
        act(() => refreshContentVisibility());
        await screen.findByText('Later incoming message');
        Object.defineProperty(viewport, 'scrollHeight', { configurable: true, value: 2000 });
        harness.resize(screen.getByTestId('chat-thread-content'));
        harness.resize(viewport);
        harness.flush();
        expect(viewport.scrollTop).toBe(240);
      } finally { rendered.unmount(); harness.restore(); }
    });
  });

  it.each(['bottom', 'latest visible', 'older history'])('retains only a latest-message reader during keyboard resize: %s', async position => {
    const vv = mockVisualViewport({ height: 900, innerHeight: 900 });
    const conversationId = '7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2';
    getConversationMessages.mockResolvedValue({
      conversation: { id: conversationId, kind: 'dm', user: { id: 'user-2', name: 'River', pronouns: '', photo: null },
        distance: 'Nearby', updatedAt: '2026-04-29T12:00:00.000Z', lastMessage: 'Latest message', unreadCount: 0, pinned: false, tags: [], mutual: true },
      messages: [{ id: 'latest-message', userId: 'user-2', content: 'Latest message', timestamp: '2026-04-29T12:05:00.000Z' }],
    });
    try {
      render(<div data-testid="app-page-content"><MemoryRouter initialEntries={[`/chat/${conversationId}`]}><Routes><Route path="/chat/:chatId" element={<PrivateGroupChat />} /></Routes></MemoryRouter></div>);
      const latest = await screen.findByText('Latest message');
      const viewport = screen.getByTestId('app-page-content');
      Object.defineProperty(viewport, 'scrollHeight', { configurable: true, value: 1200 });
      Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 600 });
      viewport.scrollTop = position === 'bottom' ? 600 : position === 'latest visible' ? 450 : 100;
      const initialScroll = viewport.scrollTop;
      vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 600, height: 600 } as DOMRect);
      vi.spyOn(screen.getByTestId('chat-composer-bar'), 'getBoundingClientRect').mockReturnValue({ top: 600, bottom: 755, height: 155 } as DOMRect);
      const row = latest.closest('.items-end') as HTMLElement;
      vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({ top: 500, bottom: position === 'latest visible' ? 550 : 950, height: 50 } as DOMRect);
      fireEvent.focus(screen.getByPlaceholderText('Say what you want...'));
      expect(viewport.scrollTop).toBe(initialScroll);
      Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 350 });
      vv.viewport.height = 520;
      fireEvent(window, new Event('resize'));
      await waitFor(() => expect(screen.getByTestId('chat-composer-bar')).toHaveAttribute('data-keyboard-open', 'true'));
      if (position === 'older history') {
        await new Promise(resolve => setTimeout(resolve, 40));
        expect(viewport.scrollTop).toBe(initialScroll);
      } else {
        await waitFor(() => expect(viewport.scrollTop).toBe(850));
        fireEvent.wheel(viewport);
        viewport.scrollTop = 100;
        vv.viewport.height = 480;
        fireEvent(window, new Event('resize'));
        await new Promise(resolve => setTimeout(resolve, 40));
        expect(viewport.scrollTop).toBe(100);
      }
    } finally { vv.restore(); }
  });

  it.each([undefined, 'mutual_cruushes', 'mutual_crowds'] as Array<NsfwPhotoRestriction | undefined>)('opens an eligible view-once photo only after tapping; owner restriction=%s', async (restriction) => {
    setDlModeEnabled(false);
    const conversationId = '7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2';
    getConversationMessages.mockResolvedValue({
      conversation: {
        id: conversationId,
        kind: 'group',
        user: {
          id: 'group-1',
          name: 'Beta crew',
          pronouns: '',
          photo: null,
        },
        distance: 'Nearby',
        updatedAt: '2026-04-29T12:00:00.000Z',
        lastMessage: 'photo',
        unreadCount: 0,
        pinned: false,
        tags: [],
        membersLabel: '3 people',
        currentUserRole: 'member',
        disappearingTimer: '24h',
      },
      messages: [{
        id: 'msg-photo',
        userId: 'user-2',
        content: '',
        timestamp: '2026-04-29T12:00:00.000Z',
        attachments: [{
          id: 'media-1',
          url: '/api/media/message-photos/photo.png',
          mediaType: 'image',
          mimeType: 'image/png',
          viewOnce: true,
          explicit: Boolean(restriction),
          photoRelationship: restriction ? { isMutualCruush: false, sharesCrowd: false, nsfwPhotoRestriction: restriction } : undefined,
        }],
      }],
    });
    viewMessageAttachment.mockResolvedValue('blob:view-once-photo');

    render(
      <MemoryRouter initialEntries={[`/chat/${conversationId}`]}>
        <Routes>
          <Route path="/chat/:chatId" element={<PrivateGroupChat />} />
        </Routes>
      </MemoryRouter>,
    );

    if (restriction) {
      await screen.findByTestId('explicit-message-gradient-msg-photo:media-1');
      expect(screen.queryByRole('button', { name: 'Open view-once photo' })).not.toBeInTheDocument();
      expect(viewMessageAttachment).not.toHaveBeenCalled();
      expect(screen.queryByAltText('View-once photo')).not.toBeInTheDocument();
      return;
    }
    expect(await screen.findByRole('button', { name: 'Open view-once photo' })).toBeInTheDocument();
    expect(screen.queryByAltText('View-once photo')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open view-once photo' }));

    await waitFor(() => {
      expect(viewMessageAttachment).toHaveBeenCalledWith('msg-photo', 'media-1');
    });
    expect(await screen.findByAltText('View-once photo')).toHaveAttribute('src', 'blob:view-once-photo');
    const viewer = screen.getByRole('dialog', { name: 'View-once photo viewer' });
    expect(within(viewer).getByAltText('View-once photo')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open view-once photo' })).not.toBeInTheDocument();
    fireEvent.click(within(viewer).getByRole('button', { name: 'Close view-once photo' }));
    expect(screen.queryByRole('dialog', { name: 'View-once photo viewer' })).not.toBeInTheDocument();
    expect(screen.queryByAltText('View-once photo')).not.toBeInTheDocument();
    expect(screen.getByText('View-once photo viewed')).toBeInTheDocument();
    expect(viewMessageAttachment).toHaveBeenCalledTimes(1);

  });

  it.each([
    { kind: 'group' as const, closed: true, canMessage: true, placeholder: 'Group closed' },
    { kind: 'dm' as const, closed: false, canMessage: false, placeholder: 'cruushes only' },
  ])('disables the composer for $placeholder while keeping the thread open', async ({ kind, closed, canMessage, placeholder }) => {
    getConversationMessages.mockResolvedValue({
      conversation: {
        id: '7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2',
        kind,
        user: {
          id: 'group-1',
          name: 'Beta crew',
          pronouns: '',
          photo: null,
        },
        distance: 'Nearby',
        updatedAt: '2026-04-29T12:00:00.000Z',
        lastMessage: '',
        unreadCount: 0,
        pinned: false,
        tags: [],
        membersLabel: '3 people',
        currentUserRole: 'owner',
        disappearingTimer: 'off',
        closed,
        canMessage,
      },
      messages: [],
    });

    render(
      <MemoryRouter initialEntries={['/chat/7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2']}>
        <Routes>
          <Route path="/chat/:chatId" element={<PrivateGroupChat />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByPlaceholderText(placeholder)).toBeDisabled();
    if (closed) expect(screen.getByText('This group is closed.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
    expect(screen.getByLabelText('Choose message photo')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Attach photo' })).toBeDisabled();
  });
});
