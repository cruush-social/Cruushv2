import { buildServer } from "./app.js";
import { loadConfig } from "./config.js";
import { decryptMediaBytes } from "./media-encryption.js";
import { moderateImageOrReject } from "./moderation-service.js";
import { readEncryptedMediaObject } from "./media-storage.js";

const requestedBatchSize = Number(process.env.CRUUSH_MEDIA_BACKFILL_BATCH ?? 25);
const batchSize = Number.isFinite(requestedBatchSize)
  ? Math.max(1, Math.min(100, Math.floor(requestedBatchSize)))
  : 25;

const app = buildServer(loadConfig());

try {
  await app.ready();
  const candidates = await app.db.query<{
    id: string;
    owner_user_id: string;
    surface: "profile_photo" | "message_photo";
    object_key: string;
    mime_type: string;
    encrypted_data_key: string;
    data_key_nonce: string;
    data_key_auth_tag: string;
    content_nonce: string;
    content_auth_tag: string;
    key_version: string;
  }>(
    `select id::text, owner_user_id::text as owner_user_id, surface, object_key,
            mime_type, encrypted_data_key, data_key_nonce, data_key_auth_tag,
            content_nonce, content_auth_tag, key_version
     from media_objects
     where legacy_asset = true
       and explicit_classification = 'unknown'
       and deleted_at is null
     order by created_at asc
     limit $1`,
    [batchSize]
  );

  const result = { processed: 0, classified: 0, failed: 0 };

  for (const media of candidates.rows) {
    result.processed += 1;

    try {
      const encryptedBytes = await readEncryptedMediaObject(app.config, media.object_key);
      const bytes = decryptMediaBytes(app.config, {
        ciphertext: encryptedBytes,
        encryptedDataKey: media.encrypted_data_key,
        dataKeyNonce: media.data_key_nonce,
        dataKeyAuthTag: media.data_key_auth_tag,
        nonce: media.content_nonce,
        authTag: media.content_auth_tag,
        keyVersion: media.key_version
      });
      const moderationSurface = media.surface === "profile_photo" ? "profile_photo" : "direct_message";
      const moderation = await moderateImageOrReject(app, {
        userId: media.owner_user_id,
        surface: moderationSurface,
        mimeType: media.mime_type,
        bytes,
        contentId: media.id,
        contentRef: { assetId: media.id, legacyBackfill: true }
      });
      const labels = moderation.providerResult.labels;
      const hasExplicitLabel = labels.some((label) =>
        ["adult_nudity", "adult_explicit"].includes(label.normalized_label)
      );
      const classification = hasExplicitLabel
        ? "explicit"
        : moderation.decision.decision === "allow"
          ? "non_explicit"
          : "uncertain";
      const moderationStatus = moderation.decision.decision === "reject"
        ? "rejected"
        : moderation.decision.decision === "quarantine"
          ? "pending"
          : "approved";

      await app.db.query(
        `update media_objects
         set explicit_classification = $2,
             explicit_classification_source = 'provider',
             explicit_classification_updated_at = now(),
             explicit_classification_reason = $3,
             moderation_status = $4,
             moderation_provider = $5,
             moderation_provider_version = $6,
             moderation_scores = $7::jsonb,
             moderation_decided_at = now(),
             moderation_failure_reason = null
         where id = $1 and deleted_at is null`,
        [
          media.id,
          classification,
          moderation.decision.reason_code,
          moderationStatus,
          moderation.providerResult.provider,
          moderation.providerResult.provider_request_id,
          JSON.stringify(moderation.providerResult.labels)
        ]
      );
      result.classified += 1;
    } catch (error) {
      result.failed += 1;
      app.log.error({ err: error, mediaId: media.id }, "legacy media classification failed");
    }
  }

  console.log(JSON.stringify(result));
} finally {
  await app.close();
}

