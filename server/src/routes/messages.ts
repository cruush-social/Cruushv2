import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ApiError } from "../errors.js";
import { hasActiveMutualMessagePermission } from "../match-relationships.js";
import { createMessagePayloadSchema, openDirectConversationPayloadSchema } from "../message-schema.js";
import { approvedContentReviewCte, moderateTextOrReject } from "../moderation-service.js";
import { getAuthenticatedUserId } from "../request-auth.js";

const conversationParamsSchema = z.object({
  conversationId: z.uuid()
}).strict();

type ConversationRow = {
  id: string;
  kind: "dm" | "group";
  title: string | null;
  tags: string[] | null;
  updated_at: string | Date;
  last_message: string | null;
  unread_count: number;
  pinned: boolean;
  muted: boolean;
  other_user_id: string | null;
  other_user_name: string | null;
  other_user_pronouns: string[] | null;
  other_user_photo: string | null;
  member_count: number;
};

type MessageRow = {
  id: string;
  user_id: string;
  content: string;
  created_at: string | Date;
};

type ExistingUserRow = {
  id: string;
};

function mapConversationRow(row: ConversationRow) {
  const isGroup = row.kind === "group";

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
    lastMessage: row.last_message ?? "",
    unreadCount: row.unread_count ?? 0,
    pinned: row.pinned,
    muted: row.muted,
    mutual: false,
    membersLabel: isGroup ? `${row.member_count} people` : undefined,
    tags: row.tags ?? []
  };
}

function mapMessageRow(row: MessageRow) {
  return {
    id: row.id,
    userId: row.user_id,
    content: row.content,
    timestamp: new Date(row.created_at).toISOString()
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
    c.updated_at,
    coalesce(last_message.content, '') as last_message,
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
    select m.content, m.created_at
    from messages m
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ) as last_message on true
  left join lateral (
    select count(*)::int as unread_count
    from messages m
    where m.conversation_id = c.id
      and m.user_id <> $1
      and m.created_at > coalesce(cm.last_read_at, to_timestamp(0))
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
      data: mapConversationRow(conversation)
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
      data: result.rows.map(mapConversationRow)
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
         m.created_at
       from messages m
       where m.conversation_id::text = $1
       order by m.created_at asc`,
      [conversationId]
    );

    return reply.send({
      data: {
        conversation: mapConversationRow({
          ...conversation,
          last_message: "",
          unread_count: 0
        }),
        messages: messagesResult.rows.map(mapMessageRow)
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
         providerParam: "$4",
         providerRequestIdParam: "$5",
         normalizedLabelsParam: "$6",
         policyDecisionParam: "$7",
         moderationStatusParam: "$8",
         flaggedReasonParam: "$9",
         moderationRawResultParam: "$10"
       })}, inserted as (
         insert into messages (conversation_id, user_id, content)
         select membership.id, eligible_sender.id, $3
         from membership
         join eligible_sender on true
         join moderation_review on true
         returning id::text as id, user_id::text as user_id, content, created_at, conversation_id
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
       select id, user_id, content, created_at
       from inserted`,
      [
        payload.conversationId,
        userId,
        payload.content,
        moderation.providerResult.provider,
        moderation.providerResult.provider_request_id,
        JSON.stringify(moderation.providerResult.labels),
        JSON.stringify(moderation.decision),
        "allowed",
        null,
        JSON.stringify(moderation.providerResult.raw_result ?? {})
      ]
    );

    const created = result.rows[0];

    if (!created) {
      throw new ApiError(403, "FEATURE_RESTRICTED", "Messaging is unavailable for this account.");
    }

    return reply.code(201).send({
      data: mapMessageRow(created)
    });
  });
}
