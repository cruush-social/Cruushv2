import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addNotificationsChangedListener,
  emitNotificationsChanged,
  getNotificationPreferences,
  getNotificationSummary,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  resolveNotificationNavigationPath,
  subscribeToPushNotifications,
  updateNotificationPreferences,
} from './notificationsApi';

describe('notificationsApi', () => {
  it('opens a reward card using its server grant ID, never a duration supplied by the link', () => {
    expect(resolveNotificationNavigationPath({
      type: 'reward', linkUrl: '/rewards?days=99999', metadata: { grantId: 'earned/one', days: 99999 },
    })).toBe('/rewards?rewardGrant=earned%2Fone');
    expect(resolveNotificationNavigationPath({ type: 'reward', linkUrl: '/rewards', metadata: {} })).toBe('/rewards');
  });
  it('sends an announcement to the changelog page, not through the catch-all', () => {
    // 415 announcements went out linking to /changelog, which is not a route,
    // so the catch-all dropped people on the map instead of the page the
    // announcement was about.
    expect(resolveNotificationNavigationPath({
      type: 'announcement', linkUrl: '/changelog', metadata: {},
    })).toBe('/settings/changelog');
    expect(resolveNotificationNavigationPath({
      type: 'announcement', linkUrl: '/changelog?entry=1.6', metadata: {},
    })).toBe('/settings/changelog?entry=1.6');
  });

  it('leaves a link that already points at a real route alone', () => {
    expect(resolveNotificationNavigationPath({
      type: 'announcement', linkUrl: '/survey', metadata: {},
    })).toBe('/survey');
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({
      data: { accepted: true },
    }), { status: 200 }))));
  });

  it('calls notification list, summary, and read endpoints', async () => {
    await getNotifications({ filter: 'unread', limit: 10, cursor: '2026-07-08T12:00:00.000Z' });
    await getNotificationSummary();
    await markNotificationRead('notification-1');
    await markAllNotificationsRead();

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/notifications?filter=unread&cursor=2026-07-08T12%3A00%3A00.000Z&limit=10', expect.objectContaining({
      credentials: 'include',
    }));
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/notifications/summary', expect.any(Object));
    expect(fetch).toHaveBeenNthCalledWith(3, '/api/notifications/notification-1/read', expect.objectContaining({
      method: 'POST',
    }));
    expect(fetch).toHaveBeenNthCalledWith(4, '/api/notifications/read-all', expect.objectContaining({
      method: 'POST',
    }));
  });

  it('calls preference and push subscription endpoints', async () => {
    await getNotificationPreferences();
    await updateNotificationPreferences({
      pushEnabled: true,
      messagesEnabled: false,
      soundEnabled: false,
    });
    await subscribeToPushNotifications({
      endpoint: 'https://push.example/sub',
      keys: {
        p256dh: 'key',
        auth: 'auth',
      },
    });

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/notification-preferences', expect.any(Object));
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/notification-preferences', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({
        pushEnabled: true,
        messagesEnabled: false,
        soundEnabled: false,
      }),
    }));
    expect(fetch).toHaveBeenNthCalledWith(3, '/api/push/subscriptions', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        endpoint: 'https://push.example/sub',
        keys: {
          p256dh: 'key',
          auth: 'auth',
        },
      }),
    }));
  });

  it('emits a browser event when notifications change', () => {
    const listener = vi.fn();
    const remove = addNotificationsChangedListener(listener);

    emitNotificationsChanged({ unreadCount: 2 });

    expect(listener).toHaveBeenCalledWith({ unreadCount: 2 });
    remove();
    emitNotificationsChanged({ unreadCount: 1 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('opens nearby notifications anonymously while preserving other navigation', () => {
    const sourceUserId = '00000000-0000-4000-8000-000000000002';

    expect(resolveNotificationNavigationPath({
      type: 'nearby_activity',
      linkUrl: '/map?layer=nearby&nearbyNotification=notification-1',
      metadata: { sourceUserId },
    })).toBe('/map?layer=nearby&nearbyNotification=notification-1');
    expect(resolveNotificationNavigationPath({
      type: 'nearby_user', linkUrl: `/map?focusUserId=${sourceUserId}`,
      actorUserId: sourceUserId, metadata: { sourceUserId },
    })).toBe('/map?layer=nearby');
    expect(resolveNotificationNavigationPath({
      type: 'incoming_cruush',
      linkUrl: '/map',
      actorUserId: sourceUserId,
      metadata: {},
    })).toBe(`/map?focusUserId=${sourceUserId}`);
    expect(resolveNotificationNavigationPath({
      type: 'direct_message',
      linkUrl: '/chat/conversation-1',
      metadata: { sourceUserId },
    })).toBe('/chat/conversation-1');
    expect(resolveNotificationNavigationPath({
      type: 'direct_message',
      linkUrl: 'https://example.com',
      metadata: {},
    })).toBe('/notifications');
  });
});
