import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ApiError } from "./errors.js";
import { getRelationshipPermissions, type RelationshipPermissions } from "./match-relationships.js";
import { userHasOwnerFullAccess } from "./owner-access.js";
import { decryptSensitiveProfile } from "./profile-sensitive.js";

export const nsfwMessageVisibilitySchema = z.enum(["public", "mutual_cruushes", "mutual_crowds", "none"]);
export const messageVisibilitySchema = z.enum(["public", "mutual_cruushes", "mutual_crowds"]);

export const cruushMatchSettingsPayloadSchema = z.object({
  messageVisibility: messageVisibilitySchema.optional(),
  nsfwMessageVisibility: nsfwMessageVisibilitySchema.optional(),
  nsfwSendVisibility: nsfwMessageVisibilitySchema.optional(),
  updatedAt: z.string().nullable().optional()
}).strict().transform(({ messageVisibility, nsfwMessageVisibility, nsfwSendVisibility }) => ({
  messageVisibility: messageVisibility ?? "mutual_cruushes",
  nsfwMessageVisibility: nsfwMessageVisibility ?? "public",
  nsfwSendVisibility: nsfwSendVisibility ?? "public"
}));

export type NsfwMessageVisibility = z.infer<typeof nsfwMessageVisibilitySchema>;
export type MessageVisibility = z.infer<typeof messageVisibilitySchema>;

export type CruushMatchSettings = {
  messageVisibility: MessageVisibility;
  nsfwMessageVisibility: NsfwMessageVisibility;
  nsfwSendVisibility: NsfwMessageVisibility;
  updatedAt: string | null;
};

type CruushMatchSettingsRow = {
  user_id?: string;
  message_visibility?: MessageVisibility | null;
  nsfw_message_visibility: NsfwMessageVisibility | null;
  nsfw_send_visibility: NsfwMessageVisibility | null;
  updated_at?: string | Date | null;
};

type ConversationMemberRow = {
  user_id: string;
};

type ProfileCrowdsRow = {
  id: string;
  profile_sensitive_ciphertext: string | null;
  profile_sensitive_nonce: string | null;
  profile_sensitive_auth_tag: string | null;
  profile_sensitive_key_version: string | null;
};

const DEFAULT_CRUUSH_MATCH_SETTINGS: CruushMatchSettings = {
  messageVisibility: "mutual_cruushes",
  nsfwMessageVisibility: "public",
  nsfwSendVisibility: "public",
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
    messageVisibility: messageVisibilitySchema.safeParse(row.message_visibility).success
      ? row.message_visibility as MessageVisibility
      : DEFAULT_CRUUSH_MATCH_SETTINGS.messageVisibility,
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
      `select message_visibility, nsfw_message_visibility, nsfw_send_visibility, updated_at
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
       message_visibility,
       nsfw_message_visibility,
       nsfw_send_visibility,
       updated_at
     )
     values ($1, $2, $3, $4, now())
     on conflict (user_id) do update
     set message_visibility = excluded.message_visibility,
         nsfw_message_visibility = excluded.nsfw_message_visibility,
         nsfw_send_visibility = excluded.nsfw_send_visibility,
         updated_at = now()
     returning message_visibility, nsfw_message_visibility, nsfw_send_visibility, updated_at`,
    [userId, settings.messageVisibility, settings.nsfwMessageVisibility, settings.nsfwSendVisibility]
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
      `select user_id::text as user_id, message_visibility, nsfw_message_visibility, nsfw_send_visibility, updated_at
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
    recipientUserIds.map(async (recipientUserId) => (
      (await getRelationshipPermissions(app, senderUserId, recipientUserId)).isMutualCruush
    ))
  );

  return permissions.every(Boolean);
}

async function loadCrowdsByUserId(app: FastifyInstance, userIds: string[]) {
  const crowdsByUserId = new Map<string, string[]>();
  const uniqueUserIds = [...new Set(userIds)];
  uniqueUserIds.forEach((userId) => crowdsByUserId.set(userId, []));

  if (uniqueUserIds.length === 0) {
    return crowdsByUserId;
  }

  try {
    const result = await app.db.query<ProfileCrowdsRow>(
      `select id::text as id,
              profile_sensitive_ciphertext,
              profile_sensitive_nonce,
              profile_sensitive_auth_tag,
              profile_sensitive_key_version
       from profiles
       where id = any($1::uuid[])`,
      [uniqueUserIds]
    );

    result.rows.forEach((row) => {
      const sensitiveProfile = decryptSensitiveProfile(app.config, row);
      crowdsByUserId.set(row.id, sensitiveProfile?.crowds ?? []);
    });
  } catch (error) {
    if (!isSchemaCompatibilityError(error)) {
      throw error;
    }
  }

  return crowdsByUserId;
}

function sharesCrowd(sourceCrowds: string[], targetCrowds: string[]) {
  if (sourceCrowds.length === 0 || targetCrowds.length === 0) {
    return false;
  }

  const targetCrowdSet = new Set(targetCrowds.map((crowd) => crowd.trim().toLowerCase()).filter(Boolean));
  return sourceCrowds.some((crowd) => targetCrowdSet.has(crowd.trim().toLowerCase()));
}

export async function canStartDirectMessage(
  app: FastifyInstance,
  senderUserId: string,
  recipientUserId: string,
  relationshipOverride?: RelationshipPermissions
) {
  const relationship = relationshipOverride ?? await getRelationshipPermissions(app, senderUserId, recipientUserId);

  if (!relationship.canMessage) {
    return false;
  }

  // Mutual cruushes remain messageable in Ghost Mode. Everyone else must wait
  // for a mutual cruush even if the recipient previously selected Public or
  // Crowd, so nearby discovery cannot be used to contact a Ghost profile.
  if (relationship.isMutualCruush) {
    return true;
  }

  if (relationship.targetGhostMode) {
    return false;
  }

  const recipientSettings = await getCruushMatchSettings(app, recipientUserId);

  if (recipientSettings.messageVisibility === "public") {
    return true;
  }

  if (recipientSettings.messageVisibility === "mutual_cruushes") {
    return relationship.isMutualCruush;
  }

  const crowdsByUserId = await loadCrowdsByUserId(app, [senderUserId, recipientUserId]);
  return sharesCrowd(
    crowdsByUserId.get(senderUserId) ?? [],
    crowdsByUserId.get(recipientUserId) ?? []
  );
}

export async function assertCanStartDirectMessage(
  app: FastifyInstance,
  senderUserId: string,
  recipientUserId: string,
  relationshipOverride?: RelationshipPermissions
) {
  if (await canStartDirectMessage(app, senderUserId, recipientUserId, relationshipOverride)) {
    return;
  }

  throw new ApiError(403, "FORBIDDEN", "This user is not accepting messages from you right now.");
}

export async function assertCanSendNsfwMessagePhoto(
  app: FastifyInstance,
  input: {
    conversationId: string;
    senderUserId: string;
  }
) {
  if (await userHasOwnerFullAccess(app, input.senderUserId)) {
    return;
  }

  const recipientUserIds = await loadConversationRecipientIds(app, input.conversationId, input.senderUserId);
  const settingsByUserId = await loadSettingsByUserId(app, [input.senderUserId, ...recipientUserIds]);
  const senderSettings = settingsByUserId.get(input.senderUserId) ?? DEFAULT_CRUUSH_MATCH_SETTINGS;
  let participantCrowdsPromise: Promise<Map<string, string[]>> | null = null;
  const getParticipantCrowds = () => {
    participantCrowdsPromise ??= loadCrowdsByUserId(app, [input.senderUserId, ...recipientUserIds]);
    return participantCrowdsPromise;
  };

  if (senderSettings.nsfwSendVisibility === "none") {
    throw new ApiError(403, "NSFW_MESSAGES_RESTRICTED", "Your cruush match settings block sending NSFW photos.");
  }

  if (
    senderSettings.nsfwSendVisibility === "mutual_cruushes" &&
    !await everyRecipientIsMutual(app, input.senderUserId, recipientUserIds)
  ) {
    throw new ApiError(403, "NSFW_MESSAGES_RESTRICTED", "Your cruush match settings only allow NSFW photos with mutual cruushes.");
  }

  if (senderSettings.nsfwSendVisibility === "mutual_crowds") {
    const crowdsByUserId = await getParticipantCrowds();
    const senderCrowds = crowdsByUserId.get(input.senderUserId) ?? [];
    const everyRecipientSharesCrowd = recipientUserIds.every((recipientUserId) => (
      sharesCrowd(senderCrowds, crowdsByUserId.get(recipientUserId) ?? [])
    ));

    if (!everyRecipientSharesCrowd) {
      throw new ApiError(403, "NSFW_MESSAGES_RESTRICTED", "Your cruush match settings only allow NSFW photos with mutual crowds.");
    }
  }

  for (const recipientUserId of recipientUserIds) {
    const recipientSettings = settingsByUserId.get(recipientUserId) ?? DEFAULT_CRUUSH_MATCH_SETTINGS;

    if (recipientSettings.nsfwMessageVisibility === "none") {
      throw new ApiError(403, "NSFW_MESSAGES_RESTRICTED", "A recipient's cruush match settings do not allow NSFW photos.");
    }

    if (
      recipientSettings.nsfwMessageVisibility === "mutual_cruushes" &&
      !(await getRelationshipPermissions(app, input.senderUserId, recipientUserId)).isMutualCruush
    ) {
      throw new ApiError(403, "NSFW_MESSAGES_RESTRICTED", "A recipient only allows NSFW photos from mutual cruushes.");
    }

    if (recipientSettings.nsfwMessageVisibility === "mutual_crowds") {
      const crowdsByUserId = await getParticipantCrowds();
      const senderCrowds = crowdsByUserId.get(input.senderUserId) ?? [];
      const recipientCrowds = crowdsByUserId.get(recipientUserId) ?? [];

      if (!sharesCrowd(senderCrowds, recipientCrowds)) {
        throw new ApiError(403, "NSFW_MESSAGES_RESTRICTED", "A recipient only allows NSFW photos from mutual crowds.");
      }
    }
  }
}
