import { pathToFileURL } from "node:url";
import { loadConfig, type AppConfig } from "./config.js";
import { createPool, type DbClient } from "./db.js";
import {
  buildEncryptedRelationshipPayload,
  issueEncryptedRelationshipToken,
  upsertEncryptedRelationshipRecord
} from "./encrypted-relationships.js";

type BackfillContext = {
  config: AppConfig;
  db: DbClient;
};

type BackfillOptions = {
  dryRun: boolean;
  purge: boolean;
};

type LegacyCruushRow = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  to_user_name: string | null;
  to_user_pronouns: string | null;
  to_user_photo: string | null;
  created_at: string | Date;
};

type LegacyMatchRow = {
  id: string;
  user_one_id: string;
  user_two_id: string;
  created_at: string | Date;
  revoked_at: string | Date | null;
};

type LegacyProfileViewRow = {
  id: string;
  target_user_id: string;
  viewer_user_id: string;
  viewed_at: string | Date;
  dedupe_bucket: string | Date;
};

const MATCH_PERMISSION_PURPOSE = "permissions";
const MATCH_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function isSchemaCompatibilityError(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: string }).code)
    : "";

  if (["42703", "42P01", "42883", "22P02"].includes(code)) {
    return true;
  }

  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("column") ||
    message.includes("relation") ||
    message.includes("operator does not exist") ||
    message.includes("does not exist");
}

async function safeRows<T>(db: DbClient, sql: string, values: unknown[] = []) {
  try {
    const result = await db.query<T>(sql, values);
    return result.rows;
  } catch (error) {
    if (isSchemaCompatibilityError(error)) {
      return [];
    }

    throw error;
  }
}

async function countRows(db: DbClient, tableName: string) {
  const rows = await safeRows<{ count: string }>(
    db,
    `select count(*)::text as count from ${tableName}`
  );

  return Number(rows[0]?.count ?? 0);
}

export function parseBackfillArgs(argv: string[]): BackfillOptions {
  const args = new Set(argv);
  const apply = args.has("--apply");

  return {
    dryRun: !apply,
    purge: apply && args.has("--purge")
  };
}

export async function getRelationshipBackfillCounts(db: DbClient) {
  const [cruushes, matches, matchTokens, profileViews, encryptedRecords] = await Promise.all([
    countRows(db, "cruushes"),
    countRows(db, "cruush_matches"),
    countRows(db, "cruush_match_tokens"),
    countRows(db, "profile_view_events"),
    countRows(db, "encrypted_relationship_records")
  ]);

  return {
    cruushes,
    matches,
    matchTokens,
    profileViews,
    encryptedRecords
  };
}

async function backfillCruushes(context: BackfillContext) {
  const rows = await safeRows<LegacyCruushRow>(
    context.db,
    `select
       id::text as id,
       from_user_id::text as from_user_id,
       to_user_id::text as to_user_id,
       to_user_name,
       to_user_pronouns,
       to_user_photo,
       created_at
     from cruushes
     order by created_at asc`
  );

  for (const row of rows) {
    await upsertEncryptedRelationshipRecord(context, buildEncryptedRelationshipPayload({
      type: "cruush",
      actorUserId: row.from_user_id,
      targetUserId: row.to_user_id,
      createdAt: row.created_at,
      targetSnapshot: {
        name: row.to_user_name ?? "",
        pronouns: row.to_user_pronouns ?? "",
        photo: row.to_user_photo ?? null
      },
      legacyId: row.id,
      metadata: {
        source: "legacy-cruushes"
      }
    }));
  }

  return rows.length;
}

async function backfillMatches(context: BackfillContext) {
  const rows = await safeRows<LegacyMatchRow>(
    context.db,
    `select
       id::text as id,
       user_one_id::text as user_one_id,
       user_two_id::text as user_two_id,
       created_at,
       revoked_at
     from cruush_matches
     order by created_at asc`
  );

  for (const row of rows) {
    const active = row.revoked_at === null;
    const record = await upsertEncryptedRelationshipRecord(context, buildEncryptedRelationshipPayload({
      type: "mutual_cruush",
      status: active ? "active" : "removed",
      actorUserId: row.user_one_id,
      targetUserId: row.user_two_id,
      createdAt: row.created_at,
      revokedAt: row.revoked_at,
      legacyId: row.id,
      metadata: {
        source: "legacy-cruush-matches"
      }
    }));

    if (record && active) {
      await issueEncryptedRelationshipToken(context, {
        relationshipRecordId: record.id,
        userOneId: row.user_one_id,
        userTwoId: row.user_two_id,
        purpose: MATCH_PERMISSION_PURPOSE,
        expiresAt: new Date(Date.now() + MATCH_TOKEN_TTL_MS)
      });
    }
  }

  return rows.length;
}

async function backfillProfileViews(context: BackfillContext) {
  const rows = await safeRows<LegacyProfileViewRow>(
    context.db,
    `select
       id::text as id,
       target_user_id::text as target_user_id,
       viewer_user_id::text as viewer_user_id,
       viewed_at,
       dedupe_bucket
     from profile_view_events
     order by viewed_at asc`
  );

  for (const row of rows) {
    await upsertEncryptedRelationshipRecord(context, buildEncryptedRelationshipPayload({
      type: "profile_view",
      actorUserId: row.viewer_user_id,
      targetUserId: row.target_user_id,
      createdAt: row.viewed_at,
      updatedAt: row.viewed_at,
      dedupeBucket: new Date(row.dedupe_bucket).toISOString(),
      legacyId: row.id,
      metadata: {
        source: "legacy-profile-view-events"
      }
    }));
  }

  return rows.length;
}

async function purgeLegacyRelationshipTables(db: DbClient) {
  await db.query("delete from cruush_match_tokens");
  await db.query("delete from profile_view_events");
  await db.query("delete from cruush_matches");
  await db.query("delete from cruushes");
}

export async function runRelationshipBackfill(context: BackfillContext, options: BackfillOptions) {
  const before = await getRelationshipBackfillCounts(context.db);

  if (options.dryRun) {
    return {
      mode: "dry-run" as const,
      before,
      backfilled: {
        cruushes: 0,
        matches: 0,
        profileViews: 0
      },
      purged: false,
      after: before
    };
  }

  await context.db.query("begin");

  try {
    const [cruushes, matches, profileViews] = [
      await backfillCruushes(context),
      await backfillMatches(context),
      await backfillProfileViews(context)
    ];

    if (options.purge) {
      await purgeLegacyRelationshipTables(context.db);
    }

    await context.db.query("commit");
    const after = await getRelationshipBackfillCounts(context.db);

    return {
      mode: "apply" as const,
      before,
      backfilled: {
        cruushes,
        matches,
        profileViews
      },
      purged: options.purge,
      after
    };
  } catch (error) {
    await context.db.query("rollback");
    throw error;
  }
}

async function main() {
  const config = loadConfig();
  const db = createPool(config);
  const options = parseBackfillArgs(process.argv.slice(2));

  try {
    const result = await runRelationshipBackfill({ config, db }, options);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await db.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
