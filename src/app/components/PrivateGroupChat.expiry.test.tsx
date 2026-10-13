import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PrivateGroupChat from './PrivateGroupChat';

const { getConversationMessages } = vi.hoisted(() => ({ getConversationMessages: vi.fn() }));
vi.mock('./MapServiceAreaContext', () => ({ useMapServiceArea: () => ({ profilePinsAllowed: true }) }));
vi.mock('../lib/sessionUser', () => ({ getCurrentUserId: vi.fn().mockResolvedValue('expiry-recipient') }));
vi.mock('../lib/messagesApi', async () => ({
  ...await vi.importActual<typeof import('../lib/messagesApi')>('../lib/messagesApi'),
  getConversationMessages,
  getGroupMembers: vi.fn().mockResolvedValue([]),
  getFavoriteMessageImages: vi.fn().mockResolvedValue({ images: [] }),
}));

const conversation = {
  id: 'expiry-chat', kind: 'group',
  user: { id: 'expiry-group', name: 'expiry fixture', pronouns: '', photo: null },
  distance: 'Nearby', updatedAt: '2026-10-11T12:00:00Z', lastMessage: '', unreadCount: 0,
  pinned: false, tags: [], membersLabel: '2 people', currentUserRole: 'member', disappearingTimer: '1h',
};
const renderChat = () => render(
  <MemoryRouter initialEntries={['/chat/expiry-chat']}>
    <Routes><Route path="/chat/:chatId" element={<PrivateGroupChat />} /></Routes>
  </MemoryRouter>,
);

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('regular message photo expiry', () => {
  it('removes a regular photo at its deadline while preserving a permanent message and stays absent after reload', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-11T12:00:00Z'));
    getConversationMessages.mockResolvedValue({ conversation, messages: [{
      id: 'expiring-photo', userId: 'expiry-sender', content: '',
      timestamp: '2026-10-11T12:00:00Z', expiresAt: '2026-10-11T12:00:02Z',
      attachments: [{ id: 'expiry-media', url: '/api/media/assets/expiry-media/display',
        mediaType: 'image', mimeType: 'image/png', viewOnce: false, explicit: false }],
    }, {
      id: 'permanent-message', userId: 'expiry-sender', content: 'permanent fixture',
      timestamp: '2026-10-11T12:00:00Z',
    }] });
    const mounted = renderChat();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByRole('img', { name: 'Message photo' })).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(screen.getByRole('img', { name: 'Message photo' })).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(screen.queryByRole('img', { name: 'Message photo' })).not.toBeInTheDocument();
    expect(screen.getByText('permanent fixture')).toBeInTheDocument();
    mounted.unmount();
    getConversationMessages.mockResolvedValue({ conversation, messages: [{
      id: 'permanent-message', userId: 'expiry-sender', content: 'permanent fixture',
      timestamp: '2026-10-11T12:00:00Z',
    }] });
    renderChat();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.queryByRole('img', { name: 'Message photo' })).not.toBeInTheDocument();
    expect(screen.getByText('permanent fixture')).toBeInTheDocument();
  });
});
