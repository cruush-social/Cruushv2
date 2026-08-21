import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Bell, Download, Smartphone } from 'lucide-react';
import { useNavigate } from 'react-router';
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferences,
} from '../lib/notificationsApi';
import { disablePushNotifications, enablePushNotifications } from '../lib/pushNotifications';
import { Button } from './ui/button';
import { Switch } from './ui/switch';

function isStandaloneDisplay() {
  return window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function preferenceRows(preferences: NotificationPreferences) {
  return [
    {
      key: 'soundEnabled' as const,
      label: 'Heartbeat sound',
      checked: preferences.soundEnabled,
    },
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
    {
      key: 'nearbyEnabled' as const,
      label: 'Nearby people',
      checked: preferences.nearbyEnabled,
    },
    {
      key: 'rewardsEnabled' as const,
      label: 'Reward updates',
      checked: preferences.rewardsEnabled,
    },
  ];
}

export default function NotificationSettings() {
  const navigate = useNavigate();
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const loadRequestIdRef = useRef(0);

  const loadSettings = useCallback(async () => {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    setIsLoading(true);
    setError('');

    try {
      const nextPreferences = await getNotificationPreferences();

      if (loadRequestIdRef.current === requestId) {
        setPreferences(nextPreferences);
      }
    } catch (error) {
      if (loadRequestIdRef.current === requestId) {
        setPreferences(null);
        setError(error instanceof Error ? error.message : 'Failed to load notification settings.');
      }
    } finally {
      if (loadRequestIdRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadSettings();

    return () => {
      loadRequestIdRef.current += 1;
    };
  }, [loadSettings]);

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
      const next = await enablePushNotifications();

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
      const next = await disablePushNotifications();
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
                  disabled={isLoading || isSaving || !preferences}
                  className="rounded-full"
                >
                  {preferences?.pushEnabled ? 'Disable push' : 'Enable push'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void savePreferences({ pushEnabled: !preferences?.pushEnabled })}
                  disabled={isLoading || isSaving || !preferences}
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
            )) : isLoading ? (
              <p className="text-sm text-muted-foreground">Loading settings...</p>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => void loadSettings()}
              >
                Retry loading notification settings
              </Button>
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
                  : 'Install cruush from its own row on the settings page.'}
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
