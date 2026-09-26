import { describe, expect, it } from 'vitest';
import {
  isNotificationTypeEnabled,
  notificationPopupIconName,
  notificationPopupTheme,
  shouldPlayInAppNotificationSound,
} from './ForegroundNotifications';
import type { NotificationPreferences, NotificationRecord } from '../lib/notificationsApi';

const preferences: NotificationPreferences = {
  pushEnabled: true,
  cruushEnabled: true,
  messagesEnabled: true,
  groupsEnabled: true,
  nearbyEnabled: true,
  rewardsEnabled: true,
  soundEnabled: true,
};

const directMessage: NotificationRecord = {
  id: 'notification-1',
  userId: 'recipient-1',
  type: 'direct_message',
  title: 'New message',
  body: 'Open cruush to reply.',
  linkUrl: '/messages',
  actorUserId: 'sender-1',
  conversationId: 'conversation-1',
  metadata: {},
  readAt: null,
  createdAt: '2026-08-09T18:00:00.000Z',
};

describe('ForegroundNotifications behavior', () => {
  it('honors existing message preferences', () => {
    expect(isNotificationTypeEnabled(preferences, 'direct_message')).toBe(true);
    expect(isNotificationTypeEnabled({ ...preferences, messagesEnabled: false }, 'direct_message')).toBe(false);
  });

  it('honors nearby and reward preferences', () => {
    expect(isNotificationTypeEnabled(preferences, 'nearby_activity')).toBe(true);
    expect(isNotificationTypeEnabled({ ...preferences, nearbyEnabled: false }, 'nearby_activity')).toBe(false);
    expect(isNotificationTypeEnabled(preferences, 'nearby_feed_post')).toBe(true);
    expect(isNotificationTypeEnabled({ ...preferences, nearbyEnabled: false }, 'nearby_feed_post')).toBe(false);
    expect(isNotificationTypeEnabled(preferences, 'reward')).toBe(true);
    expect(isNotificationTypeEnabled({ ...preferences, rewardsEnabled: false }, 'reward')).toBe(false);
  });

  it('suppresses sound inside the active conversation only', () => {
    expect(shouldPlayInAppNotificationSound('/chat/conversation-1', directMessage)).toBe(false);
    expect(shouldPlayInAppNotificationSound('/settings', directMessage)).toBe(true);
  });

  it('uses the brand accent for every in-app popup', () => {
    expect(notificationPopupTheme()).toEqual(expect.objectContaining({
      popup: 'border-primary/45',
    }));
  });

  it('uses the mutual icon for mutual notifications', () => {
    expect(notificationPopupIconName('mutual_cruush')).toBe('mutual');
    expect(notificationPopupIconName('direct_message')).toBe('bell');
  });
});
