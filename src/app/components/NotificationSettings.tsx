import { useEffect, useState } from 'react';
import { ArrowLeft, Bell, Download, Smartphone } from 'lucide-react';
import { useNavigate } from 'react-router';
import {
  getNotificationPreferences,
  getVapidPublicKey,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
  updateNotificationPreferences,
  type NotificationPreferences,
  type PushSubscriptionPayload,
  type VapidPublicKeyPayload,
} from '../lib/notificationsApi';
import { Button } from './ui/button';
import { Switch } from './ui/switch';

function urlBase64ToUint8Array(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    output[index] = rawData.charCodeAt(index);
  }

  return output;
}

function arrayBufferToBase64(value: ArrayBuffer | null) {
  if (!value) {
    return '';
  }

  const bytes = new Uint8Array(value);
  let output = '';

  bytes.forEach((byte) => {
    output += String.fromCharCode(byte);
  });

  return window.btoa(output);
}

function serializeSubscription(subscription: PushSubscription): PushSubscriptionPayload {
  return {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: arrayBufferToBase64(subscription.getKey('p256dh')),
      auth: arrayBufferToBase64(subscription.getKey('auth')),
    },
  };
}

function isStandaloneDisplay() {
  return window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function preferenceRows(preferences: NotificationPreferences) {
  return [
    {
      key: 'cruushEnabled' as const,
      label: 'cruush alerts',
      checked: preferences.cruushEnabled,
    },
    {
      key: 'messagesEnabled' as const,
      label: 'Message alerts',
      checked: preferences.messagesEnabled,
    },
    {
      key: 'groupsEnabled' as const,
      label: 'Group alerts',
      checked: preferences.groupsEnabled,
    },
  ];
}

export default function NotificationSettings() {
  const navigate = useNavigate();
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [vapid, setVapid] = useState<VapidPublicKeyPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let isActive = true;

    const loadSettings = async () => {
      setIsLoading(true);
      setError('');

      try {
        const [nextPreferences, nextVapid] = await Promise.all([
          getNotificationPreferences(),
          getVapidPublicKey(),
        ]);

        if (!isActive) {
          return;
        }

        setPreferences(nextPreferences);
        setVapid(nextVapid);
      } catch (error) {
        if (isActive) {
          setError(error instanceof Error ? error.message : 'Failed to load notification settings.');
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    void loadSettings();

    return () => {
      isActive = false;
    };
  }, []);

  const savePreferences = async (partial: Partial<NotificationPreferences>) => {
    if (!preferences) {
      return;
    }

    setIsSaving(true);
    setError('');
    setNotice('');

    try {
      const next = await updateNotificationPreferences(partial);
      setPreferences(next);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to save notification settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const enablePush = async () => {
    setIsSaving(true);
    setError('');
    setNotice('');

    try {
      if (!vapid?.enabled || !vapid.publicKey) {
        throw new Error('Push alerts are not configured on this server yet.');
      }

      if (!('Notification' in window)) {
        throw new Error('This browser does not support push notifications.');
      }

      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        throw new Error('Add cruush to your Home Screen, then open it from there to enable push alerts.');
      }

      const permission = Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();

      if (permission !== 'granted') {
        throw new Error('Notifications are blocked for cruush in this browser.');
      }

      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid.publicKey),
      });
      const next = await subscribeToPushNotifications(serializeSubscription(subscription));

      setPreferences(next);
      setNotice('Push alerts enabled.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to enable push alerts.');
    } finally {
      setIsSaving(false);
    }
  };

  const disablePush = async () => {
    setIsSaving(true);
    setError('');
    setNotice('');

    try {
      let endpoint = '';

      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        endpoint = subscription?.endpoint ?? '';
        await subscription?.unsubscribe();
      }

      const next = await unsubscribeFromPushNotifications(endpoint || undefined);
      setPreferences(next);
      setNotice('Push alerts disabled.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to disable push alerts.');
    } finally {
      setIsSaving(false);
    }
  };

  const installed = typeof window !== 'undefined' ? isStandaloneDisplay() : false;

  return (
    <div className="min-h-screen bg-background pb-28 text-foreground">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/88 px-4 py-3 backdrop-blur-md">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="rounded-full"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl text-white">Notification settings</h1>
          <p className="text-sm text-muted-foreground">Push alerts stay private on your lock screen.</p>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-5">
        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {notice ? (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
            {notice}
          </div>
        ) : null}

        <section className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <Bell className="mt-1 h-5 w-5 text-primary" />
            <div className="min-w-0 flex-1">
              <h2 className="text-lg text-white">Push alerts</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Lock screen alerts use generic text. Open cruush to see details.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={preferences?.pushEnabled ? disablePush : enablePush}
                  disabled={isLoading || isSaving}
                  className="rounded-full"
                >
                  {preferences?.pushEnabled ? 'Disable push' : 'Enable push'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void savePreferences({ pushEnabled: !preferences?.pushEnabled })}
                  disabled={isLoading || isSaving}
                  className="rounded-full"
                >
                  {preferences?.pushEnabled ? 'Pause alerts' : 'Allow in-app only'}
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-lg text-white">Alert types</h2>
          <div className="mt-4 divide-y divide-border">
            {preferences ? preferenceRows(preferences).map((row) => (
              <div key={row.key} className="flex min-h-14 items-center justify-between gap-4 py-3">
                <span className="text-sm text-white">{row.label}</span>
                <Switch
                  checked={row.checked}
                  onCheckedChange={(checked) => void savePreferences({ [row.key]: checked })}
                  disabled={isSaving}
                  aria-label={`Toggle ${row.label}`}
                />
              </div>
            )) : (
              <p className="text-sm text-muted-foreground">Loading settings...</p>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <Smartphone className="mt-1 h-5 w-5 text-primary" />
            <div className="min-w-0 flex-1">
              <h2 className="text-lg text-white">Home Screen app</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {installed
                  ? 'cruush is already running as a Home Screen app.'
                  : 'On iPhone, open Safari share and choose Add to Home Screen. On Android, use the install option in your browser menu.'}
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => window.dispatchEvent(new Event('cruush:install-requested'))}
                className="mt-4 gap-2 rounded-full"
              >
                <Download className="h-4 w-4" />
                Install cruush
              </Button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
