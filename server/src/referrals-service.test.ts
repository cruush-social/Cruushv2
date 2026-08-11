import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppConfig } from "./config.js";
import type { DbClient, DbQueryResult } from "./db.js";
import {
  prepareSignupReferral,
  qualifyPendingReferrals
} from "./referrals-service.js";

const { sendNotification, setVapidDetails } = vi.hoisted(() => ({
  sendNotification: vi.fn(),
  setVapidDetails: vi.fn()
}));

vi.mock("web-push", () => ({
  default: { sendNotification, setVapidDetails },
  sendNotification,
  setVapidDetails
}));

const referralId = "76b226e8-01f1-4232-bccc-746ddc0dcdf8";
const referrerId = "8b2f51cf-65e2-4cb3-b09b-c8cc3e3bbb21";
const referredId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";

class ReferralTestDb implements DbClient {
  status = "pending";
  twoFactorEnabled = true;
  accountStatus = "active";
  trustSuspended = false;
  activeSuspension = false;
  rewardGrantCount = 0;
  trustEventCount = 0;
  activeUntil: Date | null = null;
  notifications: Array<Record<string, unknown>> = [];
  queries: string[] = [];

  async query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<DbQueryResult<T>> {
    const sql = text.replace(/\s+/g, " ").trim();
    this.queries.push(sql);
    let rows: unknown[] = [];

    if (sql.includes("from reward_settings")) {
      rows = [];
    } else if (sql.includes("from referrals") && sql.includes("where status = 'pending'") && sql.includes("limit $2")) {
      rows = this.status === "pending"
        ? [{ id: referralId, referrer_user_id: referrerId, referred_user_id: referredId }]
        : [];
    } else if (sql.includes("from referrals") && sql.includes("for update")) {
      rows = [{
        id: referralId,
        referrer_user_id: referrerId,
        referred_user_id: referredId,
        status: this.status
      }];
    } else if (sql.includes("as two_factor_enabled") && sql.includes("from app_users app_user")) {
      rows = [{
        account_status: this.accountStatus,
        two_factor_enabled: this.twoFactorEnabled,
        trust_suspended: this.trustSuspended,
        has_active_suspension: this.activeSuspension
      }];
    } else if (sql.includes("set status = 'rejected'")) {
      this.status = "rejected";
    } else if (sql.includes("set status = 'flagged'")) {
      this.status = "flagged";
    } else if (sql.includes("set status = 'qualified'")) {
      this.status = "qualified";
    } else if (sql.includes("set status = 'rewarded'")) {
      this.status = "rewarded";
    } else if (sql.includes("insert into promotional_cruush_plus_entitlements")) {
      rows = [{ active_until: this.activeUntil, banked_seconds: 0 }];
    } else if (sql.includes("insert into reward_grants")) {
      if (this.rewardGrantCount === 0) {
        this.rewardGrantCount += 1;
        rows = [{
          id: "1b42b828-b18b-44d4-a39d-ae85320d99f5",
          user_id: referrerId,
          source: "referral",
          days: 7,
          milestone_key: null,
          referral_id: referralId,
          audit_metadata: {},
          created_at: new Date("2026-07-27T12:00:00.000Z")
        }];
      }
    } else if (sql.includes("as legacy_enabled") && sql.includes("paid_expires_at")) {
      rows = [{
        legacy_enabled: false,
        legacy_expires_at: null,
        has_lifetime: false,
        paid_expires_at: null
      }];
    } else if (sql.includes("set active_until = greatest")) {
      this.activeUntil = new Date(Date.now() + Number(params[1]) * 1000);
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
    } else if (sql.includes("event_type = 'qualified_referral'")) {
      rows = [{ total: this.trustEventCount }];
    } else if (sql.includes("insert into trust_events")) {
      this.trustEventCount += 1;
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

function qualificationApp(db: ReferralTestDb, pushEnabled = false) {
  return {
    db,
    config: {
      SESSION_SECRET: "test-session-secret",
      APP_URL: "https://cruush.test",
      WEB_PUSH_ENABLED: pushEnabled,
      WEB_PUSH_VAPID_PUBLIC_KEY: pushEnabled ? "public-key" : "",
      WEB_PUSH_VAPID_PRIVATE_KEY: pushEnabled ? "private-key" : "",
      WEB_PUSH_SUBJECT: "mailto:hello@cruush.test"
    } as AppConfig,
    log: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn()
    }
  } as unknown as Pick<FastifyInstance, "db" | "config" | "log">;
}

afterEach(() => {
  sendNotification.mockReset();
  setVapidDetails.mockReset();
});

describe("referral lifecycle", () => {
  it("dispatches the referrer's reward push after referral qualification commits", async () => {
    const db = new ReferralTestDb();
    sendNotification.mockResolvedValueOnce(undefined);

    await qualifyPendingReferrals(qualificationApp(db, true));

    expect(sendNotification).toHaveBeenCalledOnce();
    expect(db.queries.some((sql) => sql.includes("from app_notifications") && sql.includes("dedupe_key = $2"))).toBe(true);
  });

  it("qualifies an otherwise valid referral without an account-age delay", async () => {
    const db = new ReferralTestDb();
    const result = await qualifyPendingReferrals(qualificationApp(db));
    expect(result.rewarded).toBe(1);
    expect(db.status).toBe("rewarded");
    expect(db.rewardGrantCount).toBe(1);
    expect(db.queries.find((sql) => sql.includes("where status = 'pending'"))).not.toContain("created_at <=");
    expect(db.queries.find((sql) => sql.includes("as two_factor_enabled"))).not.toContain("old_enough");
  });

  it("requires 2FA but does not delay a valid referral for profile completion", async () => {
    const withoutTwoFactor = new ReferralTestDb();
    withoutTwoFactor.twoFactorEnabled = false;
    await qualifyPendingReferrals(qualificationApp(withoutTwoFactor));
    expect(withoutTwoFactor.status).toBe("pending");

    const noProfileDelay = new ReferralTestDb();
    const result = await qualifyPendingReferrals(qualificationApp(noProfileDelay));
    expect(result.rewarded).toBe(1);
    expect(noProfileDelay.status).toBe("rewarded");
    expect(noProfileDelay.queries.some((sql) => sql.includes("from profiles"))).toBe(false);
  });

  it("rejects banned or suspended accounts and flags accounts under review", async () => {
    const suspended = new ReferralTestDb();
    suspended.accountStatus = "suspended";
    await qualifyPendingReferrals(qualificationApp(suspended));
    expect(suspended.status).toBe("rejected");

    const underReview = new ReferralTestDb();
    underReview.accountStatus = "under_review";
    await qualifyPendingReferrals(qualificationApp(underReview));
    expect(underReview.status).toBe("flagged");
  });

  it("qualifies, grants, and adds trust exactly once across retries", async () => {
    const db = new ReferralTestDb();
    const first = await qualifyPendingReferrals(qualificationApp(db));
    const retry = await qualifyPendingReferrals(qualificationApp(db));

    expect(first.rewarded).toBe(1);
    expect(retry.scanned).toBe(0);
    expect(db.status).toBe("rewarded");
    expect(db.rewardGrantCount).toBe(1);
    expect(db.trustEventCount).toBe(1);
  });

  it("marks suspicious referral bursts for review without exposing signal values", async () => {
    const query = vi.fn(async () => ({
      rows: [{
        user_id: referrerId,
        recent_referrals: 21,
        repeated_ip_referrals: 4
      }]
    }));
    const app = {
      db: { query },
      config: {
        SEVERE_ACCESS_BANS_ENABLED: true,
        SEVERE_ACCESS_BAN_HMAC_KEY: "a".repeat(32),
        TRUST_PROXY_HOPS: 1
      },
      rateLimiter: { assert: vi.fn(async () => undefined) }
    } as unknown as FastifyInstance;
    const request = {
      ip: "203.0.113.10",
      headers: { cookie: `cruush_device=${"a".repeat(43)}` }
    } as unknown as FastifyRequest;

    const prepared = await prepareSignupReferral(
      app,
      request,
      "abcdefghijklmnop"
    );

    expect(prepared).toMatchObject({
      status: "flagged",
      riskScore: 100,
      reviewFlags: ["referrer_signup_burst", "repeated_signup_network"]
    });
    expect(prepared?.ipHash).not.toBe("203.0.113.10");
    expect(JSON.stringify({
      status: prepared?.status,
      riskScore: prepared?.riskScore
    })).not.toContain(prepared?.ipHash ?? "never");
  });
});
