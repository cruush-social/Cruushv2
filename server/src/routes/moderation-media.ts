import type { FastifyInstance, FastifyReply } from "fastify";
import { ApiError } from "../errors.js";
import { decryptMediaBytes } from "../media-encryption.js";
import {
  deleteModerationMediaAsset,
  inspectModerationMediaGrant,
  redeemModerationMediaGrant
} from "../moderation-media-grants.js";
import {
  readEncryptedMediaObject
} from "../media-storage.js";

const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

function unavailable() {
  return new ApiError(404, "NOT_FOUND", "Media not found.");
}

function applyCapabilityHeaders(reply: FastifyReply) {
  return reply
    .header("cache-control", "private, no-store, max-age=0")
    .header("pragma", "no-cache")
    .header("expires", "0")
    .header("x-robots-tag", "noindex, nofollow, noarchive")
    .header("referrer-policy", "no-referrer")
    .header("cross-origin-resource-policy", "cross-origin");
}

export async function registerModerationMediaRoutes(app: FastifyInstance) {
  app.route({
    method: ["GET", "HEAD"],
    url: "/api/moderation-media/:token",
    logLevel: "silent",
    async handler(request, reply) {
      applyCapabilityHeaders(reply);
      if (app.config.STREAM_NO_AI_TRAINING_VERIFIED !== true) {
        throw unavailable();
      }
      const token = (request.params as { token?: unknown }).token;

      if (typeof token !== "string" || !tokenPattern.test(token)) {
        throw unavailable();
      }

      const grant = request.method === "HEAD"
        ? await inspectModerationMediaGrant(app.db, token)
        : await redeemModerationMediaGrant(app.db, token);

      if (!grant) {
        throw unavailable();
      }

      reply
        .type(grant.mime_type)
        .header("content-length", String(grant.byte_size));

      if (request.method === "HEAD") {
        return reply.send();
      }

      try {
        const ciphertext = await readEncryptedMediaObject(app.config, grant.object_key);
        const plaintext = decryptMediaBytes(app.config, {
          ciphertext,
          encryptedDataKey: grant.encrypted_data_key,
          dataKeyNonce: grant.data_key_nonce,
          dataKeyAuthTag: grant.data_key_auth_tag,
          nonce: grant.content_nonce,
          authTag: grant.content_auth_tag,
          keyVersion: grant.key_version
        });

        return reply.send(plaintext);
      } catch {
        try {
          await deleteModerationMediaAsset(app.db, app.config, {
            id: grant.id,
            media_object_id: grant.media_object_id,
            object_key: grant.object_key
          });
        } catch {
          // Leave the consumed grant for the scheduled cleanup retry.
        }
        throw unavailable();
      }
    }
  });
}
