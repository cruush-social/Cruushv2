import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { AppConfig } from "./config.js";
import type { DbClient } from "./db.js";
import { deleteEncryptedMediaObject } from "./media-storage.js";

export const MODERATION_MEDIA_GRANT_TTL_MS = 90_000;

export type ModerationMediaGrantRow = {
  id: string;
  media_object_id: string;
  object_key: string;
  mime_type: string;
  byte_size: number;
  encrypted_data_key: string;
  data_key_nonce: string;
  data_key_auth_tag: string;
  content_nonce: string;
  content_auth_tag: string;
  key_version: string;
};

type CreateGrantInput = {
  mediaObjectId: string;
  ownerUserId: string;
  objectKey: string;
  mimeType: string;
  byteSize: number;
  encryptedDataKey: string;
  dataKeyNonce: string;
  dataKeyAuthTag: string;
  contentNonce: string;
  contentAuthTag: string;
  keyVersion: string;
};

type GrantClock = {
  now?: () => Date;
};

export function hashModerationMediaToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createModerationMediaGrant(
  db: DbClient,
  input: CreateGrantInput,
  options: GrantClock = {}
) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashModerationMediaToken(token);
  const now = options.now?.() ?? new Date();
  const expiresAt = new Date(now.getTime() + MODERATION_MEDIA_GRANT_TTL_MS);
  const id = randomUUID();

  await db.query(
    `insert into moderation_media_grants (
       id,
       media_object_id,
       owner_user_id,
       token_hash,
       object_key,
       mime_type,
       byte_size,
       encrypted_data_key,
       data_key_nonce,
       data_key_auth_tag,
       content_nonce,
       content_auth_tag,
       key_version,
       expires_at
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      id,
      input.mediaObjectId,
      input.ownerUserId,
      tokenHash,
      input.objectKey,
      input.mimeType,
      input.byteSize,
      input.encryptedDataKey,
      input.dataKeyNonce,
      input.dataKeyAuthTag,
      input.contentNonce,
      input.contentAuthTag,
      input.keyVersion,
      expiresAt
    ]
  );

  return { id, token, expiresAt };
}

const activeGrantSelection = `
  id,
  media_object_id,
  object_key,
  mime_type,
  byte_size,
  encrypted_data_key,
  data_key_nonce,
  data_key_auth_tag,
  content_nonce,
  content_auth_tag,
  key_version`;

export async function inspectModerationMediaGrant(db: DbClient, token: string) {
  const result = await db.query<ModerationMediaGrantRow>(
    `select ${activeGrantSelection}
     from moderation_media_grants
     where token_hash = $1
       and redeemed_at is null
       and revoked_at is null
       and expires_at > now()
     limit 1`,
    [hashModerationMediaToken(token)]
  );

  return result.rows[0] ?? null;
}

export async function redeemModerationMediaGrant(db: DbClient, token: string) {
  const result = await db.query<ModerationMediaGrantRow>(
    `update moderation_media_grants
     set redeemed_at = now()
     where token_hash = $1
       and redeemed_at is null
       and revoked_at is null
       and expires_at > now()
     returning ${activeGrantSelection}`,
    [hashModerationMediaToken(token)]
  );

  return result.rows[0] ?? null;
}

export async function wasModerationMediaGrantRedeemed(db: DbClient, grantId: string) {
  const result = await db.query<{ redeemed: boolean }>(
    `select (redeemed_at is not null) as redeemed
     from moderation_media_grants
     where id = $1
     limit 1`,
    [grantId]
  );

  return result.rows[0]?.redeemed === true;
}

export async function deleteModerationMediaGrant(db: DbClient, grantId: string) {
  await db.query("delete from moderation_media_grants where id = $1", [grantId]);
}

export async function revokeModerationMediaGrant(db: DbClient, grantId: string) {
  await db.query(
    `update moderation_media_grants
     set revoked_at = coalesce(revoked_at, now())
     where id = $1`,
    [grantId]
  );
}

type CleanupGrantRow = { id: string; media_object_id: string; object_key: string };

export async function deleteModerationMediaAsset(
  db: DbClient,
  config: AppConfig,
  input: CleanupGrantRow
) {
  const result = await db.query<{ object_key: string }>(
    `select media.object_key
     from media_objects media
     where media.id = $1
     union all
     select variant.object_key
     from media_variants variant
     where variant.media_object_id = $1`,
    [input.media_object_id]
  );
  const objectKeys = new Set([
    input.object_key,
    ...result.rows.map((row) => row.object_key)
  ]);

  for (const objectKey of objectKeys) {
    await deleteEncryptedMediaObject(config, objectKey);
  }

  await db.query("delete from media_objects where id = $1", [input.media_object_id]);
}

export async function cleanupModerationMediaGrants(
  db: DbClient,
  config: AppConfig,
  limit = 100
) {
  const result = await db.query<CleanupGrantRow>(
    `with cleanup_candidates as (
       select
         media_grant.id,
         media_grant.media_object_id,
         media_grant.object_key,
         media_grant.expires_at as cleanup_at
       from moderation_media_grants media_grant
       where media_grant.expires_at <= now()
       union all
       select
         media.id,
         media.id as media_object_id,
         media.object_key,
         media.created_at as cleanup_at
       from media_objects media
       where media.moderation_status = 'pending'
         and media.deleted_at is null
         and media.created_at <= now() - interval '5 minutes'
         and not exists (
           select 1
           from moderation_media_grants media_grant
           where media_grant.media_object_id = media.id
         )
     )
     select id, media_object_id, object_key
     from cleanup_candidates
     order by cleanup_at asc
     limit $1`,
    [limit]
  );
  let deleted = 0;

  for (const grant of result.rows) {
    await deleteModerationMediaAsset(db, config, grant);
    deleted += 1;
  }

  return deleted;
}
