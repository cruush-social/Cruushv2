import type { AppConfig } from "./config.js";
import type { DbClient, DbQueryResult } from "./db.js";
import { createClubEnrollmentBlindIndex, decryptClubEnrollmentPayload, type EncryptedClubEnrollmentRow } from "./encrypted-club-enrollments.js";
import { createRelationshipBlindIndex, decryptRelationshipPayload, type EncryptedRelationshipRecordRow } from "./encrypted-relationships.js";
import { createPrivacyAuditBlindIndex, decryptPrivacyAuditEvent } from "./location-privacy.js";
import { betaCityRequestHash } from "./beta-city-requests.js";
import { placeSuggestionSupporterToken } from "./place-suggestion-privacy.js";
import { createHash } from "node:crypto";

// Opaque stores cannot use an account FK. Derive the deleted member's indexes
// for every stored version and remove the corresponding encrypted payloads.
export async function deleteAccountPrivateData(db: DbClient, config: AppConfig, userId: string, emails: string[] = []) {
  const relationshipVersions = await db.query<{ key_version: string }>(
    "select distinct index_key_version as key_version from encrypted_relationship_records"
  );
  for (const { key_version: version } of relationshipVersions.rows) {
    await db.query(
      `delete from encrypted_relationship_records
       where index_key_version = $1
         and (actor_user_index = $2 or target_user_index = $3
           or participant_one_index = $4 or participant_two_index = $4)`,
      [version, createRelationshipBlindIndex(config, "actor-user", userId, version),
        createRelationshipBlindIndex(config, "target-user", userId, version),
        createRelationshipBlindIndex(config, "participant", userId, version)]
    );
  }
  let relationshipCursor: string | null = null;
  while (true) {
    const rows: DbQueryResult<EncryptedRelationshipRecordRow> = await db.query<EncryptedRelationshipRecordRow>(
      "select * from encrypted_relationship_records where ($1::uuid is null or id > $1::uuid) order by id limit 100", [relationshipCursor]
    );
    if (!rows.rows.length) break;
    const ownedIds = rows.rows.flatMap(row => {
      try {
        const payload = decryptRelationshipPayload(config, row);
        return payload.actorUserId === userId || payload.targetUserId === userId || payload.participantUserIds.includes(userId) ? [row.id] : [];
      } catch { return []; }
    });
    if (ownedIds.length) await db.query("delete from encrypted_relationship_records where id = any($1::uuid[])", [ownedIds]);
    relationshipCursor = rows.rows[rows.rows.length - 1]!.id;
  }

  const clubVersions = await db.query<{ key_version: string }>(
    "select distinct index_key_version as key_version from encrypted_club_enrollments"
  );
  const clubIndexes = [...new Set([config.CLUB_ENROLLMENT_INDEX_KEY_VERSION || "v1",
    ...clubVersions.rows.map(row => row.key_version)])]
    .map(version => createClubEnrollmentBlindIndex(config, "user", userId, version));
  await db.query("delete from encrypted_club_enrollments where user_index = any($1::text[])", [clubIndexes]);
  await db.query("delete from conversation_members where member_index = any($1::text[])", [clubIndexes]);
  let clubCursor: string | null = null;
  while (true) {
    const rows: DbQueryResult<EncryptedClubEnrollmentRow> = await db.query<EncryptedClubEnrollmentRow>(
      "select * from encrypted_club_enrollments where ($1::uuid is null or id > $1::uuid) order by id limit 100", [clubCursor]
    );
    if (!rows.rows.length) break;
    const owned = rows.rows.filter(row => {
      try { return decryptClubEnrollmentPayload(config, row).userId === userId; }
      catch { return false; }
    });
    if (owned.length) {
      await db.query("delete from conversation_members where member_index = any($1::text[])", [owned.map(row => row.user_index)]);
      await db.query("delete from encrypted_club_enrollments where id = any($1::uuid[])", [owned.map(row => row.id)]);
    }
    clubCursor = rows.rows[rows.rows.length - 1]!.id;
  }

  // Audit key_version records the encryption key; old index versions can also
  // exist independently, so include all declared versions and the v1 baseline.
  const auditVersions = await db.query<{ key_version: string }>(
    "select distinct coalesce(index_key_version, key_version) as key_version from encrypted_privacy_audit_events"
  );
  const versions = [...new Set(["v1", config.LOCATION_INDEX_KEY_VERSION || "v1",
    ...auditVersions.rows.map(row => row.key_version)])];
  await db.query(
    `delete from encrypted_privacy_audit_events
     where subject_user_index = any($1::text[]) or viewer_user_index = any($2::text[])`,
    [versions.map(version => createPrivacyAuditBlindIndex(config, "subject", userId, version)),
      versions.map(version => createPrivacyAuditBlindIndex(config, "viewer", userId, version))]
  );
  await deleteLegacyPrivacyAudits(db, config, userId);
  // Legacy incoming cruushes embed the recipient's profile snapshot.
  await db.query("delete from cruushes where to_user_id = $1", [userId]);
  if (emails.length) {
    await db.query("delete from beta_city_requests where email_hash = any($1::text[])",
      [[...new Set(emails.map(email => betaCityRequestHash(config, "email", email)))]]);
  }

  const suggestions = await db.query<{ place_id: string }>(
    "select distinct place_id::text from place_suggestions union select distinct place_id::text from place_detail_suggestions"
  );
  for (const { place_id: placeId } of suggestions.rows) {
    const tokens = [placeSuggestionSupporterToken(config, placeId, userId),
      createHash("sha256").update(`${placeId}${userId}`).digest("hex")];
    // A sole, unpublished submission belongs to this member. Shared or
    // published venue records continue to belong to the community.
    await db.query(
      `delete from places where id = $1 and status = 'pending'
       and exists (select 1 from place_suggestions where place_id = $1 and supporter_token = any($2::text[]))
       and not exists (select 1 from place_suggestions where place_id = $1 and not (supporter_token = any($2::text[])))`,
      [placeId, tokens]
    );
    await db.query("delete from place_suggestions where place_id = $1 and supporter_token = any($2::text[])", [placeId, tokens]);
    await db.query("delete from place_detail_suggestions where place_id = $1 and supporter_token = $2",
      [placeId, placeSuggestionSupporterToken(config, `details:${placeId}`, userId)]);
  }
}

async function deleteLegacyPrivacyAudits(db: DbClient, config: AppConfig, userId: string) {
  type AuditRow = Parameters<typeof decryptPrivacyAuditEvent>[1];
  const candidateUsers = [userId];
  let accountCursor: string | null = null;
  while (true) {
    const candidates: DbQueryResult<{ id: string }> = await db.query<{ id: string }>(
      "select id::text from app_users where ($1::uuid is null or id > $1::uuid) order by id limit 200", [accountCursor]
    );
    if (!candidates.rows.length) break;
    candidateUsers.push(...candidates.rows.map(row => row.id));
    accountCursor = candidates.rows[candidates.rows.length - 1]!.id;
  }
  let auditCursor: string | null = null;
  while (true) {
    const audits: DbQueryResult<AuditRow> = await db.query<AuditRow>(
      `select id::text, event_ciphertext, event_nonce, event_auth_tag, wrapped_event_dek,
              event_dek_nonce, event_dek_auth_tag, key_version, created_at_ms, revoked_at_ms
       from encrypted_privacy_audit_events
       where index_key_version is null and ($1::uuid is null or id > $1::uuid)
       order by id limit 100`, [auditCursor]
    );
    if (!audits.rows.length) break;
    const ownedIds: string[] = [];
    for (const row of audits.rows) {
      let owned = false;
      for (const otherUserId of candidateUsers) {
        for (const [subject, viewer] of [[userId, otherUserId], [otherUserId, userId]]) {
          try {
            const payload = decryptPrivacyAuditEvent({ db, config }, row, subject!, viewer!);
            owned = payload.subjectUserId === userId || payload.viewerUserId === userId;
          } catch {
            // Authentication failure means this is another pair or a retired
            // unavailable key. Never erase an unverified other member's row.
          }
          if (owned) break;
        }
        if (owned) break;
      }
      if (owned) ownedIds.push(row.id);
    }
    if (ownedIds.length) await db.query("delete from encrypted_privacy_audit_events where id = any($1::uuid[])", [ownedIds]);
    auditCursor = audits.rows[audits.rows.length - 1]!.id;
  }
}
