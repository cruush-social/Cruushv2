import type { FastifyInstance } from "fastify";
import { getRelationshipPermissions } from "./match-relationships.js";
import { listEncryptedRelationshipRecordsByParticipant } from "./encrypted-relationships.js";

export async function loadCheckinMutualIds(app: FastifyInstance, viewerId: string) {
  const records = await listEncryptedRelationshipRecordsByParticipant(app, { participantUserId: viewerId, type: "mutual_cruush" }).catch(() => []);
  const candidates = new Set(records.flatMap(record => record.payload.actorUserId === viewerId ? [record.payload.targetUserId] : record.payload.targetUserId === viewerId ? [record.payload.actorUserId] : []));
  const allowed = await Promise.all([...candidates].map(async id => {
    try { return (await getRelationshipPermissions(app, viewerId, id)).isMutualCruush ? id : null; }
    catch { return null; }
  }));
  return allowed.filter((id): id is string => id !== null);
}

export function restrictedCheckinAudience(viewer: string, mutuals: string, alias = "c") {
  return `or (${alias}.visibility_scope in ('mutuals', 'crowd') and (
    ${alias}.user_id = ${viewer}::uuid
    or (${alias}.visibility_scope = 'mutuals' and ${alias}.user_id = any(${mutuals}::uuid[]))
    or (${alias}.visibility_scope = 'crowd' and exists (
      select 1 from jsonb_to_recordset(${alias}.crowd_targets) as target(token_hash text, token_key_version text)
      join profile_sensitive_tokens viewer_crowd_token on viewer_crowd_token.user_id = ${viewer}::uuid
        and viewer_crowd_token.token_hash = target.token_hash
        and viewer_crowd_token.token_key_version = target.token_key_version
    ))
  ) and not exists (select 1 from user_blocks b
    where (b.blocker_user_id = ${viewer}::uuid and b.blocked_user_id = ${alias}.user_id)
       or (b.blocker_user_id = ${alias}.user_id and b.blocked_user_id = ${viewer}::uuid)))`;
}

export function boardAudienceCondition(viewer: string, mutuals: string) {
  return `(m.visibility_scope = 'public' or (
    (m.user_id = ${viewer}::uuid or exists (
      select 1 from place_checkins viewer_checkin where viewer_checkin.user_id = ${viewer}::uuid
        and viewer_checkin.place_id = m.place_id and viewer_checkin.expires_at > now()
    )) and (false ${restrictedCheckinAudience(viewer, mutuals, "m")})
  ))`;
}
