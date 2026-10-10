import { requestApi } from './apiClient';

export type NotificationRecord = {
  id: string;
  userId: string;
  type: 'incoming_cruush' | 'mutual_cruush' | 'direct_message' | 'group_message' | 'group_membership' | 'nearby_activity' | 'nearby_feed_post' | 'mutual_feed_post' | 'reward' | 'announcement' | 'nearby_user' | 'pulse' | 'place_checkin_expired' | 'subscription_expiring' | 'site_reminder';
  title: string;
  body: string;
  linkUrl: string;
  actorUserId: string | null;
  conversationId: string | null;
  metadata: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
};

export type NotificationSummary = {
  unreadCount: number;
};

export type NotificationsPayload = {
  notifications: NotificationRecord[];
  nextCursor: string | null;
};

export type NotificationPreferences = {
  emailEnabled: boolean;
  pushEnabled: boolean;
  cruushEnabled: boolean;
  messagesEnabled: boolean;
  groupsEnabled: boolean;
  nearbyEnabled: boolean;
  mutualFeedEnabled: boolean;
  rewardsEnabled: boolean;
  siteRemindersEnabled: boolean;
  pulseEnabled: boolean;
  soundEnabled: boolean;
  quietHoursEnabled: boolean;
  /** Minutes past local midnight. A start above the end wraps past midnight. */
  quietHoursStartMinute: number;
  quietHoursEndMinute: number;
  /** IANA zone the window is read in. */
  quietHoursTimezone: string;
};

export type PushSubscriptionPayload = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

export type VapidPublicKeyPayload = {
  enabled: boolean;
  publicKey: string;
};

export const NOTIFICATIONS_CHANGED_EVENT = 'notifications:changed';

export type NotificationsChangedPayload = {
  unreadCount: number;
};

/**
 * Announcements went out linking to /changelog, which is not a route, so the
 * catch-all dropped people on the map instead of the page the announcement was
 * about. The stored links are corrected, but one already delivered to a phone
 * or sitting in a push payload still carries the old path.
 */
const LEGACY_NOTIFICATION_PATHS: Readonly<Record<string, string>> = {
  '/changelog': '/settings/changelog',
};

function safeNotificationLink(linkUrl: string | null | undefined) {
  if (!linkUrl || !linkUrl.startsWith('/') || linkUrl.startsWith('//')) {
    return '/notifications';
  }

  const [path, rest] = [linkUrl.split(/[?#]/)[0], linkUrl.slice(linkUrl.split(/[?#]/)[0].length)];

  return LEGACY_NOTIFICATION_PATHS[path] ? `${LEGACY_NOTIFICATION_PATHS[path]}${rest}` : linkUrl;
}

export function resolveNotificationNavigationPath(
  notification: Pick<NotificationRecord, 'type' | 'linkUrl' | 'metadata'> & Partial<Pick<NotificationRecord, 'actorUserId'>>,
) {
  const safeLink = safeNotificationLink(notification.linkUrl);
  if (notification.type === 'reward' && typeof notification.metadata?.grantId === 'string') {
    return `/rewards?rewardGrant=${encodeURIComponent(notification.metadata.grantId)}`;
  }
  if (notification.type === 'nearby_activity' || notification.type === 'nearby_user') {
    const destination = new URL(safeLink, 'https://cruush.app');
    const notificationId = destination.searchParams.get('nearbyNotification');
    return notificationId
      ? `/map?layer=nearby&nearbyNotification=${encodeURIComponent(notificationId)}`
      : '/map?layer=nearby';
  }

  const isPersonalPulse = notification.type === 'pulse'
    && notification.metadata?.conversationKind !== 'group'
    && (typeof notification.metadata?.pingId === 'string' || safeLink === '/map');
  if (isPersonalPulse) {
    return '/map?pulse=open';
  }

  const actorUserId = notification.actorUserId?.trim() ?? '';
  if (actorUserId && (notification.type === 'incoming_cruush' || notification.type === 'mutual_cruush')) {
    return `/profile/${encodeURIComponent(actorUserId)}`;
  }
  if (actorUserId && (!notification.linkUrl || notification.linkUrl === '/map')) {
    return `/map?focusUserId=${encodeURIComponent(actorUserId)}`;
  }

  return safeLink;
}

const LEGACY_NOTIFICATION_COPY = [
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

export function normalizeLegacyNotificationCopy(notification: NotificationRecord): NotificationRecord {
  const template = LEGACY_NOTIFICATION_COPY.find((candidate) => (
    notification.type === candidate.type
    && notification.title === candidate.title
    && notification.body === candidate.body
  ));

  return template
    ? { ...notification, title: template.currentTitle, body: template.currentBody }
    : notification;
}

/** Validate specific live popups without inferring visibility from a paginated list. */
export async function getVisibleNotificationIds(ids: string[]): Promise<string[]> {
  const unique = [...new Set(ids)];
  const visible: string[] = [];
  for (let offset = 0; offset < unique.length; offset += 50) {
    const query = new URLSearchParams({ ids: unique.slice(offset, offset + 50).join(',') });
    const result = await requestApi<{ ids: string[] }>(`/api/notifications/visible-ids?${query}`);
    visible.push(...result.ids);
  }
  return visible;
}

export function getNotifications(input: {
  filter?: 'all' | 'unread';
  cursor?: string | null;
  limit?: number;
} = {}) {
  const params = new URLSearchParams();
  params.set('filter', input.filter ?? 'all');
  if (input.cursor) {
    params.set('cursor', input.cursor);
  }
  if (input.limit) {
    params.set('limit', String(input.limit));
  }

  return requestApi<NotificationsPayload>(`/api/notifications?${params.toString()}`).then((payload) => ({
    ...payload,
    notifications: payload.notifications.map(normalizeLegacyNotificationCopy),
  }));
}

export function getNotificationSummary() {
  return requestApi<NotificationSummary>('/api/notifications/summary');
}

export function markNotificationRead(notificationId: string) {
  return requestApi<NotificationSummary>(`/api/notifications/${notificationId}/read`, {
    method: 'POST',
  });
}

export function markAllNotificationsRead() {
  return requestApi<NotificationSummary>('/api/notifications/read-all', {
    method: 'POST',
  });
}

export function clearNotifications() {
  return requestApi<NotificationSummary>('/api/notifications', {
    method: 'DELETE',
  });
}

export function deleteNotification(notificationId: string) {
  return requestApi<NotificationSummary>(`/api/notifications/${notificationId}`, {
    method: 'DELETE',
  });
}

export function getNotificationPreferences() {
  return requestApi<NotificationPreferences>('/api/notification-preferences');
}

export function updateNotificationPreferences(preferences: Partial<NotificationPreferences>) {
  return requestApi<NotificationPreferences>('/api/notification-preferences', {
    method: 'PATCH',
    body: JSON.stringify(preferences),
  });
}

export function getVapidPublicKey() {
  return requestApi<VapidPublicKeyPayload>('/api/push/vapid-public-key');
}

export function subscribeToPushNotifications(subscription: PushSubscriptionPayload) {
  return requestApi<NotificationPreferences>('/api/push/subscriptions', {
    method: 'POST',
    body: JSON.stringify(subscription),
  });
}

export function refreshPushSubscription(subscription: PushSubscriptionPayload, signal?: AbortSignal) {
  return requestApi<NotificationPreferences>('/api/push/subscriptions/refresh', {
    method: 'POST',
    body: JSON.stringify(subscription),
    signal,
  });
}

export function unsubscribeFromPushNotifications(endpoint?: string) {
  return requestApi<NotificationPreferences>('/api/push/subscriptions/unsubscribe', {
    method: 'POST',
    body: JSON.stringify(endpoint ? { endpoint } : {}),
  });
}

export function emitNotificationsChanged(payload: NotificationsChangedPayload) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent<NotificationsChangedPayload>(NOTIFICATIONS_CHANGED_EVENT, {
    detail: payload,
  }));
}

export function addNotificationsChangedListener(listener: (payload: NotificationsChangedPayload) => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleNotificationsChanged = (event: Event) => {
    listener((event as CustomEvent<NotificationsChangedPayload>).detail);
  };

  window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, handleNotificationsChanged);

  return () => {
    window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, handleNotificationsChanged);
  };
}

export type NearbyNotificationArea = {
  approximateLatitude: number;
  approximateLongitude: number;
  radiusMiles: number;
};

export function getNearbyNotificationArea(notificationId: string) {
  return requestApi<{ area: NearbyNotificationArea | null }>(
    `/api/notifications/${encodeURIComponent(notificationId)}/area`
  );
}
