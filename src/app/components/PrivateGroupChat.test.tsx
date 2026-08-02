import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PrivateGroupChat from './PrivateGroupChat';
import { ApiClientError } from '../lib/apiClient';

const {
  clearConversationForEveryone,
  createMessage,
  createMessagePhoto,
  deleteConversationForEveryone,
  getConversationMessages,
  getCurrentUserId,
  getGroupMembers,
  setConversationDisappearingTimer,
  viewMessageAttachment,
} = vi.hoisted(() => ({
  clearConversationForEveryone: vi.fn(),
  createMessage: vi.fn(),
  createMessagePhoto: vi.fn(),
  deleteConversationForEveryone: vi.fn(),
  getConversationMessages: vi.fn(),
  getCurrentUserId: vi.fn(),
  getGroupMembers: vi.fn(),
  setConversationDisappearingTimer: vi.fn(),
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
    getConversationMessages,
    getGroupMembers,
    setConversationDisappearingTimer,
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
    clearConversationForEveryone.mockReset();
    createMessage.mockReset();
    createMessagePhoto.mockReset();
    deleteConversationForEveryone.mockReset();
    getConversationMessages.mockReset();
    getCurrentUserId.mockReset();
    getGroupMembers.mockReset();
    setConversationDisappearingTimer.mockReset();
    viewMessageAttachment.mockReset();
    blockUser.mockReset();
    createReport.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
    getCurrentUserId.mockResolvedValue('user-1');
    getGroupMembers.mockResolvedValue([]);
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

  it('routes blocked non-mutual dm sends back to the profile', async () => {
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
      'MUTUAL_CRUUSH_REQUIRED',
      'You can message after a mutual cruush.',
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

    expect(await screen.findByText('You need a mutual cruush before messaging. Open their profile to send a cruush first.')).toBeInTheDocument();
    expect(screen.getByText('Send a cruush first. Messages open after it is mutual.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open profile' }));

    expect(screen.getByTestId('location-probe')).toHaveTextContent('/profile/user-2');
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

    fireEvent.click(await screen.findByRole('button', { name: 'More conversation options' }));
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

    fireEvent.click(await screen.findByRole('button', { name: 'More conversation options' }));

    expect(screen.queryByRole('button', { name: /Block/ })).not.toBeInTheDocument();
  });

  it('renders expiring message metadata', async () => {
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
        expiresAt: '2026-04-30T12:00:00.000Z',
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
    expect(screen.getByText(/expires Apr 30/)).toBeInTheDocument();
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
      'image/jpeg,image/png,image/webp,image/heic,image/heif',
    );
    expect(photoInput).toHaveAttribute('id');
    expect(attachPhotoControl).toHaveAttribute('for', photoInput.getAttribute('id'));
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

    fireEvent.click(await screen.findByRole('button', { name: 'More conversation options' }));
    fireEvent.change(await screen.findByLabelText('Disappearing timer'), {
      target: { value: '1h' },
    });

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

    fireEvent.click(await screen.findByRole('button', { name: 'More conversation options' }));
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

    fireEvent.change(screen.getByLabelText('Message disappearing timer'), {
      target: { value: '1h' },
    });

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
    expect(composerBar.style.getPropertyValue('--chat-composer-bottom')).toBe('calc(6.25rem + env(safe-area-inset-bottom))');
    expect(screen.getByPlaceholderText('Say what you want...')).toHaveClass('min-w-0', 'flex-1');
    expect(screen.getByRole('button', { name: 'Send message' })).toHaveClass('size-9', 'rounded-full');
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
      expect(composerBar.style.getPropertyValue('--chat-composer-bottom')).toBe('calc(0.75rem + env(safe-area-inset-bottom) + 380px)');

      visualViewport.viewport.height = 900;
      visualViewport.dispatch('resize');

      await waitFor(() => expect(composerBar).not.toHaveAttribute('data-keyboard-open'));
      expect(composerBar.style.getPropertyValue('--chat-composer-bottom')).toBe('calc(6.25rem + env(safe-area-inset-bottom))');
    } finally {
      visualViewport.restore();
    }
  });

  it('opens a view-once photo only after the user taps it', async () => {
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
    expect(screen.getByRole('button', { name: 'Attach photo' })).toHaveAttribute('aria-disabled', 'true');
  });
});
