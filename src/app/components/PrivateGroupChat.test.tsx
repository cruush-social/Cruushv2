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
  removeFavoriteMessageImage,
  sendFavoriteMessageImage,
  setConversationDisappearingTimer,
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
  removeFavoriteMessageImage: vi.fn(),
  sendFavoriteMessageImage: vi.fn(),
  setConversationDisappearingTimer: vi.fn(),
  uploadFavoriteMessageImage: vi.fn(),
  viewMessageAttachment: vi.fn(),
}));

const { blockUser } = vi.hoisted(() => ({
  blockUser: vi.fn(),
}));

const { createReport } = vi.hoisted(() => ({
  createReport: vi.fn(),
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
    removeFavoriteMessageImage,
    sendFavoriteMessageImage,
    setConversationDisappearingTimer,
    uploadFavoriteMessageImage,
    viewMessageAttachment,
  };
});

vi.mock('../lib/blockApi', () => ({
  blockUser,
}));

vi.mock('../lib/reportApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/reportApi')>('../lib/reportApi');
  return { ...actual, createReport };
});

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
    window.localStorage.removeItem('cruush:dl-mode-show-only-exception');
    clearConversationForEveryone.mockReset();
    createMessage.mockReset();
    createMessagePhoto.mockReset();
    deleteConversationForEveryone.mockReset();
    getFavoriteMessageImages.mockReset();
    getConversationMessages.mockReset();
    getCurrentUserId.mockReset();
    getGroupMembers.mockReset();
    removeFavoriteMessageImage.mockReset();
    sendFavoriteMessageImage.mockReset();
    setConversationDisappearingTimer.mockReset();
    uploadFavoriteMessageImage.mockReset();
    viewMessageAttachment.mockReset();
    blockUser.mockReset();
    createReport.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
    getCurrentUserId.mockResolvedValue('user-1');
    getGroupMembers.mockResolvedValue([]);
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
    expect(screen.queryByText('Preview thread')).not.toBeInTheDocument();
    expect(screen.queryByText('hosting for another hour if you still want to swing by')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open River profile' })).not.toBeInTheDocument();
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

  it('navigates to the report page from the conversation safety action', async () => {
    getConversationMessages.mockResolvedValue({
      conversation: {
        id: '7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2',
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

    fireEvent.click(await screen.findByRole('button', { name: 'Report conversation' }));
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'harassment' } });
    fireEvent.change(screen.getByLabelText('Additional details (optional)'), {
      target: { value: 'Repeated unwanted messages.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit report' }));

    await waitFor(() => expect(createReport).toHaveBeenCalledWith({
      targetType: 'conversation',
      targetId: '7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2',
      reason: 'harassment',
      details: 'Repeated unwanted messages.',
    }));
    expect(toastSuccess).toHaveBeenCalledWith('Report submitted.');
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

  it('lets users report an individual incoming message', async () => {
    const messageId = '59e01d61-4a76-4359-915a-1f25b7815ff4';
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
        lastMessage: 'unwanted message',
        unreadCount: 0,
        pinned: false,
        tags: [],
      },
      messages: [{
        id: messageId,
        userId: 'user-2',
        content: 'unwanted message',
        timestamp: '2026-04-29T12:00:00.000Z',
      }],
    });

    render(
      <MemoryRouter initialEntries={['/chat/7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2']}>
        <Routes>
          <Route path="/chat/:chatId" element={<PrivateGroupChat />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Report message' }));
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'harassment' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit report' }));

    await waitFor(() => expect(createReport).toHaveBeenCalledWith({
      targetType: 'message',
      targetId: messageId,
      targetUserId: undefined,
      reason: 'harassment',
      details: undefined,
    }));
    expect(toastSuccess).toHaveBeenCalledWith('Report submitted.');
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

    render(
      <MemoryRouter initialEntries={[`/chat/${conversationId}`]}>
        <Routes>
          <Route path="/chat/:chatId" element={<PrivateGroupChat />} />
        </Routes>
      </MemoryRouter>,
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
    expect(composerBar.style.getPropertyValue('--chat-composer-bottom')).toBe('calc(5.5rem + env(safe-area-inset-bottom))');
    expect(composerBar).toHaveClass('pb-0');
    expect(screen.getByPlaceholderText('Say what you want...')).toHaveClass('min-w-0', 'flex-1');
    expect(screen.getByRole('button', { name: 'Send message' })).toHaveClass('size-9', 'rounded-full');
  });

  it('drops the composer gap when the input is focused and no inset is reported', async () => {
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

    render(
      <MemoryRouter initialEntries={[`/chat/${conversationId}`]}>
        <Routes>
          <Route path="/chat/:chatId" element={<PrivateGroupChat />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('No messages yet.')).toBeInTheDocument();

    const composerBar = screen.getByTestId('chat-composer-bar');
    expect(composerBar.style.getPropertyValue('--chat-composer-bottom')).toBe('calc(5.5rem + env(safe-area-inset-bottom))');

    // Some Android browsers resize the layout viewport instead of reporting a
    // visual viewport inset, so the keyboard measures as zero. Focus is the one
    // signal every browser gives, and the resting gap has to go or a strip of
    // the thread shows between the input and the keyboard.
    fireEvent.focus(screen.getByPlaceholderText('Say what you want...'));

    await waitFor(() => expect(composerBar.style.getPropertyValue('--chat-composer-bottom')).toBe('0px'));

    fireEvent.blur(screen.getByPlaceholderText('Say what you want...'));

    await waitFor(() => expect(composerBar.style.getPropertyValue('--chat-composer-bottom')).toBe('calc(5.5rem + env(safe-area-inset-bottom))'));
  });

  it('moves the mobile composer above Android in-app browser keyboards', async () => {
    const visualViewport = mockVisualViewport({
      height: 520,
      innerHeight: 900,
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

      await waitFor(() => expect(composerBar).toHaveAttribute('data-keyboard-open', 'true'));
      // Flush on the keyboard: no rem gap and no safe-area on top, since the
      // keyboard already covers that zone.
      expect(composerBar.style.getPropertyValue('--chat-composer-bottom')).toBe('380px');
      expect(composerBar).toHaveClass('pb-3');

      visualViewport.viewport.height = 900;
      visualViewport.dispatch('resize');

      await waitFor(() => expect(composerBar).not.toHaveAttribute('data-keyboard-open'));
      expect(composerBar.style.getPropertyValue('--chat-composer-bottom')).toBe('calc(5.5rem + env(safe-area-inset-bottom))');
      expect(composerBar).toHaveClass('pb-0');
    } finally {
      visualViewport.restore();
    }
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
  });

  it('disables the composer when a group is closed', async () => {
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
        closed: true,
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

    expect(await screen.findByText('This group is closed.')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Group closed')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
    expect(screen.getByLabelText('Choose message photo')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Attach photo' })).toBeDisabled();
  });
});
