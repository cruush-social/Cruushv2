import { useEffect, useRef, useState } from 'react';
import { useExclusivePopup } from '../lib/popupQueue';
import { enablePushNotifications } from '../lib/pushNotifications';
import { Button } from './ui/button';
import { CruushIcon } from './CruushIconImage';
import FirstEntryPromptSurface from './FirstEntryPromptSurface';
import { getNotificationPreferences } from '../lib/notificationsApi';
import { androidPushPromptSessionKey } from '../lib/pushPromptSession';

const PUSH_PROMPT_VERSION = 'v1';
export const PUSH_PREFERENCE_TIMEOUT_MS = 10_000;

function wasHandled(storage: 'localStorage' | 'sessionStorage', key: string) {
  try { return window[storage].getItem(key) === 'true'; }
  catch { return false; }
}

export function pushPromptHandledKey(userId: string) {
  return `cruush:first-entry-push:${PUSH_PROMPT_VERSION}:${userId}`;
}

function isStandaloneDisplay() {
  return window.matchMedia?.('(display-mode: standalone)').matches
    || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIosBrowser() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isAndroidBrowser() {
  return /android/i.test(window.navigator.userAgent);
}

function canOfferAndroidPush(userId: string) {
  return isAndroidBrowser()
    && 'Notification' in window
    && Boolean(navigator.serviceWorker)
    && 'PushManager' in window
    && !wasHandled('sessionStorage', androidPushPromptSessionKey(userId));
}

function canOfferPush(userId: string) {
  if (isAndroidBrowser()) {
    return canOfferAndroidPush(userId) && Notification.permission !== 'granted';
  }
  if (wasHandled('localStorage', pushPromptHandledKey(userId))) {
    return false;
  }

  if (!('Notification' in window) || Notification.permission !== 'default') {
    return false;
  }

  if (!navigator.serviceWorker || !('PushManager' in window)) {
    return false;
  }

  return !isIosBrowser() || isStandaloneDisplay();
}

export default function PushPermissionPrompt({ userId }: { userId: string }) {
  const [visible, setVisible] = useState(() => canOfferPush(userId));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [checkingPreference, setCheckingPreference] = useState(() => canOfferAndroidPush(userId) && Notification.permission === 'granted');
  const enableGeneration = useRef(0);
  const ownsSlot = useExclusivePopup('push-permission', visible || checkingPreference);
  const showing = visible && ownsSlot;

  useEffect(() => {
    let active = true;
    let preferencePending = true;
    let timeout: number | undefined;
    setVisible(canOfferPush(userId));
    setError('');
    setSaving(false);
    const needsPreference = canOfferAndroidPush(userId) && Notification.permission === 'granted';
    setCheckingPreference(needsPreference);
    if (needsPreference) {
      timeout = window.setTimeout(() => {
        preferencePending = false;
        if (active) setCheckingPreference(false);
      }, PUSH_PREFERENCE_TIMEOUT_MS);
      void getNotificationPreferences().then((preferences) => {
        if (active && preferencePending) setVisible(!preferences.pushEnabled);
      }).catch(() => {
        // An unavailable preference is not evidence that push is off.
      }).finally(() => {
        window.clearTimeout(timeout);
        preferencePending = false;
        if (active) setCheckingPreference(false);
      });
    }

    return () => {
      active = false;
      window.clearTimeout(timeout);
      enableGeneration.current += 1;
    };
  }, [userId]);

  const markHandledAndClose = () => {
    try {
      if (isAndroidBrowser()) {
        window.sessionStorage.setItem(androidPushPromptSessionKey(userId), 'true');
      } else {
        window.localStorage.setItem(pushPromptHandledKey(userId), 'true');
      }
    } catch { /* Storage may be blocked; dismissal still works for this mount. */ }
    setVisible(false);
  };

  const enable = async () => {
    const generation = ++enableGeneration.current;
    setSaving(true);
    setError('');

    try {
      await enablePushNotifications();
      if (generation !== enableGeneration.current) return;
      markHandledAndClose();
    } catch (nextError) {
      if (generation !== enableGeneration.current) return;
      if (!isAndroidBrowser() && 'Notification' in window && Notification.permission === 'denied') {
        markHandledAndClose();
      } else {
        setError(nextError instanceof Error ? nextError.message : 'Failed to enable push alerts.');
      }
    } finally {
      if (generation === enableGeneration.current) setSaving(false);
    }
  };

  return (
    <FirstEntryPromptSurface
      open={showing}
      onDismiss={markHandledAndClose}
      testId="push-permission-prompt"
      title="Enable notifications"
      description={error || 'Get alerts for cruushes, messages, and activity.'}
      icon={(
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white" style={{ background: 'var(--cruush-gradient)' }}>
          <CruushIcon name="notifications" variant="white" className="h-6 w-6" />
        </div>
      )}
      primary={(
        <Button
          type="button"
          onClick={() => void enable()}
          disabled={saving}
          className="min-h-11 rounded-full text-white"
          style={{ background: 'var(--cruush-gradient)' }}
        >
          Enable notifications
        </Button>
      )}
      secondary={(
        <Button
          type="button"
          variant="outline"
          onClick={markHandledAndClose}
          disabled={saving}
          className="min-h-11 rounded-full"
        >
          Not now
        </Button>
      )}
    />
  );
}
