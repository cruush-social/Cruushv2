import { describe, expect, it } from 'vitest';
import {
  isNotificationTypeEnabled,
  notificationPopupTheme,
  shouldPlayInAppNotificationSound,
} from './ForegroundNotifications';
import type { NotificationPreferences, NotificationRecord } from '../lib/notificationsApi';

const preferences: NotificationPreferences = {
  pushEnabled: true,
  cruushEnabled: true,
  messagesEnabled: true,
  groupsEnabled: true,
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

  it('suppresses sound inside the active conversation only', () => {
    expect(shouldPlayInAppNotificationSound('/chat/conversation-1', directMessage)).toBe(false);
    expect(shouldPlayInAppNotificationSound('/settings', directMessage)).toBe(true);
  });

  it('uses the Techno Sovereign chartreuse theme for every in-app popup', () => {
    expect(notificationPopupTheme()).toEqual(expect.objectContaining({
      popup: 'border-[#C8FF31]',
    }));
  });
});
