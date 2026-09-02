import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import { Bell, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { CruushIcon } from './CruushIconImage';
import {
  emitNotificationsChanged,
  getNotificationPreferences,
  getNotificationSummary,
  getNotifications,
  markNotificationRead,
  resolveNotificationNavigationPath,
  type NotificationPreferences,
  type NotificationRecord,
} from '../lib/notificationsApi';

export const IN_APP_NOTIFICATION_POLL_INTERVAL_MS = 20000;
const MAX_POPUPS_PER_POLL = 3;

function notificationTimestamp(notification: NotificationRecord) {
  const timestamp = Date.parse(notification.createdAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function isMapPath(pathname: string) {
  return pathname === '/map' || pathname.startsWith('/map/');
}

function isActiveConversationPath(pathname: string, notification: NotificationRecord) {
  if (!notification.conversationId) {
    return false;
  }

  return pathname === `/chat/${notification.conversationId}` ||
    pathname === `/chat/group/${notification.conversationId}`;
}

export function isNotificationTypeEnabled(
  preferences: NotificationPreferences,
  type: NotificationRecord['type'],
) {
  if (type === 'incoming_cruush' || type === 'mutual_cruush') {
    return preferences.cruushEnabled;
  }

  if (type === 'direct_message') {
    return preferences.messagesEnabled;
  }

  if (type === 'group_message' || type === 'group_membership') {
    return preferences.groupsEnabled;
  }

  if (type === 'nearby_activity' || type === 'place_checkin_expired') {
    return preferences.nearbyEnabled;
  }

  if (type === 'reward') {
    return preferences.rewardsEnabled;
  }

  if (type === 'pulse') {
    return preferences.pulseEnabled;
  }

  return true;
}

export function shouldShowInAppNotificationPopup(pathname: string, notification: NotificationRecord) {
  return notification.type === 'reward' || (!isMapPath(pathname) && !isActiveConversationPath(pathname, notification));
}

export function shouldPlayInAppNotificationSound(pathname: string, notification: NotificationRecord) {
  return !isActiveConversationPath(pathname, notification);
}

export function notificationPopupTheme() {
  return {
    popup: 'border-primary/45',
  };
}

export function notificationPopupIconName(type: NotificationRecord['type']) {
  return type === 'mutual_cruush' ? 'mutual' : 'bell';
}

function getAudioContextConstructor() {
  return window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

function getOrCreateAudioContext(audioContextRef: MutableRefObject<AudioContext | null>) {
  if (typeof window === 'undefined') {
    return null;
  }

  if (audioContextRef.current?.state === 'closed') {
    audioContextRef.current = null;
  }

  if (audioContextRef.current) {
    return audioContextRef.current;
  }

  const AudioContextConstructor = getAudioContextConstructor();
  if (!AudioContextConstructor) {
    return null;
  }

  audioContextRef.current = new AudioContextConstructor();
  return audioContextRef.current;
}

async function resumeAudioContext(audioContextRef: MutableRefObject<AudioContext | null>) {
  const context = getOrCreateAudioContext(audioContextRef);

  if (!context) {
    return null;
  }

  if (context.state !== 'running' && typeof context.resume === 'function') {
    await context.resume();
  }

  return context;
}

function scheduleHeartbeatTone(
  context: AudioContext,
  startTime: number,
  duration: number,
  startFrequency: number,
  endFrequency: number,
  peakGain: number,
  type: OscillatorType,
) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(startFrequency, startTime);
  oscillator.frequency.exponentialRampToValueAtTime(endFrequency, startTime + duration * 0.72);
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(peakGain, startTime + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.02);
}

function scheduleHeartbeatBeat(context: AudioContext, startTime: number, accent = 1) {
  scheduleHeartbeatTone(context, startTime, 0.2, 154, 92, 0.16 * accent, 'sine');
  scheduleHeartbeatTone(context, startTime + 0.006, 0.11, 292, 176, 0.055 * accent, 'triangle');
}

async function playHeartbeatNotificationSound(audioContextRef: MutableRefObject<AudioContext | null>) {
  try {
    const context = await resumeAudioContext(audioContextRef);

    if (!context) {
      return;
    }

    const startTime = context.currentTime + 0.025;
    scheduleHeartbeatBeat(context, startTime);
    scheduleHeartbeatBeat(context, startTime + 0.23, 0.72);
  } catch {
    // Browsers can block foreground audio until the user interacts with the page.
  }
}

export default function ForegroundNotifications({ showLatestRewardOnFirstPoll = false }: {
  showLatestRewardOnFirstPoll?: boolean;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const pathnameRef = useRef(location.pathname);
  const audioContextRef = useRef<AudioContext | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const latestCreatedAtRef = useRef(0);
  const hasBaselineRef = useRef(false);
  const isPollingRef = useRef(false);

  useEffect(() => {
    pathnameRef.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    const unlockAudio = () => {
      try {
        void resumeAudioContext(audioContextRef);
      } catch {
        // Ignore audio unlock failures; notification delivery should keep working.
      }
    };

    window.addEventListener('pointerdown', unlockAudio, true);
    window.addEventListener('touchstart', unlockAudio, true);
    window.addEventListener('click', unlockAudio, true);
    window.addEventListener('keydown', unlockAudio, true);

    return () => {
      window.removeEventListener('pointerdown', unlockAudio, true);
      window.removeEventListener('touchstart', unlockAudio, true);
      window.removeEventListener('click', unlockAudio, true);
      window.removeEventListener('keydown', unlockAudio, true);
    };
  }, []);

  const openNotification = useCallback(async (notification: NotificationRecord, toastId: string | number) => {
    try {
      const summary = await markNotificationRead(notification.id);
      emitNotificationsChanged(summary);
    } catch {
      // Still navigate if the read marker fails.
    }

    toast.dismiss(toastId);
    navigate(resolveNotificationNavigationPath(notification));
  }, [navigate]);

  const showPopup = useCallback((notification: NotificationRecord) => {
    const theme = notificationPopupTheme();

    toast.custom((toastId) => (
      <div className={`relative flex w-full max-w-[22rem] rounded-lg border bg-background/95 text-white shadow-[0_18px_48px_rgba(0,0,0,0.46)] backdrop-blur-md ${theme.popup}`}>
      <button
        type="button"
        className="flex w-full items-start gap-3 rounded-lg border-0 bg-transparent p-4 pr-10 text-left text-white transition-colors hover:bg-muted/80"
        onClick={() => void openNotification(notification, toastId)}
        aria-label={`Open notification: ${notification.title}`}
      >
        <span
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white shadow-[0_8px_22px_rgba(0,0,0,0.3)]"
          data-notification-icon={notificationPopupIconName(notification.type)}
          style={{ background: 'var(--cruush-gradient)' }}
        >
          {notification.type === 'mutual_cruush' ? (
            <CruushIcon name="mutual" variant="white" className="h-5 w-5" />
          ) : (
            <Bell className="h-4 w-4" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block break-words text-sm font-medium leading-snug">
            {notification.title}
          </span>
          {notification.body ? (
            <span className="mt-1 block break-words text-xs leading-snug text-muted-foreground">
              {notification.body}
            </span>
          ) : null}
        </span>
      </button>

      {/* Dismissing a popup should not mean opening what it points at. */}
      <button
        aria-label={`Dismiss notification: ${notification.title}`}
        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border border-white/12 bg-black/45 text-white/75 transition-colors hover:text-white"
        onClick={() => toast.dismiss(toastId)}
        type="button"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      </div>
    ), {
      id: `notification-${notification.id}`,
      duration: 9000,
      unstyled: true,
    });
  }, [openNotification]);

  useEffect(() => {
    let isActive = true;

    const poll = async () => {
      if (isPollingRef.current || document.visibilityState === 'hidden') {
        return;
      }

      isPollingRef.current = true;

      try {
        const [payload, summary, preferences] = await Promise.all([
          getNotifications({ filter: 'unread', limit: 10 }),
          getNotificationSummary(),
          getNotificationPreferences(),
        ]);

        if (!isActive) {
          return;
        }

        emitNotificationsChanged(summary);

        const newestTimestamp = payload.notifications.reduce((newest, notification) => (
          Math.max(newest, notificationTimestamp(notification))
        ), latestCreatedAtRef.current);

        if (!hasBaselineRef.current) {
          const onboardingReward = showLatestRewardOnFirstPoll
            ? payload.notifications.find((notification) => (
                notification.type === 'reward' && isNotificationTypeEnabled(preferences, notification.type)
              ))
            : null;
          payload.notifications.forEach((notification) => {
            seenIdsRef.current.add(notification.id);
          });
          latestCreatedAtRef.current = newestTimestamp;
          hasBaselineRef.current = true;
          if (onboardingReward) {
            if (preferences.soundEnabled && shouldPlayInAppNotificationSound(pathnameRef.current, onboardingReward)) {
              void playHeartbeatNotificationSound(audioContextRef);
            }
            showPopup(onboardingReward);
          }
          return;
        }

        const threshold = latestCreatedAtRef.current;
        const newNotifications = payload.notifications
          .filter((notification) => (
            !seenIdsRef.current.has(notification.id) &&
            notificationTimestamp(notification) > threshold &&
            isNotificationTypeEnabled(preferences, notification.type)
          ))
          .sort((first, second) => notificationTimestamp(first) - notificationTimestamp(second));

        payload.notifications.forEach((notification) => {
          seenIdsRef.current.add(notification.id);
        });
        latestCreatedAtRef.current = newestTimestamp;

        const soundableNotifications = newNotifications.filter((notification) => (
          preferences.soundEnabled &&
          shouldPlayInAppNotificationSound(pathnameRef.current, notification)
        ));
        if (soundableNotifications.length > 0) {
          void playHeartbeatNotificationSound(audioContextRef);
        }

        newNotifications
          .filter((notification) => shouldShowInAppNotificationPopup(pathnameRef.current, notification))
          .slice(-MAX_POPUPS_PER_POLL)
          .forEach(showPopup);
      } catch {
        // Foreground notifications are best-effort and should never interrupt app usage.
      } finally {
        isPollingRef.current = false;
      }
    };

    void poll();

    const intervalId = window.setInterval(() => {
      void poll();
    }, IN_APP_NOTIFICATION_POLL_INTERVAL_MS);
    const pollWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        void poll();
      }
    };

    window.addEventListener('focus', pollWhenVisible);
    document.addEventListener('visibilitychange', pollWhenVisible);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', pollWhenVisible);
      document.removeEventListener('visibilitychange', pollWhenVisible);
    };
  }, [showLatestRewardOnFirstPoll, showPopup]);

  return null;
}
