import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PrivateGroupChat from './PrivateGroupChat';

const { createMessage, createMessagePhoto, getConversationMessages, getCurrentUserId } = vi.hoisted(() => ({
  createMessage: vi.fn(),
  createMessagePhoto: vi.fn(),
  getConversationMessages: vi.fn(),
  getCurrentUserId: vi.fn(),
}));

vi.mock('../lib/sessionUser', () => ({
  getCurrentUserId,
}));

vi.mock('../lib/messagesApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/messagesApi')>('../lib/messagesApi');

  return {
    ...actual,
    createMessage,
    createMessagePhoto,
    getConversationMessages,
  };
});

describe('PrivateGroupChat', () => {
  beforeEach(() => {
    createMessage.mockReset();
    createMessagePhoto.mockReset();
    getConversationMessages.mockReset();
    getCurrentUserId.mockReset();
    getCurrentUserId.mockResolvedValue('user-1');
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

    fireEvent.click(await screen.findByRole('button', { name: 'Report conversation' }));

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
    fireEvent.change(screen.getByLabelText('Choose message photo'), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(createMessagePhoto).toHaveBeenCalledWith(conversationId, file, 'meet here');
    });
    expect(await screen.findByAltText('Message photo')).toHaveAttribute('src', '/api/media/message-photos/photo.png');
    expect(screen.getByText('meet here')).toBeInTheDocument();
  });
});
