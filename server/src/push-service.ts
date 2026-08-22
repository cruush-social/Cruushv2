import type { FastifyInstance } from "fastify";
import webPush from "web-push";
import type { AppConfig } from "./config.js";
import type { DbClient } from "./db.js";
import type { AppNotificationRecord, AppNotificationType } from "./notification-service.js";

type PushApp = Pick<FastifyInstance, "config" | "db" | "log"> | {
  config: AppConfig;
  db: DbClient;
  log: Pick<FastifyInstance["log"], "warn" | "error" | "info">;
};

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type NotificationPreferencesRow = {
  push_enabled: boolean;
  cruush_enabled: boolean;
  messages_enabled: boolean;
  groups_enabled: boolean;
  nearby_enabled: boolean;
  rewards_enabled: boolean;
  sound_enabled: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start_minute: number;
  quiet_hours_end_minute: number;
  quiet_hours_timezone: string;
  pulse_enabled: boolean;
};

export type NotificationPreferences = {
  pushEnabled: boolean;
  cruushEnabled: boolean;
  messagesEnabled: boolean;
  groupsEnabled: boolean;
  nearbyEnabled: boolean;
  rewardsEnabled: boolean;
  soundEnabled: boolean;
  quietHoursEnabled: boolean;
  /** Minutes past local midnight. A start above the end wraps past midnight. */
  quietHoursStartMinute: number;
  quietHoursEndMinute: number;
  /** IANA zone the window is read in. */
  quietHoursTimezone: string;
  pulseEnabled: boolean;
};

export type PushSubscriptionPayload = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

let configuredVapidKey = "";

const MINUTES_PER_DAY = 1440;
const QUIET_HOURS_DEFAULT_END_MINUTE = 360;

function clampMinuteOfDay(value: unknown, fallback: number) {
  const minute = Math.trunc(Number(value));

  return Number.isFinite(minute) && minute >= 0 && minute < MINUTES_PER_DAY ? minute : fallback;
}

/**
 * The member's own wall clock, in minutes past midnight. Quiet hours are a
 * human window, so an overnight span is read where the member lives rather
 * than in UTC.
 */
function localMinuteOfDay(timezone: string, atMs: number) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      hour12: false,
      minute: "2-digit",
      timeZone: timezone
    }).formatToParts(new Date(atMs));
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
    const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");

    return ((hour % 24) * 60 + minute) % MINUTES_PER_DAY;
  } catch {
    const date = new Date(atMs);

    return date.getUTCHours() * 60 + date.getUTCMinutes();
  }
}

export function isWithinQuietHours(preferences: NotificationPreferences, atMs = Date.now()) {
  if (!preferences.quietHoursEnabled) {
    return false;
  }

  const { quietHoursStartMinute: start, quietHoursEndMinute: end } = preferences;
  if (start === end) {
    return false;
  }

  const minute = localMinuteOfDay(preferences.quietHoursTimezone, atMs);

  // A window that wraps past midnight covers both ends of the day.
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

function mapPreferences(row?: Partial<NotificationPreferencesRow> | null): NotificationPreferences {
  return {
    pushEnabled: Boolean(row?.push_enabled),
    cruushEnabled: row?.cruush_enabled ?? true,
    messagesEnabled: row?.messages_enabled ?? true,
    groupsEnabled: row?.groups_enabled ?? true,
    nearbyEnabled: row?.nearby_enabled ?? true,
    rewardsEnabled: row?.rewards_enabled ?? true,
    soundEnabled: row?.sound_enabled ?? true,
    quietHoursEnabled: row?.quiet_hours_enabled ?? false,
    quietHoursStartMinute: clampMinuteOfDay(row?.quiet_hours_start_minute, 0),
    quietHoursEndMinute: clampMinuteOfDay(row?.quiet_hours_end_minute, QUIET_HOURS_DEFAULT_END_MINUTE),
    quietHoursTimezone: row?.quiet_hours_timezone || "UTC",
    pulseEnabled: row?.pulse_enabled !== false
  };
}

function isPushConfigured(config: AppConfig) {
  return Boolean(
    config.WEB_PUSH_ENABLED &&
    config.WEB_PUSH_VAPID_PUBLIC_KEY &&
    config.WEB_PUSH_VAPID_PRIVATE_KEY &&
    config.WEB_PUSH_SUBJECT
  );
}

function configureWebPush(config: AppConfig) {
  if (!isPushConfigured(config)) {
    return false;
  }

  const nextKey = `${config.WEB_PUSH_SUBJECT}:${config.WEB_PUSH_VAPID_PUBLIC_KEY}`;
  if (configuredVapidKey !== nextKey) {
    webPush.setVapidDetails(
      config.WEB_PUSH_SUBJECT ?? "mailto:hello@cruush.app",
      config.WEB_PUSH_VAPID_PUBLIC_KEY ?? "",
      config.WEB_PUSH_VAPID_PRIVATE_KEY ?? ""
    );
    configuredVapidKey = nextKey;
  }

  return true;
}

function isPreferenceEnabledForType(preferences: NotificationPreferences, type: AppNotificationType) {
  if (!preferences.pushEnabled) {
    return false;
  }

  if (type === "nearby_activity") {
    return preferences.nearbyEnabled;
  }

  if (type === "reward") {
    return preferences.rewardsEnabled;
  }

  if (type === "incoming_cruush" || type === "mutual_cruush") {
    return preferences.cruushEnabled;
  }

  if (type === "pulse") {
    return preferences.pulseEnabled;
  }

  if (type === "direct_message" || type === "group_message") {
    return preferences.messagesEnabled;
  }

  return preferences.groupsEnabled;
}

function genericPushCopy(type: AppNotificationType) {
  if (type === "incoming_cruush") {
    return {
      title: "New cruush",
      body: "Open cruush to check it."
    };
  }

  if (type === "mutual_cruush") {
    return {
      title: "It's mutual",
      body: "Open cruush to check it."
    };
  }

  if (type === "group_membership") {
    return {
      title: "New group update",
      body: "Open cruush to check it."
    };
  }

  if (type === "nearby_activity") {
    return {
      title: "Someone nearby",
      body: "Someone within your radar may be in your area."
    };
  }

  if (type === "reward") {
    return {
      title: "cruush+ reward earned",
      body: "Open cruush to view it."
    };
  }

  return {
    title: "New message",
    body: "Open cruush to check it."
  };
}

function getPushErrorStatus(error: unknown) {
  if (typeof error === "object" && error !== null && "statusCode" in error) {
    const statusCode = Number((error as { statusCode?: unknown }).statusCode);
    return Number.isFinite(statusCode) ? statusCode : 0;
  }

  return 0;
}

export function getVapidPublicKey(config: AppConfig) {
  return {
    enabled: isPushConfigured(config),
    publicKey: config.WEB_PUSH_VAPID_PUBLIC_KEY ?? ""
  };
}

export async function getNotificationPreferences(app: PushApp, userId: string) {
  const result = await app.db.query<NotificationPreferencesRow>(
    `select push_enabled, cruush_enabled, messages_enabled, groups_enabled, nearby_enabled, rewards_enabled, sound_enabled, quiet_hours_enabled, quiet_hours_start_minute, quiet_hours_end_minute, quiet_hours_timezone, pulse_enabled
     from notification_preferences
     where user_id = $1
     limit 1`,
    [userId]
  );

  return mapPreferences(result.rows[0]);
}

export async function updateNotificationPreferences(
  app: PushApp,
  userId: string,
  preferences: Partial<NotificationPreferences>
) {
  const current = await getNotificationPreferences(app, userId);
  const next = {
    ...current,
    ...preferences
  };

  const result = await app.db.query<NotificationPreferencesRow>(
    `insert into notification_preferences (
       user_id,
       push_enabled,
       cruush_enabled,
       messages_enabled,
       groups_enabled,
       nearby_enabled,
       rewards_enabled,
       sound_enabled,
       quiet_hours_enabled,
       quiet_hours_start_minute,
       quiet_hours_end_minute,
       quiet_hours_timezone,
       pulse_enabled
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     on conflict (user_id) do update
       set push_enabled = excluded.push_enabled,
           cruush_enabled = excluded.cruush_enabled,
           messages_enabled = excluded.messages_enabled,
           groups_enabled = excluded.groups_enabled,
           nearby_enabled = excluded.nearby_enabled,
           rewards_enabled = excluded.rewards_enabled,
           sound_enabled = excluded.sound_enabled,
           quiet_hours_enabled = excluded.quiet_hours_enabled,
           quiet_hours_start_minute = excluded.quiet_hours_start_minute,
           quiet_hours_end_minute = excluded.quiet_hours_end_minute,
           quiet_hours_timezone = excluded.quiet_hours_timezone,
           pulse_enabled = excluded.pulse_enabled,
           updated_at = now()
     returning push_enabled, cruush_enabled, messages_enabled, groups_enabled, nearby_enabled, rewards_enabled, sound_enabled, quiet_hours_enabled, quiet_hours_start_minute, quiet_hours_end_minute, quiet_hours_timezone, pulse_enabled`,
    [
      userId,
      next.pushEnabled,
      next.cruushEnabled,
      next.messagesEnabled,
      next.groupsEnabled,
      next.nearbyEnabled,
      next.rewardsEnabled,
      next.soundEnabled,
      next.quietHoursEnabled,
      clampMinuteOfDay(next.quietHoursStartMinute, 0),
      clampMinuteOfDay(next.quietHoursEndMinute, QUIET_HOURS_DEFAULT_END_MINUTE),
      next.quietHoursTimezone || "UTC",
      next.pulseEnabled
    ]
  );

  return mapPreferences(result.rows[0]);
}

export async function upsertPushSubscription(
  app: PushApp,
  userId: string,
  subscription: PushSubscriptionPayload,
  userAgent = ""
) {
  const result = await app.db.query<NotificationPreferencesRow>(
    `with subscription_upsert as (
       insert into push_subscriptions (
         user_id,
         endpoint,
         p256dh,
         auth,
         user_agent,
         revoked_at
       )
       values ($1, $2, $3, $4, $5, null)
       on conflict (endpoint) do update
         set user_id = excluded.user_id,
             p256dh = excluded.p256dh,
             auth = excluded.auth,
             user_agent = excluded.user_agent,
             revoked_at = null,
             updated_at = now()
       returning id
     ), preferences_upsert as (
       insert into notification_preferences (user_id, push_enabled)
       values ($1, true)
       on conflict (user_id) do update
         set push_enabled = true,
             updated_at = now()
       returning push_enabled, cruush_enabled, messages_enabled, groups_enabled, nearby_enabled, rewards_enabled, sound_enabled, quiet_hours_enabled, quiet_hours_start_minute, quiet_hours_end_minute, quiet_hours_timezone, pulse_enabled
     )
     select push_enabled, cruush_enabled, messages_enabled, groups_enabled, nearby_enabled, rewards_enabled, sound_enabled, quiet_hours_enabled, quiet_hours_start_minute, quiet_hours_end_minute, quiet_hours_timezone, pulse_enabled
     from preferences_upsert`,
    [
      userId,
      subscription.endpoint,
      subscription.keys.p256dh,
      subscription.keys.auth,
      userAgent
    ]
  );

  return mapPreferences(result.rows[0]);
}

export async function removePushSubscription(app: PushApp, userId: string, endpoint?: string) {
  await app.db.query(
    `update push_subscriptions
     set revoked_at = now(),
         updated_at = now()
     where user_id = $1
       and ($2::text is null or endpoint = $2)`,
    [userId, endpoint ?? null]
  );
}

async function markPushSuccess(app: PushApp, subscriptionId: string) {
  await app.db.query(
    `update push_subscriptions
     set last_success_at = now(),
         last_failure_at = null,
         failure_count = 0,
         updated_at = now()
     where id = $1`,
    [subscriptionId]
  );
}

async function markPushFailure(app: PushApp, subscriptionId: string, shouldRevoke: boolean) {
  if (shouldRevoke) {
    await app.db.query(
      `update push_subscriptions
       set last_failure_at = now(),
           failure_count = failure_count + 1,
           revoked_at = now(),
           updated_at = now()
       where id = $1`,
      [subscriptionId]
    );
    return;
  }

  await app.db.query(
    `update push_subscriptions
     set last_failure_at = now(),
         failure_count = failure_count + 1,
         updated_at = now()
     where id = $1`,
    [subscriptionId]
  );
}

export async function sendPushForNotification(app: PushApp, notification: AppNotificationRecord) {
  if (!configureWebPush(app.config)) {
    return {
      attempted: false,
      sent: 0
    };
  }

  const preferences = await getNotificationPreferences(app, notification.userId);
  if (isWithinQuietHours(preferences)) {
    return {
      attempted: false,
      sent: 0
    };
  }

  if (!isPreferenceEnabledForType(preferences, notification.type)) {
    return {
      attempted: false,
      sent: 0
    };
  }

  const subscriptions = await app.db.query<PushSubscriptionRow>(
    `select id::text as id, endpoint, p256dh, auth
     from push_subscriptions
     where user_id = $1
       and revoked_at is null
     order by updated_at desc`,
    [notification.userId]
  );
  const copy = genericPushCopy(notification.type);
  const payload = JSON.stringify({
    title: copy.title,
    body: copy.body,
    sound: "heartbeat",
    soundEnabled: preferences.soundEnabled,
    url: notification.linkUrl || "/notifications",
    notificationId: notification.id
  });
  let sent = 0;

  for (const subscription of subscriptions.rows) {
    try {
      await webPush.sendNotification({
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth
        }
      }, payload);
      sent += 1;
      await markPushSuccess(app, subscription.id);
    } catch (error) {
      const statusCode = getPushErrorStatus(error);
      const shouldRevoke = statusCode === 404 || statusCode === 410;
      await markPushFailure(app, subscription.id, shouldRevoke);
      app.log.warn({ err: error, subscriptionId: subscription.id }, "web push delivery failed");
    }
  }

  return {
    attempted: true,
    sent
  };
}
