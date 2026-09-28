import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NotificationCenter from './NotificationCenter';

const {
  clearNotifications,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} = vi.hoisted(() => ({
  clearNotifications: vi.fn(),
  getNotifications: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  markNotificationRead: vi.fn(),
}));

vi.mock('../lib/notificationsApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/notificationsApi')>('../lib/notificationsApi');

  return {
    ...actual,
    clearNotifications,
    getNotifications,
    markAllNotificationsRead,
    markNotificationRead,
  };
});

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{location.pathname}{location.search}</div>;
}

describe('NotificationCenter', () => {
  beforeEach(() => {
    clearNotifications.mockReset();
    getNotifications.mockReset();
    markAllNotificationsRead.mockReset();
    markNotificationRead.mockReset();
    clearNotifications.mockResolvedValue({ unreadCount: 0 });
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
    expect(screen.getByTestId('notification-center-header')).toHaveClass(
      'border-white/10',
      'bg-black/88',
      'shadow-[0_20px_55px_rgba(0,0,0,0.34)]',
      'backdrop-blur-xl',
    );
    expect(screen.getByRole('heading', { name: 'Notifications' })).toHaveClass('text-2xl', 'sm:text-3xl');
    expect(screen.getByRole('button', { name: 'Back' })).toHaveClass('rounded-full', 'bg-background/55');
    expect(screen.getByRole('button', { name: 'Mark all as read' })).toHaveClass('rounded-full', 'bg-background/55');
    expect(screen.getByRole('button', { name: 'Delete all notifications' })).toHaveClass('rounded-full', 'bg-background/55');
    expect(screen.getByRole('button', { name: 'Notification settings' })).toHaveClass('rounded-full', 'bg-background/55');

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
    expect(document.querySelector('[data-notification-icon="mutual"]')).toBeInTheDocument();
    expect(document.querySelector('[data-notification-icon="bell"]')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));

    await waitFor(() => expect(markAllNotificationsRead).toHaveBeenCalled());
  });

  it('opens the other member profile from a mutual cruush notification', async () => {
    getNotifications.mockResolvedValue({
      notifications: [{
        id: 'notification-mutual',
        userId: 'user-1',
        type: 'mutual_cruush',
        title: "It's mutual",
        body: 'Open cruush to check it.',
        linkUrl: '/cruush',
        actorUserId: 'user-2',
        conversationId: null,
        metadata: {},
        readAt: null,
        createdAt: '2026-09-27T00:00:00.000Z',
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

    fireEvent.click(await screen.findByRole('button', { name: "It's mutual" }));
    await waitFor(() => expect(markNotificationRead).toHaveBeenCalledWith('notification-mutual'));
    expect(await screen.findByTestId('location-probe')).toHaveTextContent('/profile/user-2');
  });

  it('opens an existing nearby notification on an anonymous area, never its source pin', async () => {
    const sourceUserId = '00000000-0000-4000-8000-000000000002';
    getNotifications.mockResolvedValue({
      notifications: [{
        id: 'notification-nearby',
        userId: 'user-1',
        type: 'nearby_activity',
        title: 'Someone nearby',
        body: 'Someone within your radar may be in your area.',
        linkUrl: '/map?layer=nearby',
        actorUserId: null,
        conversationId: null,
        metadata: { sourceUserId },
        readAt: null,
        createdAt: '2026-08-19T12:00:00.000Z',
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

    fireEvent.click(await screen.findByRole('button', { name: 'Someone nearby' }));
    await waitFor(() => expect(markNotificationRead).toHaveBeenCalledWith('notification-nearby'));
    // 1aaf2f3 made this navigation anonymous: the notification frames a general
    // area and must never name, select or centre on the triggering member, so
    // no source profile ID may reach the destination URL.
    const probe = await screen.findByTestId('location-probe');
    expect(probe).toHaveTextContent('/map?layer=nearby');
    expect(probe.textContent ?? '').not.toContain(sourceUserId);
    expect(probe.textContent ?? '').not.toContain('focusUserId');
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
