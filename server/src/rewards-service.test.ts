import { afterEach, describe, expect, it, vi } from "vitest";
import type { DbClient, DbQueryResult } from "./db.js";
import {
  calendarDateInTimeZone,
  grantPromotionalDays,
  recordMeaningfulActivity,
  reverseRewardGrant
} from "./rewards-service.js";

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
  queryLog: Array<{ text: string; params: unknown[] }> = [];

  async query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<DbQueryResult<T>> {
    this.queryLog.push({ text, params });
    const sql = text.replace(/\s+/g, " ").trim();
    let rows: unknown[] = [];

    if (sql.includes("from reward_settings")) {
      rows = this.settings;
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
      const key = String(params[3]);

      if (!this.grants.some((grant) => grant.idempotencyKey === key)) {
        const grant = {
          id: `grant-${this.grants.length + 1}`,
          source: String(params[1]),
          days: Number(params[2]),
          idempotencyKey: key,
          milestoneKey: params[4] ? String(params[4]) : null,
          referralId: params[5] ? String(params[5]) : null
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
      this.activeUntil = new Date(start.getTime() + Number(params[1]) * 1000);
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

const appFor = (db: RewardTestDb) => ({ db });
const userId = "8b2f51cf-65e2-4cb3-b09b-c8cc3e3bbb21";

afterEach(() => {
  vi.useRealTimers();
});

describe("rewards activity and promotional entitlement service", () => {
  it("credits the first eligible action once and ignores duplicate or ineligible actions", async () => {
    const db = new RewardTestDb();
    const occurredAt = new Date("2026-07-27T12:00:00.000Z");

    const first = await recordMeaningfulActivity(appFor(db), {
      userId,
      activityType: "message",
      sourceEventId: "message-1",
      occurredAt
    });
    const duplicate = await recordMeaningfulActivity(appFor(db), {
      userId,
      activityType: "message",
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
      activityType: "cruush",
      occurredAt: new Date("2026-07-28T04:30:00.000Z")
    });
    await recordMeaningfulActivity(appFor(db), {
      userId,
      activityType: "cruush",
      occurredAt: new Date("2026-07-28T05:30:00.000Z")
    });
    expect(db.activityDates).toEqual(new Set(["2026-07-27", "2026-07-28"]));
  });

  it("grants the seventh-day milestone exactly once and resets after a missed day", async () => {
    const db = new RewardTestDb();

    for (let day = 1; day <= 7; day += 1) {
      await recordMeaningfulActivity(appFor(db), {
        userId,
        activityType: "message",
        occurredAt: new Date(`2026-07-${String(day).padStart(2, "0")}T12:00:00.000Z`)
      });
    }

    await recordMeaningfulActivity(appFor(db), {
      userId,
      activityType: "message",
      occurredAt: new Date("2026-07-07T18:00:00.000Z")
    });

    expect(db.grants).toHaveLength(1);
    expect(db.grants[0]).toMatchObject({ source: "activity_recurring", days: 1 });

    const reset = await recordMeaningfulActivity(appFor(db), {
      userId,
      activityType: "message",
      occurredAt: new Date("2026-07-09T12:00:00.000Z")
    });
    expect(reset).toMatchObject({ currentStreak: 1 });
  });

  it("awards the recurring and long-streak milestones through day 30 without retry duplication", async () => {
    const db = new RewardTestDb();

    for (let day = 1; day <= 30; day += 1) {
      await recordMeaningfulActivity(appFor(db), {
        userId,
        activityType: "cruush",
        occurredAt: new Date(Date.UTC(2026, 5, day, 12))
      });
    }

    expect(db.grants.map((grant) => [grant.source, grant.days])).toEqual([
      ["activity_recurring", 1],
      ["activity_recurring", 1],
      ["activity_recurring", 1],
      ["activity_recurring", 1],
      ["activity_long_bonus", 3]
    ]);
    expect(db.grants.reduce((total, grant) => total + grant.days, 0)).toBe(7);
  });

  it("enforces activity caps and the maximum promotional bank", async () => {
    const cappedDb = new RewardTestDb();
    cappedDb.settings = [{ key: "activity_reward_cap_days", value: 1 }];

    for (let day = 1; day <= 14; day += 1) {
      await recordMeaningfulActivity(appFor(cappedDb), {
        userId,
        activityType: "message",
        occurredAt: new Date(Date.UTC(2026, 6, day, 12))
      });
    }
    expect(cappedDb.grants).toHaveLength(1);

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
