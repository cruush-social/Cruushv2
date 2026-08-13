import { generate } from "otplib";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "./config.js";
import { hashPassword } from "./auth.js";
import type { DbClient, DbQueryResult } from "./db.js";
import {
  completeTwoFactorSetup,
  disableTwoFactor,
  regenerateRecoveryCodes,
  startTwoFactorSetup,
  verifyLoginSecondFactor
} from "./two-factor.js";

const { grantPromotionalDaysInTransaction } = vi.hoisted(() => ({
  grantPromotionalDaysInTransaction: vi.fn()
}));

vi.mock("./rewards-service.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("./rewards-service.js")>(),
  grantPromotionalDaysInTransaction
}));

const userId = "8b2f51cf-65e2-4cb3-b09b-c8cc3e3bbb21";
let credentialHash = "";

type TwoFactorState = {
  secret_ciphertext: string;
  secret_nonce: string;
  secret_auth_tag: string;
  secret_key_version: string;
  enabled_at: Date | null;
  setup_created_at: Date;
  trust_awarded_at: Date | null;
  last_used_time_step: number | null;
};

class TwoFactorTestDb implements DbClient {
  state: TwoFactorState | null = null;
  recovery = new Map<string, { hash: string; used: boolean }>();
  recoveryIndex = 0;
  trustEventCount = 0;
  promoDays = 0;
  promoCutoverAt: Date | null = null;
  userCreatedAt = new Date("2026-07-27T12:00:00.000Z");

  async query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<DbQueryResult<T>> {
    const sql = text.replace(/\s+/g, " ").trim();
    let rows: unknown[] = [];

    if (sql === "select email, password_hash from app_users where id = $1 limit 1") {
      rows = [{ email: "member@cruush.test", password_hash: credentialHash }];
    } else if (sql === "select created_at from app_users where id = $1 limit 1") {
      rows = [{ created_at: this.userCreatedAt }];
    } else if (sql.includes("from user_two_factor_auth") && sql.includes("for update")) {
      rows = this.state
        ? [{
            user_id: userId,
            ...this.state
          }]
        : [];
    } else if (sql.includes("insert into user_two_factor_auth")) {
      this.state = {
        secret_ciphertext: String(params[1]),
        secret_nonce: String(params[2]),
        secret_auth_tag: String(params[3]),
        secret_key_version: String(params[4]),
        enabled_at: null,
        setup_created_at: new Date(),
        trust_awarded_at: this.state?.trust_awarded_at ?? null,
        last_used_time_step: null
      };
    } else if (sql.includes("set last_used_time_step = $2")) {
      if (this.state) {
        this.state.last_used_time_step = Number(params[1]);
      }
    } else if (sql.includes("set enabled_at = now()")) {
      if (this.state) {
        this.state.enabled_at = new Date();
      }
    } else if (sql.includes("set trust_awarded_at = now()")) {
      if (this.state) {
        this.state.trust_awarded_at = new Date();
      }
    } else if (sql.includes("from reward_settings")) {
      rows = this.promoDays > 0 && this.promoCutoverAt
        ? [
            { key: "two_factor_promo_reward_days", value: this.promoDays },
            { key: "two_factor_promo_cutover_at", value: this.promoCutoverAt.toISOString() }
          ]
        : [];
    } else if (sql.includes("insert into trust_events")) {
      if (this.trustEventCount === 0) {
        this.trustEventCount += 1;
      }
    } else if (sql.includes("delete from user_two_factor_recovery_codes")) {
      this.recovery.clear();
    } else if (sql.includes("insert into user_two_factor_recovery_codes")) {
      this.recoveryIndex += 1;
      this.recovery.set(`recovery-${this.recoveryIndex}`, {
        hash: String(params[1]),
        used: false
      });
    } else if (sql.includes("from user_two_factor_recovery_codes") && sql.includes("for update")) {
      rows = [...this.recovery.entries()]
        .filter(([, code]) => !code.used)
        .map(([id, code]) => ({ id, code_hash: code.hash }));
    } else if (sql.includes("update user_two_factor_recovery_codes") && sql.includes("set used_at")) {
      const code = this.recovery.get(String(params[0]));

      if (code) {
        code.used = true;
      }
    } else if (sql.includes("set enabled_at = null")) {
      if (this.state) {
        this.state.enabled_at = null;
        this.state.last_used_time_step = null;
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

function appFor(db: TwoFactorTestDb) {
  return {
    db,
    config: {
      SESSION_SECRET: "session-secret-used-only-for-tests-123456789",
      TWO_FACTOR_ENCRYPTION_KEY: "two-factor-test-key-12345678901234567890",
      TWO_FACTOR_ENCRYPTION_KEY_VERSION: "v1"
    } as AppConfig
  } as Pick<FastifyInstance, "db" | "config">;
}

beforeAll(async () => {
  credentialHash = await hashPassword("correct-password");
});

afterEach(() => {
  vi.useRealTimers();
  grantPromotionalDaysInTransaction.mockReset();
});

describe("internal TOTP two-factor authentication", () => {
  it("does not enable setup without a valid authenticator code", async () => {
    const db = new TwoFactorTestDb();
    const app = appFor(db);
    await startTwoFactorSetup(app, userId, "correct-password");

    await expect(
      completeTwoFactorSetup(app, userId, "000000")
    ).rejects.toMatchObject({ code: "INVALID_TWO_FACTOR_CODE" });
    expect(db.state?.enabled_at).toBeNull();
    expect(db.recovery.size).toBe(0);
  });

  it("enables TOTP, exposes recovery codes once, and rejects TOTP replay", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-27T12:00:00.000Z"));
    const db = new TwoFactorTestDb();
    const app = appFor(db);
    const setup = await startTwoFactorSetup(app, userId, "correct-password");
    const token = await generate({ secret: setup.secret });
    const completed = await completeTwoFactorSetup(app, userId, token);

    expect(completed.enabled).toBe(true);
    expect(completed.recoveryCodes).toHaveLength(10);
    expect(db.state?.enabled_at).toBeInstanceOf(Date);
    expect(db.trustEventCount).toBe(1);
    await expect(
      verifyLoginSecondFactor(app, userId, token)
    ).rejects.toMatchObject({ code: "INVALID_TWO_FACTOR_CODE" });
  });

  it("accepts a recovery code once and rejects its reuse", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-27T12:00:00.000Z"));
    const db = new TwoFactorTestDb();
    const app = appFor(db);
    const setup = await startTwoFactorSetup(app, userId, "correct-password");
    const completed = await completeTwoFactorSetup(
      app,
      userId,
      await generate({ secret: setup.secret })
    );
    const recoveryCode = completed.recoveryCodes[0];

    await expect(
      verifyLoginSecondFactor(app, userId, recoveryCode)
    ).resolves.toBe(true);
    await expect(
      verifyLoginSecondFactor(app, userId, recoveryCode)
    ).rejects.toMatchObject({ code: "INVALID_TWO_FACTOR_CODE" });
  });

  it("grants one idempotent cruush+ day to a new account when 2FA is enabled", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T12:00:00.000Z"));
    const db = new TwoFactorTestDb();
    db.userCreatedAt = new Date("2026-08-14T12:00:00.000Z");
    db.promoCutoverAt = new Date("2026-08-13T12:00:00.000Z");
    db.promoDays = 1;
    grantPromotionalDaysInTransaction.mockResolvedValueOnce({
      id: "grant-2fa-day",
      source: "admin",
      days: 1,
      createdAt: "2026-08-15T12:00:00.000Z"
    });

    const app = appFor(db);
    const setup = await startTwoFactorSetup(app, userId, "correct-password");
    const completed = await completeTwoFactorSetup(app, userId, await generate({ secret: setup.secret }));

    expect(completed.promotionalDaysGranted).toBe(1);
    expect(grantPromotionalDaysInTransaction).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        userId,
        source: "admin",
        days: 1,
        idempotencyKey: `two-factor-cruush-plus-day:${userId}`,
        milestoneKey: `two-factor-cruush-plus-day:${userId}`
      }),
      expect.objectContaining({ twoFactorPromoDays: 1 })
    );
  });

  it("requires the current password and a fresh authenticator code to regenerate codes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-27T12:00:00.000Z"));
    const db = new TwoFactorTestDb();
    const app = appFor(db);
    const setup = await startTwoFactorSetup(app, userId, "correct-password");
    await completeTwoFactorSetup(app, userId, await generate({ secret: setup.secret }));

    vi.setSystemTime(new Date("2026-07-27T12:01:00.000Z"));
    const freshToken = await generate({ secret: setup.secret });
    await expect(regenerateRecoveryCodes(app, userId, {
      password: "wrong-password",
      token: freshToken
    })).rejects.toMatchObject({ code: "AUTH_REQUIRED" });

    const regenerated = await regenerateRecoveryCodes(app, userId, {
      password: "correct-password",
      token: freshToken
    });
    expect(regenerated.recoveryCodes).toHaveLength(10);
  });

  it("requires recent credentials to disable and awards 2FA trust only once after re-enable", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-27T12:00:00.000Z"));
    const db = new TwoFactorTestDb();
    const app = appFor(db);
    const firstSetup = await startTwoFactorSetup(app, userId, "correct-password");
    const firstCompleted = await completeTwoFactorSetup(
      app,
      userId,
      await generate({ secret: firstSetup.secret })
    );

    await expect(disableTwoFactor(app, userId, {
      password: "wrong-password",
      token: firstCompleted.recoveryCodes[0]
    })).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
    await disableTwoFactor(app, userId, {
      password: "correct-password",
      token: firstCompleted.recoveryCodes[0]
    });
    expect(db.state?.enabled_at).toBeNull();

    vi.setSystemTime(new Date("2026-07-27T12:01:00.000Z"));
    const secondSetup = await startTwoFactorSetup(app, userId, "correct-password");
    await completeTwoFactorSetup(
      app,
      userId,
      await generate({ secret: secondSetup.secret })
    );
    expect(db.trustEventCount).toBe(1);
  });
});
