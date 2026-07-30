import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ApiError } from "./errors.js";
import { hasActiveMutualMessagePermission } from "./match-relationships.js";

export const nsfwMessageVisibilitySchema = z.enum(["public", "mutual_cruushes", "none"]);

export const cruushMatchSettingsPayloadSchema = z.object({
  nsfwMessageVisibility: nsfwMessageVisibilitySchema,
  nsfwSendVisibility: nsfwMessageVisibilitySchema
}).strict();

export type NsfwMessageVisibility = z.infer<typeof nsfwMessageVisibilitySchema>;

export type CruushMatchSettings = {
  nsfwMessageVisibility: NsfwMessageVisibility;
  nsfwSendVisibility: NsfwMessageVisibility;
  updatedAt: string | null;
};

type CruushMatchSettingsRow = {
  user_id?: string;
  nsfw_message_visibility: NsfwMessageVisibility | null;
  nsfw_send_visibility: NsfwMessageVisibility | null;
  updated_at?: string | Date | null;
};

type ConversationMemberRow = {
  user_id: string;
};

const DEFAULT_CRUUSH_MATCH_SETTINGS: CruushMatchSettings = {
  nsfwMessageVisibility: "mutual_cruushes",
  nsfwSendVisibility: "mutual_cruushes",
  updatedAt: null
};

function isSchemaCompatibilityError(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: string }).code)
    : "";

  if (["42703", "42P01"].includes(code)) {
    return true;
  }

  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("user_cruush_match_settings") || message.includes("column");
}

function mapSettingsRow(row: CruushMatchSettingsRow | null | undefined): CruushMatchSettings {
  if (!row) {
    return DEFAULT_CRUUSH_MATCH_SETTINGS;
  }

  return {
    nsfwMessageVisibility: nsfwMessageVisibilitySchema.safeParse(row.nsfw_message_visibility).success
      ? row.nsfw_message_visibility as NsfwMessageVisibility
      : DEFAULT_CRUUSH_MATCH_SETTINGS.nsfwMessageVisibility,
    nsfwSendVisibility: nsfwMessageVisibilitySchema.safeParse(row.nsfw_send_visibility).success
      ? row.nsfw_send_visibility as NsfwMessageVisibility
      : DEFAULT_CRUUSH_MATCH_SETTINGS.nsfwSendVisibility,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
  };
}

export async function getCruushMatchSettings(app: FastifyInstance, userId: string): Promise<CruushMatchSettings> {
  try {
    const result = await app.db.query<CruushMatchSettingsRow>(
      `select nsfw_message_visibility, nsfw_send_visibility, updated_at
       from user_cruush_match_settings
       where user_id = $1
       limit 1`,
      [userId]
    );

    return mapSettingsRow(result.rows[0]);
  } catch (error) {
    if (isSchemaCompatibilityError(error)) {
      return DEFAULT_CRUUSH_MATCH_SETTINGS;
    }

    throw error;
  }
}

export async function saveCruushMatchSettings(
  app: FastifyInstance,
  userId: string,
  settings: z.infer<typeof cruushMatchSettingsPayloadSchema>
) {
  const result = await app.db.query<CruushMatchSettingsRow>(
    `insert into user_cruush_match_settings (
       user_id,
       nsfw_message_visibility,
       nsfw_send_visibility,
       updated_at
     )
     values ($1, $2, $3, now())
     on conflict (user_id) do update
     set nsfw_message_visibility = excluded.nsfw_message_visibility,
         nsfw_send_visibility = excluded.nsfw_send_visibility,
         updated_at = now()
     returning nsfw_message_visibility, nsfw_send_visibility, updated_at`,
    [userId, settings.nsfwMessageVisibility, settings.nsfwSendVisibility]
  );

  return mapSettingsRow(result.rows[0]);
}

async function loadConversationRecipientIds(app: FastifyInstance, conversationId: string, senderUserId: string) {
  const result = await app.db.query<ConversationMemberRow>(
    `select cm.user_id::text as user_id
     from conversation_members cm
     join app_users app_user on app_user.id = cm.user_id
     where cm.conversation_id::text = $1
       and cm.user_id <> $2
       and coalesce(app_user.account_status, 'active') = 'active'`,
    [conversationId, senderUserId]
  );

  return result.rows.map((row) => row.user_id);
}

async function loadSettingsByUserId(app: FastifyInstance, userIds: string[]) {
  const settingsByUserId = new Map<string, CruushMatchSettings>();
  userIds.forEach((userId) => settingsByUserId.set(userId, DEFAULT_CRUUSH_MATCH_SETTINGS));

  if (userIds.length === 0) {
    return settingsByUserId;
  }

  try {
    const result = await app.db.query<CruushMatchSettingsRow>(
      `select user_id::text as user_id, nsfw_message_visibility, nsfw_send_visibility, updated_at
       from user_cruush_match_settings
       where user_id = any($1::uuid[])`,
      [userIds]
    );

    result.rows.forEach((row) => {
      if (row.user_id) {
        settingsByUserId.set(row.user_id, mapSettingsRow(row));
      }
    });
  } catch (error) {
    if (!isSchemaCompatibilityError(error)) {
      throw error;
    }
  }

  return settingsByUserId;
}

async function everyRecipientIsMutual(app: FastifyInstance, senderUserId: string, recipientUserIds: string[]) {
  const permissions = await Promise.all(
    recipientUserIds.map((recipientUserId) => hasActiveMutualMessagePermission(app, senderUserId, recipientUserId))
  );

  return permissions.every(Boolean);
}

export async function assertCanSendNsfwMessagePhoto(
  app: FastifyInstance,
  input: {
    conversationId: string;
    senderUserId: string;
  }
) {
  const recipientUserIds = await loadConversationRecipientIds(app, input.conversationId, input.senderUserId);
  const settingsByUserId = await loadSettingsByUserId(app, [input.senderUserId, ...recipientUserIds]);
  const senderSettings = settingsByUserId.get(input.senderUserId) ?? DEFAULT_CRUUSH_MATCH_SETTINGS;

  if (senderSettings.nsfwSendVisibility === "none") {
    throw new ApiError(403, "NSFW_MESSAGES_RESTRICTED", "Your cruush match settings block sending NSFW photos.");
  }

  if (
    senderSettings.nsfwSendVisibility === "mutual_cruushes" &&
    !await everyRecipientIsMutual(app, input.senderUserId, recipientUserIds)
  ) {
    throw new ApiError(403, "NSFW_MESSAGES_RESTRICTED", "Your cruush match settings only allow NSFW photos with mutual cruushes.");
  }

  for (const recipientUserId of recipientUserIds) {
    const recipientSettings = settingsByUserId.get(recipientUserId) ?? DEFAULT_CRUUSH_MATCH_SETTINGS;

    if (recipientSettings.nsfwMessageVisibility === "none") {
      throw new ApiError(403, "NSFW_MESSAGES_RESTRICTED", "A recipient's cruush match settings do not allow NSFW photos.");
    }

    if (
      recipientSettings.nsfwMessageVisibility === "mutual_cruushes" &&
      !await hasActiveMutualMessagePermission(app, input.senderUserId, recipientUserId)
    ) {
      throw new ApiError(403, "NSFW_MESSAGES_RESTRICTED", "A recipient only allows NSFW photos from mutual cruushes.");
    }
  }
}
