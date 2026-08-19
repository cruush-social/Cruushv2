import { useEffect, useState } from 'react';
import { ArrowLeft, Bell, CheckCheck } from 'lucide-react';
import { useNavigate } from 'react-router';
import {
  emitNotificationsChanged,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationRecord,
} from '../lib/notificationsApi';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { CruushIcon } from './CruushIconImage';

function formatNotificationTime(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return '';
  }
}

export default function NotificationCenter() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let isActive = true;

    const loadNotifications = async () => {
      setIsLoading(true);
      setError('');

      try {
        const payload = await getNotifications({ limit: 30 });

        if (!isActive) {
          return;
        }

        setNotifications(payload.notifications);
      } catch (error) {
        if (!isActive) {
          return;
        }

        setError(error instanceof Error ? error.message : 'Failed to load notifications.');
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    void loadNotifications();

    return () => {
      isActive = false;
    };
  }, []);

  const unreadCount = notifications.filter((notification) => !notification.readAt).length;

  const handleMarkAllRead = async () => {
    setIsMarkingAll(true);
    try {
      const summary = await markAllNotificationsRead();
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((notification) => ({
        ...notification,
        readAt: notification.readAt ?? readAt,
      })));
      emitNotificationsChanged(summary);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to mark notifications read.');
    } finally {
      setIsMarkingAll(false);
    }
  };

  const handleOpenNotification = async (notification: NotificationRecord) => {
    if (!notification.readAt) {
      try {
        const summary = await markNotificationRead(notification.id);
        setNotifications((current) => current.map((currentNotification) => (
          currentNotification.id === notification.id
            ? { ...currentNotification, readAt: new Date().toISOString() }
            : currentNotification
        )));
        emitNotificationsChanged(summary);
      } catch {
        // Navigation should still work if the read marker fails.
      }
    }

    if (notification.actorUserId && (notification.type === 'nearby_user' || notification.type === 'incoming_cruush' || !notification.linkUrl || notification.linkUrl === '/map')) {
      navigate(`/map?focusUserId=${encodeURIComponent(notification.actorUserId)}`);
      return;
    }

    navigate(notification.linkUrl || '/notifications');
  };

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
        <div className="min-w-0 flex-1">
          <h1 className="text-xl text-white">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => navigate('/settings/notifications')}
          aria-label="Notification settings"
          className="rounded-full text-white/88 hover:bg-white/10"
        >
          <CruushIcon name="settings" className="h-5 w-5" />
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handleMarkAllRead}
          disabled={unreadCount === 0 || isMarkingAll}
          aria-label="Mark all as read"
          className="gap-2 rounded-full"
        >
          <CheckCheck className="h-4 w-4" />
          <span className="hidden sm:inline">Mark all as read</span>
        </Button>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 py-5">
        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {isLoading ? (
          <div className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">
            Loading notifications...
          </div>
        ) : null}

        {!isLoading && notifications.length === 0 && !error ? (
          <div className="flex min-h-[16rem] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/70 p-8 text-center">
            <Bell className="h-8 w-8 text-muted-foreground" />
            <p className="mt-4 text-lg text-white">No notifications yet.</p>
          </div>
        ) : null}

        {!isLoading && notifications.length > 0 ? (
          <div className="space-y-2">
            {notifications.map((notification) => {
              const unread = !notification.readAt;

              return (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => void handleOpenNotification(notification)}
                  aria-label={notification.title}
                  className={`flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors ${
                    unread
                      ? 'border-primary/30 bg-primary/10 hover:bg-primary/14'
                      : 'border-border bg-card hover:bg-muted/45'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${unread ? 'bg-primary' : 'bg-transparent'}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-3">
                      <span className="min-w-0 break-words text-base text-white">{notification.title}</span>
                      {unread ? <Badge variant="secondary">Unread</Badge> : null}
                    </span>
                    {notification.body ? (
                      <span className="mt-1 block break-words text-sm text-muted-foreground">
                        {notification.body}
                      </span>
                    ) : null}
                    <span className="mt-2 block text-xs text-muted-foreground">
                      {formatNotificationTime(notification.createdAt)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
      </main>
    </div>
  );
}
