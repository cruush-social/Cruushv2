import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addNotificationsChangedListener,
  emitNotificationsChanged,
  getNotificationPreferences,
  getNotificationSummary,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeToPushNotifications,
  updateNotificationPreferences,
} from './notificationsApi';

describe('notificationsApi', () => {
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
    await updateNotificationPreferences({ pushEnabled: true, messagesEnabled: false });
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
      body: JSON.stringify({ pushEnabled: true, messagesEnabled: false }),
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
});
