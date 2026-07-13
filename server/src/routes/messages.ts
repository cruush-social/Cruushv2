import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { decryptTextContentOrFallback, encryptTextContent } from "../content-encryption.js";
import { decryptMediaBytes } from "../media-encryption.js";
import { readEncryptedMediaObject } from "../media-storage.js";
import { createPendingMediaAsset, deletePendingMediaAsset, moderatePendingMediaAsset } from "../media-assets.js";
import { MAX_IMAGE_BYTES, processUploadedImage } from "../media-image.js";
import { photoUploadAvailability } from "../photo-upload-availability.js";
import { ApiError } from "../errors.js";
import { hasActiveMutualMessagePermission } from "../match-relationships.js";
import { createAppNotificationAndPush } from "../notification-service.js";
import {
  conversationTimerSchema,
  createGroupConversationPayloadSchema,
  createMessagePhotoFieldsSchema,
  createMessagePayloadSchema,
  groupMemberPayloadSchema,
  openDirectConversationPayloadSchema,
  updateGroupConversationPayloadSchema
} from "../message-schema.js";
import { approvedContentReviewCte, moderateMessageTextOrAllowByKeyword } from "../moderation-service.js";
import { getActiveAccountUserId, getAuthenticatedUserId } from "../request-auth.js";

const conversationParamsSchema = z.object({
  conversationId: z.uuid()
}).strict();

const messageAttachmentViewParamsSchema = z.object({
  messageId: z.uuid(),
  mediaObjectId: z.uuid()
}).strict();

const updateConversationTimerPayloadSchema = z.object({
  disappearingTimer: conversationTimerSchema
}).strict();

const groupMemberParamsSchema = z.object({
  conversationId: z.uuid(),
  targetUserId: z.uuid()
}).strict();

const adminRoles = new Set(["owner", "admin"]);

type ConversationRow = {
  id: string;
  kind: "dm" | "group";
  title: string | null;
  tags: string[] | null;
  current_user_role?: "owner" | "admin" | "member" | null;
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
  other_user_id: string | null;
  other_user_name: string | null;
  other_user_pronouns: string[] | null;
  other_user_photo: string | null;
  member_count: number;
};

type GroupAccessRow = {
  role: "owner" | "admin" | "member";
  closed_at: string | Date | null;
};

type MessageRow = {
  id: string;
  user_id: string;
  content: string;
  content_ciphertext?: string | null;
  content_nonce?: string | null;
  content_auth_tag?: string | null;
  content_key_version?: string | null;
  created_at: string | Date;
  expires_at?: string | Date | null;
  attachments?: MessageAttachment[] | string | null;
};

type ExistingUserRow = {
  id: string;
};

type MessageAttachment = {
  id: string;
  url: string;
  mediaType: string;
  mimeType: string;
  viewOnce?: boolean;
  viewedAt?: string | null;
};

type GroupMemberRow = {
  id: string;
  name: string | null;
  pronouns: string[] | null;
  photo: string | null;
  role: "owner" | "admin" | "member";
  joined_at: string | Date;
};

type ConversationNotificationRecipientRow = {
  user_id: string;
  muted: boolean;
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

function mapConversationRow(app: FastifyInstance, row: ConversationRow) {
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
      photo: isGroup ? null : row.other_user_photo ?? null
    },
    distance: "Nearby",
    updatedAt: new Date(row.updated_at).toISOString(),
    lastMessage,
    unreadCount: row.unread_count ?? 0,
    pinned: row.pinned,
    muted: row.muted,
    mutual: false,
    membersLabel: isGroup ? `${row.member_count} people` : undefined,
    tags: row.tags ?? [],
    ...(row.current_user_role ? { currentUserRole: row.current_user_role } : {}),
    ...(row.disappearing_timer ? { disappearingTimer: row.disappearing_timer } : {}),
    ...(row.closed_at !== undefined ? { closed: Boolean(row.closed_at) } : {})
  };
}

function mapMessageRow(app: FastifyInstance, row: MessageRow) {
  const attachments = normalizeMessageAttachments(row.attachments);

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
    ...(row.expires_at ? { expiresAt: new Date(row.expires_at).toISOString() } : {}),
    ...(attachments.length > 0 ? { attachments } : {})
  };
}

async function notifyConversationMessageRecipients(
  app: FastifyInstance,
  input: {
    conversationId: string;
    senderUserId: string;
    messageId: string;
    conversationKind: "dm" | "group";
    conversationTitle?: string | null;
  }
) {
  try {
    const recipients = await app.db.query<ConversationNotificationRecipientRow>(
      `select
         cm.user_id::text as user_id,
         cm.muted,
         sender_profile.display_name as sender_name,
         c.title as conversation_title
       from conversation_members cm
       join conversations c on c.id = cm.conversation_id
       left join profiles sender_profile on sender_profile.id = $2
       where cm.conversation_id::text = $1
         and cm.user_id <> $2`,
      [input.conversationId, input.senderUserId]
    );

    for (const recipient of recipients.rows) {
      const senderName = recipient.sender_name?.trim() || "Someone";
      const groupTitle = recipient.conversation_title?.trim() || input.conversationTitle?.trim() || "Group chat";
      const isGroup = input.conversationKind === "group";

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
        suppressPush: recipient.muted
      });
    }
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
    cm.muted,
    case when c.kind = 'dm' then other_member.user_id::text else null end as other_user_id,
    case
      when c.kind = 'group' then c.title
      else coalesce(other_profile.display_name, other_user.display_name, other_user.email)
    end as other_user_name,
    other_profile.pronouns as other_user_pronouns,
    case when c.kind = 'dm' then other_profile.photos[1] else null end as other_user_photo,
    member_counts.member_count
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
`;

async function loadConversationForUser(app: FastifyInstance, userId: string, conversationId: string) {
  const result = await app.db.query<ConversationRow>(
    `${CONVERSATION_SELECT}
     where cm.user_id = $1
       and c.id::text = $2
     limit 1`,
    [userId, conversationId]
  );

  return result.rows[0] ?? null;
}

async function assertGroupAdmin(app: FastifyInstance, userId: string, conversationId: string) {
  const accessResult = await app.db.query<GroupAccessRow>(
    `select cm.role, c.closed_at
     from conversations c
     join conversation_members cm on cm.conversation_id = c.id
     where c.id::text = $1
       and c.kind = 'group'
       and cm.user_id = $2
     limit 1`,
    [conversationId, userId]
  );
  const access = accessResult.rows[0];

  if (!access) {
    throw new ApiError(404, "NOT_FOUND", "Group conversation not found.");
  }

  if (!adminRoles.has(access.role)) {
    throw new ApiError(403, "FORBIDDEN", "Only group admins can manage this group.");
  }

  if (access.closed_at) {
    throw new ApiError(400, "FEATURE_RESTRICTED", "This group is closed.");
  }

  return access;
}

async function assertMutualGroupInvitees(app: FastifyInstance, userId: string, memberIds: string[]) {
  for (const memberId of memberIds) {
    if (!await hasActiveMutualMessagePermission(app, userId, memberId)) {
      throw new ApiError(403, "MUTUAL_CRUUSH_REQUIRED", "Groups can only include mutual cruushes.");
    }
  }
}

async function assertNoBlockedConversationMembers(app: FastifyInstance, userId: string, conversationId: string) {
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
    throw new ApiError(403, "MUTUAL_CRUUSH_REQUIRED", "You can message after a mutual cruush.");
  }
}

function assertCanManageConversation(conversation: ConversationRow, action: "timer" | "clear") {
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
             when ${timerParam} = '1h' then now() + interval '1 hour'
             when ${timerParam} = '24h' then now() + interval '24 hours'
             when ${timerParam} = '7d' then now() + interval '7 days'
             when ${timerParam} = '30d' then now() + interval '30 days'
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

    if (!await hasActiveMutualMessagePermission(app, userId, payload.otherUserId)) {
      throw new ApiError(
        403,
        "MUTUAL_CRUUSH_REQUIRED",
        "You can message after a mutual cruush."
      );
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
    const conversationInsertResult = await app.db.query<{ id: string }>(
      `insert into conversations (kind, dm_key, created_by)
       values ('dm', $1, $2)
       on conflict (dm_key) do update
       set updated_at = conversations.updated_at
       returning id::text as id`,
      [dmKey, userId]
    );

    const conversationId = conversationInsertResult.rows[0]?.id;

    if (!conversationId) {
      throw new ApiError(500, "INTERNAL_ERROR", "Failed to create conversation.");
    }

    await app.db.query(
      `insert into conversation_members (conversation_id, user_id, last_read_at)
       values ($1, $2, now()), ($1, $3, null)
       on conflict (conversation_id, user_id) do nothing`,
      [conversationId, userId, payload.otherUserId]
    );

    const result = await app.db.query<ConversationRow>(
      `${CONVERSATION_SELECT}
       where cm.user_id = $1
         and c.id::text = $2
       limit 1`,
      [userId, conversationId]
    );

    const conversation = result.rows[0];

    if (!conversation) {
      throw new ApiError(404, "NOT_FOUND", "Conversation not found.");
    }

    return reply.code(201).send({
      data: mapConversationRow(app, conversation)
    });
  });

  app.post("/api/conversations/groups", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const payload = createGroupConversationPayloadSchema.parse(request.body);
    const memberIds = [...new Set(payload.memberIds.filter((memberId) => memberId !== userId))];

    await assertMutualGroupInvitees(app, userId, memberIds);

    const result = await app.db.query<ConversationRow>(
      `with eligible_creator as (
         select u.id
         from app_users u
         left join user_trust_profiles trust on trust.user_id = u.id
         where u.id = $1
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
               and restriction.feature = 'group_creation'
               and (restriction.ends_at is null or restriction.ends_at > now())
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
      [userId, payload.title, memberIds, payload.disappearingTimer]
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

    const result = await app.db.query<ConversationRow>(
      `with updated as (
         update conversations
         set
           title = coalesce($3, title),
           disappearing_timer = coalesce($4, disappearing_timer),
           updated_at = now()
         where id::text = $1
           and kind = 'group'
         returning id
       )
       ${CONVERSATION_SELECT}
       where cm.user_id = $2
         and c.id = (select id from updated)
       limit 1`,
      [conversationId, userId, payload.title ?? null, payload.disappearingTimer ?? null]
    );
    const conversation = result.rows[0];

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
    await assertGroupAdmin(app, userId, conversationId);
    await assertMutualGroupInvitees(app, userId, [payload.userId]);

    const result = await app.db.query<{ id: string }>(
      `insert into conversation_members (conversation_id, user_id, role)
       select c.id, u.id, 'member'
       from conversations c
       join app_users u on u.id = $2
       where c.id::text = $1
         and c.kind = 'group'
         and c.closed_at is null
       on conflict (conversation_id, user_id) do update
       set role = conversation_members.role
       returning user_id::text as id`,
      [conversationId, payload.userId]
    );

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
    await assertGroupAdmin(app, userId, conversationId);

    const result = await app.db.query<{ id: string }>(
      `delete from conversation_members
       where conversation_id::text = $1
         and user_id = $2
         and role <> 'owner'
       returning user_id::text as id`,
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
    await assertGroupAdmin(app, userId, conversationId);

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
    await assertGroupAdmin(app, userId, conversationId);

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

    const result = await app.db.query<ConversationRow>(
      `with updated as (
         update conversations
         set disappearing_timer = $3,
             updated_at = now()
         where id::text = $1
         returning id
       )
       ${CONVERSATION_SELECT}
       where cm.user_id = $2
         and c.id = (select id from updated)
       limit 1`,
      [conversationId, userId, payload.disappearingTimer]
    );
    const updated = result.rows[0];

    if (!updated) {
      throw new ApiError(404, "NOT_FOUND", "Conversation not found.");
    }

    return reply.send({
      data: mapConversationRow(app, updated)
    });
  });

  app.post("/api/conversations/:conversationId/clear-for-everyone", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const { conversationId } = conversationParamsSchema.parse(request.params);
    const conversation = await loadConversationForUser(app, userId, conversationId);

    if (!conversation) {
      throw new ApiError(404, "NOT_FOUND", "Conversation not found.");
    }

    assertCanManageConversation(conversation, "clear");

    const result = await app.db.query<ConversationRow>(
      `with updated as (
         update conversations
         set cleared_at = now(),
             cleared_by = $2,
             updated_at = now()
         where id::text = $1
         returning id
       )
       ${CONVERSATION_SELECT}
       where cm.user_id = $2
         and c.id = (select id from updated)
       limit 1`,
      [conversationId, userId]
    );
    const updated = result.rows[0];

    if (!updated) {
      throw new ApiError(404, "NOT_FOUND", "Conversation not found.");
    }

    return reply.send({
      data: mapConversationRow(app, updated)
    });
  });

  app.get("/api/conversations/groups/:conversationId/members", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    const { conversationId } = conversationParamsSchema.parse(request.params);
    const conversation = await loadConversationForUser(app, userId, conversationId);

    if (!conversation || conversation.kind !== "group") {
      throw new ApiError(404, "NOT_FOUND", "Group conversation not found.");
    }

    const result = await app.db.query<GroupMemberRow>(
      `select
         member.user_id::text as id,
         coalesce(profile.display_name, app_user.display_name, app_user.email) as name,
         profile.pronouns,
         profile.photos[1] as photo,
         member.role,
         member.joined_at
       from conversation_members member
       join app_users app_user on app_user.id = member.user_id
       left join profiles profile on profile.id = member.user_id
       where member.conversation_id::text = $1
       order by
         case member.role when 'owner' then 0 when 'admin' then 1 else 2 end,
         member.joined_at asc`,
      [conversationId]
    );

    return reply.send({
      data: result.rows.map((row) => ({
        id: row.id,
        name: row.name?.trim() || "cruush user",
        pronouns: row.pronouns?.join(", ") ?? "",
        photo: row.photo ?? null,
        role: row.role,
        joinedAt: new Date(row.joined_at).toISOString()
      }))
    });
  });

  app.get("/api/conversations", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);

    const result = await app.db.query<ConversationRow>(
      `${CONVERSATION_SELECT}
       where cm.user_id = $1
       order by greatest(c.updated_at, coalesce(last_message.created_at, c.updated_at)) desc`,
      [userId]
    );

    return reply.send({
      data: result.rows.map((row) => mapConversationRow(app, row))
    });
  });

  app.get("/api/messages/:conversationId", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    const { conversationId } = conversationParamsSchema.parse(request.params);

    const conversationResult = await app.db.query<ConversationRow>(
      `${CONVERSATION_SELECT}
       where cm.user_id = $1
         and c.id::text = $2
       limit 1`,
      [userId, conversationId]
    );

    const conversation = conversationResult.rows[0];

    if (!conversation) {
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
         coalesce(message_attachments.attachments, '[]'::jsonb) as attachments
       from messages m
       join conversations c on c.id = m.conversation_id
       left join lateral (
         select jsonb_agg(jsonb_build_object(
           'id', media.id::text,
           'url', media.public_url,
           'mediaType', media.media_type,
           'mimeType', coalesce(display_variant.mime_type, media.mime_type),
           'viewOnce', attachment.view_once,
           'viewedAt', viewed.viewed_at
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
        }),
        messages: messagesResult.rows.map((row) => mapMessageRow(app, row))
      }
    });
  });

  app.post("/api/messages/:messageId/attachments/:mediaObjectId/view", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const { messageId, mediaObjectId } = messageAttachmentViewParamsSchema.parse(request.params);
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
          and member.user_id = $3
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
      [messageId, mediaObjectId, userId]
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

    const conversationResult = await app.db.query<ConversationRow>(
      `${CONVERSATION_SELECT}
       where cm.user_id = $1
         and c.id::text = $2
       limit 1`,
      [userId, payload.conversationId]
    );
    const conversation = conversationResult.rows[0];

    if (!conversation) {
      throw new ApiError(404, "NOT_FOUND", "Conversation not found.");
    }

    if (
      conversation.kind === "dm" &&
      conversation.other_user_id &&
      !await hasActiveMutualMessagePermission(app, userId, conversation.other_user_id)
    ) {
      throw new ApiError(
        403,
        "MUTUAL_CRUUSH_REQUIRED",
        "You can message after a mutual cruush."
      );
    }
    if (conversation.kind === "group") {
      await assertNoBlockedConversationMembers(app, userId, payload.conversationId);
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

    const pendingAsset = await createPendingMediaAsset(app, request, {
      ownerUserId: userId,
      surface: "message_photo",
      processed
    });

    try {
      const mediaAsset = await moderatePendingMediaAsset(app, request, pendingAsset, {
        filename: upload.filename,
        moderationSurface
      });

    const encryptedContent = encryptTextContent(app.config, "message", payload.content);
    const disappearingTimer = conversation.disappearing_timer ?? "off";
    const result = await app.db.query<MessageRow>(
      `with membership as (
         select c.id
         from conversations c
         join conversation_members cm on cm.conversation_id = c.id
         where c.id::text = $1
           and cm.user_id = $2
           and c.closed_at is null
         limit 1
       ), eligible_sender as (
         select u.id
         from app_users u
         left join user_trust_profiles trust on trust.user_id = u.id
         where u.id = $2
           and u.account_status = 'active'
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
       ), approved_media as (
         update media_objects media
         set public_url = $16,
             moderation_status = 'approved',
             moderation_provider = $8,
             moderation_provider_version = $9,
             moderation_scores = $11::jsonb,
             moderation_decided_at = now(),
             moderation_failure_reason = null,
             explicit_classification = 'non_explicit',
             photodna_status = $14,
             photodna_provider_request_id = $15
         from eligible_sender
         where media.id = $7
           and media.owner_user_id = eligible_sender.id
           and media.surface = 'message_photo'
           and media.moderation_status = 'pending'
         returning eligible_sender.id
       ), ${approvedContentReviewCte({
         userIdParam: "$2",
         surface: moderationSurface,
         contentType: "image",
         fromCte: "approved_media",
         providerParam: "$8",
         providerRequestIdParam: "$10",
         normalizedLabelsParam: "$11",
         policyDecisionParam: "$12",
         moderationStatusParam: "'allowed'",
         moderationRawResultParam: "$13",
         contentIdParam: "$7",
         contentRefParam: "jsonb_build_object('assetId', $7, 'surface', 'message_photo')"
       })}, linked_media as (
         update media_objects media
         set content_review_id = moderation_review.id
         from moderation_review
         where media.id = $7
         returning media.id
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
           ${expirationSql("$17")}
         from membership
         join eligible_sender on true
         join linked_media on true
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
         select inserted.id::uuid, $7::uuid, $18
         from inserted
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
           and cm.user_id = $2
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
          'id', media.id::text,
          'url', media.public_url,
          'mediaType', media.media_type,
          'mimeType', media.mime_type,
          'viewOnce', attached.view_once,
          'viewedAt', null
        ) order by attached.media_object_id), '[]'::jsonb) as attachments
       from inserted
       join attached on attached.message_id = inserted.id::uuid
       join media_objects media on media.id = attached.media_object_id
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
        mediaAsset.id,
        mediaAsset.moderation.provider,
        mediaAsset.moderation.providerVersion,
        mediaAsset.moderation.providerRequestId,
        JSON.stringify(mediaAsset.moderation.labels),
        JSON.stringify(mediaAsset.moderation.decision),
        JSON.stringify(mediaAsset.moderation.rawResult),
        mediaAsset.moderation.photoDnaStatus,
        mediaAsset.moderation.photoDnaProviderRequestId,
        mediaAsset.displayUrl,
        disappearingTimer,
        payload.viewOnce
      ]
    );
    const created = result.rows[0];

    if (!created) {
      throw new ApiError(403, "FEATURE_RESTRICTED", "Messaging is unavailable for this account.");
    }

    await notifyConversationMessageRecipients(app, {
      conversationId: payload.conversationId,
      senderUserId: userId,
      messageId: created.id,
      conversationKind: conversation.kind,
      conversationTitle: conversation.title
    });

      return reply.code(201).send({
        data: mapMessageRow(app, created)
      });
    } catch (error) {
      await deletePendingMediaAsset(app, request, pendingAsset);
      throw error;
    }
  });

  app.post("/api/messages", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const payload = createMessagePayloadSchema.parse(request.body);

    const conversationResult = await app.db.query<ConversationRow>(
      `${CONVERSATION_SELECT}
       where cm.user_id = $1
         and c.id::text = $2
       limit 1`,
      [userId, payload.conversationId]
    );
    const conversation = conversationResult.rows[0];

    if (!conversation) {
      throw new ApiError(404, "NOT_FOUND", "Conversation not found.");
    }

    if (
      conversation.kind === "dm" &&
      conversation.other_user_id &&
      !await hasActiveMutualMessagePermission(app, userId, conversation.other_user_id)
    ) {
      throw new ApiError(
        403,
        "MUTUAL_CRUUSH_REQUIRED",
        "You can message after a mutual cruush."
      );
    }
    if (conversation.kind === "group") {
      await assertNoBlockedConversationMembers(app, userId, payload.conversationId);
    }

    const moderationSurface = conversation.kind === "group" ? "group_message" : "direct_message";
    const restrictedFeature = conversation.kind === "group" ? "group_messages" : "direct_messages";
    const moderation = await moderateMessageTextOrAllowByKeyword(app, {
      userId,
      surface: moderationSurface,
      text: payload.content
    });
    const encryptedContent = encryptTextContent(app.config, "message", payload.content);
    const disappearingTimer = conversation.disappearing_timer ?? "off";

    const result = await app.db.query<MessageRow>(
      `with membership as (
         select c.id
         from conversations c
         join conversation_members cm on cm.conversation_id = c.id
         where c.id::text = $1
           and cm.user_id = $2
           and c.closed_at is null
         limit 1
       ), eligible_sender as (
         select u.id
         from app_users u
         left join user_trust_profiles trust on trust.user_id = u.id
         where u.id = $2
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
           and cm.user_id = $2
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
        "allowed",
        null,
        JSON.stringify(moderation.providerResult.raw_result ?? {}),
        disappearingTimer
      ]
    );

    const created = result.rows[0];

    if (!created) {
      throw new ApiError(403, "FEATURE_RESTRICTED", "Messaging is unavailable for this account.");
    }

    await notifyConversationMessageRecipients(app, {
      conversationId: payload.conversationId,
      senderUserId: userId,
      messageId: created.id,
      conversationKind: conversation.kind,
      conversationTitle: conversation.title
    });

    return reply.code(201).send({
      data: mapMessageRow(app, created)
    });
  });
}
