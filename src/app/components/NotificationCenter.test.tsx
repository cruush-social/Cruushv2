import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NotificationCenter from './NotificationCenter';

const {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} = vi.hoisted(() => ({
  getNotifications: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  markNotificationRead: vi.fn(),
}));

vi.mock('../lib/notificationsApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/notificationsApi')>('../lib/notificationsApi');

  return {
    ...actual,
    getNotifications,
    markAllNotificationsRead,
    markNotificationRead,
  };
});

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{location.pathname}</div>;
}

describe('NotificationCenter', () => {
  beforeEach(() => {
    getNotifications.mockReset();
    markAllNotificationsRead.mockReset();
    markNotificationRead.mockReset();
    markAllNotificationsRead.mockResolvedValue({ unreadCount: 0 });
    markNotificationRead.mockResolvedValue({ unreadCount: 0 });
  });

  it('renders notifications and opens notification links after marking the item read', async () => {
    getNotifications.mockResolvedValue({
      notifications: [{
        id: 'notification-1',
        userId: 'user-1',
        type: 'direct_message',
        title: 'Jordan sent you a message',
        body: 'Open cruush to reply.',
        linkUrl: '/chat/conversation-1',
        actorUserId: 'user-2',
        conversationId: 'conversation-1',
        metadata: { conversationKind: 'dm' },
        readAt: null,
        createdAt: '2026-07-08T12:00:00.000Z',
      }],
      nextCursor: null,
    });

    render(
      <MemoryRouter initialEntries={['/notifications']}>
        <Routes>
          <Route path="/notifications" element={<NotificationCenter />} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.getByText('Jordan sent you a message')).toBeInTheDocument();
    expect(screen.getByText('Open cruush to reply.')).toBeInTheDocument();
    expect(screen.getByText('Unread')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Notification settings' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Jordan sent you a message' }));
    await waitFor(() => expect(markNotificationRead).toHaveBeenCalledWith('notification-1'));
    expect(await screen.findByTestId('location-probe')).toHaveTextContent('/chat/conversation-1');
  });

  it('marks all visible notifications read', async () => {
    getNotifications.mockResolvedValue({
      notifications: [{
        id: 'notification-1',
        userId: 'user-1',
        type: 'mutual_cruush',
        title: "It's mutual",
        body: 'Open cruush to check it.',
        linkUrl: '/cruush',
        actorUserId: 'user-2',
        conversationId: null,
        metadata: {},
        readAt: null,
        createdAt: '2026-07-08T12:00:00.000Z',
      }],
      nextCursor: null,
    });

    render(
      <MemoryRouter initialEntries={['/notifications']}>
        <NotificationCenter />
      </MemoryRouter>,
    );

    expect(await screen.findByText("It's mutual")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));

    await waitFor(() => expect(markAllNotificationsRead).toHaveBeenCalled());
  });

  it('renders an empty state and a load error state', async () => {
    getNotifications.mockResolvedValueOnce({ notifications: [], nextCursor: null });

    const { unmount } = render(
      <MemoryRouter initialEntries={['/notifications']}>
        <NotificationCenter />
      </MemoryRouter>,
    );

    expect(await screen.findByText('No notifications yet.')).toBeInTheDocument();
    unmount();

    getNotifications.mockRejectedValueOnce(new Error('Network down'));
    render(
      <MemoryRouter initialEntries={['/notifications']}>
        <NotificationCenter />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Network down')).toBeInTheDocument();
  });
});
