import { pathToFileURL } from "node:url";
import { loadConfig, type AppConfig } from "./config.js";
import { createPool, runTransaction, type DbClient } from "./db.js";
import {
  buildClubEnrollmentPayload,
  createClubEnrollmentUserIndex,
  listClubMemberships,
  upsertClubEnrollment,
  type ClubEnrollmentRole
} from "./encrypted-club-enrollments.js";

type Context = { config: AppConfig; db: DbClient };
type Options = { dryRun: boolean; purge: boolean };
type LegacyMembership = { club_id: string; user_id: string; role: ClubEnrollmentRole; created_at: string | Date };
type LegacyRequest = { club_id: string; user_id: string; created_at: string | Date };
type ClubConversation = { club_id: string; conversation_id: string | null };

function compatibilityError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: string }).code) : "";
  return ["42703", "42P01"].includes(code);
}

async function safeRows<T>(db: DbClient, sql: string) {
  try {
    return (await db.query<T>(sql)).rows;
  } catch (error) {
    if (compatibilityError(error)) return [];
    throw error;
  }
}

export function parseClubEnrollmentBackfillArgs(argv: string[]): Options {
  const args = new Set(argv);
  return { dryRun: !args.has("--apply"), purge: args.has("--apply") && args.has("--purge") };
}

export async function runClubEnrollmentBackfill(context: Context, options: Options) {
  const memberships = await safeRows<LegacyMembership>(context.db, `
    select club_id::text as club_id, user_id::text as user_id, role, created_at
    from club_memberships order by created_at asc`);
  const owners = await safeRows<LegacyMembership>(context.db, `
    select id::text as club_id, owner_user_id::text as user_id, 'owner'::text as role, created_at
    from clubs where owner_user_id is not null`);
  const requests = await safeRows<LegacyRequest>(context.db, `
    select club_id::text as club_id, requester_user_id::text as user_id, created_at
    from club_join_requests order by created_at asc`);
  const conversations = await safeRows<ClubConversation>(context.db, `
    select id::text as club_id, conversation_id::text as conversation_id from clubs`);
  const membershipByEdge = new Map<string, LegacyMembership>();
  for (const row of [...owners, ...memberships]) membershipByEdge.set(`${row.club_id}:${row.user_id}`, row);

  if (options.dryRun) {
    return { mode: "dry-run" as const, memberships: membershipByEdge.size, joinRequests: requests.length };
  }

  await runTransaction(context.db, async (db) => {
    const tx = { config: context.config, db };
    const conversationByClub = new Map(conversations.map((row) => [row.club_id, row.conversation_id]));
    for (const row of membershipByEdge.values()) {
      await upsertClubEnrollment(tx, buildClubEnrollmentPayload({
        type: "membership", status: "active", clubId: row.club_id, userId: row.user_id,
        role: row.role, createdAt: row.created_at
      }));
      const conversationId = conversationByClub.get(row.club_id);
      if (conversationId) {
        await db.query(
          `with existing_account as (
             select id from app_users where id = $3::uuid for key share
           )
           insert into conversation_members (conversation_id, user_id, member_index, role)
           select $1, null, $2, 'member' from existing_account
           on conflict (conversation_id, member_index) where member_index is not null do nothing`,
          [conversationId, createClubEnrollmentUserIndex(context.config, row.user_id), row.user_id]
        );
      }
    }
    for (const row of requests) {
      await upsertClubEnrollment(tx, buildClubEnrollmentPayload({
        type: "join_request", status: "pending", clubId: row.club_id, userId: row.user_id,
        applicationAnswer: null, createdAt: row.created_at
      }));
    }

    for (const clubId of new Set([...membershipByEdge.values()].map((row) => row.club_id))) {
      const expected = [...membershipByEdge.values()].filter((row) => row.club_id === clubId).length;
      const actual = (await listClubMemberships(tx, clubId)).length;
      if (actual !== expected) throw new Error(`Club enrollment validation failed for ${clubId}: expected ${expected}, found ${actual}.`);
    }

    if (options.purge) {
      await db.query(`delete from conversation_members member using clubs club
        where club.conversation_id = member.conversation_id and member.user_id is not null`);
      await db.query("drop table if exists club_join_requests");
      await db.query("drop table if exists club_memberships");
      await db.query("alter table clubs drop column if exists owner_user_id");
    }
  });

  return { mode: options.purge ? "applied-and-purged" as const : "applied" as const, memberships: membershipByEdge.size, joinRequests: requests.length };
}

async function main() {
  const config = loadConfig();
  const db = createPool(config);
  try {
    const result = await runClubEnrollmentBackfill({ config, db }, parseClubEnrollmentBackfillArgs(process.argv.slice(2)));
    console.info(JSON.stringify(result));
  } finally {
    await db.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
