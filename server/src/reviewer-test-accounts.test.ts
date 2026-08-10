import { describe, expect, it, vi } from "vitest";
import type { AppConfig } from "./config.js";
import type { DbClient } from "./db.js";
import {
  REVIEWER_TEST_ACCOUNT_COUNT,
  assertReviewerTestAccountConfig,
  buildReviewerTestAccounts,
  seedReviewerTestAccountsWithDb
} from "./reviewer-test-accounts.js";

const config: AppConfig = {
  NODE_ENV: "development",
  PORT: 3001,
  HOST: "127.0.0.1",
  DATABASE_URL: "postgres://localhost:5432/cruush",
  CORS_ORIGIN: "http://localhost:5173",
  SESSION_SECRET: "test-secret",
  APP_URL: "https://cruush.test",
  RESEND_API_KEY: "",
  MAIL_FROM: "",
  EMAIL_PREVIEW_ENABLED: true,
  DEVELOPMENT_ADMIN_ENABLED: false,
  DEVELOPMENT_ADMIN_PASSWORD: "",
  TURNSTILE_SECRET_KEY: "",
  PROFILE_ENCRYPTION_KEY: "",
  PROFILE_TOKEN_KEY: "",
  PROFILE_TOKEN_KEY_VERSION: "v1",
  RELATIONSHIP_ENCRYPTION_KEY: "",
  RELATIONSHIP_INDEX_KEY: "",
  RELATIONSHIP_ENCRYPTION_KEY_VERSION: "v1",
  RELATIONSHIP_INDEX_KEY_VERSION: "v1",
  MATCH_TOKEN_ENCRYPTION_KEY: "",
  MATCH_TOKEN_SIGNING_KEY: "",
  MATCH_TOKEN_KEY_VERSION: "v1",
  LOCATION_ENCRYPTION_KEY: "location-encryption-key-32-bytes",
  LOCATION_INDEX_KEY: "location-index-key-32-bytes-long",
  VISIBILITY_POLICY_ENCRYPTION_KEY: "visibility-policy-key-32-bytes",
  GHOST_DERIVATION_KEY: "ghost-derivation-key-32-bytes-ok",
  DISPLAY_TOKEN_ENCRYPTION_KEY: "display-token-key-32-bytes-long",
  LOCATION_ENCRYPTION_KEY_VERSION: "v1",
  LOCATION_INDEX_KEY_VERSION: "v1",
  VISIBILITY_POLICY_ENCRYPTION_KEY_VERSION: "v1",
  GHOST_DERIVATION_KEY_VERSION: "v1",
  DISPLAY_TOKEN_ENCRYPTION_KEY_VERSION: "v1"
};

function seededReviewerUserId(index: number) {
  return `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

describe("reviewer test account seeding", () => {
  it("builds internal codeveloper and bank-only NYC accounts without payment fixtures", () => {
    const accounts = buildReviewerTestAccounts(new Date("2026-07-07T12:00:00.000Z"));
    const emails = accounts.map((account) => account.email);

    expect(accounts).toHaveLength(REVIEWER_TEST_ACCOUNT_COUNT);
    expect(emails).toEqual(["codeveloper-nyc@cruush.local", "bank-reviewer-nyc@cruush.local"]);
    expect(emails).not.toContain("payment@cruush.local");
    expect(accounts.every((account) => account.lat >= 40.35 && account.lat <= 41.08)).toBe(true);
    expect(accounts.every((account) => account.lng >= -74.65 && account.lng <= -73.45)).toBe(true);
    expect(accounts.every((account) => account.fuzzyLat >= 40.35 && account.fuzzyLat <= 41.08)).toBe(true);
    expect(accounts.every((account) => account.fuzzyLng >= -74.65 && account.fuzzyLng <= -73.45)).toBe(true);
    expect(accounts[0]).toMatchObject({
      displayName: "codev nyc",
      passwordConfigKey: "REVIEWER_TEST_ACCOUNT_PASSWORD",
      vibes: expect.arrayContaining(["NYC beta", "spoof location", "codeveloper"])
    });
    expect(accounts[1]).toMatchObject({
      displayName: "bank nyc review",
      passwordConfigKey: "BANK_REVIEWER_ACCOUNT_PASSWORD",
      vibes: ["NYC review"]
    });
    expect(accounts[1]).not.toHaveProperty("photos");
    expect(accounts[1].vibes).not.toContain("codeveloper");
  });

  it("requires explicit enabled flag plus codeveloper and bank passwords, and refuses the public production host", () => {
    expect(() => assertReviewerTestAccountConfig({
      NODE_ENV: "development",
      APP_URL: "https://cruush.test",
      REVIEWER_TEST_ACCOUNTS_ENABLED: "false",
      REVIEWER_TEST_ACCOUNT_PASSWORD: "reviewer-password-123",
      BANK_REVIEWER_ACCOUNT_PASSWORD: "bank-password-123"
    })).toThrow(/REVIEWER_TEST_ACCOUNTS_ENABLED/);

    expect(() => assertReviewerTestAccountConfig({
      NODE_ENV: "development",
      APP_URL: "https://cruush.test",
      REVIEWER_TEST_ACCOUNTS_ENABLED: "true",
      REVIEWER_TEST_ACCOUNT_PASSWORD: ""
    })).toThrow(/REVIEWER_TEST_ACCOUNT_PASSWORD/);

    expect(() => assertReviewerTestAccountConfig({
      NODE_ENV: "development",
      APP_URL: "https://cruush.test",
      REVIEWER_TEST_ACCOUNTS_ENABLED: "true",
      REVIEWER_TEST_ACCOUNT_PASSWORD: "reviewer-password-123",
      BANK_REVIEWER_ACCOUNT_PASSWORD: ""
    })).toThrow(/BANK_REVIEWER_ACCOUNT_PASSWORD/);

    expect(() => assertReviewerTestAccountConfig({
      NODE_ENV: "production",
      APP_URL: "https://cruush.app",
      REVIEWER_TEST_ACCOUNTS_ENABLED: "true",
      REVIEWER_TEST_ACCOUNT_PASSWORD: "reviewer-password-123",
      BANK_REVIEWER_ACCOUNT_PASSWORD: "bank-password-123"
    })).toThrow(/production/i);

    expect(() => assertReviewerTestAccountConfig({
      NODE_ENV: "production",
      APP_URL: "https://staging.cruush.app",
      REVIEWER_TEST_ACCOUNTS_ENABLED: "true",
      REVIEWER_TEST_ACCOUNT_PASSWORD: "reviewer-password-123",
      BANK_REVIEWER_ACCOUNT_PASSWORD: "bank-password-123"
    })).not.toThrow();
  });

  it("upserts reviewer auth users, profiles, privacy settings, and encrypted NYC location envelopes", async () => {
    let userIndex = 0;
    const query = vi.fn(async (sql: string, params: unknown[] = []) => {
      const normalizedSql = sql.toLowerCase();

      if (normalizedSql.includes("insert into app_users")) {
        userIndex += 1;

        return {
          rows: [{
            id: seededReviewerUserId(userIndex),
            email: params[0],
            display_name: params[2],
            email_verified_at: "2026-07-07T12:00:00.000Z",
            created_at: "2026-07-07T12:00:00.000Z"
          }]
        };
      }

      if (normalizedSql.includes("insert into encrypted_relationship_records")) {
        return {
          rows: [{
            id: "20000000-0000-4000-8000-000000000001"
          }]
        };
      }

      if (normalizedSql.includes("insert into conversations (kind, dm_key, created_by, disappearing_timer)")) {
        return {
          rows: [{
            id: "30000000-0000-4000-8000-000000000001"
          }]
        };
      }

      if (normalizedSql.includes("select id::text as id") && normalizedSql.includes("from conversations")) {
        return {
          rows: []
        };
      }

      if (normalizedSql.includes("insert into conversations (kind, title, tags, created_by, disappearing_timer)")) {
        return {
          rows: [{
            id: "30000000-0000-4000-8000-000000000002"
          }]
        };
      }

      return {
        rows: []
      };
    });
    const db = {
      query,
      end: vi.fn()
    } as unknown as DbClient;

    const result = await seedReviewerTestAccountsWithDb({
      config,
      db,
      seedConfig: {
        NODE_ENV: "development",
        APP_URL: "https://cruush.test",
        REVIEWER_TEST_ACCOUNTS_ENABLED: "true",
        REVIEWER_TEST_ACCOUNT_PASSWORD: "reviewer-password-123",
        BANK_REVIEWER_ACCOUNT_PASSWORD: "bank-password-123"
      }
    });

    const userUpserts = query.mock.calls.filter(([sql]) => String(sql).includes("insert into app_users"));
    const profileUpserts = query.mock.calls.filter(([sql]) => String(sql).includes("insert into profiles"));
    const encryptedLocationCalls = query.mock.calls.filter(([sql]) => String(sql).includes("insert into encrypted_location_envelopes"));
    const encryptedPolicyCalls = query.mock.calls.filter(([sql]) => String(sql).includes("insert into encrypted_visibility_tokens"));
    const legacyPrivacyCalls = query.mock.calls.filter(([sql]) => String(sql).includes(
      "insert into user_privacy_settings (user_id, ghost_mode_enabled, precise_location_visibility)"
    ));
    const conversationDeletes = query.mock.calls.filter(([sql]) => String(sql).toLowerCase().includes("delete from conversations"));
    const fakeUserDeletes = query.mock.calls.filter(([sql]) => String(sql).toLowerCase().includes("delete from app_users"));

    expect(result.accountCount).toBe(REVIEWER_TEST_ACCOUNT_COUNT);
    expect(result.accounts.map((account) => account.email)).toEqual(["codeveloper-nyc@cruush.local", "bank-reviewer-nyc@cruush.local"]);
    expect(result.accounts.map((account) => account.email)).not.toContain("payment@cruush.local");
    expect(userUpserts).toHaveLength(REVIEWER_TEST_ACCOUNT_COUNT);
    expect(profileUpserts).toHaveLength(REVIEWER_TEST_ACCOUNT_COUNT);
    expect(encryptedLocationCalls).toHaveLength(REVIEWER_TEST_ACCOUNT_COUNT);
    expect(encryptedPolicyCalls).toHaveLength(REVIEWER_TEST_ACCOUNT_COUNT);
    expect(legacyPrivacyCalls).toHaveLength(REVIEWER_TEST_ACCOUNT_COUNT);
    const encryptedLocationParams = JSON.stringify(encryptedLocationCalls.map(([, params]) => params));
    expect(encryptedLocationParams).not.toContain("40.7359");
    expect(encryptedLocationParams).not.toContain("-73.9911");
    expect(encryptedLocationParams).not.toContain("40.7336");
    expect(encryptedLocationParams).not.toContain("-74.0027");
    expect(encryptedLocationParams).not.toContain("40.7339");
    expect(encryptedLocationParams).not.toContain("-74.0022");
    expect(encryptedLocationParams).not.toContain("40.7282");
    expect(encryptedLocationParams).not.toContain("-73.9942");
    expect(result).toHaveProperty("conversationFixtures", []);
    expect(query.mock.calls.filter(([sql]) => String(sql).includes("insert into encrypted_relationship_records"))).toHaveLength(0);
    expect(query.mock.calls.filter(([sql]) => String(sql).includes("insert into encrypted_relationship_tokens"))).toHaveLength(0);
    const dmConversationUpserts = query.mock.calls.filter(([sql]) =>
      String(sql).includes("insert into conversations (kind, dm_key, created_by, disappearing_timer)")
    );
    expect(dmConversationUpserts).toHaveLength(0);
    const groupConversationUpserts = query.mock.calls.filter(([sql]) =>
      String(sql).includes("insert into conversations (kind, title, tags, created_by, disappearing_timer)")
    );
    expect(groupConversationUpserts).toHaveLength(0);
    expect(query.mock.calls.some(([sql]) => String(sql).toLowerCase().includes("insert into messages"))).toBe(false);
    expect(conversationDeletes).toHaveLength(1);
    expect(conversationDeletes[0]?.[1]).toEqual([
      ["reviewer-test-fixture", "bank-payment-smoke"],
      ["payment@cruush.local"]
    ]);
    expect(fakeUserDeletes).toHaveLength(1);
    expect(fakeUserDeletes[0]?.[1]).toEqual([["payment@cruush.local"]]);
    expect(query.mock.calls.some(([sql]) => String(sql).toLowerCase() === "commit")).toBe(true);
  });
});
