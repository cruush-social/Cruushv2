import { requestApi } from './apiClient';

export type NotificationRecord = {
  id: string;
  userId: string;
  type: 'incoming_cruush' | 'mutual_cruush' | 'direct_message' | 'group_message' | 'group_membership' | 'nearby_activity' | 'reward';
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
  pushEnabled: boolean;
  cruushEnabled: boolean;
  messagesEnabled: boolean;
  groupsEnabled: boolean;
  nearbyEnabled: boolean;
  rewardsEnabled: boolean;
  soundEnabled: boolean;
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

function safeNotificationLink(linkUrl: string | null | undefined) {
  if (!linkUrl || !linkUrl.startsWith('/') || linkUrl.startsWith('//')) {
    return '/notifications';
  }

  return linkUrl;
}

export function resolveNotificationNavigationPath(
  notification: Pick<NotificationRecord, 'type' | 'linkUrl' | 'metadata'> & Partial<Pick<NotificationRecord, 'actorUserId'>>,
) {
  const safeLink = safeNotificationLink(notification.linkUrl);
  const sourceUserId = typeof notification.metadata?.sourceUserId === 'string'
    ? notification.metadata.sourceUserId.trim()
    : '';

  if (notification.type === 'nearby_activity' && sourceUserId) {
    const safeDestination = new URL(safeLink, 'https://cruush.app');
    const destination = safeDestination.pathname === '/map'
      ? safeDestination
      : new URL('/map?layer=nearby', 'https://cruush.app');
    destination.searchParams.set('focusUserId', sourceUserId);
    return `${destination.pathname}${destination.search}${destination.hash}`;
  }

  const actorUserId = notification.actorUserId?.trim() ?? '';
  const legacyNearbyType = (notification.type as string) === 'nearby_user';
  if (actorUserId && (legacyNearbyType || notification.type === 'incoming_cruush' || !notification.linkUrl || notification.linkUrl === '/map')) {
    return `/map?focusUserId=${encodeURIComponent(actorUserId)}`;
  }

  return safeLink;
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

  return requestApi<NotificationsPayload>(`/api/notifications?${params.toString()}`);
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
