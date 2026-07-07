import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { decryptTextContentOrFallback, encryptTextContent } from "../content-encryption.js";
import { ApiError } from "../errors.js";
import { hasActiveMutualMessagePermission } from "../match-relationships.js";
import {
  createGroupConversationPayloadSchema,
  createMessagePayloadSchema,
  groupMemberPayloadSchema,
  openDirectConversationPayloadSchema,
  updateGroupConversationPayloadSchema
} from "../message-schema.js";
import { approvedContentReviewCte, moderateTextOrReject } from "../moderation-service.js";
import { getAuthenticatedUserId } from "../request-auth.js";

const conversationParamsSchema = z.object({
  conversationId: z.uuid()
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
  disappearing_timer?: "off" | "24h" | "7d" | "30d" | null;
  closed_at?: string | Date | null;
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
};

type ExistingUserRow = {
  id: string;
};

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
        : row.other_user_name?.trim() || "Cruush user",
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
    ...(row.expires_at ? { expiresAt: new Date(row.expires_at).toISOString() } : {})
  };
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

export async function registerMessageRoutes(app: FastifyInstance) {
  app.post("/api/conversations/dm", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
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
    const userId = await getAuthenticatedUserId(request);
    const payload = createGroupConversationPayloadSchema.parse(request.body);
    const memberIds = [...new Set(payload.memberIds.filter((memberId) => memberId !== userId))];

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

    return reply.code(201).send({
      data: mapConversationRow(app, conversation)
    });
  });

  app.patch("/api/conversations/groups/:conversationId", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
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
    const userId = await getAuthenticatedUserId(request);
    const { conversationId } = conversationParamsSchema.parse(request.params);
    const payload = groupMemberPayloadSchema.parse(request.body);
    await assertGroupAdmin(app, userId, conversationId);

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

    return reply.code(204).send();
  });

  app.delete("/api/conversations/groups/:conversationId/members/:targetUserId", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
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
    const userId = await getAuthenticatedUserId(request);
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
    const userId = await getAuthenticatedUserId(request);
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
    const userId = await getAuthenticatedUserId(request);
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
         m.expires_at
       from messages m
       where m.conversation_id::text = $1
         and (m.expires_at is null or m.expires_at > now())
       order by m.created_at asc`,
      [conversationId]
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

  app.post("/api/messages", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
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

    const moderationSurface = conversation.kind === "group" ? "group_message" : "direct_message";
    const restrictedFeature = conversation.kind === "group" ? "group_messages" : "direct_messages";
    const moderation = await moderateTextOrReject(app, {
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
           case
             when $14 = '24h' then now() + interval '24 hours'
             when $14 = '7d' then now() + interval '7 days'
             when $14 = '30d' then now() + interval '30 days'
             else null
           end
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
         expires_at
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

    return reply.code(201).send({
      data: mapMessageRow(app, created)
    });
  });
}
