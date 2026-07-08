import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PrivateGroupChat from './PrivateGroupChat';

const {
  clearConversationForEveryone,
  createMessage,
  createMessagePhoto,
  getConversationMessages,
  getCurrentUserId,
  getGroupMembers,
  setConversationDisappearingTimer,
  viewMessageAttachment,
} = vi.hoisted(() => ({
  clearConversationForEveryone: vi.fn(),
  createMessage: vi.fn(),
  createMessagePhoto: vi.fn(),
  getConversationMessages: vi.fn(),
  getCurrentUserId: vi.fn(),
  getGroupMembers: vi.fn(),
  setConversationDisappearingTimer: vi.fn(),
  viewMessageAttachment: vi.fn(),
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
    getConversationMessages,
    getGroupMembers,
    setConversationDisappearingTimer,
    viewMessageAttachment,
  };
});

describe('PrivateGroupChat', () => {
  beforeEach(() => {
    clearConversationForEveryone.mockReset();
    createMessage.mockReset();
    createMessagePhoto.mockReset();
    getConversationMessages.mockReset();
    getCurrentUserId.mockReset();
    getGroupMembers.mockReset();
    setConversationDisappearingTimer.mockReset();
    viewMessageAttachment.mockReset();
    getCurrentUserId.mockResolvedValue('user-1');
    getGroupMembers.mockResolvedValue([]);
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
          <Route path="/report" element={<div>Report route</div>} />
        </Routes>
      </MemoryRouter>,
    );

    const reportButton = await screen.findByRole('button', { name: 'Report conversation' });
    await waitFor(() => expect(reportButton).not.toBeDisabled());
    fireEvent.click(reportButton);

    expect(await screen.findByText('Report route')).toBeInTheDocument();
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
    expect(screen.getByLabelText('Choose message photo')).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
    expect(screen.getByRole('button', { name: 'Attach photo' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Choose message photo'), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(createMessagePhoto).toHaveBeenCalledWith(conversationId, file, 'meet here', { viewOnce: false });
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

  it('lets group admins change timers and clear history from conversation settings', async () => {
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
  });
});
