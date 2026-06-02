import { describe, expect, it, vi } from "vitest";
import type { AppConfig } from "./config.js";
import type { DbClient } from "./db.js";
import {
  parseBackfillArgs,
  runRelationshipBackfill
} from "./backfill-encrypted-relationships.js";

const config: AppConfig = {
  NODE_ENV: "test",
  PORT: 3001,
  HOST: "127.0.0.1",
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/cruush",
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
  MATCH_TOKEN_KEY_VERSION: "v1"
};

function createCountingDb() {
  const counts = new Map([
    ["cruushes", "2"],
    ["cruush_matches", "1"],
    ["cruush_match_tokens", "1"],
    ["profile_view_events", "3"],
    ["encrypted_relationship_records", "0"]
  ]);
  const query = vi.fn(async (sql: string) => {
    for (const [tableName, count] of counts) {
      if (sql.includes(`from ${tableName}`)) {
        return { rows: [{ count }] };
      }
    }

    return { rows: [] };
  });

  return {
    query,
    end: vi.fn(async () => undefined)
  } as unknown as DbClient & { query: typeof query };
}

describe("encrypted relationship backfill", () => {
  it("defaults to dry-run unless --apply is present", () => {
    expect(parseBackfillArgs([])).toEqual({
      dryRun: true,
      purge: false
    });
    expect(parseBackfillArgs(["--apply"])).toEqual({
      dryRun: false,
      purge: false
    });
    expect(parseBackfillArgs(["--apply", "--purge"])).toEqual({
      dryRun: false,
      purge: true
    });
  });

  it("reports legacy counts in dry-run mode without writing records", async () => {
    const db = createCountingDb();
    const result = await runRelationshipBackfill({ config, db }, {
      dryRun: true,
      purge: false
    });

    expect(result).toEqual({
      mode: "dry-run",
      before: {
        cruushes: 2,
        matches: 1,
        matchTokens: 1,
        profileViews: 3,
        encryptedRecords: 0
      },
      backfilled: {
        cruushes: 0,
        matches: 0,
        profileViews: 0
      },
      purged: false,
      after: {
        cruushes: 2,
        matches: 1,
        matchTokens: 1,
        profileViews: 3,
        encryptedRecords: 0
      }
    });
    expect(db.query.mock.calls.map((call) => call[0]).join("\n")).not.toContain("insert into encrypted_relationship_records");
    expect(db.query.mock.calls.map((call) => call[0]).join("\n")).not.toContain("delete from cruushes");
  });
});
