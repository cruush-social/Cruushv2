import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ForegroundNotifications, {
  IN_APP_NOTIFICATION_POLL_INTERVAL_MS,
  isNotificationTypeEnabled,
  resolveNotificationNavigationPath,
  shouldPlayInAppNotificationSound,
  shouldShowInAppNotificationPopup,
} from './ForegroundNotifications';
import type { NotificationPreferences, NotificationRecord } from '../lib/notificationsApi';

const {
  emitNotificationsChanged,
  getNotificationPreferences,
  getNotificationSummary,
  getNotifications,
  markNotificationRead,
  toastCustom,
  toastDismiss,
} = vi.hoisted(() => ({
  emitNotificationsChanged: vi.fn(),
  getNotificationPreferences: vi.fn(),
  getNotificationSummary: vi.fn(),
  getNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  toastCustom: vi.fn(),
  toastDismiss: vi.fn(),
}));

vi.mock('../lib/notificationsApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/notificationsApi')>('../lib/notificationsApi');

  return {
    ...actual,
    emitNotificationsChanged,
    getNotificationPreferences,
    getNotificationSummary,
    getNotifications,
    markNotificationRead,
  };
});

vi.mock('sonner', () => ({
  toast: {
    custom: toastCustom,
    dismiss: toastDismiss,
  },
}));

const enabledPreferences: NotificationPreferences = {
  pushEnabled: false,
  cruushEnabled: true,
  messagesEnabled: true,
  groupsEnabled: true,
  soundEnabled: true,
};

function notification(overrides: Partial<NotificationRecord> = {}): NotificationRecord {
  return {
    id: 'notification-1',
    userId: 'user-1',
    type: 'direct_message',
    title: 'New message',
    body: 'Open cruush to check it.',
    linkUrl: '/messages',
    actorUserId: null,
    conversationId: 'conversation-1',
    metadata: {},
    readAt: null,
    createdAt: '2026-08-02T12:00:00.000Z',
    ...overrides,
  };
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{location.pathname}</div>;
}

function installMockAudioContext(initialState: AudioContextState = 'suspended') {
  const oscillators: Array<{
    connect: ReturnType<typeof vi.fn>;
    frequency: {
      exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
      setValueAtTime: ReturnType<typeof vi.fn>;
    };
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    type: OscillatorType;
  }> = [];
  const gains: Array<{
    connect: ReturnType<typeof vi.fn>;
    gain: {
      exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
      setValueAtTime: ReturnType<typeof vi.fn>;
    };
  }> = [];
  const context: {
    createGain: ReturnType<typeof vi.fn>;
    createOscillator: ReturnType<typeof vi.fn>;
    currentTime: number;
    destination: Record<string, never>;
    resume: ReturnType<typeof vi.fn>;
    state: AudioContextState;
  } = {
    createGain: vi.fn(() => {
      const gain = {
        connect: vi.fn(),
        gain: {
          exponentialRampToValueAtTime: vi.fn(),
          setValueAtTime: vi.fn(),
        },
      };
      gains.push(gain);
      return gain;
    }),
    createOscillator: vi.fn(() => {
      const oscillator = {
        connect: vi.fn(),
        frequency: {
          exponentialRampToValueAtTime: vi.fn(),
          setValueAtTime: vi.fn(),
        },
        start: vi.fn(),
        stop: vi.fn(),
        type: 'sine' as OscillatorType,
      };
      oscillators.push(oscillator);
      return oscillator;
    }),
    currentTime: 12,
    destination: {},
    resume: vi.fn(async () => {
      context.state = 'running';
    }),
    state: initialState,
  };
  const AudioContextConstructor = vi.fn(function MockAudioContext() {
    return context;
  });

  Object.defineProperty(window, 'AudioContext', {
    configurable: true,
    value: AudioContextConstructor,
    writable: true,
  });

  return {
    AudioContextConstructor,
    context,
    gains,
    oscillators,
  };
}

async function advanceToNextPoll() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(IN_APP_NOTIFICATION_POLL_INTERVAL_MS);
  });
}

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('ForegroundNotifications', () => {
  let originalAudioContext: typeof window.AudioContext | undefined;
  let originalWebkitAudioContext: typeof AudioContext | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    originalAudioContext = window.AudioContext;
    originalWebkitAudioContext = (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: undefined,
      writable: true,
    });
    Object.defineProperty(window, 'webkitAudioContext', {
      configurable: true,
      value: undefined,
      writable: true,
    });
    emitNotificationsChanged.mockReset();
    getNotificationPreferences.mockReset();
    getNotificationSummary.mockReset();
    getNotifications.mockReset();
    markNotificationRead.mockReset();
    toastCustom.mockReset();
    toastDismiss.mockReset();
    toastCustom.mockImplementation(() => 'toast-id');
    getNotificationPreferences.mockResolvedValue(enabledPreferences);
    getNotificationSummary.mockResolvedValue({ unreadCount: 1 });
    getNotifications.mockResolvedValue({ notifications: [], nextCursor: null });
    markNotificationRead.mockResolvedValue({ unreadCount: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: originalAudioContext,
      writable: true,
    });
    Object.defineProperty(window, 'webkitAudioContext', {
      configurable: true,
      value: originalWebkitAudioContext,
      writable: true,
    });
  });

  it('uses the first poll as a baseline and pops only new unread notifications', async () => {
    const oldNotification = notification({
      id: 'old-notification',
      createdAt: '2026-08-02T12:00:00.000Z',
    });
    const newNotification = notification({
      id: 'new-notification',
      title: 'New message',
      linkUrl: '/chat/conversation-1',
      createdAt: '2026-08-02T12:01:00.000Z',
    });
    getNotifications
      .mockResolvedValueOnce({ notifications: [oldNotification], nextCursor: null })
      .mockResolvedValueOnce({ notifications: [newNotification, oldNotification], nextCursor: null });

    render(
      <MemoryRouter initialEntries={['/messages']}>
        <ForegroundNotifications />
      </MemoryRouter>,
    );

    await flushAsyncWork();
    expect(getNotifications).toHaveBeenCalledTimes(1);
    expect(toastCustom).not.toHaveBeenCalled();

    await advanceToNextPoll();

    expect(toastCustom).toHaveBeenCalledTimes(1);
    expect(toastCustom.mock.calls[0]?.[1]).toMatchObject({
      id: 'notification-new-notification',
      duration: 9000,
      unstyled: true,
    });
    expect(emitNotificationsChanged).toHaveBeenCalledWith({ unreadCount: 1 });
  });

  it('marks a popup notification read before opening its link', async () => {
    const newNotification = notification({
      id: 'new-notification',
      title: 'New message',
      linkUrl: '/chat/conversation-1',
      createdAt: '2026-08-02T12:01:00.000Z',
    });
    getNotifications
      .mockResolvedValueOnce({
        notifications: [notification({ id: 'old-notification' })],
        nextCursor: null,
      })
      .mockResolvedValueOnce({ notifications: [newNotification], nextCursor: null });

    render(
      <MemoryRouter initialEntries={['/messages']}>
        <ForegroundNotifications />
        <LocationProbe />
      </MemoryRouter>,
    );

    await flushAsyncWork();
    expect(getNotifications).toHaveBeenCalledTimes(1);
    await advanceToNextPoll();
    expect(toastCustom).toHaveBeenCalledTimes(1);

    const renderPopup = toastCustom.mock.calls[0]?.[0];
    expect(renderPopup).toBeTypeOf('function');
    render(renderPopup('toast-new-notification'));

    fireEvent.click(screen.getByRole('button', { name: 'Open notification: New message' }));

    await flushAsyncWork();
    expect(markNotificationRead).toHaveBeenCalledWith('new-notification');
    expect(toastDismiss).toHaveBeenCalledWith('toast-new-notification');
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/chat/conversation-1');
  });

  it('does not show popups on the map route', async () => {
    getNotifications
      .mockResolvedValueOnce({
        notifications: [notification({ id: 'old-notification' })],
        nextCursor: null,
      })
      .mockResolvedValueOnce({
        notifications: [notification({
          id: 'new-notification',
          createdAt: '2026-08-02T12:01:00.000Z',
        })],
        nextCursor: null,
      });

    render(
      <MemoryRouter initialEntries={['/map']}>
        <ForegroundNotifications />
      </MemoryRouter>,
    );

    await flushAsyncWork();
    expect(getNotifications).toHaveBeenCalledTimes(1);
    await advanceToNextPoll();
    expect(getNotifications).toHaveBeenCalledTimes(2);

    expect(toastCustom).not.toHaveBeenCalled();
  });

  it('honors alert type preferences before showing a popup', async () => {
    getNotificationPreferences.mockResolvedValue({
      ...enabledPreferences,
      messagesEnabled: false,
    });
    getNotifications
      .mockResolvedValueOnce({
        notifications: [notification({ id: 'old-notification' })],
        nextCursor: null,
      })
      .mockResolvedValueOnce({
        notifications: [notification({
          id: 'new-message-notification',
          createdAt: '2026-08-02T12:01:00.000Z',
        })],
        nextCursor: null,
      });

    render(
      <MemoryRouter initialEntries={['/messages']}>
        <ForegroundNotifications />
      </MemoryRouter>,
    );

    await flushAsyncWork();
    expect(getNotifications).toHaveBeenCalledTimes(1);
    await advanceToNextPoll();
    expect(getNotifications).toHaveBeenCalledTimes(2);

    expect(toastCustom).not.toHaveBeenCalled();
  });

  it('plays an audible heartbeat after resuming foreground notification audio', async () => {
    const audio = installMockAudioContext();
    const oldNotification = notification({
      id: 'old-notification',
      createdAt: '2026-08-02T12:00:00.000Z',
    });
    const newNotification = notification({
      id: 'new-notification',
      createdAt: '2026-08-02T12:01:00.000Z',
    });
    getNotifications
      .mockResolvedValueOnce({ notifications: [oldNotification], nextCursor: null })
      .mockResolvedValueOnce({ notifications: [newNotification], nextCursor: null });

    render(
      <MemoryRouter initialEntries={['/messages']}>
        <ForegroundNotifications />
      </MemoryRouter>,
    );

    await flushAsyncWork();
    await advanceToNextPoll();
    await flushAsyncWork();

    expect(audio.AudioContextConstructor).toHaveBeenCalledTimes(1);
    expect(audio.context.resume).toHaveBeenCalled();
    expect(audio.oscillators).toHaveLength(4);
    expect(audio.gains).toHaveLength(4);
    expect(audio.oscillators.every((oscillator) => oscillator.start.mock.calls.length === 1)).toBe(true);
    expect(audio.oscillators.every((oscillator) => oscillator.stop.mock.calls.length === 1)).toBe(true);

    const peakGains = audio.gains.flatMap((gain) => (
      gain.gain.exponentialRampToValueAtTime.mock.calls.map(([value]) => Number(value))
    ));
    expect(Math.max(...peakGains)).toBeGreaterThanOrEqual(0.16);
    expect(peakGains.some((value) => value >= 0.055 && value < 0.07)).toBe(true);
  });

  it('unlocks heartbeat audio on mobile touch and click gestures', async () => {
    const audio = installMockAudioContext();

    render(
      <MemoryRouter initialEntries={['/messages']}>
        <ForegroundNotifications />
      </MemoryRouter>,
    );

    fireEvent.touchStart(window);
    await flushAsyncWork();

    expect(audio.AudioContextConstructor).toHaveBeenCalledTimes(1);
    expect(audio.context.resume).toHaveBeenCalled();
  });

  it('keeps route and preference helpers narrow', () => {
    const messageNotification = notification();
    const groupNotification = notification({
      type: 'group_membership',
      conversationId: 'group-1',
    });

    expect(shouldShowInAppNotificationPopup('/map', messageNotification)).toBe(false);
    expect(shouldShowInAppNotificationPopup('/messages', messageNotification)).toBe(true);
    expect(shouldShowInAppNotificationPopup('/chat/conversation-1', messageNotification)).toBe(false);
    expect(shouldPlayInAppNotificationSound('/chat/conversation-1', messageNotification)).toBe(false);
    expect(shouldPlayInAppNotificationSound('/map', messageNotification)).toBe(true);
    expect(isNotificationTypeEnabled({
      ...enabledPreferences,
      groupsEnabled: false,
    }, groupNotification.type)).toBe(false);
    expect(resolveNotificationNavigationPath('https://example.com')).toBe('/notifications');
    expect(resolveNotificationNavigationPath('//example.com')).toBe('/notifications');
    expect(resolveNotificationNavigationPath('/notifications')).toBe('/notifications');
  });
});
