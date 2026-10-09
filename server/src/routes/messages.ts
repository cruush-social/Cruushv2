import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { canViewNsfwPhoto, loadSharedCrowdUserIds, loadPhotoViewerRelationships, getNsfwPhotoAudience, resolveNsfwPhotoRestriction, type PhotoViewerRelationship } from "../nsfw-photo-audience.js";
import { recordMeaningfulActivitySafely } from "../rewards-service.js";
import { decryptTextContentOrFallback, encryptTextContent } from "../content-encryption.js";
import { runTransaction } from "../db.js";
import { decryptMediaBytes } from "../media-encryption.js";
import { readEncryptedMediaObject } from "../media-storage.js";
import {
  createPendingMediaAsset,
  deletePendingMediaAsset,
  isPhotoModerationUnavailable,
  moderatePendingMediaAsset
} from "../media-assets.js";
import { MAX_IMAGE_BYTES, processUploadedImage } from "../media-image.js";
import { sendApprovedPhotoMessage } from "../message-photo-send.js";
import { photoUploadAvailability } from "../photo-upload-availability.js";
import { ApiError } from "../errors.js";
import { assertCanSendNsfwMessagePhoto, assertCanStartDirectMessage, canStartDirectMessage } from "../cruush-match-settings.js";
import { getRelationshipPermissions, type RelationshipPermissions } from "../match-relationships.js";
import { createGroupPulse } from "../map-pings.js";
import { createAppNotificationAndPush } from "../notification-service.js";
import {
  conversationTimerSchema,
  clubMemberRolePayloadSchema,
  createGroupConversationPayloadSchema,
  createMessagePhotoFieldsSchema,
  createMessagePayloadSchema,
  favoriteMessageImageUploadFieldsSchema,
  groupMemberPayloadSchema,
  MAX_GROUP_CONVERSATION_MEMBERS,
  openDirectConversationPayloadSchema,
  sendFavoriteMessageImagePayloadSchema,
  updateGroupConversationPayloadSchema
} from "../message-schema.js";
import { approvedContentReviewCte, moderateMessageTextOrAllowByKeyword } from "../moderation-service.js";
import { OWNER_FULL_ACCESS_EMAIL, userHasOwnerFullAccess } from "../owner-access.js";
import { getActiveAccountUserId, getAuthenticatedUserId } from "../request-auth.js";
import { formatLastActiveFromDate } from "../discovery-users.js";
import {
  buildClubEnrollmentPayload,
  createClubEnrollmentUserIndex,
  deleteClubEnrollment,
  findClubEnrollment,
  listClubMemberships,
  upsertClubEnrollment,
  type ClubEnrollmentRole
} from "../encrypted-club-enrollments.js";

const conversationParamsSchema = z.object({
  conversationId: z.uuid()
}).strict();

const messageParamsSchema = z.object({
  messageId: z.uuid()
}).strict();

const messageAttachmentViewParamsSchema = z.object({
  messageId: z.uuid(),
  mediaObjectId: z.uuid()
}).strict();

const favoriteImageParamsSchema = z.object({
  favoriteId: z.uuid()
}).strict();

const updateConversationTimerPayloadSchema = z.object({
  disappearingTimer: conversationTimerSchema
}).strict();

const updateConversationNotificationsPayloadSchema = z.object({
  notificationLevel: z.enum(["all", "mentions"]).optional(),
  muteFor: z.enum(["off", "1h", "8h", "24h", "7d"]).optional()
}).strict().refine(
  (value) => value.notificationLevel !== undefined || value.muteFor !== undefined,
  "Choose a notification setting."
);

const groupMemberParamsSchema = z.object({
  conversationId: z.uuid(),
  targetUserId: z.uuid()
}).strict();

const groupPulsePayloadSchema = z.object({
  idempotencyKey: z.uuid()
}).strict();

const adminRoles = new Set(["owner", "admin"]);

type ConversationRow = {
  id: string;
  kind: "dm" | "group";
  title: string | null;
  tags: string[] | null;
  current_user_role?: "owner" | "admin" | "moderator" | "member" | null;
  disappearing_timer?: "off" | "1h" | "24h" | "7d" | "30d" | null;
  closed_at?: string | Date | null;
  cleared_at?: string | Date | null;
  updated_at: string | Date;
  last_message: string | null;
  last_message_ciphertext: string | null;
  last_message_nonce: string | null;
  last_message_auth_tag: string | null;
  last_message_key_version: string | null;
  unread_count: number;
  pinned: boolean;
  muted: boolean;
  notification_level: "all" | "mentions";
  muted_until: string | Date | null;
  other_user_id: string | null;
  other_user_name: string | null;
  other_user_pronouns: string[] | null;
  other_user_photo: string | null;
  other_user_photo_explicit?: boolean | null;
  other_user_side_badges?: unknown;
  other_user_vibes?: string[] | null;
  other_user_travelling?: boolean;
  other_user_last_active?: string | Date | null;
  member_count: number;
  club_id?: string | null;
};

type GroupAccessRow = {
  role: "owner" | "admin" | "moderator" | "member";
  closed_at: string | Date | null;
};

type MessageRow = {
  id: string;
  user_id: string;
  sender_name?: string | null;
  sender_pronouns?: string[] | null;
  sender_photo?: string | null;
  sender_photo_explicit?: boolean | null;
  content: string;
  content_ciphertext?: string | null;
  content_nonce?: string | null;
  content_auth_tag?: string | null;
  content_key_version?: string | null;
  created_at: string | Date;
  read_at?: string | Date | null;
  expires_at?: string | Date | null;
  attachments?: MessageAttachment[] | string | null;
};

type ExistingUserRow = {
  id: string;
};

type MessageAttachment = {
  id: string;
  ownerUserId?: string;
  url: string;
  mediaType: string;
  mimeType: string;
  viewOnce?: boolean;
  viewedAt?: string | null;
  explicit?: boolean;
};

type FavoriteMessageImageRow = {
  id: string;
  media_object_id: string;
  label: string | null;
  url: string | null;
  thumbnail_url: string | null;
  media_type: string;
  mime_type: string;
  explicit: boolean;
  created_at: string | Date;
  updated_at: string | Date;
};

type GroupMemberRow = {
  id: string;
  name: string | null;
  pronouns: string[] | null;
  photo: string | null;
  photo_explicit?: boolean | null;
  role: "owner" | "admin" | "moderator" | "member";
  joined_at: string | Date;
};

type ConversationNotificationRecipientRow = {
  user_id: string;
  muted: boolean;
  notification_level: "all" | "mentions";
  recipient_name: string | null;
  sender_name: string | null;
  conversation_title: string | null;
};

type EncryptedMessageMediaRow = {
  object_key: string;
  mime_type: string;
  encrypted_data_key: string;
  data_key_nonce: string;
  data_key_auth_tag: string;
  content_nonce: string;
  content_auth_tag: string;
  key_version: string;
};

function toMessagePhotoUploadError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (message.includes("request file too large") || message.includes("file size")) {
    return new ApiError(400, "VALIDATION_ERROR", "Message photo must be 5 MB or smaller.");
  }

  return error;
}

export async function assertCanSaveFavoriteMessageImage(app: FastifyInstance, userId: string, ownerFullAccess: boolean) {
  if (ownerFullAccess) {
    return;
  }

  const result = await app.db.query<{
    account_status: string;
    suspended: boolean;
    trust_score: number;
    suspensions: number;
    owner_email: boolean;
    admin: boolean;
  }>(
    `select
       u.account_status,
       coalesce(trust.is_suspended, false) as suspended,
       coalesce(trust.trust_score, 50) as trust_score,
       lower(trim(coalesce(u.email, ''))) = $2 as owner_email,
       exists (
         select 1
         from moderator_users moderator
         where moderator.user_id = u.id
           and moderator.role = 'admin'
       ) as admin,
       (select count(*)::int from suspensions suspension
         where suspension.user_id = u.id
           and (suspension.permanent or suspension.ends_at is null or suspension.ends_at > now())) as suspensions
     from app_users u
     left join user_trust_profiles trust on trust.user_id = u.id
     where u.id = $1`,
    [userId, OWNER_FULL_ACCESS_EMAIL]
  );

  const row = result.rows[0];

  if (!row) {
    throw new ApiError(403, "FORBIDDEN", "Account not found.");
  }

  if (row.owner_email || row.admin) {
    return;
  }

  if (row.account_status !== "active") {
    throw new ApiError(403, "FEATURE_RESTRICTED", "Your account is not active.");
  }

  if (row.suspended || row.suspensions > 0) {
    throw new ApiError(403, "FEATURE_RESTRICTED", "Your account is suspended.");
  }

  if (row.trust_score <= 20) {
    throw new ApiError(403, "FEATURE_RESTRICTED", "Favorite image uploads are unavailable while your trust score is low.");
  }
}

async function throwTextMessageInsertFailure(
  app: FastifyInstance,
  userId: string,
  restrictedFeature: "direct_messages" | "group_messages"
): Promise<never> {
  const result = await app.db.query<{
    account_status: string;
    suspended: boolean;
    trust_score: number;
    active_suspensions: number;
    active_restrictions: number;
    owner_email: boolean;
    admin: boolean;
  }>(
    `select
       u.account_status,
       coalesce(trust.is_suspended, false) as suspended,
       coalesce(trust.trust_score, 50) as trust_score,
       lower(trim(coalesce(u.email, ''))) = $3 as owner_email,
       exists (
         select 1
         from moderator_users moderator
         where moderator.user_id = u.id
           and moderator.role = 'admin'
       ) as admin,
       (select count(*)::int
        from suspensions suspension
        where suspension.user_id = u.id
          and (suspension.permanent or suspension.ends_at is null or suspension.ends_at > now())) as active_suspensions,
       (select count(*)::int
        from feature_restrictions restriction
        where restriction.user_id = u.id
          and restriction.feature = $2
          and (restriction.ends_at is null or restriction.ends_at > now())) as active_restrictions
     from app_users u
     left join user_trust_profiles trust on trust.user_id = u.id
     where u.id = $1`,
    [userId, restrictedFeature, OWNER_FULL_ACCESS_EMAIL]
  );
  const sender = result.rows[0];

  if (!sender) {
    throw new ApiError(403, "FORBIDDEN", "Account not found.");
  }

  if (!sender.owner_email && !sender.admin) {
    if (sender.account_status !== "active") {
      throw new ApiError(
        403,
        "FEATURE_RESTRICTED",
        "Text messaging is unavailable because your account is not active."
      );
    }

    if (sender.suspended || sender.active_suspensions > 0) {
      throw new ApiError(
        403,
        "FEATURE_RESTRICTED",
        "Text messaging is unavailable while your account is suspended."
      );
    }

    if (sender.trust_score <= 20) {
      throw new ApiError(
        403,
        "FEATURE_RESTRICTED",
        "Text messaging is unavailable while your trust score is low."
      );
    }

    if (sender.active_restrictions > 0) {
      throw new ApiError(403, "FEATURE_RESTRICTED", "Text messaging is restricted on your account.");
    }
  }

  throw new ApiError(403, "FEATURE_RESTRICTED", "This text message could not be sent.");
}

function normalizeMessageAttachments(value: MessageRow["attachments"]): MessageAttachment[] {
  if (!value) {
    return [];
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed as MessageAttachment[] : [];
    } catch {
      return [];
    }
  }

  return Array.isArray(value) ? value : [];
}

async function refreshCreatedMessageAttachments(app: FastifyInstance, row: MessageRow) {
  const attachments = normalizeMessageAttachments(row.attachments);

  if (attachments.length === 0) {
    return row;
  }

  // The upload statement updates media_objects and returns the message in the
  // same PostgreSQL statement. PostgreSQL's statement snapshot can therefore
  // expose the pre-update URL/classification. Read the committed media rows in
  // a second statement before returning the message to the browser.
  const mediaIds = [...new Set(attachments.map((attachment) => attachment.id).filter(Boolean))];
  const mediaResult = await app.db.query<{
    id: string;
    public_url: string | null;
    explicit: boolean;
  }>(
    `select id::text as id,
            public_url,
            explicit_classification is distinct from 'non_explicit' as explicit
     from media_objects
     where id = any($1::uuid[])
       and deleted_at is null`,
    [mediaIds]
  );
  const mediaById = new Map(mediaResult.rows.map((media) => [media.id, media]));

  row.attachments = attachments.map((attachment) => {
    const media = mediaById.get(attachment.id);

    return media
      ? { ...attachment, url: media.public_url ?? attachment.url, explicit: media.explicit }
      : attachment;
  });

  return row;
}

export function mapConversationRow(app: FastifyInstance, row: ConversationRow, options: {
  canMessage?: boolean;
  mutual?: boolean;
  sharesCrowd?: boolean;
  nsfwPhotoRestriction?: PhotoViewerRelationship["nsfwPhotoRestriction"];
} = {}) {
  const isGroup = row.kind === "group";
  const lastMessage = decryptTextContentOrFallback(app.config, "message", {
    ciphertext: row.last_message_ciphertext ?? undefined,
    nonce: row.last_message_nonce ?? undefined,
    authTag: row.last_message_auth_tag ?? undefined,
    keyVersion: row.last_message_key_version ?? undefined
  }, row.last_message ?? "");

  return {
    id: row.id,
    kind: row.kind,
    user: {
      id: isGroup ? row.id : row.other_user_id ?? row.id,
      name: isGroup
        ? row.title?.trim() || "Group chat"
        : row.other_user_name?.trim() || "cruush user",
      pronouns: isGroup ? "" : row.other_user_pronouns?.join(", ") ?? "",
      photo: isGroup ? null : row.other_user_photo ?? null,
      ...(isGroup ? {} : { photoExplicit: row.other_user_photo_explicit === true }),
      ...(isGroup ? {} : { photoRelationship: { isMutualCruush: options.mutual === true, sharesCrowd: options.sharesCrowd === true, nsfwPhotoRestriction: options.nsfwPhotoRestriction } }),
      ...(isGroup || !row.other_user_side_badges ? {} : { sideBadges: row.other_user_side_badges }),
      ...(isGroup || !row.other_user_vibes?.length ? {} : { vibes: row.other_user_vibes.slice(0, 3) }),
      ...(isGroup ? {} : { travelling: row.other_user_travelling === true }),
      ...(isGroup || !row.other_user_last_active ? {} : { lastActive: formatLastActiveFromDate(row.other_user_last_active) })
    },
    distance: "Nearby",
    updatedAt: new Date(row.updated_at).toISOString(),
    lastMessage,
    unreadCount: row.unread_count ?? 0,
    pinned: row.pinned,
    muted: row.muted,
    notificationLevel: row.notification_level,
    ...(row.muted_until ? { mutedUntil: new Date(row.muted_until).toISOString() } : {}),
    mutual: options.mutual ?? false,
    ...(options.canMessage !== undefined ? { canMessage: options.canMessage } : {}),
    membersLabel: isGroup ? `${row.member_count} people` : undefined,
    tags: row.tags ?? [],
    ...(row.club_id ? { clubId: row.club_id } : {}),
    ...(row.current_user_role ? { currentUserRole: row.current_user_role } : {}),
    ...(row.disappearing_timer ? { disappearingTimer: row.disappearing_timer } : {}),
    ...(row.closed_at !== undefined ? { closed: Boolean(row.closed_at) } : {})
  };
}

async function getConversationRelationship(app: FastifyInstance, userId: string, conversation: ConversationRow) {
  if (conversation.kind !== "dm" || !conversation.other_user_id) {
    return null;
  }

  return getRelationshipPermissions(app, userId, conversation.other_user_id);
}

async function canReadConversation(
  app: FastifyInstance,
  userId: string,
  conversation: ConversationRow,
  relationshipOverride?: RelationshipPermissions | null
) {
  if (conversation.kind !== "dm") {
    return true;
  }

  if (!conversation.other_user_id) {
    return false;
  }

  const relationship = relationshipOverride ?? await getConversationRelationship(app, userId, conversation);
  return relationship?.canMessage ?? false;
}

async function getDirectConversationOptions(
  app: FastifyInstance,
  userId: string,
  row: ConversationRow,
  relationshipOverride?: RelationshipPermissions | null
) {
  if (row.kind !== "dm") {
    return {};
  }

  if (!row.other_user_id) {
    return {
      canMessage: false,
      mutual: false
    };
  }

  const relationship = relationshipOverride ?? await getConversationRelationship(app, userId, row);
  if (!relationship) {
    return {
      canMessage: false,
      mutual: false
    };
  }

  const canMessage = relationship.canMessage
    ? await canStartDirectMessage(app, userId, row.other_user_id, relationship)
    : false;

  const sharesCrowd = !relationship.isBlocked && (await loadSharedCrowdUserIds(app, userId, [row.other_user_id])).has(row.other_user_id);
  const audience = await getNsfwPhotoAudience(app, row.other_user_id);
  return {
    canMessage,
    mutual: relationship.isMutualCruush,
    sharesCrowd,
    nsfwPhotoRestriction: resolveNsfwPhotoRestriction(audience, { isMutualCruush: relationship.isMutualCruush, sharesCrowd })
  };
}

async function mapReadableConversationRow(
  app: FastifyInstance,
  userId: string,
  row: ConversationRow,
  relationship?: RelationshipPermissions | null
) {
  return mapConversationRow(app, row, {
    ...await getDirectConversationOptions(app, userId, row, relationship)
  });
}

async function filterReadableConversationRows(
  app: FastifyInstance,
  userId: string,
  rows: ConversationRow[],
  relationshipsByConversationId?: Map<string, RelationshipPermissions>
) {
  const readable = await Promise.all(rows.map(async (row) => {
    const relationship = await getConversationRelationship(app, userId, row);
    if (relationship && relationshipsByConversationId) {
      relationshipsByConversationId.set(row.id, relationship);
    }

    return canReadConversation(app, userId, row, relationship);
  }));

  return rows.filter((_, index) => readable[index]);
}

function mapMessageRow(app: FastifyInstance, row: MessageRow, relationships: Map<string, PhotoViewerRelationship>) {
  const attachments = normalizeMessageAttachments(row.attachments).map(({ ownerUserId, ...attachment }) => ({
    ...attachment,
    photoRelationship: ownerUserId ? relationships.get(ownerUserId) : undefined
  }));
  const hasSender = row.sender_name !== undefined ||
    row.sender_pronouns !== undefined ||
    row.sender_photo !== undefined;

  return {
    id: row.id,
    userId: row.user_id,
    content: decryptTextContentOrFallback(app.config, "message", {
      ciphertext: row.content_ciphertext ?? undefined,
      nonce: row.content_nonce ?? undefined,
      authTag: row.content_auth_tag ?? undefined,
      keyVersion: row.content_key_version ?? undefined
    }, row.content),
    timestamp: new Date(row.created_at).toISOString(),
    ...(row.read_at ? { readAt: new Date(row.read_at).toISOString() } : {}),
    ...(row.expires_at ? { expiresAt: new Date(row.expires_at).toISOString() } : {}),
    ...(hasSender ? {
      user: {
        id: row.user_id,
        name: row.sender_name?.trim() || "cruush user",
        pronouns: row.sender_pronouns?.join(", ") ?? "",
        photo: row.sender_photo ?? null,
        photoExplicit: row.sender_photo_explicit === true,
        photoRelationship: relationships.get(row.user_id)
      }
    } : {}),
    ...(attachments.length > 0 ? { attachments } : {})
  };
}

async function mapMessageRows(app: FastifyInstance, viewerUserId: string, rows: MessageRow[]) {
  const ownerIds = rows.flatMap((row) => [row.user_id, ...normalizeMessageAttachments(row.attachments).flatMap((attachment) => attachment.ownerUserId ? [attachment.ownerUserId] : [])]);
  const relationships = await loadPhotoViewerRelationships(app, viewerUserId, ownerIds);
  return rows.map((row) => mapMessageRow(app, row, relationships));
}

function mapFavoriteMessageImage(row: FavoriteMessageImageRow) {
  return {
    id: row.id,
    mediaObjectId: row.media_object_id,
    label: row.label ?? "",
    url: row.url ?? `/api/media/assets/${row.media_object_id}/display`,
    thumbnailUrl: row.thumbnail_url ?? `/api/media/assets/${row.media_object_id}/thumbnail`,
    mediaType: row.media_type,
    mimeType: row.mime_type,
    explicit: row.explicit,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

export async function notifyConversationMessageRecipients(
  app: FastifyInstance,
  input: {
    conversationId: string;
    senderUserId: string;
    messageId: string;
    conversationKind: "dm" | "group";
    clubId?: string | null;
    conversationTitle?: string | null;
    messageContent?: string | null;
  }
) {
  try {
    let recipientRows: ConversationNotificationRecipientRow[];
    if (input.clubId) {
      const members = await listClubMemberships({ config: app.config, db: app.db }, input.clubId);
      const recipients = members.filter((member) => member.payload.userId !== input.senderUserId);
      const indexes = recipients.map((member) => createClubEnrollmentUserIndex(app.config, member.payload.userId));
      const settings = indexes.length === 0 ? { rows: [] } : await app.db.query<{
        member_index: string;
        muted: boolean;
        notification_level: "all" | "mentions";
        sender_name: string | null;
        conversation_title: string | null;
      }>(
        `select cm.member_index,
           (cm.muted or (cm.muted_until is not null and cm.muted_until > now())) as muted,
           cm.notification_level,
           sender_profile.display_name as sender_name,
           c.title as conversation_title
         from conversation_members cm
         join conversations c on c.id = cm.conversation_id
         left join profiles sender_profile on sender_profile.id = $3
         where cm.conversation_id::text = $1 and cm.member_index = any($2::text[])`,
        [input.conversationId, indexes, input.senderUserId]
      );
      const settingsByIndex = new Map(settings.rows.map((row) => [row.member_index, row]));
      const profiles = recipients.length === 0 ? { rows: [] } : await app.db.query<{ user_id: string; recipient_name: string | null }>(
        "select id::text as user_id, display_name as recipient_name from profiles where id = any($1::uuid[])",
        [recipients.map((member) => member.payload.userId)]
      );
      const names = new Map(profiles.rows.map((row) => [row.user_id, row.recipient_name]));
      recipientRows = recipients.flatMap((member) => {
        const settingsRow = settingsByIndex.get(createClubEnrollmentUserIndex(app.config, member.payload.userId));
        return settingsRow ? [{
          user_id: member.payload.userId,
          muted: settingsRow.muted,
          notification_level: settingsRow.notification_level,
          recipient_name: names.get(member.payload.userId) ?? null,
          sender_name: settingsRow.sender_name,
          conversation_title: settingsRow.conversation_title
        }] : [];
      });
    } else {
      const recipients = await app.db.query<ConversationNotificationRecipientRow>(
        `select
         cm.user_id::text as user_id,
         (cm.muted or (cm.muted_until is not null and cm.muted_until > now())) as muted,
         cm.notification_level,
         recipient_profile.display_name as recipient_name,
         sender_profile.display_name as sender_name,
         c.title as conversation_title
       from conversation_members cm
       join conversations c on c.id = cm.conversation_id
       left join profiles sender_profile on sender_profile.id = $2
       left join profiles recipient_profile on recipient_profile.id = cm.user_id
       where cm.conversation_id::text = $1
         and cm.user_id <> $2`,
        [input.conversationId, input.senderUserId]
      );
      recipientRows = recipients.rows;
    }

    await Promise.all(recipientRows.map(async (recipient) => {
      const senderName = recipient.sender_name?.trim() || "Someone";
      const groupTitle = recipient.conversation_title?.trim() || input.conversationTitle?.trim() || "Group chat";
      const isGroup = input.conversationKind === "group";
      const messageText = input.messageContent?.toLocaleLowerCase() ?? "";
      const recipientMention = recipient.recipient_name?.trim().toLocaleLowerCase();
      const mentioned = messageText.includes("@everyone")
        || messageText.includes("@all")
        || Boolean(recipientMention && messageText.includes(`@${recipientMention}`));

      if (recipient.muted || (isGroup && recipient.notification_level === "mentions" && !mentioned)) {
        return;
      }

      await createAppNotificationAndPush(app, {
        userId: recipient.user_id,
        actorUserId: input.senderUserId,
        type: isGroup ? "group_message" : "direct_message",
        title: isGroup ? `New message in ${groupTitle}` : `${senderName} sent you a message`,
        body: "Open cruush to reply.",
        linkUrl: isGroup ? `/chat/group/${input.conversationId}` : `/chat/${input.conversationId}`,
        conversationId: input.conversationId,
        dedupeKey: `message:${input.messageId}:${recipient.user_id}`,
        metadata: {
          conversationKind: input.conversationKind
        },
        suppressPush: false,
        deferPush: true
      });
    }));
  } catch (error) {
    app.log.warn({ err: error, conversationId: input.conversationId }, "message notification dispatch failed");
  }
}

async function notifyGroupMembership(
  app: FastifyInstance,
  input: {
    conversationId: string;
    actorUserId: string;
    memberIds: string[];
    title?: string | null;
    eventKey: string;
  }
) {
  const groupTitle = input.title?.trim() || "Group chat";

  for (const memberId of input.memberIds) {
    try {
      await createAppNotificationAndPush(app, {
        userId: memberId,
        actorUserId: input.actorUserId,
        type: "group_membership",
        title: `You were added to ${groupTitle}`,
        body: "Open cruush to see the group.",
        linkUrl: `/chat/group/${input.conversationId}`,
        conversationId: input.conversationId,
        dedupeKey: `group:${input.eventKey}:${memberId}`,
        metadata: {
          conversationKind: "group"
        }
      });
    } catch (error) {
      app.log.warn({ err: error, conversationId: input.conversationId, memberId }, "group membership notification failed");
    }
  }
}

function getDirectMessageKey(userId: string, otherUserId: string) {
  return [userId, otherUserId].sort().join(":");
}

const CONVERSATION_SELECT = `
  select
    c.id::text as id,
    c.kind,
    c.title,
    c.tags,
    cm.role as current_user_role,
    c.disappearing_timer,
    c.closed_at,
    c.cleared_at,
    c.updated_at,
    coalesce(last_message.content, '') as last_message,
    last_message.content_ciphertext as last_message_ciphertext,
    last_message.content_nonce as last_message_nonce,
    last_message.content_auth_tag as last_message_auth_tag,
    last_message.content_key_version as last_message_key_version,
    coalesce(unread_counts.unread_count, 0) as unread_count,
    cm.pinned,
    (cm.muted or (cm.muted_until is not null and cm.muted_until > now())) as muted,
    cm.notification_level,
    cm.muted_until,
    case when c.kind = 'dm' then other_member.user_id::text else null end as other_user_id,
    case
      when c.kind = 'group' then c.title
      else coalesce(other_profile.display_name, other_user.display_name, other_user.email)
    end as other_user_name,
    other_profile.pronouns as other_user_pronouns,
    case when c.kind = 'dm' then other_profile.photos[1] else null end as other_user_photo,
    case when c.kind = 'dm' then to_jsonb(other_profile)->'side_badges' else null end as other_user_side_badges,
    -- Cruushes cards read vibes, scenes and archetypes as one set, so a
    -- message card shows the same three a profile card would.
    case when c.kind = 'dm' then (
      coalesce(other_profile.vibes, '{}'::text[])
      || coalesce(other_profile.scenes, '{}'::text[])
      || coalesce(other_profile.archetypes, '{}'::text[])
    ) else null end as other_user_vibes,
    case when c.kind = 'dm' then exists (
      select 1 from user_travel_pins travel
      where travel.user_id = other_member.user_id
        and travel.set_at > now() - interval '24 hours'
    ) else false end as other_user_travelling,
    case when c.kind = 'dm'
      then coalesce(other_profile.location_updated_at, other_profile.updated_at)
      else null
    end as other_user_last_active,
    case when c.kind = 'dm' then coalesce((
      select media.explicit_classification is distinct from 'non_explicit'
      from media_objects media
      where media.owner_user_id = other_member.user_id
        and media.public_url = other_profile.photos[1]
        and media.surface = 'profile_photo'
        and media.deleted_at is null
      limit 1
    ), true) else true end as other_user_photo_explicit,
    member_counts.member_count,
    linked_club.id::text as club_id
  from conversation_members cm
  join conversations c on c.id = cm.conversation_id
  left join lateral (
    select
      m.content,
      m.content_ciphertext,
      m.content_nonce,
      m.content_auth_tag,
      m.content_key_version,
      m.created_at
    from messages m
    where m.conversation_id = c.id
      and (m.expires_at is null or m.expires_at > now())
      and (c.cleared_at is null or m.created_at > c.cleared_at)
    order by m.created_at desc
    limit 1
  ) as last_message on true
  left join lateral (
    select count(*)::int as unread_count
    from messages m
    where m.conversation_id = c.id
      and m.user_id <> $1
      and m.created_at > coalesce(cm.last_read_at, to_timestamp(0))
      and (m.expires_at is null or m.expires_at > now())
      and (c.cleared_at is null or m.created_at > c.cleared_at)
  ) as unread_counts on true
  left join lateral (
    select count(*)::int as member_count
    from conversation_members members
    where members.conversation_id = c.id
  ) as member_counts on true
  left join conversation_members other_member
    on other_member.conversation_id = c.id
   and other_member.user_id <> $1
   and c.kind = 'dm'
  left join app_users other_user on other_user.id = other_member.user_id
  left join profiles other_profile on other_profile.id = other_member.user_id
  left join clubs linked_club on linked_club.conversation_id = c.id
`;

async function loadConversationForUser(app: FastifyInstance, userId: string, conversationId: string) {
  const result = await app.db.query<ConversationRow>(
    `${CONVERSATION_SELECT}
     where cm.user_id = $1 and c.id::text = $3
        or (cm.member_index = $2 and c.id::text = $3)
     limit 1`,
    [userId, createClubEnrollmentUserIndex(app.config, userId), conversationId]
  );
  const conversation = result.rows[0] ?? null;
  if (!conversation?.club_id) return conversation;
  const membership = await findClubEnrollment(
    { config: app.config, db: app.db },
    { clubId: conversation.club_id, userId, type: "membership" }
  );
  if (!membership?.payload.role) return null;
  return { ...conversation, current_user_role: membership.payload.role };
}

async function assertGroupAdmin(app: FastifyInstance, userId: string, conversationId: string) {
  const result = await app.db.query<GroupAccessRow & { club_id: string | null }>(
    `select cm.role, c.closed_at, linked_club.id::text as club_id
     from conversations c
     join conversation_members cm on cm.conversation_id = c.id
     left join clubs linked_club on linked_club.conversation_id = c.id
     where c.id::text = $1 and c.kind = 'group'
       and (cm.user_id = $2 or cm.member_index = $3)
     limit 1`,
    [conversationId, userId, createClubEnrollmentUserIndex(app.config, userId)]
  );
  const access = result.rows[0] ?? null;

  if (!access) {
    throw new ApiError(404, "NOT_FOUND", "Group conversation not found.");
  }

  if (access.club_id) {
    const membership = await findClubEnrollment(
      { config: app.config, db: app.db },
      { clubId: access.club_id, userId, type: "membership" }
    );
    access.role = membership?.payload.role ?? access.role;
  }

  if (!adminRoles.has(access.role)) {
    throw new ApiError(403, "FORBIDDEN", "Only group admins can manage this group.");
  }

  if (access.closed_at) {
    throw new ApiError(400, "FEATURE_RESTRICTED", "This group is closed.");
  }

  return access;
}

async function setClubMemberRole(
  app: FastifyInstance,
  clubId: string,
  targetUserId: string,
  role: ClubEnrollmentRole
) {
  const context = { config: app.config, db: app.db };
  const membership = await findClubEnrollment(context, { clubId, userId: targetUserId, type: "membership" });
  if (!membership || membership.payload.role === "owner") return false;
  await upsertClubEnrollment(context, buildClubEnrollmentPayload({
    ...membership.payload,
    type: "membership",
    status: "active",
    role,
    createdAt: membership.payload.createdAt
  }));
  return true;
}

async function assertMutualGroupInvitees(app: FastifyInstance, userId: string, memberIds: string[]) {
  for (const memberId of memberIds) {
    const relationship = await getRelationshipPermissions(app, userId, memberId);
    if (!relationship.canMessage || !relationship.isMutualCruush) {
      throw new ApiError(403, "MUTUAL_CRUUSH_REQUIRED", "Groups can only include mutual cruushes.");
    }
  }
}

async function assertNoBlockedConversationMembers(app: FastifyInstance, userId: string, conversationId: string, clubId?: string | null) {
  if (clubId) {
    const members = await listClubMemberships({ config: app.config, db: app.db }, clubId);
    const memberIds = members.map((member) => member.payload.userId).filter((id) => id !== userId);
    if (memberIds.length === 0) return;
    const blocked = await app.db.query(
      `select 1 from user_blocks block
       where (block.blocker_user_id = $1 and block.blocked_user_id = any($2::uuid[]))
          or (block.blocked_user_id = $1 and block.blocker_user_id = any($2::uuid[]))
       limit 1`,
      [userId, memberIds]
    );
    if (blocked.rows[0]) throw new ApiError(403, "FORBIDDEN", "You cannot message one or more blocked group members.");
    return;
  }
  const result = await app.db.query<{ user_id: string }>(
    `select member.user_id::text as user_id
     from conversation_members member
     join user_blocks block
       on (
         (block.blocker_user_id = $1 and block.blocked_user_id = member.user_id)
         or (block.blocker_user_id = member.user_id and block.blocked_user_id = $1)
       )
     where member.conversation_id::text = $2
       and member.user_id <> $1
     limit 1`,
    [userId, conversationId]
  );

  if (result.rows[0]) {
    throw new ApiError(403, "FORBIDDEN", "You cannot message one or more blocked group members.");
  }
}

function assertCanManageConversation(conversation: ConversationRow, action: "timer" | "clear" | "delete") {
  if (conversation.kind !== "group") {
    return;
  }

  if (!conversation.current_user_role || !adminRoles.has(conversation.current_user_role)) {
    throw new ApiError(403, "FORBIDDEN", "Only group admins can manage this group.");
  }

  if (action === "timer" && conversation.closed_at) {
    throw new ApiError(400, "FEATURE_RESTRICTED", "This group is closed.");
  }
}

function expirationSql(timerParam: string) {
  return `case
             when ${timerParam} = '5m' then now() + interval '5 minutes'
             when ${timerParam} = '1h' then now() + interval '1 hour'
             when ${timerParam} = '8h' then now() + interval '8 hours'
             when ${timerParam} = '24h' then now() + interval '24 hours'
             when ${timerParam} = '3d' then now() + interval '3 days'
             when ${timerParam} = '7d' then now() + interval '7 days'
             when ${timerParam} = '30d' then now() + interval '30 days'
             when ${timerParam} = '90d' then now() + interval '90 days'
             else null
           end`;
}

async function sendEncryptedMessageMedia(app: FastifyInstance, reply: FastifyReply, mediaObject: EncryptedMessageMediaRow) {
  const encryptedBytes = await readEncryptedMediaObject(app.config, mediaObject.object_key);
  const bytes = decryptMediaBytes(app.config, {
    ciphertext: encryptedBytes,
    nonce: mediaObject.content_nonce,
    authTag: mediaObject.content_auth_tag,
    encryptedDataKey: mediaObject.encrypted_data_key,
    dataKeyNonce: mediaObject.data_key_nonce,
    dataKeyAuthTag: mediaObject.data_key_auth_tag,
    keyVersion: mediaObject.key_version
  });

  return reply
    .type(mediaObject.mime_type)
    .header("cache-control", "no-store")
    .send(bytes);
}

export async function registerMessageRoutes(app: FastifyInstance) {
  app.post("/api/conversations/dm", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const payload = openDirectConversationPayloadSchema.parse(request.body);

    if (payload.otherUserId === userId) {
      throw new ApiError(400, "VALIDATION_ERROR", "You cannot create a direct conversation with yourself.");
    }

    const relationship = await getRelationshipPermissions(app, userId, payload.otherUserId);
    if (!relationship.canMessage) {
      throw new ApiError(403, "FORBIDDEN", "You cannot message this user.");
    }

    const existingUser = await app.db.query<ExistingUserRow>(
      `select id::text as id
       from app_users
       where id = $1
       limit 1`,
      [payload.otherUserId]
    );

    if (!existingUser.rows[0]) {
      throw new ApiError(404, "NOT_FOUND", "User not found.");
    }

    const dmKey = getDirectMessageKey(userId, payload.otherUserId);
    let conversationInsertResult: { rows: Array<{ id: string }> };

    try {
      conversationInsertResult = await app.db.query<{ id: string }>(
        `insert into conversations (kind, dm_key, created_by)
         values ('dm', $1, $2)
         on conflict (dm_key) do update
         set updated_at = conversations.updated_at
         returning id::text as id`,
        [dmKey, userId]
      );
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: string }).code)
        : "";

      if (code !== "42P10") {
        throw error;
      }

      app.log.warn({ err: error }, "direct conversation conflict constraint unavailable");
      conversationInsertResult = await app.db.query<{ id: string }>(
        `with existing as (
           select id::text as id
           from conversations
           where dm_key = $1
           order by created_at asc
           limit 1
         ), inserted as (
           insert into conversations (kind, dm_key, created_by)
           select 'dm', $1, $2
           where not exists (select 1 from existing)
           returning id::text as id
         )
         select id from existing
         union all
         select id from inserted
         limit 1`,
        [dmKey, userId]
      );
    }

    const conversationId = conversationInsertResult.rows[0]?.id;

    if (!conversationId) {
      throw new ApiError(500, "INTERNAL_ERROR", "Failed to create conversation.");
    }

    await app.db.query(
      `insert into conversation_members (conversation_id, user_id, last_read_at)
       select requested.conversation_id, requested.user_id, requested.last_read_at
       from (values ($1, $2, now()), ($1, $3, null)) as requested(conversation_id, user_id, last_read_at)
       where not exists (
         select 1
         from conversation_members existing
         where existing.conversation_id = requested.conversation_id
           and existing.user_id = requested.user_id
       )`,
      [conversationId, userId, payload.otherUserId]
    );

    return reply.code(201).send({
      data: { id: conversationId }
    });
  });

  app.post("/api/conversations/groups", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const payload = createGroupConversationPayloadSchema.parse(request.body);
    const memberIds = [...new Set(payload.memberIds.filter((memberId) => memberId !== userId))];
    if (memberIds.length >= MAX_GROUP_CONVERSATION_MEMBERS) {
      throw new ApiError(400, "VALIDATION_ERROR", `Groups can have at most ${MAX_GROUP_CONVERSATION_MEMBERS} members.`);
    }
    const ownerFullAccess = await userHasOwnerFullAccess(app, userId);

    await assertMutualGroupInvitees(app, userId, memberIds);

    const result = await app.db.query<ConversationRow>(
      `with eligible_creator as (
         select u.id
         from app_users u
         left join user_trust_profiles trust on trust.user_id = u.id
         where u.id = $1
           and (
             $5::boolean
             or (
               coalesce(trust.is_suspended, false) = false
               and coalesce(trust.trust_score, 50) > 20
               and not exists (
                 select 1
                 from suspensions suspension
                 where suspension.user_id = u.id
                   and (suspension.permanent or suspension.ends_at is null or suspension.ends_at > now())
               )
               and not exists (
                 select 1
                 from feature_restrictions restriction
                 where restriction.user_id = u.id
                   and restriction.feature = 'group_creation'
                   and (restriction.ends_at is null or restriction.ends_at > now())
               )
             )
           )
       ), inserted_conversation as (
         insert into conversations (kind, title, created_by, disappearing_timer)
         select 'group', $2, eligible_creator.id, $4
         from eligible_creator
         returning id
       ), requested_members as (
         select distinct member_id
         from unnest(array_prepend($1::uuid, $3::uuid[])) as requested(member_id)
       ), existing_members as (
         select app_users.id
         from app_users
         join requested_members on requested_members.member_id = app_users.id
       ), inserted_members as (
         insert into conversation_members (conversation_id, user_id, role, last_read_at)
         select
           inserted_conversation.id,
           existing_members.id,
           case when existing_members.id = $1 then 'owner' else 'member' end,
           case when existing_members.id = $1 then now() else null end
         from inserted_conversation
         join existing_members on true
         on conflict (conversation_id, user_id) do nothing
       )
       ${CONVERSATION_SELECT}
       where cm.user_id = $1
         and c.id = (select id from inserted_conversation)
       limit 1`,
      [userId, payload.title, memberIds, payload.disappearingTimer, ownerFullAccess]
    );
    const conversation = result.rows[0];

    if (!conversation) {
      throw new ApiError(403, "FEATURE_RESTRICTED", "Group creation is unavailable for this account.");
    }

    await notifyGroupMembership(app, {
      conversationId: conversation.id,
      actorUserId: userId,
      memberIds,
      title: conversation.title,
      eventKey: `created:${conversation.id}`
    });

    return reply.code(201).send({
      data: mapConversationRow(app, conversation)
    });
  });

  app.patch("/api/conversations/groups/:conversationId", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const { conversationId } = conversationParamsSchema.parse(request.params);
    const payload = updateGroupConversationPayloadSchema.parse(request.body);
    await assertGroupAdmin(app, userId, conversationId);

    const result = await app.db.query<{ id: string }>(
      `update conversations
       set title = coalesce($2, title),
           disappearing_timer = coalesce($3, disappearing_timer),
           updated_at = now()
       where id::text = $1
         and kind = 'group'
       returning id::text as id`,
      [conversationId, payload.title ?? null, payload.disappearingTimer ?? null]
    );
    const conversation = result.rows[0]
      ? await loadConversationForUser(app, userId, conversationId)
      : null;

    if (!conversation) {
      throw new ApiError(404, "NOT_FOUND", "Group conversation not found.");
    }

    return reply.send({
      data: mapConversationRow(app, conversation)
    });
  });

  app.post("/api/conversations/groups/:conversationId/members", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const { conversationId } = conversationParamsSchema.parse(request.params);
    const payload = groupMemberPayloadSchema.parse(request.body);
    const access = await assertGroupAdmin(app, userId, conversationId);
    await assertMutualGroupInvitees(app, userId, [payload.userId]);

    if (access.club_id) {
      const context = { config: app.config, db: app.db };
      const members = await listClubMemberships(context, access.club_id);
      const existing = members.find((member) => member.payload.userId === payload.userId);
      if (!existing && members.length >= 1000) {
        throw new ApiError(409, "VALIDATION_ERROR", "This conversation has reached its member limit.");
      }
      if (!existing) {
        await upsertClubEnrollment(context, buildClubEnrollmentPayload({
          type: "membership",
          status: "active",
          clubId: access.club_id,
          userId: payload.userId,
          role: "member"
        }));
        await app.db.query(
          `insert into conversation_members (conversation_id, user_id, member_index, role)
           values ($1, null, $2, 'member')
           on conflict (conversation_id, member_index) where member_index is not null do nothing`,
          [conversationId, createClubEnrollmentUserIndex(app.config, payload.userId)]
        );
      }
      await notifyGroupMembership(app, {
        conversationId,
        actorUserId: userId,
        memberIds: [payload.userId],
        eventKey: `member:${conversationId}:${payload.userId}`
      });
      return reply.code(204).send();
    }

    const result = await app.db.query<{ id: string | null; member_limit_reached: boolean }>(
      `with target_membership as (
         select c.id as conversation_id,
                u.id as user_id,
                count(existing_member.user_id)::int as member_count,
                exists (
                  select 1 from conversation_members current_member
                  where current_member.conversation_id = c.id and current_member.user_id = u.id
                ) as already_member
         from conversations c
         join app_users u on u.id = $2
         left join conversation_members existing_member on existing_member.conversation_id = c.id
         where c.id::text = $1
           and c.kind = 'group'
           and c.closed_at is null
         group by c.id, u.id
       ), capacity as (
         select *,
           already_member or member_count < $3 as can_add
         from target_membership
       ), inserted_conversation_member as (
         insert into conversation_members (conversation_id, user_id, role)
         select conversation_id, user_id, 'member' from capacity where can_add
         on conflict (conversation_id, user_id) do update
         set role = conversation_members.role
         returning user_id
       )
       select inserted_conversation_member.user_id::text as id, false as member_limit_reached
       from inserted_conversation_member
       union all
       select null::text as id, true as member_limit_reached
       from capacity
       where not can_add
       limit 1`,
      [conversationId, payload.userId, MAX_GROUP_CONVERSATION_MEMBERS]
    );

    if (result.rows[0]?.member_limit_reached) {
      throw new ApiError(409, "VALIDATION_ERROR", "This conversation has reached its member limit.");
    }
    if (!result.rows[0]) {
      throw new ApiError(404, "NOT_FOUND", "User or group not found.");
    }

    await notifyGroupMembership(app, {
      conversationId,
      actorUserId: userId,
      memberIds: [payload.userId],
      eventKey: `member:${conversationId}:${payload.userId}`
    });

    return reply.code(204).send();
  });

  app.delete("/api/conversations/groups/:conversationId/members/:targetUserId", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const { conversationId, targetUserId } = groupMemberParamsSchema.parse(request.params);
    const access = await assertGroupAdmin(app, userId, conversationId);

    if (access.club_id) {
      const context = { config: app.config, db: app.db };
      const membership = await findClubEnrollment(context, { clubId: access.club_id, userId: targetUserId, type: "membership" });
      if (!membership || membership.payload.role === "owner") {
        throw new ApiError(400, "VALIDATION_ERROR", "Group owners cannot be removed.");
      }
      await runTransaction(app.db, async (db) => {
        await deleteClubEnrollment({ config: app.config, db }, { clubId: access.club_id!, userId: targetUserId, type: "membership" });
        await db.query(
          "delete from conversation_members where conversation_id::text = $1 and member_index = $2",
          [conversationId, createClubEnrollmentUserIndex(app.config, targetUserId)]
        );
      });
      return reply.code(204).send();
    }

    const result = await app.db.query<{ id: string }>(
      `with target_membership as (
         select member.conversation_id, member.user_id
         from conversation_members member
         where member.conversation_id::text = $1
           and member.user_id = $2
           and member.role <> 'owner'
       ), removed_conversation_member as (
         delete from conversation_members member
         using target_membership target
         where member.conversation_id = target.conversation_id
           and member.user_id = target.user_id
         returning member.user_id::text as id
       )
       select id from removed_conversation_member`,
      [conversationId, targetUserId]
    );

    if (!result.rows[0]) {
      throw new ApiError(400, "VALIDATION_ERROR", "Group owners cannot be removed.");
    }

    return reply.code(204).send();
  });

  app.post("/api/conversations/groups/:conversationId/admins", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const { conversationId } = conversationParamsSchema.parse(request.params);
    const payload = groupMemberPayloadSchema.parse(request.body);
    const access = await assertGroupAdmin(app, userId, conversationId);
    if (access.club_id) {
      if (!await setClubMemberRole(app, access.club_id, payload.userId, "admin")) {
        throw new ApiError(404, "NOT_FOUND", "Group member not found.");
      }
      return reply.code(204).send();
    }

    const result = await app.db.query<{ id: string }>(
      `update conversation_members
       set role = 'admin'
       where conversation_id::text = $1
         and user_id = $2
         and role <> 'owner'
       returning user_id::text as id`,
      [conversationId, payload.userId]
    );

    if (!result.rows[0]) {
      throw new ApiError(404, "NOT_FOUND", "Group member not found.");
    }

    return reply.code(204).send();
  });

  app.delete("/api/conversations/groups/:conversationId/admins/:targetUserId", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const { conversationId, targetUserId } = groupMemberParamsSchema.parse(request.params);
    const access = await assertGroupAdmin(app, userId, conversationId);
    if (access.club_id) {
      const membership = await findClubEnrollment(
        { config: app.config, db: app.db },
        { clubId: access.club_id, userId: targetUserId, type: "membership" }
      );
      if (membership?.payload.role !== "admin" || !await setClubMemberRole(app, access.club_id, targetUserId, "member")) {
        throw new ApiError(404, "NOT_FOUND", "Group admin not found.");
      }
      return reply.code(204).send();
    }

    const result = await app.db.query<{ id: string }>(
      `update conversation_members
       set role = 'member'
       where conversation_id::text = $1
         and user_id = $2
         and role = 'admin'
       returning user_id::text as id`,
      [conversationId, targetUserId]
    );

    if (!result.rows[0]) {
      throw new ApiError(404, "NOT_FOUND", "Group admin not found.");
    }

    return reply.code(204).send();
  });

  app.patch("/api/conversations/groups/:conversationId/members/:targetUserId/club-role", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const { conversationId, targetUserId } = groupMemberParamsSchema.parse(request.params);
    const { role } = clubMemberRolePayloadSchema.parse(request.body);
    const access = await assertGroupAdmin(app, userId, conversationId);
    if (!access.club_id || !await setClubMemberRole(app, access.club_id, targetUserId, role)) {
      throw new ApiError(404, "NOT_FOUND", "Club member not found.");
    }

    return reply.code(204).send();
  });

  app.post("/api/conversations/groups/:conversationId/close", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const { conversationId } = conversationParamsSchema.parse(request.params);
    await assertGroupAdmin(app, userId, conversationId);

    await app.db.query(
      `update conversations
       set closed_at = coalesce(closed_at, now()),
           updated_at = now()
       where id::text = $1
         and kind = 'group'`,
      [conversationId]
    );

    return reply.code(204).send();
  });

  app.patch("/api/conversations/:conversationId/disappearing-timer", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const { conversationId } = conversationParamsSchema.parse(request.params);
    const payload = updateConversationTimerPayloadSchema.parse(request.body);
    const conversation = await loadConversationForUser(app, userId, conversationId);

    if (!conversation) {
      throw new ApiError(404, "NOT_FOUND", "Conversation not found.");
    }

    assertCanManageConversation(conversation, "timer");

    const result = await app.db.query<{ id: string }>(
      `update conversations
       set disappearing_timer = $2,
           updated_at = now()
       where id::text = $1
       returning id::text as id`,
      [conversationId, payload.disappearingTimer]
    );
    const updated = result.rows[0]
      ? await loadConversationForUser(app, userId, conversationId)
      : null;

    if (!updated) {
      throw new ApiError(404, "NOT_FOUND", "Conversation not found.");
    }

    return reply.send({
      data: mapConversationRow(app, updated)
    });
  });

  app.patch("/api/conversations/:conversationId/notifications", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const { conversationId } = conversationParamsSchema.parse(request.params);
    const payload = updateConversationNotificationsPayloadSchema.parse(request.body);
    const conversation = await loadConversationForUser(app, userId, conversationId);

    if (!conversation || conversation.kind !== "group") {
      throw new ApiError(404, "NOT_FOUND", "Group or Club conversation not found.");
    }

    const result = await app.db.query<{ id: string }>(
      `update conversation_members
       set notification_level = coalesce($3, notification_level),
           muted = case when $4::text is not null then false else muted end,
           muted_until = case $4::text
             when 'off' then null
             when '1h' then now() + interval '1 hour'
             when '8h' then now() + interval '8 hours'
             when '24h' then now() + interval '24 hours'
             when '7d' then now() + interval '7 days'
             else muted_until
           end
       where conversation_id::text = $1
         and (user_id = $2 or member_index = $5)
       returning conversation_id::text as id`,
      [
        conversationId,
        userId,
        payload.notificationLevel ?? null,
        payload.muteFor ?? null,
        createClubEnrollmentUserIndex(app.config, userId)
      ]
    );
    const updated = result.rows[0]
      ? await loadConversationForUser(app, userId, conversationId)
      : null;

    if (!updated) {
      throw new ApiError(404, "NOT_FOUND", "Group or Club conversation not found.");
    }

    return reply.send({ data: mapConversationRow(app, updated) });
  });

  app.post("/api/conversations/:conversationId/clear-for-everyone", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const { conversationId } = conversationParamsSchema.parse(request.params);
    const conversation = await loadConversationForUser(app, userId, conversationId);

    if (!conversation) {
      throw new ApiError(404, "NOT_FOUND", "Conversation not found.");
    }

    const result = await app.db.query<{ id: string }>(
      `update conversations
       set cleared_at = now(),
           cleared_by = $2,
           updated_at = now()
       where id::text = $1
       returning id::text as id`,
      [conversationId, userId]
    );
    const updated = result.rows[0]
      ? await loadConversationForUser(app, userId, conversationId)
      : null;

    if (!updated) {
      throw new ApiError(404, "NOT_FOUND", "Conversation not found.");
    }

    return reply.send({
      data: mapConversationRow(app, updated)
    });
  });

  app.delete("/api/conversations/:conversationId", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const { conversationId } = conversationParamsSchema.parse(request.params);
    const conversation = await loadConversationForUser(app, userId, conversationId);

    if (!conversation) {
      throw new ApiError(404, "NOT_FOUND", "Conversation not found.");
    }

    assertCanManageConversation(conversation, "delete");

    const result = await app.db.query<{ id: string }>(
      `delete from conversations
       where id::text = $1
       returning id::text as id`,
      [conversationId]
    );

    if (!result.rows[0]) {
      throw new ApiError(404, "NOT_FOUND", "Conversation not found.");
    }

    return reply.code(204).send();
  });

  app.get("/api/conversations/groups/:conversationId/members", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    const { conversationId } = conversationParamsSchema.parse(request.params);
    const conversation = await loadConversationForUser(app, userId, conversationId);

    if (!conversation || conversation.kind !== "group") {
      throw new ApiError(404, "NOT_FOUND", "Group conversation not found.");
    }

    if (conversation.club_id) {
      const memberships = await listClubMemberships({ config: app.config, db: app.db }, conversation.club_id);
      const memberIds = memberships.map((membership) => membership.payload.userId);
      const result = memberIds.length === 0 ? { rows: [] } : await app.db.query<Omit<GroupMemberRow, "role" | "joined_at">>(
        `select app_user.id::text as id,
           coalesce(profile.display_name, app_user.display_name, app_user.email) as name,
           profile.pronouns,
           profile.photos[1] as photo,
           coalesce((
             select media.explicit_classification is distinct from 'non_explicit'
             from media_objects media
             where media.owner_user_id = app_user.id
               and media.public_url = profile.photos[1]
               and media.surface = 'profile_photo'
               and media.deleted_at is null
             limit 1
           ), true) as photo_explicit
         from app_users app_user
         left join profiles profile on profile.id = app_user.id
         where app_user.id = any($1::uuid[])`,
        [memberIds]
      );
      const profiles = new Map(result.rows.map((row) => [row.id, row]));
      const photoRelationships = await loadPhotoViewerRelationships(app, userId, memberIds);
      return reply.send({
        data: memberships.flatMap((membership) => {
          const row = profiles.get(membership.payload.userId);
          return row ? [{
            id: row.id,
            name: row.name?.trim() || "cruush user",
            pronouns: row.pronouns?.join(", ") ?? "",
            photo: row.photo ?? null,
            photoExplicit: row.photo_explicit === true,
            photoRelationship: photoRelationships.get(row.id),
            role: membership.payload.role ?? "member",
            joinedAt: membership.payload.createdAt
          }] : [];
        })
      });
    }

    const result = await app.db.query<GroupMemberRow>(
      `select
         member.user_id::text as id,
         coalesce(profile.display_name, app_user.display_name, app_user.email) as name,
         profile.pronouns,
         profile.photos[1] as photo,
         coalesce((
           select media.explicit_classification is distinct from 'non_explicit'
           from media_objects media
           where media.owner_user_id = member.user_id
             and media.public_url = profile.photos[1]
             and media.surface = 'profile_photo'
             and media.deleted_at is null
           limit 1
         ), true) as photo_explicit,
         member.role,
         member.joined_at
       from conversation_members member
       join app_users app_user on app_user.id = member.user_id
       left join profiles profile on profile.id = member.user_id
       where member.conversation_id::text = $1
       order by
         case member.role when 'owner' then 0 when 'admin' then 1 when 'moderator' then 2 else 3 end,
         member.joined_at asc`,
      [conversationId]
    );

    const photoRelationships = await loadPhotoViewerRelationships(app, userId, result.rows.map((row) => row.id));
    return reply.send({
      data: result.rows.map((row) => ({
        id: row.id,
        name: row.name?.trim() || "cruush user",
        pronouns: row.pronouns?.join(", ") ?? "",
        photo: row.photo ?? null,
        photoExplicit: row.photo_explicit === true,
        photoRelationship: photoRelationships.get(row.id),
        role: row.role,
        joinedAt: new Date(row.joined_at).toISOString()
      }))
    });
  });

  app.post("/api/conversations/groups/:conversationId/pulse", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const { conversationId } = conversationParamsSchema.parse(request.params);
    const payload = groupPulsePayloadSchema.parse(request.body);

    await app.rateLimiter.assert({
      key: `group-pulses:create:${userId}`,
      max: 5,
      windowMs: 60_000,
      message: "Too many Pulse attempts. Try again shortly."
    });

    const status = await createGroupPulse(app, {
      userId,
      conversationId,
      idempotencyKey: payload.idempotencyKey
    });

    return reply.code(201).send({ data: status });
  });

  app.get("/api/conversations", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);

    const result = await app.db.query<ConversationRow>(
      `${CONVERSATION_SELECT}
       where (cm.user_id = $1 or cm.member_index = $2)
       order by greatest(c.updated_at, coalesce(last_message.created_at, c.updated_at)) desc`,
      [userId, createClubEnrollmentUserIndex(app.config, userId)]
    );
    const authorizedRows = (await Promise.all(result.rows.map(async (row) => {
      if (!row.club_id) return row;
      const membership = await findClubEnrollment(
        { config: app.config, db: app.db },
        { clubId: row.club_id, userId, type: "membership" }
      );
      return membership?.payload.role ? { ...row, current_user_role: membership.payload.role } : null;
    }))).filter((row): row is ConversationRow => row !== null);
    const relationshipsByConversationId = new Map<string, RelationshipPermissions>();
    const rows = await filterReadableConversationRows(app, userId, authorizedRows, relationshipsByConversationId);

    return reply.send({
      data: await Promise.all(rows.map((row) => mapReadableConversationRow(
        app,
        userId,
        row,
        relationshipsByConversationId.get(row.id)
      )))
    });
  });

  app.get("/api/messages/favorite-images", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    const result = await app.db.query<FavoriteMessageImageRow>(
      `select
         favorite.id::text,
         favorite.media_object_id::text,
         favorite.label,
         media.public_url as url,
         '/api/media/assets/' || media.id::text || '/thumbnail' as thumbnail_url,
         media.media_type,
         coalesce(display_variant.mime_type, media.mime_type) as mime_type,
         media.explicit_classification is distinct from 'non_explicit' as explicit,
         favorite.created_at,
         favorite.updated_at
       from message_favorite_images favorite
       join media_objects media on media.id = favorite.media_object_id
       left join media_variants display_variant
         on display_variant.media_object_id = media.id
        and display_variant.variant_type = 'display'
        and display_variant.deleted_at is null
       where favorite.user_id = $1
         and media.owner_user_id = $1
         and media.surface = 'message_photo'
         and media.moderation_status = 'approved'
         and media.deleted_at is null
       order by favorite.created_at desc
       limit 100`,
      [userId]
    );

    return reply.send({
      data: {
        images: result.rows.map(mapFavoriteMessageImage)
      }
    });
  });

  app.post("/api/messages/favorite-images", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);

    if (!photoUploadAvailability(app.config).messagePhotos) {
      throw new ApiError(503, "FEATURE_RESTRICTED", "Message photo uploads are temporarily unavailable.");
    }

    await app.rateLimiter.assert({
      key: `message-favorite-image-upload:${userId}`,
      max: 20,
      windowMs: 60 * 1000,
      message: "Too many favorite image uploads. Try again later."
    });

    const fields: Record<string, string> = {};
    let upload: {
      filename: string;
      mimetype: string;
      buffer: Buffer;
      truncated: boolean;
    } | null = null;

    try {
      for await (const part of request.parts({
        limits: {
          fileSize: MAX_IMAGE_BYTES,
          files: 1,
          fields: 1
        }
      })) {
        if (part.type === "file") {
          if (part.fieldname !== "photo") {
            throw new ApiError(400, "VALIDATION_ERROR", "Upload a favorite image in the photo field.");
          }

          upload = {
            filename: part.filename,
            mimetype: part.mimetype,
            buffer: await part.toBuffer(),
            truncated: part.file.truncated
          };
          continue;
        }

        if (part.fieldname === "label") {
          fields.label = String(part.value ?? "");
        }
      }
    } catch (error) {
      throw toMessagePhotoUploadError(error);
    }

    const payload = favoriteMessageImageUploadFieldsSchema.parse(fields);

    if (!upload) {
      throw new ApiError(400, "VALIDATION_ERROR", "Upload a favorite image in the photo field.");
    }

    if (upload.buffer.length === 0) {
      throw new ApiError(400, "VALIDATION_ERROR", "Favorite image cannot be empty.");
    }

    if (upload.buffer.length > MAX_IMAGE_BYTES || upload.truncated) {
      throw new ApiError(400, "VALIDATION_ERROR", "Message photo must be 5 MB or smaller.");
    }

    const processed = await processUploadedImage(upload.buffer, upload.mimetype);
    const ownerFullAccess = await userHasOwnerFullAccess(app, userId);
    const pendingAsset = await createPendingMediaAsset(app, request, {
      ownerUserId: userId,
      surface: "message_photo",
      processed,
      moderationHold: {
        kind: "favorite_image",
        label: payload.label.trim()
      }
    });

    try {
      const mediaAsset = await moderatePendingMediaAsset(app, request, pendingAsset, {
        filename: upload.filename,
        moderationSurface: "direct_message"
      });
      const isAdultExplicit = mediaAsset.moderation.labels.some((label) =>
        label.normalized_label === "adult_nudity" || label.normalized_label === "adult_explicit"
      );
      await assertCanSaveFavoriteMessageImage(app, userId, ownerFullAccess);

      const favorite = await runTransaction(app.db, async (db) => {
        const approved = await db.query<{ id: string }>(
          `update media_objects media
           set public_url = $3,
               moderation_status = 'approved',
               moderation_provider = $4,
               moderation_provider_version = $5,
               moderation_scores = $6::jsonb,
               moderation_decided_at = now(),
               moderation_failure_reason = null,
               moderation_attempts = 0,
               moderation_next_retry_at = null,
               moderation_hold = null,
               explicit_classification = case when $7 then 'explicit' else 'non_explicit' end,
               photodna_status = $8,
               photodna_provider_request_id = $9
           where media.id = $2
             and media.owner_user_id = $1
             and media.surface = 'message_photo'
             and media.deleted_at is null
           returning media.id::text as id`,
          [
            userId,
            mediaAsset.id,
            mediaAsset.displayUrl,
            mediaAsset.moderation.provider,
            mediaAsset.moderation.providerVersion,
            JSON.stringify(mediaAsset.moderation.labels),
            isAdultExplicit,
            mediaAsset.moderation.photoDnaStatus,
            mediaAsset.moderation.photoDnaProviderRequestId
          ]
        );

        if (!approved.rows[0]) {
          throw new ApiError(500, "INTERNAL_ERROR", "Favorite image media could not be saved.");
        }

        const review = await db.query<{ id: string }>(
          `insert into content_reviews (
             user_id,
             surface,
             content_type,
             status,
             content_id,
             content_ref,
             provider,
             provider_request_id,
             normalized_labels,
             policy_decision,
             moderation_status,
             flagged_reason,
             moderation_provider,
             moderation_raw_result,
             completed_at
           ) values (
             $1,
             'direct_message',
             'image',
             'allowed',
             $2::text,
             jsonb_build_object('assetId', $2::text, 'surface', 'message_photo', 'favorite', true),
             $3,
             $4,
             $5::jsonb,
             $6::jsonb,
             'allowed',
             null,
             $3,
             $7::jsonb,
             now()
           )
           returning id::text as id`,
          [
            userId,
            mediaAsset.id,
            mediaAsset.moderation.provider,
            mediaAsset.moderation.providerRequestId,
            JSON.stringify(mediaAsset.moderation.labels),
            JSON.stringify(mediaAsset.moderation.decision),
            JSON.stringify(mediaAsset.moderation.rawResult)
          ]
        );
        const reviewId = review.rows[0]?.id;

        if (!reviewId) {
          throw new ApiError(500, "INTERNAL_ERROR", "Favorite image review could not be saved.");
        }

        await db.query(
          `update media_objects
           set content_review_id = $2
           where id = $1
             and owner_user_id = $3
             and deleted_at is null`,
          [mediaAsset.id, reviewId, userId]
        );

        const savedFavorite = await db.query<FavoriteMessageImageRow>(
          `with favorite as (
             insert into message_favorite_images (user_id, media_object_id, label)
             values ($1, $2, $3)
             on conflict (user_id, media_object_id) do update
             set label = excluded.label,
                 updated_at = now()
             returning id::text, media_object_id::text, label, created_at, updated_at
           )
           select
             favorite.id,
             favorite.media_object_id,
             favorite.label,
             media.public_url as url,
             '/api/media/assets/' || media.id::text || '/thumbnail' as thumbnail_url,
             media.media_type,
             coalesce(display_variant.mime_type, media.mime_type) as mime_type,
             media.explicit_classification is distinct from 'non_explicit' as explicit,
             favorite.created_at,
             favorite.updated_at
           from favorite
           join media_objects media on media.id::text = favorite.media_object_id
           left join media_variants display_variant
             on display_variant.media_object_id = media.id
            and display_variant.variant_type = 'display'
            and display_variant.deleted_at is null`,
          [userId, mediaAsset.id, payload.label.trim()]
        );
        const saved = savedFavorite.rows[0];

        if (!saved) {
          throw new ApiError(500, "INTERNAL_ERROR", "Favorite image could not be saved.");
        }

        return saved;
      });

      const refreshedFavorite = await app.db.query<FavoriteMessageImageRow>(
        `select
           favorite.id::text,
           favorite.media_object_id::text,
           favorite.label,
           media.public_url as url,
           '/api/media/assets/' || media.id::text || '/thumbnail' as thumbnail_url,
           media.media_type,
           coalesce(display_variant.mime_type, media.mime_type) as mime_type,
           media.explicit_classification is distinct from 'non_explicit' as explicit,
           favorite.created_at,
           favorite.updated_at
         from message_favorite_images favorite
         join media_objects media on media.id = favorite.media_object_id
         left join media_variants display_variant
           on display_variant.media_object_id = media.id
          and display_variant.variant_type = 'display'
          and display_variant.deleted_at is null
         where favorite.id::text = $1
           and favorite.user_id = $2
         limit 1`,
        [favorite.id, userId]
      );
      const committedFavorite = refreshedFavorite.rows[0] ?? favorite;

      return reply.code(201).send({
        data: mapFavoriteMessageImage(committedFavorite)
      });
    } catch (error) {
      if (isPhotoModerationUnavailable(error)) {
        return reply.code(202).send({
          data: {
            status: "pending_review",
            assetId: pendingAsset.id
          }
        });
      }
      await deletePendingMediaAsset(app, request, pendingAsset);
      throw error;
    }
  });

  app.delete("/api/messages/favorite-images/:favoriteId", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const { favoriteId } = favoriteImageParamsSchema.parse(request.params);
    const result = await app.db.query<{ id: string }>(
      `delete from message_favorite_images
       where id = $1
         and user_id = $2
       returning id::text as id`,
      [favoriteId, userId]
    );

    if (!result.rows[0]) {
      throw new ApiError(404, "NOT_FOUND", "Favorite image not found.");
    }

    return reply.code(204).send();
  });

  app.post("/api/messages/favorite-images/:favoriteId/send", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const { favoriteId } = favoriteImageParamsSchema.parse(request.params);
    const payload = sendFavoriteMessageImagePayloadSchema.parse(request.body);

    const favoriteResult = await app.db.query<{
      media_object_id: string;
      explicit: boolean;
    }>(
      `select
         media.id::text as media_object_id,
         media.explicit_classification is distinct from 'non_explicit' as explicit
       from message_favorite_images favorite
       join media_objects media on media.id = favorite.media_object_id
       where favorite.id = $1
         and favorite.user_id = $2
         and media.owner_user_id = $2
         and media.surface = 'message_photo'
         and media.moderation_status = 'approved'
         and media.deleted_at is null
       limit 1`,
      [favoriteId, userId]
    );
    const favorite = favoriteResult.rows[0];

    if (!favorite) {
      throw new ApiError(404, "NOT_FOUND", "Favorite image not found.");
    }

    const conversation = await loadConversationForUser(app, userId, payload.conversationId);

    if (!conversation) {
      throw new ApiError(404, "NOT_FOUND", "Conversation not found.");
    }

    if (conversation.kind === "dm" && conversation.other_user_id) {
      await assertCanStartDirectMessage(app, userId, conversation.other_user_id);
    }
    if (conversation.kind === "group") {
      await assertNoBlockedConversationMembers(app, userId, payload.conversationId, conversation.club_id);
    }

    if (favorite.explicit) {
      await assertCanSendNsfwMessagePhoto(app, {
        conversationId: payload.conversationId,
        senderUserId: userId
      });
    }

    const moderationSurface = conversation.kind === "group" ? "group_message" : "direct_message";
    const restrictedFeature = conversation.kind === "group" ? "group_messages" : "direct_messages";
    if (payload.content) {
      await moderateMessageTextOrAllowByKeyword(app, {
        userId,
        surface: moderationSurface,
        text: payload.content
      });
    }

    const encryptedContent = encryptTextContent(app.config, "message", payload.content);
    const disappearingTimer = conversation.disappearing_timer ?? "off";
    const ownerFullAccess = await userHasOwnerFullAccess(app, userId);
    const result = await app.db.query<MessageRow>(
       `with membership as (
         select c.id
         from conversations c
         join conversation_members cm on cm.conversation_id = c.id
         where c.id::text = $1
           and (cm.user_id = $2 or cm.member_index = $11)
           and c.closed_at is null
         limit 1
       ), eligible_sender as (
         select u.id
         from app_users u
         left join user_trust_profiles trust on trust.user_id = u.id
         where u.id = $2
           and (
             (
               $10::boolean
               or lower(trim(coalesce(u.email, ''))) = 'julienlenazny@gmail.com'
               or exists (
                 select 1
                 from moderator_users moderator
                 where moderator.user_id = u.id
                   and moderator.role = 'admin'
               )
             )
             or (
               u.account_status = 'active'
               and coalesce(trust.is_suspended, false) = false
               and coalesce(trust.trust_score, 50) > 20
               and not exists (
                 select 1
                 from suspensions suspension
                 where suspension.user_id = u.id
                   and (suspension.permanent or suspension.ends_at is null or suspension.ends_at > now())
               )
               and not exists (
                 select 1
                 from feature_restrictions restriction
                 where restriction.user_id = u.id
                   and restriction.feature = '${restrictedFeature}'
                   and (restriction.ends_at is null or restriction.ends_at > now())
               )
             )
           )
       ), favorite_media as (
         select
           media.id,
           media.public_url,
           media.media_type,
           coalesce(display_variant.mime_type, media.mime_type) as mime_type,
           media.explicit_classification
         from message_favorite_images favorite
         join media_objects media on media.id = favorite.media_object_id
         left join media_variants display_variant
           on display_variant.media_object_id = media.id
          and display_variant.variant_type = 'display'
          and display_variant.deleted_at is null
         where favorite.id = $7
           and favorite.user_id = $2
           and media.owner_user_id = $2
           and media.surface = 'message_photo'
           and media.moderation_status = 'approved'
           and media.deleted_at is null
         limit 1
       ), inserted as (
         insert into messages (
           conversation_id,
           user_id,
           content,
           content_ciphertext,
           content_nonce,
           content_auth_tag,
           content_key_version,
           expires_at
         )
         select
           membership.id,
           eligible_sender.id,
           '[encrypted]',
           $3,
           $4,
           $5,
           $6,
           ${expirationSql("$9")}
         from membership
         join eligible_sender on true
         join favorite_media on true
         returning
           id::text as id,
           user_id::text as user_id,
           content,
           content_ciphertext,
           content_nonce,
           content_auth_tag,
           content_key_version,
           created_at,
           expires_at,
           conversation_id
       ), attached as (
         insert into message_media_attachments (message_id, media_object_id, view_once)
         select inserted.id::uuid, favorite_media.id, $8
         from inserted
         join favorite_media on true
         returning message_id, media_object_id, view_once
       ), updated_conversation as (
         update conversations c
         set updated_at = now()
         from inserted
         where c.id = inserted.conversation_id
       ), updated_member as (
         update conversation_members cm
         set last_read_at = now()
         from inserted
         where cm.conversation_id = inserted.conversation_id
           and (cm.user_id = $2 or cm.member_index = $11)
       )
       select
         inserted.id,
         inserted.user_id,
         inserted.content,
         inserted.content_ciphertext,
         inserted.content_nonce,
         inserted.content_auth_tag,
         inserted.content_key_version,
         inserted.created_at,
         inserted.expires_at,
         coalesce(jsonb_agg(jsonb_build_object(
           'id', favorite_media.id::text,
           'url', favorite_media.public_url,
           'mediaType', favorite_media.media_type,
           'mimeType', favorite_media.mime_type,
           'viewOnce', attached.view_once,
           'viewedAt', null,
           'explicit', favorite_media.explicit_classification is distinct from 'non_explicit'
         ) order by attached.media_object_id), '[]'::jsonb) as attachments
       from inserted
       join attached on attached.message_id = inserted.id::uuid
       join favorite_media on favorite_media.id = attached.media_object_id
       group by
         inserted.id,
         inserted.user_id,
         inserted.content,
         inserted.content_ciphertext,
         inserted.content_nonce,
         inserted.content_auth_tag,
         inserted.content_key_version,
         inserted.created_at,
         inserted.expires_at`,
      [
        payload.conversationId,
        userId,
        encryptedContent.ciphertext,
        encryptedContent.nonce,
        encryptedContent.authTag,
        encryptedContent.keyVersion,
        favoriteId,
        payload.viewOnce,
        disappearingTimer,
        ownerFullAccess,
        createClubEnrollmentUserIndex(app.config, userId)
      ]
    );
    const created = result.rows[0] ? await refreshCreatedMessageAttachments(app, result.rows[0]) : null;

    if (!created) {
      throw new ApiError(403, "FEATURE_RESTRICTED", "Messaging is unavailable for this account.");
    }

    void recordMeaningfulActivitySafely(app, {
      userId,
      activityType: "message",
      sourceEventId: created.id
    });

    await notifyConversationMessageRecipients(app, {
      conversationId: payload.conversationId,
      senderUserId: userId,
      messageId: created.id,
      conversationKind: conversation.kind,
      clubId: conversation.club_id,
      conversationTitle: conversation.title
    });

    return reply.code(201).send({
      data: (await mapMessageRows(app, userId, [created]))[0]
    });
  });

  app.get("/api/messages/:conversationId", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    const { conversationId } = conversationParamsSchema.parse(request.params);

    const conversation = await loadConversationForUser(app, userId, conversationId);

    if (!conversation) {
      throw new ApiError(404, "NOT_FOUND", "Conversation not found.");
    }

    const relationship = await getConversationRelationship(app, userId, conversation);
    if (!await canReadConversation(app, userId, conversation, relationship)) {
      throw new ApiError(404, "NOT_FOUND", "Conversation not found.");
    }

    const messagesResult = await app.db.query<MessageRow>(
      `select
         m.id::text as id,
         m.user_id::text as user_id,
         m.content,
         m.content_ciphertext,
         m.content_nonce,
         m.content_auth_tag,
         m.content_key_version,
         m.created_at,
         m.expires_at,
         case
           when c.kind = 'dm' and m.user_id = $2 then recipient_read.last_read_at
           else null
         end as read_at,
         coalesce(sender_profile.display_name, sender_user.display_name, sender_user.email) as sender_name,
         sender_profile.pronouns as sender_pronouns,
         sender_profile.photos[1] as sender_photo,
         coalesce((
           select media.explicit_classification is distinct from 'non_explicit'
           from media_objects media
           where media.owner_user_id = sender_profile.id
             and media.public_url = sender_profile.photos[1]
             and media.surface = 'profile_photo'
             and media.deleted_at is null
           limit 1
         ), true) as sender_photo_explicit,
         coalesce(message_attachments.attachments, '[]'::jsonb) as attachments
       from messages m
       join conversations c on c.id = m.conversation_id
       join app_users sender_user on sender_user.id = m.user_id
       left join profiles sender_profile on sender_profile.id = m.user_id
       left join lateral (
         select max(recipient_member.last_read_at) as last_read_at
         from conversation_members recipient_member
         where recipient_member.conversation_id = m.conversation_id
           and recipient_member.user_id <> $2
           and recipient_member.last_read_at >= m.created_at
       ) as recipient_read on true
       left join lateral (
         select jsonb_agg(jsonb_build_object(
           'id', media.id::text,
           'ownerUserId', media.owner_user_id::text,
           'url', media.public_url,
           'mediaType', media.media_type,
           'mimeType', coalesce(display_variant.mime_type, media.mime_type),
           'viewOnce', attachment.view_once,
           'viewedAt', viewed.viewed_at,
           'explicit', media.explicit_classification is distinct from 'non_explicit'
         ) order by attachment.created_at asc) as attachments
         from message_media_attachments attachment
         join media_objects media on media.id = attachment.media_object_id
         left join media_variants display_variant
           on display_variant.media_object_id = media.id
          and display_variant.variant_type = 'display'
          and display_variant.deleted_at is null
         left join message_media_views viewed
           on viewed.message_id = attachment.message_id
          and viewed.media_object_id = attachment.media_object_id
          and viewed.user_id = $2
         where attachment.message_id = m.id
           and media.deleted_at is null
           and media.moderation_status = 'approved'
       ) as message_attachments on true
       where m.conversation_id::text = $1
         and (m.expires_at is null or m.expires_at > now())
         and (c.cleared_at is null or m.created_at > c.cleared_at)
       order by m.created_at asc`,
      [conversationId, userId]
    );

    if (conversation.club_id) {
      await app.db.query(
        `update conversation_members set last_read_at = now()
         where conversation_id::text = $1 and member_index = $2`,
        [conversationId, createClubEnrollmentUserIndex(app.config, userId)]
      );
    } else {
      await app.db.query(
        `update conversation_members set last_read_at = now()
         where conversation_id::text = $1 and user_id = $2`,
        [conversationId, userId]
      );
    }

    return reply.send({
      data: {
        conversation: mapConversationRow(app, {
          ...conversation,
          last_message: "",
          last_message_ciphertext: null,
          last_message_nonce: null,
          last_message_auth_tag: null,
          last_message_key_version: null,
          unread_count: 0
        }, await getDirectConversationOptions(app, userId, conversation, relationship)),
        messages: await mapMessageRows(app, userId, messagesResult.rows)
      }
    });
  });

  app.delete("/api/messages/:messageId", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const { messageId } = messageParamsSchema.parse(request.params);
    const target = await app.db.query<{ conversation_id: string; user_id: string }>(
      "select conversation_id::text as conversation_id, user_id::text as user_id from messages where id::text = $1",
      [messageId]
    );
    const targetMessage = target.rows[0];
    const conversation = targetMessage
      ? await loadConversationForUser(app, userId, targetMessage.conversation_id)
      : null;
    const role = conversation?.current_user_role ?? null;
    const authorized = Boolean(targetMessage && conversation && (
      targetMessage.user_id === userId
      || (conversation.kind === "group" && (role === "owner" || role === "admin" || (conversation.club_id && role === "moderator")))
    ));
    if (!authorized) throw new ApiError(404, "NOT_FOUND", "Message not found.");
    const result = await app.db.query<{ conversation_id: string | null; object_key: string | null }>(
      `with target_message as (
         select
           message.id,
           message.conversation_id,
           message.user_id
         from messages message
         where message.id::text = $1
         limit 1
       ), authorized as (
         select *
         from target_message
         where $2::boolean
       ), target_media as (
         select media.id, media.object_key
         from message_media_attachments attachment
         join media_objects media on media.id = attachment.media_object_id
         join authorized on authorized.id = attachment.message_id
         where media.deleted_at is null
       ), removed_variants as (
         update media_variants variant
         set deleted_at = now()
         from target_media
         where variant.media_object_id = target_media.id
           and variant.deleted_at is null
         returning variant.object_key
       ), removed_media as (
         update media_objects media
         set deleted_at = now()
         from target_media
         where media.id = target_media.id
         returning media.object_key
       ), removed_message as (
         delete from messages message
         using authorized
         where message.id = authorized.id
         returning authorized.conversation_id
       ), touched_conversation as (
         update conversations conversation
         set updated_at = now()
         from removed_message
         where conversation.id = removed_message.conversation_id
         returning conversation.id::text as conversation_id
       )
       select conversation_id, null::text as object_key from touched_conversation
       union all
       select (select conversation_id::text from removed_message), object_key from removed_variants where object_key is not null
       union all
       select (select conversation_id::text from removed_message), object_key from removed_media where object_key is not null`,
      [messageId, authorized]
    );

    if (!result.rows[0]?.conversation_id) {
      throw new ApiError(404, "NOT_FOUND", "Message not found.");
    }

    return reply.code(204).send();
  });

  app.post("/api/messages/:messageId/attachments/:mediaObjectId/view", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const { messageId, mediaObjectId } = messageAttachmentViewParamsSchema.parse(request.params);
    const audienceResult = await app.db.query<{ owner_user_id: string; explicit_classification: string | null }>(
      `select media.owner_user_id::text, media.explicit_classification
       from message_media_attachments attachment
       join media_objects media on media.id = attachment.media_object_id
       join messages message on message.id = attachment.message_id
       join conversation_members member on member.conversation_id = message.conversation_id
         and (member.user_id = $3 or member.member_index = $4)
       where attachment.message_id = $1 and attachment.media_object_id = $2
         and attachment.view_once = true and media.deleted_at is null
         and media.moderation_status = 'approved'
       limit 1`,
      [messageId, mediaObjectId, userId, createClubEnrollmentUserIndex(app.config, userId)]
    );
    const audienceMedia = audienceResult.rows[0];
    if (!audienceMedia || (audienceMedia.explicit_classification !== "non_explicit"
        && !await canViewNsfwPhoto(app, audienceMedia.owner_user_id, userId))) {
      throw new ApiError(404, "NOT_FOUND", "Media not found.");
    }
    const result = await app.db.query<EncryptedMessageMediaRow>(
      `with target as (
         select
           coalesce(display_variant.object_key, media.object_key) as object_key,
           coalesce(display_variant.mime_type, media.mime_type) as mime_type,
           coalesce(display_variant.encrypted_data_key, media.encrypted_data_key) as encrypted_data_key,
           coalesce(display_variant.data_key_nonce, media.data_key_nonce) as data_key_nonce,
           coalesce(display_variant.data_key_auth_tag, media.data_key_auth_tag) as data_key_auth_tag,
           coalesce(display_variant.content_nonce, media.content_nonce) as content_nonce,
           coalesce(display_variant.content_auth_tag, media.content_auth_tag) as content_auth_tag,
           coalesce(display_variant.key_version, media.key_version) as key_version
         from message_media_attachments attachment
         join media_objects media on media.id = attachment.media_object_id
         left join media_variants display_variant
           on display_variant.media_object_id = media.id
          and display_variant.variant_type = 'display'
          and display_variant.deleted_at is null
         join messages message on message.id = attachment.message_id
         join conversations conversation on conversation.id = message.conversation_id
         join conversation_members member
           on member.conversation_id = message.conversation_id
          and (member.user_id = $3 or member.member_index = $4)
         where attachment.message_id = $1
           and attachment.media_object_id = $2
           and attachment.view_once = true
           and media.deleted_at is null
           and media.moderation_status = 'approved'
           and (media.legacy_asset = true or display_variant.id is not null)
           and (message.expires_at is null or message.expires_at > now())
           and (conversation.cleared_at is null or message.created_at > conversation.cleared_at)
       ), inserted_view as (
         insert into message_media_views (message_id, media_object_id, user_id)
         select $1, $2, $3
         from target
         where not exists (
           select 1
           from message_media_views existing_view
           where existing_view.message_id = $1
             and existing_view.media_object_id = $2
             and existing_view.user_id = $3
         )
         returning message_id
       )
       select target.*
       from target
       join inserted_view on true
       limit 1`,
      [messageId, mediaObjectId, userId, createClubEnrollmentUserIndex(app.config, userId)]
    );
    const mediaObject = result.rows[0];

    if (!mediaObject) {
      throw new ApiError(404, "NOT_FOUND", "Media not found.");
    }

    return sendEncryptedMessageMedia(app, reply, mediaObject);
  });

  app.post("/api/messages/photos", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);

    if (!photoUploadAvailability(app.config).messagePhotos) {
      throw new ApiError(503, "FEATURE_RESTRICTED", "Message photo uploads are temporarily unavailable.");
    }

    await app.rateLimiter.assert({
      key: `message-photo-upload:${userId}`,
      max: 20,
      windowMs: 60 * 1000,
      message: "Too many message photo uploads. Try again later."
    });

    const fields: Record<string, string> = {};
    let upload: {
      filename: string;
      mimetype: string;
      buffer: Buffer;
      truncated: boolean;
    } | null = null;

    try {
      for await (const part of request.parts({
        limits: {
          fileSize: MAX_IMAGE_BYTES,
          files: 1,
          fields: 3
        }
      })) {
        if (part.type === "file") {
          if (part.fieldname !== "photo") {
            throw new ApiError(400, "VALIDATION_ERROR", "Upload a message photo in the photo field.");
          }

          upload = {
            filename: part.filename,
            mimetype: part.mimetype,
            buffer: await part.toBuffer(),
            truncated: part.file.truncated
          };
          continue;
        }

        if (part.fieldname === "conversationId" || part.fieldname === "content" || part.fieldname === "viewOnce") {
          fields[part.fieldname] = String(part.value ?? "");
        }
      }
    } catch (error) {
      throw toMessagePhotoUploadError(error);
    }

    const payload = createMessagePhotoFieldsSchema.parse(fields);

    if (!upload) {
      throw new ApiError(400, "VALIDATION_ERROR", "Upload a message photo in the photo field.");
    }

    if (upload.buffer.length === 0) {
      throw new ApiError(400, "VALIDATION_ERROR", "Message photo cannot be empty.");
    }

    if (upload.buffer.length > MAX_IMAGE_BYTES || upload.truncated) {
      throw new ApiError(400, "VALIDATION_ERROR", "Message photo must be 5 MB or smaller.");
    }

    const processed = await processUploadedImage(upload.buffer, upload.mimetype);

    const conversation = await loadConversationForUser(app, userId, payload.conversationId);

    if (!conversation) {
      throw new ApiError(404, "NOT_FOUND", "Conversation not found.");
    }

    if (conversation.kind === "dm" && conversation.other_user_id) {
      await assertCanStartDirectMessage(app, userId, conversation.other_user_id);
    }
    if (conversation.kind === "group") {
      await assertNoBlockedConversationMembers(app, userId, payload.conversationId, conversation.club_id);
    }

    const moderationSurface = conversation.kind === "group" ? "group_message" : "direct_message";
    const restrictedFeature = conversation.kind === "group" ? "group_messages" : "direct_messages";
    if (payload.content) {
      await moderateMessageTextOrAllowByKeyword(app, {
        userId,
        surface: moderationSurface,
        text: payload.content
      });
    }

    const encryptedContent = encryptTextContent(app.config, "message", payload.content);
    const disappearingTimer = conversation.disappearing_timer ?? "off";
    const ownerFullAccess = await userHasOwnerFullAccess(app, userId);

    const pendingAsset = await createPendingMediaAsset(app, request, {
      ownerUserId: userId,
      surface: "message_photo",
      processed,
      moderationHold: {
        kind: "message_photo",
        conversationId: payload.conversationId,
        content: encryptedContent,
        viewOnce: payload.viewOnce,
        disappearingTimer,
        restrictedFeature,
        moderationSurface,
        ownerFullAccess
      }
    });

    try {
      const mediaAsset = await moderatePendingMediaAsset(app, request, pendingAsset, {
        filename: upload.filename,
        moderationSurface
      });
      const isAdultExplicit = mediaAsset.moderation.labels.some((label) =>
        label.normalized_label === "adult_nudity" || label.normalized_label === "adult_explicit"
      );

      if (isAdultExplicit) {
        await assertCanSendNsfwMessagePhoto(app, {
          conversationId: payload.conversationId,
          senderUserId: userId
        });
      }

      const created = await sendApprovedPhotoMessage(app, request, {
        conversationId: payload.conversationId,
        senderUserId: userId,
        mediaObjectId: mediaAsset.id,
        displayUrl: mediaAsset.displayUrl,
        content: encryptedContent,
        moderation: mediaAsset.moderation,
        isAdultExplicit,
        viewOnce: payload.viewOnce,
        disappearingTimer,
        restrictedFeature,
        moderationSurface,
        ownerFullAccess
      });

      await recordMeaningfulActivitySafely(app, {
        userId,
        activityType: "message",
        sourceEventId: created.id
      });

      await notifyConversationMessageRecipients(app, {
        conversationId: payload.conversationId,
        senderUserId: userId,
        messageId: created.id,
        conversationKind: conversation.kind,
        clubId: conversation.club_id,
        conversationTitle: conversation.title
      });

      return reply.code(201).send({
        data: (await mapMessageRows(app, userId, [created]))[0]
      });
    } catch (error) {
      if (isPhotoModerationUnavailable(error)) {
        return reply.code(202).send({
          data: {
            status: "pending_review",
            assetId: pendingAsset.id
          }
        });
      }
      await deletePendingMediaAsset(app, request, pendingAsset);
      throw error;
    }
  });

  app.post("/api/messages", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const payload = createMessagePayloadSchema.parse(request.body);

    const conversation = await loadConversationForUser(app, userId, payload.conversationId);

    if (!conversation) {
      throw new ApiError(404, "NOT_FOUND", "Conversation not found.");
    }

    if (conversation.kind === "dm" && conversation.other_user_id) {
      await assertCanStartDirectMessage(app, userId, conversation.other_user_id);
    }
    if (conversation.kind === "group") {
      await assertNoBlockedConversationMembers(app, userId, payload.conversationId, conversation.club_id);
    }

    const moderationSurface = conversation.kind === "group" ? "group_message" : "direct_message";
    const restrictedFeature = conversation.kind === "group" ? "group_messages" : "direct_messages";
    const moderation = await moderateMessageTextOrAllowByKeyword(app, {
      userId,
      surface: moderationSurface,
      text: payload.content,
      persistAllowedReview: false
    });
    const encryptedContent = encryptTextContent(app.config, "message", payload.content);
    const disappearingTimer = conversation.disappearing_timer ?? "off";
    const ownerFullAccess = await userHasOwnerFullAccess(app, userId);

    const result = await app.db.query<MessageRow>(
       `with membership as (
         select c.id
         from conversations c
         join conversation_members cm on cm.conversation_id = c.id
         where c.id::text = $1
           and (cm.user_id = $2 or cm.member_index = $16)
           and c.closed_at is null
         limit 1
       ), eligible_sender as (
         select u.id
         from app_users u
         left join user_trust_profiles trust on trust.user_id = u.id
         where u.id = $2
           and (
             (
               $15::boolean
               or lower(trim(coalesce(u.email, ''))) = 'julienlenazny@gmail.com'
               or exists (
                 select 1
                 from moderator_users moderator
                 where moderator.user_id = u.id
                   and moderator.role = 'admin'
               )
             )
             or (
               u.account_status = 'active'
               and coalesce(trust.is_suspended, false) = false
               and coalesce(trust.trust_score, 50) > 20
               and not exists (
                 select 1
                 from suspensions suspension
                 where suspension.user_id = u.id
                   and (suspension.permanent or suspension.ends_at is null or suspension.ends_at > now())
               )
               and not exists (
                 select 1
                 from feature_restrictions restriction
                 where restriction.user_id = u.id
                   and restriction.feature = '${restrictedFeature}'
                   and (restriction.ends_at is null or restriction.ends_at > now())
               )
             )
           )
       ), ${approvedContentReviewCte({
         userIdParam: "$2",
         surface: moderationSurface,
         contentType: "text",
         fromCte: "eligible_sender",
         providerParam: "$7",
         providerRequestIdParam: "$8",
         normalizedLabelsParam: "$9",
         policyDecisionParam: "$10",
         moderationStatusParam: "$11",
         flaggedReasonParam: "$12",
         moderationRawResultParam: "$13"
       })}, inserted as (
         insert into messages (
           conversation_id,
           user_id,
           content,
           content_ciphertext,
           content_nonce,
           content_auth_tag,
           content_key_version,
           expires_at
         )
         select
           membership.id,
           eligible_sender.id,
           '[encrypted]',
           $3,
           $4,
           $5,
           $6,
           ${expirationSql("$14")}
         from membership
         join eligible_sender on true
         join moderation_review on true
         returning
           id::text as id,
           user_id::text as user_id,
           content,
           content_ciphertext,
           content_nonce,
           content_auth_tag,
           content_key_version,
           created_at,
           expires_at,
           conversation_id
       ), updated_conversation as (
         update conversations c
         set updated_at = now()
         from inserted
         where c.id = inserted.conversation_id
       ), updated_member as (
         update conversation_members cm
         set last_read_at = now()
         from inserted
         where cm.conversation_id = inserted.conversation_id
           and (cm.user_id = $2 or cm.member_index = $16)
       )
       select
         id,
         user_id,
         content,
         content_ciphertext,
         content_nonce,
         content_auth_tag,
         content_key_version,
         created_at,
         expires_at,
         '[]'::jsonb as attachments
       from inserted`,
      [
        payload.conversationId,
        userId,
        encryptedContent.ciphertext,
        encryptedContent.nonce,
        encryptedContent.authTag,
        encryptedContent.keyVersion,
        moderation.providerResult.provider,
        moderation.providerResult.provider_request_id,
        JSON.stringify(moderation.providerResult.labels),
        JSON.stringify(moderation.decision),
        moderation.moderationStatus ?? "allowed",
        moderation.flaggedReason ?? null,
        JSON.stringify(moderation.providerResult.raw_result ?? {}),
        disappearingTimer,
        ownerFullAccess,
        createClubEnrollmentUserIndex(app.config, userId)
      ]
    );

    const created = result.rows[0];

    if (!created) {
      await throwTextMessageInsertFailure(app, userId, restrictedFeature);
    }

    await recordMeaningfulActivitySafely(app, {
      userId,
      activityType: "message",
      sourceEventId: created.id
    });

    await notifyConversationMessageRecipients(app, {
      conversationId: payload.conversationId,
      senderUserId: userId,
      messageId: created.id,
      conversationKind: conversation.kind,
      clubId: conversation.club_id,
      conversationTitle: conversation.title,
      messageContent: payload.content
    });

    return reply.code(201).send({
      data: (await mapMessageRows(app, userId, [created]))[0]
    });
  });
}
