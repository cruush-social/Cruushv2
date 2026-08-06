import { buildServer } from "./app.js";
import { loadConfig } from "./config.js";
import { classifyLegacyProviderResult } from "./legacy-media-classification.js";
import { decryptMediaBytes } from "./media-encryption.js";
import { detectProfilePhotoHuman } from "./profile-photo-human-detection.js";
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
      // Legacy classification is an explicitness backfill, not a replay of the
      // upload workflow. Replaying that workflow would apply the current
      // profile-photo identity gate to old assets and turn an unresolved legacy
      // photo into a user-facing rejection. The provider result alone determines
      // explicitness here; uncertain results remain masked.
      const providerResult = await detectProfilePhotoHuman(app.config, bytes);
      const classificationResult = classifyLegacyProviderResult(providerResult);

      if (classificationResult.classification === "unknown") {
        throw new Error(classificationResult.reason);
      }

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
          classificationResult.classification,
          classificationResult.reason,
          "approved",
          providerResult.provider,
          providerResult.provider_request_id,
          JSON.stringify(providerResult.labels)
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
