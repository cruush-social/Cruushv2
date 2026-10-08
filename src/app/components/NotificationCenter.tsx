import { useEffect, useState } from 'react';
import { Bell, CheckCheck, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import {
  clearNotifications,
  deleteNotification,
  emitNotificationsChanged,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  resolveNotificationNavigationPath,
  type NotificationRecord,
} from '../lib/notificationsApi';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { CruushIcon } from './CruushIconImage';
import AppPageHeader, { APP_PAGE_HEADER_BUTTON_CLASS } from './AppPageHeader';

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
  const [isClearingAll, setIsClearingAll] = useState(false);
  const [deletingNotificationIds, setDeletingNotificationIds] = useState<Set<string>>(() => new Set());
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

    navigate(resolveNotificationNavigationPath(notification));
  };

  const handleDeleteNotification = async (notification: NotificationRecord) => {
    setDeletingNotificationIds((current) => new Set(current).add(notification.id));
    try {
      const summary = await deleteNotification(notification.id);
      setNotifications((current) => current.filter((item) => item.id !== notification.id));
      emitNotificationsChanged(summary);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to delete notification.');
    } finally {
      setDeletingNotificationIds((current) => {
        const next = new Set(current);
        next.delete(notification.id);
        return next;
      });
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm('Delete all notifications?')) {
      return;
    }

    setIsClearingAll(true);
    try {
      const summary = await clearNotifications();
      setNotifications([]);
      emitNotificationsChanged(summary);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to delete notifications.');
    } finally {
      setIsClearingAll(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-28 text-foreground">
      <AppPageHeader
        title="Notifications"
        onBack={() => navigate(-1)}
        bugButtonTestId="notification-bug-button-slot"
        testId="notification-center-header"
        rowTestId="notification-center-header-row"
        actions={(
          <>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              onClick={handleMarkAllRead}
              disabled={unreadCount === 0 || isMarkingAll}
              aria-label="Mark all as read"
              className={APP_PAGE_HEADER_BUTTON_CLASS}
            >
              <CheckCheck className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              onClick={() => void handleClearAll()}
              disabled={notifications.length === 0 || isClearingAll}
              aria-label="Delete all notifications"
              className={APP_PAGE_HEADER_BUTTON_CLASS}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              onClick={() => navigate('/settings/notifications')}
              aria-label="Notification settings"
              className={APP_PAGE_HEADER_BUTTON_CLASS}
            >
              <CruushIcon name="settings" className="h-5 w-5" />
            </Button>
          </>
        )}
      />

      <main className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 py-5">
        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {isLoading ? (
          <div className="space-y-2" aria-label="Loading notifications">
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                aria-hidden="true"
                className="flex animate-pulse items-start gap-3 rounded-lg border border-border bg-card p-4"
              >
                <div className="h-9 w-9 shrink-0 rounded-full bg-white/10" />
                <div className="min-w-0 flex-1 space-y-2 py-1">
                  <div className="h-4 w-2/5 rounded-full bg-white/10" />
                  <div className="h-3 w-4/5 rounded-full bg-white/[0.07]" />
                  <div className="h-3 w-1/4 rounded-full bg-white/[0.05]" />
                </div>
              </div>
            ))}
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
                <article
                  key={notification.id}
                  className={`relative flex w-full items-start gap-3 rounded-lg border p-4 pr-14 text-left transition-colors ${
                    unread
                      ? 'border-primary/30 bg-primary/10 hover:bg-primary/14'
                      : 'border-border bg-card hover:bg-muted/45'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white shadow-[0_8px_22px_rgba(0,0,0,0.3)]"
                    data-notification-icon={notification.type === 'mutual_cruush' ? 'mutual' : 'bell'}
                    style={{ background: 'var(--cruush-gradient)' }}
                  >
                    {notification.type === 'mutual_cruush' ? (
                      <CruushIcon name="mutual" variant="white" className="h-5 w-5" />
                    ) : (
                      <Bell className="h-4 w-4" />
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleOpenNotification(notification)}
                    aria-label={notification.title}
                    className="min-w-0 flex-1 text-left"
                  >
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
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete notification: ${notification.title}`}
                    title="Delete notification"
                    disabled={deletingNotificationIds.has(notification.id)}
                    onClick={() => void handleDeleteNotification(notification)}
                    className="absolute right-3 top-3 size-8 text-white/55 hover:bg-white/10 hover:text-white"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </article>
              );
            })}
          </div>
        ) : null}
      </main>
    </div>
  );
}
