import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addNotificationsChangedListener,
  emitNotificationsChanged,
  getNotificationPreferences,
  getNotificationSummary,
  getNotifications,
  getVisibleNotificationIds,
  markAllNotificationsRead,
  markNotificationRead,
  normalizeLegacyNotificationCopy,
  resolveNotificationNavigationPath,
  refreshPushSubscription,
  subscribeToPushNotifications,
  updateNotificationPreferences,
  type NotificationRecord,
} from './notificationsApi';

const legacyCopyCases = [
  {
    type: 'nearby_feed_post',
    title: 'New Feed post nearby',
    body: 'Open Feed to see what’s happening in your area.',
    currentTitle: 'New Confessional post nearby',
    currentBody: 'Open Confessional to see what’s happening in your area.',
  },
  {
    type: 'mutual_feed_post',
    title: 'New Feed post',
    body: 'Open Feed to see it.',
    currentTitle: 'New Confessional post',
    currentBody: 'Open Confessional to see it.',
  },
  {
    type: 'site_reminder',
    title: "See what's happening nearby",
    body: 'Open Feed to catch up on posts around you.',
    currentTitle: "See what's happening nearby",
    currentBody: 'Open Confessional to catch up on posts around you.',
  },
  {
    type: 'site_reminder',
    title: 'Post to Feed',
    body: "Share what you're up for with people nearby.",
    currentTitle: 'Post to Confessional',
    currentBody: "Share what you're up for with people nearby.",
  },
] as const;

const notificationFixture: NotificationRecord = {
  id: 'notification-1',
  userId: 'recipient-1',
  type: 'nearby_feed_post',
  title: 'New Feed post nearby',
  body: 'Open Feed to see what’s happening in your area.',
  linkUrl: '/feed?view=nearby#latest',
  actorUserId: 'actor-1',
  conversationId: null,
  metadata: { postId: 'post-1', title: 'My Feed Club', content: 'Keep this Feed text.' },
  readAt: null,
  createdAt: '2026-10-09T12:00:00.000Z',
};

describe('notificationsApi', () => {
  it.each(legacyCopyCases)('maps only the complete legacy $type template "$title" without mutating its record', ({
    type, title, body, currentTitle, currentBody,
  }) => {
    const original = Object.freeze({
      ...notificationFixture, type, title, body,
      metadata: Object.freeze({ ...notificationFixture.metadata }),
    });
    const result = normalizeLegacyNotificationCopy(original);

    expect(result).toEqual({ ...original, title: currentTitle, body: currentBody });
    expect(result).not.toBe(original);
    expect(result.metadata).toBe(original.metadata);
    expect(original).toMatchObject({ title, body });
    expect(normalizeLegacyNotificationCopy(result)).toBe(result);
  });

  it.each(legacyCopyCases)('preserves mismatched type or partial legacy pairs for "$title"', ({ type, title, body }) => {
    const original = { ...notificationFixture, type, title, body };
    const unmatched: NotificationRecord[] = [
      { ...original, type: 'direct_message' },
      { ...original, type: 'announcement' },
      { ...original, title: `${title} from my Club` },
      { ...original, body: `${body} My Feed text stays.` },
    ];

    for (const notification of unmatched) {
      expect(normalizeLegacyNotificationCopy(Object.freeze(notification))).toBe(notification);
    }
  });

  it('normalizes the shared list boundary while preserving unknown types, user content and pagination', async () => {
    const notifications = [
      ...legacyCopyCases.map(({ type, title, body }) => ({ ...notificationFixture, type, title, body })),
      { ...notificationFixture, type: 'future_notice' },
      { ...notificationFixture, type: 'group_message', title: 'My Club', body: 'I wrote about Feed and Clubs.' },
      { ...notificationFixture, type: 'nearby_feed_post', title: 'Feed at my Club', body: 'My own post text.' },
    ];
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      data: { notifications, nextCursor: 'next-page' },
    }), { status: 200 }));

    const result = await getNotifications();

    expect(result).toEqual({
      notifications: [
        ...legacyCopyCases.map(({ currentTitle, currentBody }, index) => ({
          ...notifications[index], title: currentTitle, body: currentBody,
        })),
        ...notifications.slice(4),
      ],
      nextCursor: 'next-page',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

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

  it('checks exact popup IDs in bounded batches without consulting a notification page', async () => {
    const ids = Array.from({ length: 51 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`);
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ data: { ids: [ids[0]] } }), { status: 200 }));
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ data: { ids: [ids[50]] } }), { status: 200 }));
    expect(await getVisibleNotificationIds([...ids, ids[0]])).toEqual([ids[0], ids[50]]);
    expect(fetch).toHaveBeenCalledTimes(2);
    const requested = vi.mocked(fetch).mock.calls.map(([url]) => new URL(String(url), 'https://cruush.test'));
    expect(requested.map(url => url.pathname)).toEqual(['/api/notifications/visible-ids', '/api/notifications/visible-ids']);
    expect(requested.map(url => url.searchParams.get('ids')?.split(',').length)).toEqual([50, 1]);
    expect(await getVisibleNotificationIds([])).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('calls notification list, summary, and read endpoints', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      data: { notifications: [], nextCursor: null },
    }), { status: 200 }));
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

  it('uses the separate cancellable background refresh endpoint', async () => {
    const controller = new AbortController();
    const subscription = { endpoint: 'https://push.example/device', keys: { p256dh: 'key', auth: 'auth' } };

    await refreshPushSubscription(subscription, controller.signal);

    expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/push/subscriptions/refresh', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify(subscription),
      signal: controller.signal,
      credentials: 'include',
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
    })).toBe(`/profile/${sourceUserId}`);
    expect(resolveNotificationNavigationPath({
      type: 'mutual_cruush',
      linkUrl: '/cruush',
      actorUserId: sourceUserId,
      metadata: {},
    })).toBe(`/profile/${sourceUserId}`);
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

  it('opens personal Pulse notifications in the Pulse sheet without focusing or zooming to the sender', () => {
    const sourceUserId = '00000000-0000-4000-8000-000000000002';

    expect(resolveNotificationNavigationPath({
      type: 'pulse',
      linkUrl: '/map',
      actorUserId: sourceUserId,
      metadata: { pingId: 'ping-1' },
    })).toBe('/map?pulse=open');
    expect(resolveNotificationNavigationPath({
      type: 'pulse',
      linkUrl: '/chat/group-1',
      actorUserId: sourceUserId,
      metadata: { groupPulseId: 'group-pulse-1', conversationKind: 'group' },
    })).toBe('/chat/group-1');
  });
});
