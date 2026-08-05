import type { FastifyInstance, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { ApiError } from "./errors.js";
import { runTransaction, type DbClient } from "./db.js";

/**
 * Posts a photo message that moderation has already approved.
 *
 * This replaces a single statement built from eight chained CTEs. In that shape
 * any unmatched link - a closed conversation, a trust check, a media row in an
 * unexpected state - produced zero rows and the route reported "Messaging is
 * unavailable for this account", which blamed the account and named no cause.
 *
 * The rule is simple and is now written simply: once the classifier approves the
 * photo, it posts, unless the sender is actually restricted. Each precondition
 * is checked on its own and fails with a message that says which one.
 */

export type PhotoMessageInput = {
  conversationId: string;
  senderUserId: string;
  mediaObjectId: string;
  displayUrl: string;
  content: { ciphertext: string; nonce: string; authTag: string; keyVersion: string };
  moderation: {
    provider: string;
    providerVersion: string;
    providerRequestId: string;
    labels: unknown;
    decision: unknown;
    rawResult: unknown;
    photoDnaStatus: string;
    photoDnaProviderRequestId: string | null;
  };
  isAdultExplicit: boolean;
  viewOnce: boolean;
  disappearingTimer: string;
  restrictedFeature: "direct_messages" | "group_messages";
  moderationSurface: "direct_message" | "group_message";
  ownerFullAccess: boolean;
};

async function assertConversationOpen(db: DbClient, input: PhotoMessageInput) {
  const result = await db.query<{ closed: boolean }>(
    `select (c.closed_at is not null) as closed
     from conversations c
     join conversation_members cm on cm.conversation_id = c.id
     where c.id::text = $1 and cm.user_id = $2
     limit 1`,
    [input.conversationId, input.senderUserId]
  );

  if (!result.rows[0]) {
    throw new ApiError(403, "FORBIDDEN", "You are not a member of this conversation.");
  }

  if (result.rows[0].closed) {
    throw new ApiError(400, "FEATURE_RESTRICTED", "This conversation is closed.");
  }
}

async function assertSenderAllowed(db: DbClient, input: PhotoMessageInput) {
  if (input.ownerFullAccess) {
    return;
  }

  const result = await db.query<{
    account_status: string;
    suspended: boolean;
    trust_score: number;
    suspensions: number;
    restrictions: number;
  }>(
    `select
       u.account_status,
       coalesce(t.is_suspended, false) as suspended,
       coalesce(t.trust_score, 50) as trust_score,
       (select count(*)::int from suspensions s
         where s.user_id = u.id
           and (s.permanent or s.ends_at is null or s.ends_at > now())) as suspensions,
       (select count(*)::int from feature_restrictions r
         where r.user_id = u.id
           and r.feature = $2
           and (r.ends_at is null or r.ends_at > now())) as restrictions
     from app_users u
     left join user_trust_profiles t on t.user_id = u.id
     where u.id = $1`,
    [input.senderUserId, input.restrictedFeature]
  );

  const row = result.rows[0];

  if (!row) {
    throw new ApiError(403, "FORBIDDEN", "Account not found.");
  }

  if (row.account_status !== "active") {
    throw new ApiError(403, "FEATURE_RESTRICTED", "Your account is not active.");
  }

  if (row.suspended || row.suspensions > 0) {
    throw new ApiError(403, "FEATURE_RESTRICTED", "Your account is suspended.");
  }

  if (row.trust_score <= 20) {
    throw new ApiError(403, "FEATURE_RESTRICTED", "Photo messages are unavailable while your trust score is low.");
  }

  if (row.restrictions > 0) {
    throw new ApiError(403, "FEATURE_RESTRICTED", "Photo messages are restricted on your account.");
  }
}

export async function sendApprovedPhotoMessage(
  app: FastifyInstance,
  request: FastifyRequest,
  input: PhotoMessageInput
) {
  await assertConversationOpen(app.db, input);
  await assertSenderAllowed(app.db, input);

  return runTransaction(app.db, async (db) => {
    // Moderation already ran and allowed this photo; record that verdict.
    const approved = await db.query<{ id: string }>(
      `update media_objects
       set public_url = $2,
           moderation_status = 'approved',
           moderation_provider = $3,
           moderation_provider_version = $4,
           moderation_scores = $5::jsonb,
           moderation_decided_at = now(),
           moderation_failure_reason = null,
           explicit_classification = case when $6 then 'explicit' else 'non_explicit' end,
           photodna_status = $7,
           photodna_provider_request_id = $8
       where id = $1
         and owner_user_id = $9
         and surface = 'message_photo'
         and deleted_at is null
       returning id::text as id`,
      [
        input.mediaObjectId,
        input.displayUrl,
        input.moderation.provider,
        input.moderation.providerVersion,
        JSON.stringify(input.moderation.labels),
        input.isAdultExplicit,
        input.moderation.photoDnaStatus,
        input.moderation.photoDnaProviderRequestId,
        input.senderUserId
      ]
    );

    if (!approved.rows[0]) {
      // The upload created this row moments ago, so this means it was deleted or
      // reassigned mid-request rather than anything about the account.
      throw new ApiError(500, "INTERNAL_ERROR", "The uploaded photo could not be found.");
    }

    const reviewId = randomUUID();
    await db.query(
      `insert into content_reviews (
         id, user_id, surface, content_type, status, content_id, content_ref,
         provider, provider_request_id, normalized_labels, policy_decision,
         moderation_status, moderation_provider, moderation_raw_result, completed_at
       ) values ($1, $2, $3, 'image', 'allowed', $4, $5::jsonb, $6, $7, $8::jsonb, $9::jsonb, 'allowed', $6, $10::jsonb, now())`,
      [
        reviewId,
        input.senderUserId,
        input.moderationSurface,
        input.mediaObjectId,
        JSON.stringify({ assetId: input.mediaObjectId, surface: "message_photo" }),
        input.moderation.provider,
        input.moderation.providerRequestId,
        JSON.stringify(input.moderation.labels),
        JSON.stringify(input.moderation.decision),
        JSON.stringify(input.moderation.rawResult)
      ]
    );

    await db.query("update media_objects set content_review_id = $2 where id = $1", [input.mediaObjectId, reviewId]);

    const message = await db.query<{
      id: string;
      user_id: string;
      content: string;
      content_ciphertext: string | null;
      content_nonce: string | null;
      content_auth_tag: string | null;
      content_key_version: string | null;
      created_at: string | Date;
      expires_at: string | Date;
    }>(
      `insert into messages (
         conversation_id, user_id, content, content_ciphertext, content_nonce,
         content_auth_tag, content_key_version, expires_at
       )
       values (
         $1::uuid, $2, '', $3, $4, $5, $6,
         case when $7 = 'off' then null else now() + ($7)::interval end
       )
       returning
         id::text as id, user_id::text as user_id, content, content_ciphertext,
         content_nonce, content_auth_tag, content_key_version, created_at, expires_at`,
      [
        input.conversationId,
        input.senderUserId,
        input.content.ciphertext,
        input.content.nonce,
        input.content.authTag,
        input.content.keyVersion,
        input.disappearingTimer
      ]
    );

    const created = message.rows[0];

    if (!created) {
      throw new ApiError(500, "INTERNAL_ERROR", "The message could not be created.");
    }

    await db.query(
      "insert into message_media_attachments (message_id, media_object_id, view_once) values ($1::uuid, $2::uuid, $3)",
      [created.id, input.mediaObjectId, input.viewOnce]
    );

    await db.query("update conversations set updated_at = now() where id = $1::uuid", [input.conversationId]);
    await db.query(
      "update conversation_members set last_read_at = now() where conversation_id = $1::uuid and user_id = $2",
      [input.conversationId, input.senderUserId]
    );

    request.log.info(
      { messageId: created.id, mediaObjectId: input.mediaObjectId, surface: input.moderationSurface, stage: "photo_message_sent" },
      "photo message sent"
    );

    return created;
  });
}
