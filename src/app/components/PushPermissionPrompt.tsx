import { useState } from 'react';
import { useExclusivePopup } from '../lib/popupQueue';
import { enablePushNotifications } from '../lib/pushNotifications';
import { Button } from './ui/button';
import { CruushIcon } from './CruushIconImage';
import FirstEntryPromptSurface from './FirstEntryPromptSurface';

const PUSH_PROMPT_VERSION = 'v1';

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

function canOfferPush(userId: string) {
  if (window.localStorage.getItem(pushPromptHandledKey(userId)) === 'true') {
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
  const showing = useExclusivePopup('push-permission', visible);

  const markHandledAndClose = () => {
    window.localStorage.setItem(pushPromptHandledKey(userId), 'true');
    setVisible(false);
  };

  const enable = async () => {
    setSaving(true);
    setError('');

    try {
      await enablePushNotifications();
      markHandledAndClose();
    } catch (nextError) {
      if ('Notification' in window && Notification.permission === 'denied') {
        markHandledAndClose();
      } else {
        setError(nextError instanceof Error ? nextError.message : 'Failed to enable push alerts.');
      }
    } finally {
      setSaving(false);
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
