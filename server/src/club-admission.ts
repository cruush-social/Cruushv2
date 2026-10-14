import type { AppConfig } from "./config.js";
import { runTransaction, type DbClient } from "./db.js";
import { ApiError } from "./errors.js";
import {
  buildClubEnrollmentPayload, createClubEnrollmentBlindIndex,
  createClubEnrollmentUserIndex, deleteClubEnrollment,
  findClubEnrollment, upsertClubEnrollment
} from "./encrypted-club-enrollments.js";

export const MAX_CLUB_MEMBERS = 1000;
export type LockedClubAdmission = {
  config: AppConfig;
  db: DbClient;
  club: { id: string; conversation_id: string; requires_join_approval: boolean; closed_at: string | Date | null };
};

// Every admission path holds the same club lock until capacity and both
// encrypted/opaque membership writes commit. Never use the pool inside it.
export async function withLockedClubAdmission<T>(
  app: { config: AppConfig; db: DbClient },
  clubId: string,
  operation: (context: LockedClubAdmission) => Promise<T>
): Promise<T> {
  return runTransaction(app.db, async (db) => {
    const result = await db.query<Omit<LockedClubAdmission["club"], "closed_at">>(
      `select id::text as id, conversation_id::text as conversation_id, requires_join_approval
       from clubs where id = $1 for update`, [clubId]
    );
    const club = result.rows[0];
    if (!club) throw new ApiError(404, "NOT_FOUND", "Coven not found.");
    const conversation = await db.query<{ closed_at: string | Date | null }>(
      "select closed_at from conversations where id = $1 and kind = 'group' for update",
      [club.conversation_id]
    );
    if (!conversation.rows[0]) throw new ApiError(404, "NOT_FOUND", "Coven conversation not found.");
    return operation({ config: app.config, db, club: { ...club, closed_at: conversation.rows[0].closed_at } });
  });
}

export function assertClubAdmissionOpen(context: LockedClubAdmission) {
  // Call only after the route's visibility/role authorization. A closed-state
  // error must not reveal an otherwise hidden Coven to a nonmember.
  if (context.club.closed_at) throw new ApiError(400, "FEATURE_RESTRICTED", "This Coven is closed.");
}

export async function assertActiveClubJoiner(context: LockedClubAdmission, userId: string) {
  const account = await context.db.query<{ account_status: string }>(
    "select coalesce(account_status, 'active') as account_status from app_users where id = $1 for update",
    [userId]
  );
  if (account.rows[0]?.account_status !== "active") {
    throw new ApiError(403, "FEATURE_RESTRICTED", "Coven joining is unavailable for this account.");
  }
}

export async function admitLockedClubMember(context: LockedClubAdmission, userId: string) {
  assertClubAdmissionOpen(context);
  const clubId = context.club.id;
  const existing = await findClubEnrollment(context, { clubId, userId, type: "membership" });
  if (existing) {
    if (existing.payload.clubId !== clubId || existing.payload.userId !== userId ||
        existing.payload.type !== "membership" || existing.payload.status !== "active" ||
        !["owner", "admin", "moderator", "member"].includes(existing.payload.role ?? "")) {
      throw new ApiError(409, "FEATURE_RESTRICTED", "Coven membership is unavailable.");
    }
    return false;
  }
  await assertActiveClubJoiner(context, userId);
  // Opaque active rows count even if their ciphertext cannot be decrypted.
  // Such a row must not create spare capacity or permit overwriting a role.
  const version = context.config.CLUB_ENROLLMENT_INDEX_KEY_VERSION || "v1";
  const capacity = await context.db.query<{ member_count: number; already_member: boolean }>(
    `select count(*)::int as member_count,
            coalesce(bool_or(record_lookup_index = $5), false) as already_member
     from encrypted_club_enrollments
     where club_index = $1 and record_type_index = $2 and status_index = $3 and index_key_version = $4`,
    [
      createClubEnrollmentBlindIndex(context.config, "club", clubId),
      createClubEnrollmentBlindIndex(context.config, "type", "membership"),
      createClubEnrollmentBlindIndex(context.config, "status", "active"), version,
      createClubEnrollmentBlindIndex(context.config, "record", `membership:${clubId}:${userId}`)
    ]
  );
  if (!capacity.rows[0] || capacity.rows[0].already_member) {
    throw new ApiError(409, "FEATURE_RESTRICTED", "Coven membership is unavailable.");
  }
  if (capacity.rows[0].member_count >= MAX_CLUB_MEMBERS) {
    throw new ApiError(409, "VALIDATION_ERROR", `This Coven already has ${MAX_CLUB_MEMBERS} members.`);
  }
  await upsertClubEnrollment(context, buildClubEnrollmentPayload({
    type: "membership", status: "active", clubId, userId, role: "member"
  }));
  await context.db.query(
    `with existing_account as (
       select id from app_users where id = $3::uuid for key share
     )
     insert into conversation_members (conversation_id, user_id, member_index, role)
     select $1, null, $2, 'member' from existing_account
     on conflict (conversation_id, member_index) where member_index is not null do nothing`,
    [context.club.conversation_id, createClubEnrollmentUserIndex(context.config, userId), userId]
  );
  await deleteClubEnrollment(context, { clubId, userId, type: "join_request" });
  return true;
}
