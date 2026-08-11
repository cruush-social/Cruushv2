import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "./config.js";
import type { DbClient, DbQueryResult } from "./db.js";
import {
  calendarDateInTimeZone,
  getRewardSummary,
  grantPromotionalDays,
  recordMeaningfulActivity,
  redeemCruushPlusPromoCode,
  reverseRewardGrant
} from "./rewards-service.js";

const { sendNotification, setVapidDetails } = vi.hoisted(() => ({
  sendNotification: vi.fn(),
  setVapidDetails: vi.fn()
}));

vi.mock("web-push", () => ({
  default: { sendNotification, setVapidDetails },
  sendNotification,
  setVapidDetails
}));

type GrantState = {
  id: string;
  source: string;
  days: number;
  idempotencyKey: string;
  milestoneKey: string | null;
  referralId?: string | null;
};

class RewardTestDb implements DbClient {
  timezone = "UTC";
  activityDates = new Set<string>();
  streak = { current: 0, longest: 0, lastDate: null as string | null };
  grants: GrantState[] = [];
  activeUntil: Date | null = null;
  bankedSeconds = 0;
  paid = false;
  reversals = new Set<string>();
  settings: Array<{ key: string; value: unknown }> = [];
  notifications: Array<Record<string, unknown>> = [];
  queryLog: Array<{ text: string; params: unknown[] }> = [];

  async query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<DbQueryResult<T>> {
    this.queryLog.push({ text, params });
    const sql = text.replace(/\s+/g, " ").trim();
    let rows: unknown[] = [];

    if (sql.includes("from reward_settings")) {
      rows = this.settings;
    } else if (sql.includes("from cruush_plus_promo_codes")) {
      rows = [{
        id: "promo-1",
        code: "LAUNCH7",
        label: "Launch reward",
        grant_days: 7,
        active_until: null,
        max_redemptions: null
      }];
    } else if (sql.includes("from cruush_plus_promo_code_redemptions") && sql.includes("limit 1")) {
      rows = [];
    } else if (sql === "select timezone from app_users where id = $1 limit 1") {
      rows = [{ timezone: this.timezone }];
    } else if (sql.includes("insert into daily_activity_credits")) {
      const date = String(params[1]);

      if (!this.activityDates.has(date)) {
        this.activityDates.add(date);
        rows = [{ id: `activity-${date}` }];
      }
    } else if (sql.includes("from user_activity_streaks") && sql.includes("for update")) {
      rows = this.streak.lastDate
        ? [{
            current_streak: this.streak.current,
            longest_streak: this.streak.longest,
            last_activity_date: this.streak.lastDate
          }]
        : [];
    } else if (sql.includes("from user_activity_streaks where user_id = $1")) {
      rows = this.streak.lastDate
        ? [{
            current_streak: this.streak.current,
            longest_streak: this.streak.longest,
            last_activity_date: this.streak.lastDate
          }]
        : [];
    } else if (sql.includes("insert into user_activity_streaks")) {
      this.streak = {
        current: Number(params[1]),
        longest: Number(params[2]),
        lastDate: String(params[3])
      };
    } else if (sql.includes("from reward_grants reward") && sql.includes("sum(reward.days)")) {
      const activityOnly = sql.includes("activity_recurring");
      const filtered = activityOnly
        ? this.grants.filter((grant) => grant.source.startsWith("activity_"))
        : this.grants.filter((grant) => grant.source === "referral");
      rows = [{ total: filtered.reduce((total, grant) => total + grant.days, 0) }];
    } else if (sql.includes("insert into promotional_cruush_plus_entitlements")) {
      rows = [{
        active_until: this.activeUntil?.toISOString() ?? null,
        banked_seconds: this.bankedSeconds
      }];
    } else if (sql.includes("insert into reward_grants")) {
      const isFixedAccessGrant = sql.includes("values ($1, 'admin'");
      const key = String(isFixedAccessGrant ? params[2] : params[3]);

      if (!this.grants.some((grant) => grant.idempotencyKey === key)) {
        const grant = {
          id: `grant-${this.grants.length + 1}`,
          source: isFixedAccessGrant ? "admin" : String(params[1]),
          days: Number(isFixedAccessGrant ? params[1] : params[2]),
          idempotencyKey: key,
          milestoneKey: isFixedAccessGrant
            ? (params[3] ? String(params[3]) : null)
            : (params[4] ? String(params[4]) : null),
          referralId: isFixedAccessGrant
            ? null
            : (params[5] ? String(params[5]) : null)
        };
        this.grants.push(grant);
        rows = [{
          id: grant.id,
          user_id: params[0],
          source: grant.source,
          days: grant.days,
          milestone_key: grant.milestoneKey,
          referral_id: params[5] ?? null,
          audit_metadata: {},
          created_at: new Date()
        }];
      }
    } else if (sql.includes("as legacy_enabled") && sql.includes("paid_expires_at")) {
      rows = [{
        legacy_enabled: this.paid,
        legacy_expires_at: this.paid ? null : null,
        has_lifetime: false,
        paid_expires_at: null
      }];
    } else if (sql.includes("set banked_seconds = banked_seconds +")) {
      this.bankedSeconds += Number(params[1]) * Number(params[2]);
    } else if (sql.includes("set active_until = greatest")) {
      const start = this.activeUntil && this.activeUntil > new Date()
        ? this.activeUntil
        : new Date();
      const requestedUntil = typeof params[1] === "string" && params[1].includes("T")
        ? new Date(String(params[1]))
        : new Date(start.getTime() + Number(params[1]) * 1000);
      this.activeUntil = requestedUntil > start ? requestedUntil : start;
    } else if (sql.includes("insert into app_notifications")) {
      this.notifications.push({
        id: `notification-${this.notifications.length + 1}`,
        user_id: params[0],
        type: "reward",
        title: "cruush+ reward earned",
        body: params[1],
        link_url: "/rewards",
        actor_user_id: null,
        conversation_id: null,
        dedupe_key: params[2],
        metadata: params[3],
        read_at: null,
        created_at: new Date()
      });
    } else if (sql.includes("from app_notifications") && sql.includes("dedupe_key = $2")) {
      rows = this.notifications.filter((notification) =>
        notification.user_id === params[0] && notification.dedupe_key === params[1]
      );
    } else if (sql.includes("from notification_preferences")) {
      rows = [{
        push_enabled: true,
        cruush_enabled: true,
        messages_enabled: true,
        groups_enabled: true,
        nearby_enabled: true,
        rewards_enabled: true,
        sound_enabled: true
      }];
    } else if (sql.includes("from push_subscriptions")) {
      rows = [{
        id: "push-sub-1",
        endpoint: "https://push.example/sub",
        p256dh: "p256dh-key",
        auth: "auth-key"
      }];
    } else if (sql.includes("from reward_grants reward") && sql.includes("for update of reward")) {
      const grant = this.grants.find((candidate) => candidate.id === params[0]);

      if (grant) {
        rows = [{
          id: grant.id,
          user_id: userId,
          source: grant.source,
          days: grant.days,
          milestone_key: grant.milestoneKey,
          referral_id: grant.referralId ?? null,
          audit_metadata: {},
          created_at: new Date(),
          reversed_at: this.reversals.has(grant.id) ? new Date() : null
        }];
      }
    } else if (sql.includes("from referrals referral") && sql.includes("count(*) filter")) {
      rows = [{ pending: 0, qualified: 0 }];
    } else if (sql.includes("from reward_grants reward") && sql.includes("order by reward.created_at desc")) {
      rows = [];
    } else if (sql.includes("insert into reward_grant_reversals")) {
      this.reversals.add(String(params[0]));
    } else if (sql.includes("set banked_seconds = greatest")) {
      this.bankedSeconds = Math.max(0, this.bankedSeconds - Number(params[1]));
      const activeRemoval = Number(params[2]);

      if (activeRemoval > 0 && this.activeUntil && this.activeUntil > new Date()) {
        this.activeUntil = new Date(Math.max(
          Date.now(),
          this.activeUntil.getTime() - activeRemoval * 1000
        ));
      }
    }

    return { rows: rows as T[], rowCount: rows.length };
  }

  async transaction<T>(fn: (client: DbClient) => Promise<T>): Promise<T> {
    return fn(this);
  }

  async end() {
    return undefined;
  }
}

const appFor = (db: RewardTestDb, pushEnabled = false) => ({
  db,
  config: {
    WEB_PUSH_ENABLED: pushEnabled,
    WEB_PUSH_VAPID_PUBLIC_KEY: pushEnabled ? "public-key" : "",
    WEB_PUSH_VAPID_PRIVATE_KEY: pushEnabled ? "private-key" : "",
    WEB_PUSH_SUBJECT: "mailto:hello@cruush.test"
  } as AppConfig,
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
});
const userId = "8b2f51cf-65e2-4cb3-b09b-c8cc3e3bbb21";

afterEach(() => {
  vi.useRealTimers();
  sendNotification.mockReset();
  setVapidDetails.mockReset();
});

describe("rewards activity and promotional entitlement service", () => {
  it("dispatches a persisted reward push after the reward transaction commits", async () => {
    const db = new RewardTestDb();
    sendNotification.mockResolvedValueOnce(undefined);

    await grantPromotionalDays(appFor(db, true), {
      userId,
      source: "admin",
      days: 7,
      idempotencyKey: "admin-push-proof"
    });

    expect(sendNotification).toHaveBeenCalledOnce();
    const payload = JSON.parse(sendNotification.mock.calls[0]?.[1] as string);
    expect(payload).toMatchObject({
      title: "cruush+ reward earned",
      body: "Open cruush to view it.",
      url: "/rewards"
    });
    const notificationInsertIndex = db.queryLog.findIndex(({ text }) => text.includes("insert into app_notifications"));
    const persistedNotificationReadIndex = db.queryLog.findIndex(({ text }) => text.includes("from app_notifications"));
    expect(notificationInsertIndex).toBeGreaterThanOrEqual(0);
    expect(persistedNotificationReadIndex).toBeGreaterThan(notificationInsertIndex);
  });

  it("dispatches the recurring activity reward push after the milestone transaction commits", async () => {
    const db = new RewardTestDb();
    sendNotification.mockResolvedValue(undefined);

    for (let day = 1; day <= 7; day += 1) {
      await recordMeaningfulActivity(appFor(db, true), {
        userId,
        activityType: "check_in",
        occurredAt: new Date(`2026-07-${String(day).padStart(2, "0")}T12:00:00.000Z`)
      });
    }

    expect(sendNotification).toHaveBeenCalledOnce();
    const persistedNotificationRead = db.queryLog.find(({ text }) => text.includes("from app_notifications"));
    expect(persistedNotificationRead?.params).toEqual([
      userId,
      `reward:activity:recurring:${userId}:7`
    ]);
  });

  it("dispatches a promo-code reward push after redemption commits", async () => {
    const db = new RewardTestDb();
    sendNotification.mockResolvedValueOnce(undefined);

    await redeemCruushPlusPromoCode(appFor(db, true), {
      userId,
      code: "launch7"
    });

    expect(sendNotification).toHaveBeenCalledOnce();
    const persistedNotificationRead = db.queryLog.find(({ text }) => text.includes("from app_notifications"));
    expect(persistedNotificationRead?.params).toEqual([
      userId,
      `reward:promo-code:promo-1:${userId}`
    ]);
  });

  it("credits the first daily check-in once and ignores duplicate or ineligible actions", async () => {
    const db = new RewardTestDb();
    const occurredAt = new Date("2026-07-27T12:00:00.000Z");

    const first = await recordMeaningfulActivity(appFor(db), {
      userId,
      activityType: "check_in",
      sourceEventId: "message-1",
      occurredAt
    });
    const duplicate = await recordMeaningfulActivity(appFor(db), {
      userId,
      activityType: "check_in",
      sourceEventId: "message-2",
      occurredAt
    });
    const ineligible = await recordMeaningfulActivity(appFor(db), {
      userId,
      activityType: "profile_update",
      occurredAt: new Date("2026-07-28T12:00:00.000Z")
    });

    expect(first).toMatchObject({ credited: true, currentStreak: 1 });
    expect(duplicate.credited).toBe(false);
    expect(ineligible.credited).toBe(false);
    expect(db.activityDates).toEqual(new Set(["2026-07-27"]));
  });

  it.each(["cruush", "message", "post"] as const)(
    "does not advance a check-in streak from a %s action",
    async (activityType) => {
      const db = new RewardTestDb();

      const result = await recordMeaningfulActivity(appFor(db), {
        userId,
        activityType,
        occurredAt: new Date("2026-07-27T12:00:00.000Z")
      });

      expect(result).toEqual({ credited: false, grants: [] });
      expect(db.activityDates).toEqual(new Set());
    }
  );

  it("resolves calendar dates in the user's timezone across a UTC boundary", async () => {
    expect(calendarDateInTimeZone(
      new Date("2026-07-28T04:30:00.000Z"),
      "America/Chicago"
    )).toBe("2026-07-27");
    expect(calendarDateInTimeZone(
      new Date("2026-07-28T05:30:00.000Z"),
      "America/Chicago"
    )).toBe("2026-07-28");

    const db = new RewardTestDb();
    db.timezone = "America/Chicago";
    await recordMeaningfulActivity(appFor(db), {
      userId,
      activityType: "check_in",
      occurredAt: new Date("2026-07-28T04:30:00.000Z")
    });
    await recordMeaningfulActivity(appFor(db), {
      userId,
      activityType: "check_in",
      occurredAt: new Date("2026-07-28T05:30:00.000Z")
    });
    expect(db.activityDates).toEqual(new Set(["2026-07-27", "2026-07-28"]));
  });

  it("grants one day on the seventh check-in and resets after a missed day", async () => {
    const db = new RewardTestDb();

    for (let day = 1; day <= 7; day += 1) {
      await recordMeaningfulActivity(appFor(db), {
        userId,
        activityType: "check_in",
        occurredAt: new Date(`2026-07-${String(day).padStart(2, "0")}T12:00:00.000Z`)
      });
    }

    await recordMeaningfulActivity(appFor(db), {
      userId,
      activityType: "check_in",
      occurredAt: new Date("2026-07-07T18:00:00.000Z")
    });

    expect(db.grants).toHaveLength(1);
    expect(db.grants[0]).toMatchObject({ source: "activity_recurring", days: 1 });

    const reset = await recordMeaningfulActivity(appFor(db), {
      userId,
      activityType: "check_in",
      occurredAt: new Date("2026-07-09T12:00:00.000Z")
    });
    expect(reset).toMatchObject({ currentStreak: 1 });
  });

  it("grants exactly one day only on completed seven-day check-in boundaries", async () => {
    const db = new RewardTestDb();

    for (let day = 1; day <= 14; day += 1) {
      await recordMeaningfulActivity(appFor(db), {
        userId,
        activityType: "check_in",
        occurredAt: new Date(Date.UTC(2026, 5, day, 12))
      });
    }

    await recordMeaningfulActivity(appFor(db), {
      userId,
      activityType: "check_in",
      occurredAt: new Date("2026-06-14T18:00:00.000Z")
    });

    expect(db.grants.map((grant) => [grant.source, grant.days])).toEqual([
      ["activity_recurring", 1],
      ["activity_recurring", 1]
    ]);
    expect(db.grants.map((grant) => grant.milestoneKey)).toEqual([
      "streak:7",
      "streak:14"
    ]);
    expect(db.grants.reduce((total, grant) => total + grant.days, 0)).toBe(2);
  });

  it.each([
    { current: 6, next: 1, target: 7 },
    { current: 7, next: 7, target: 14 },
    { current: 8, next: 6, target: 14 },
    { current: 13, next: 1, target: 14 },
    { current: 14, next: 7, target: 21 }
  ])("reports progress from streak $current to boundary $target", async ({ current, next, target }) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-08T18:00:00.000Z"));
    const db = new RewardTestDb();
    db.streak = { current, longest: current, lastDate: "2026-06-08" };

    const summary = await getRewardSummary(appFor(db), userId);

    expect(summary.streak).toMatchObject({
      current,
      nextRecurringInDays: next,
      nextLongBonusInDays: next,
      nextLoginBonusAtDays: target
    });
  });

  it("enforces the configured activity reward cap and maximum promotional bank", async () => {
    const cappedDb = new RewardTestDb();
    cappedDb.settings = [{ key: "activity_reward_cap_days", value: 14 }];

    for (let day = 1; day <= 14; day += 1) {
      await recordMeaningfulActivity(appFor(cappedDb), {
        userId,
        activityType: "check_in",
        occurredAt: new Date(Date.UTC(2026, 6, day, 12))
      });
    }
    expect(cappedDb.grants).toHaveLength(2);

    const bankDb = new RewardTestDb();
    bankDb.settings = [{ key: "max_banked_promotional_days", value: 1 }];
    const rejected = await grantPromotionalDays(appFor(bankDb), {
      userId,
      source: "admin",
      days: 2,
      idempotencyKey: "admin-too-large"
    });
    expect(rejected).toBeNull();
    expect(bankDb.grants).toHaveLength(0);
  });

  it("limits check-in rewards to five days per rolling 30 days by default", async () => {
    const db = new RewardTestDb();

    for (let reward = 1; reward <= 5; reward += 1) {
      await grantPromotionalDays(appFor(db), {
        userId,
        source: "activity_recurring",
        days: 1,
        idempotencyKey: `check-in-cap-${reward}`,
        milestoneKey: `streak:${reward * 7}`
      });
    }
    const rejected = await grantPromotionalDays(appFor(db), {
      userId,
      source: "activity_recurring",
      days: 1,
      idempotencyKey: "check-in-cap-6",
      milestoneKey: "streak:42"
    });

    expect(db.grants).toHaveLength(5);
    expect(rejected).toBeNull();
  });

  it("starts and extends promo access when unpaid, but banks new rewards while paid", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-27T12:00:00.000Z"));
    const db = new RewardTestDb();

    await grantPromotionalDays(appFor(db), {
      userId,
      source: "admin",
      days: 1,
      idempotencyKey: "admin-one"
    });
    await grantPromotionalDays(appFor(db), {
      userId,
      source: "admin",
      days: 1,
      idempotencyKey: "admin-two"
    });
    expect(db.activeUntil?.toISOString()).toBe("2026-07-29T12:00:00.000Z");

    db.paid = true;
    await grantPromotionalDays(appFor(db), {
      userId,
      source: "referral",
      days: 7,
      idempotencyKey: "referral-one",
      referralId: "76b226e8-01f1-4232-bccc-746ddc0dcdf8"
    });
    expect(db.bankedSeconds).toBe(7 * 86_400);
    expect(db.activeUntil?.toISOString()).toBe("2026-07-29T12:00:00.000Z");
  });

  it("handles expired promo access and creates an auditable idempotent reversal without touching paid state", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-27T12:00:00.000Z"));
    const db = new RewardTestDb();
    db.activeUntil = new Date("2026-07-20T12:00:00.000Z");
    const grant = await grantPromotionalDays(appFor(db), {
      userId,
      source: "admin",
      days: 1,
      idempotencyKey: "admin-reversible"
    });
    expect(db.activeUntil?.toISOString()).toBe("2026-07-28T12:00:00.000Z");

    const reversed = await reverseRewardGrant(appFor(db), {
      grantId: grant!.id,
      reason: "Confirmed fraudulent reward"
    });
    const retry = await reverseRewardGrant(appFor(db), {
      grantId: grant!.id,
      reason: "Confirmed fraudulent reward"
    });

    expect(reversed).toEqual({ reversed: true, alreadyReversed: false });
    expect(retry).toEqual({ reversed: false, alreadyReversed: true });
    expect(db.reversals).toEqual(new Set([grant!.id]));
    expect(db.activeUntil?.toISOString()).toBe("2026-07-27T12:00:00.000Z");
    expect(db.queryLog.some(({ text }) => /update cruush_plus_subscriptions/i.test(text))).toBe(false);
  });
});
