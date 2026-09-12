import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getRelationshipPermissions } from "./match-relationships.js";
import { decryptSensitiveProfile } from "./profile-sensitive.js";

export const nsfwPhotoAudienceSchema = z.enum(["public", "mutual_cruushes", "mutual_crowds"]);
export type NsfwPhotoAudience = z.infer<typeof nsfwPhotoAudienceSchema>;
export type NsfwPhotoRestriction = Exclude<NsfwPhotoAudience, "public">;
export type PhotoViewerRelationship = { isMutualCruush: boolean; sharesCrowd: boolean; nsfwPhotoRestriction?: NsfwPhotoRestriction };

export function resolveNsfwPhotoRestriction(audience: NsfwPhotoAudience, relationship: Pick<PhotoViewerRelationship, "isMutualCruush" | "sharesCrowd">): NsfwPhotoRestriction | undefined {
  return (audience === "mutual_cruushes" && !relationship.isMutualCruush) || (audience === "mutual_crowds" && !relationship.sharesCrowd)
    ? audience : undefined;
}

export async function loadPhotoViewerRelationships(app: FastifyInstance, viewerUserId: string, targetUserIds: string[]) {
  const targets = [...new Set(targetUserIds)].filter((id) => id !== viewerUserId);
  if (targets.length === 0) return new Map<string, PhotoViewerRelationship>();
  const sharedCrowds = await loadSharedCrowdUserIds(app, viewerUserId, targets);
  const policies = await app.db.query<{ user_id: string; nsfw_photo_visibility: string }>(
    `select user_id::text, nsfw_photo_visibility from user_cruush_match_settings where user_id = any($1::uuid[])`,
    [targets]
  );
  const audiences = new Map(policies.rows.map((row) => [row.user_id, nsfwPhotoAudienceSchema.parse(row.nsfw_photo_visibility)]));
  return new Map(await Promise.all(targets.map(async (id): Promise<[string, PhotoViewerRelationship]> => {
    const relationship = await getRelationshipPermissions(app, viewerUserId, id);
    const result: PhotoViewerRelationship = {
      isMutualCruush: !relationship.isBlocked && relationship.isMutualCruush === true,
      sharesCrowd: !relationship.isBlocked && sharedCrowds.has(id)
    };
    const audience = audiences.get(id) ?? "public";
    result.nsfwPhotoRestriction = resolveNsfwPhotoRestriction(audience, result);
    return [id, result];
  })));
}

export async function getNsfwPhotoAudience(app: FastifyInstance, ownerUserId: string): Promise<NsfwPhotoAudience> {
  const result = await app.db.query<{ nsfw_photo_visibility: string }>(
    `select nsfw_photo_visibility from user_cruush_match_settings where user_id = $1`,
    [ownerUserId]
  );
  // A missing row has the requested Public default; invalid policies and database errors never grant access.
  return result.rows.length === 0 ? "public" : nsfwPhotoAudienceSchema.parse(result.rows[0].nsfw_photo_visibility);
}

export async function saveNsfwPhotoAudience(app: FastifyInstance, ownerUserId: string, audience: NsfwPhotoAudience) {
  const result = await app.db.query<{ nsfw_photo_visibility: NsfwPhotoAudience }>(
    `insert into user_cruush_match_settings (user_id, nsfw_photo_visibility, message_visibility, nsfw_message_visibility, nsfw_send_visibility)
     values ($1, $2, 'mutual_cruushes', 'public', 'public')
     on conflict (user_id) do update set nsfw_photo_visibility = excluded.nsfw_photo_visibility, updated_at = now()
     returning nsfw_photo_visibility`,
    [ownerUserId, audience]
  );
  return nsfwPhotoAudienceSchema.parse(result.rows[0]?.nsfw_photo_visibility);
}

export async function canViewNsfwPhoto(app: FastifyInstance, ownerUserId: string, viewerUserId: string) {
  if (ownerUserId === viewerUserId) return true;
  const audience = await getNsfwPhotoAudience(app, ownerUserId);
  if (audience === "public") return true;
  const relationship = await getRelationshipPermissions(app, viewerUserId, ownerUserId);
  if (relationship.isBlocked) return false;
  if (audience === "mutual_cruushes") return relationship.isMutualCruush === true;
  return (await loadSharedCrowdUserIds(app, viewerUserId, [ownerUserId])).has(ownerUserId);
}

/** Resolve photo exceptions from actual Crowds, never overlapping kink tokens. */
export async function loadSharedCrowdUserIds(app: FastifyInstance, viewerUserId: string, targetUserIds: string[]) {
  const targets = [...new Set(targetUserIds)].filter((id) => id !== viewerUserId);
  if (targets.length === 0) return new Set<string>();
  const result = await app.db.query<{
    id: string;
    profile_sensitive_ciphertext: string | null;
    profile_sensitive_nonce: string | null;
    profile_sensitive_auth_tag: string | null;
    profile_sensitive_key_version: string | null;
  }>(
    `select id::text, profile_sensitive_ciphertext, profile_sensitive_nonce,
            profile_sensitive_auth_tag, profile_sensitive_key_version
     from profiles where id = any($1::uuid[])`,
    [[...targets, viewerUserId]]
  );
  const crowds = new Map(result.rows.map((row) => [row.id,
    new Set((decryptSensitiveProfile(app.config, row)?.crowds ?? []).map((crowd) => crowd.trim().toLowerCase()).filter(Boolean))]));
  const viewerCrowds = crowds.get(viewerUserId);
  return new Set(targets.filter((id) => [...(crowds.get(id) ?? [])].some((crowd) => viewerCrowds?.has(crowd))));
}
