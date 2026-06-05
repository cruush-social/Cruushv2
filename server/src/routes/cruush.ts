import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ApiError } from "../errors.js";
import { createCruushPayloadSchema } from "../cruush-schema.js";
import {
  ensureMutualCruushMatch,
  getCruushEntitlement,
  getPrivacySettings,
  getRelationshipPermissions,
  revokeMutualCruushMatch
} from "../match-relationships.js";
import {
  buildEncryptedRelationshipPayload,
  findEncryptedRelationshipRecord,
  listEncryptedRelationshipRecordsByActor,
  listEncryptedRelationshipRecordsByParticipant,
  listEncryptedRelationshipRecordsByTarget,
  upsertEncryptedRelationshipRecord,
  type EncryptedRelationshipRecord
} from "../encrypted-relationships.js";
import { formatDistanceMiles, formatLastActiveFromDate } from "../discovery-users.js";
import { decryptSensitiveProfile } from "../profile-sensitive.js";
import { getAuthenticatedUserId } from "../request-auth.js";

const cruushActivityParamsSchema = z.object({
  userId: z.uuid()
}).strict();

const revokeMatchParamsSchema = z.object({
  otherUserId: z.uuid()
}).strict();

type ReceivedCruushRow = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  created_at: string | Date;
  mutual: boolean;
  display_name: string | null;
  pronouns: string[] | null;
  photos: string[] | null;
};

type SentCruushRow = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  created_at: string | Date;
  mutual: boolean;
  profile_user_id: string | null;
  display_name: string | null;
  pronouns: string[] | null;
  photos: string[] | null;
  to_user_name: string | null;
  to_user_pronouns: string | null;
  to_user_photo: string | null;
};

type CreatedCruushRow = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  created_at: string | Date;
  mutual: boolean;
};

type ExistingMutualCruushRow = CreatedCruushRow & {
  match_id: string;
};

type ActivityPersonRow = {
  id: string;
  from_user_id?: string;
  to_user_id?: string;
  created_at: string | Date;
  mutual?: boolean;
  profile_user_id?: string | null;
  display_name: string | null;
  pronouns: string[] | null;
  photos: string[] | null;
  to_user_name?: string | null;
  to_user_pronouns?: string | null;
  to_user_photo?: string | null;
};

type ProfileViewRow = {
  id: string;
  viewed_at: string | Date;
  viewer_user_id: string;
  display_name: string | null;
  pronouns: string[] | null;
  photos: string[] | null;
};

type MutualCruushRow = {
  match_id: string;
  other_user_id: string;
  display_name: string | null;
  pronouns: string[] | null;
  photos: string[] | null;
  updated_at: string | Date;
  location_updated_at: string | Date | null;
  lat: number | null;
  lng: number | null;
  fuzzy_lat: number | null;
  fuzzy_lng: number | null;
  vibes: string[] | null;
  scenes: string[] | null;
  archetypes: string[] | null;
  profile_sensitive_ciphertext: string | null;
  profile_sensitive_nonce: string | null;
  profile_sensitive_auth_tag: string | null;
  profile_sensitive_key_version: string | null;
  ghost_mode_enabled: boolean | null;
  precise_location_visibility: "none" | "mutual_cruushes" | null;
  can_message: boolean | null;
};

type CurrentProfileLocationRow = {
  lat: number | null;
  lng: number | null;
  fuzzy_lat: number | null;
  fuzzy_lng: number | null;
  profile_sensitive_ciphertext: string | null;
  profile_sensitive_nonce: string | null;
  profile_sensitive_auth_tag: string | null;
  profile_sensitive_key_version: string | null;
};

type ActivityProfileRow = {
  id: string;
  display_name: string | null;
  pronouns: string[] | null;
  photos: string[] | null;
  updated_at: string | Date;
  location_updated_at: string | Date | null;
  lat: number | null;
  lng: number | null;
  fuzzy_lat: number | null;
  fuzzy_lng: number | null;
  vibes: string[] | null;
  scenes: string[] | null;
  archetypes: string[] | null;
  profile_sensitive_ciphertext: string | null;
  profile_sensitive_nonce: string | null;
  profile_sensitive_auth_tag: string | null;
  profile_sensitive_key_version: string | null;
  ghost_mode_enabled: boolean | null;
  precise_location_visibility: "none" | "mutual_cruushes" | null;
};

function isSchemaCompatibilityError(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: string }).code)
    : "";

  if (["42703", "42P01", "42883", "22P02"].includes(code)) {
    return true;
  }

  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("column") ||
    message.includes("relation") ||
    message.includes("operator does not exist") ||
    message.includes("does not exist")
  );
}

async function safeQueryRows<T>(app: FastifyInstance, sql: string, values: unknown[] = []) {
  try {
    const result = await app.db.query<T>(sql, values);
    return result?.rows ?? [];
  } catch (error) {
    if (isSchemaCompatibilityError(error)) {
      return [];
    }

    throw error;
  }
}

function mapReceivedCruushRow(row: ReceivedCruushRow) {
  return {
    id: row.id,
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
    createdAt: new Date(row.created_at).toISOString(),
    mutual: row.mutual,
    user: {
      id: row.from_user_id,
      name: row.display_name?.trim() || "Cruush user",
      pronouns: row.pronouns?.join(", ") ?? "",
      photo: row.photos?.[0] ?? null
    }
  };
}

function mapSentCruushRow(row: SentCruushRow) {
  return {
    id: row.id,
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
    createdAt: new Date(row.created_at).toISOString(),
    mutual: row.mutual,
    user: {
      id: row.profile_user_id ?? row.to_user_id,
      name: row.display_name?.trim() || row.to_user_name?.trim() || "Cruush user",
      pronouns: row.pronouns?.join(", ") ?? row.to_user_pronouns ?? "",
      photo: row.photos?.[0] ?? row.to_user_photo ?? null
    }
  };
}

function mapActivityPerson(row: {
  userId: string;
  displayName: string | null;
  pronouns?: string[] | null;
  photos?: string[] | null;
  fallbackName?: string | null;
  fallbackPronouns?: string | null;
  fallbackPhoto?: string | null;
}) {
  return {
    id: row.userId,
    name: row.displayName?.trim() || row.fallbackName?.trim() || "Cruush user",
    pronouns: row.pronouns?.join(", ") ?? row.fallbackPronouns ?? "",
    photo: row.photos?.[0] ?? row.fallbackPhoto ?? null
  };
}

function lockable<T extends { locked?: boolean; user?: unknown }>(
  rows: T[],
  isCruushPlus: boolean,
  freeVisibleCount = 1
) {
  if (isCruushPlus) {
    return rows.map((row) => ({ ...row, locked: false }));
  }

  return rows.map((row, index) => index < freeVisibleCount
    ? { ...row, locked: false }
    : { ...row, locked: true, user: null });
}

function parseCoordinate(value: number | null | undefined) {
  return Number.isFinite(value) ? value as number : null;
}

function getRowCoordinates(row: Pick<MutualCruushRow | CurrentProfileLocationRow, "lat" | "lng" | "fuzzy_lat" | "fuzzy_lng">, precise = false) {
  const lat = precise ? row.lat ?? row.fuzzy_lat : row.fuzzy_lat ?? row.lat;
  const lng = precise ? row.lng ?? row.fuzzy_lng : row.fuzzy_lng ?? row.lng;

  return {
    lat: parseCoordinate(lat),
    lng: parseCoordinate(lng)
  };
}

function formatMaybeDistance(
  center: { lat: number | null; lng: number | null } | null,
  target: { lat: number | null; lng: number | null }
) {
  if (center?.lat == null || center.lng == null || target.lat == null || target.lng == null) {
    return "Nearby";
  }

  return formatDistanceMiles(center.lat, center.lng, target.lat, target.lng);
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function wasActiveOnMapRecently(locationUpdatedAt: string | Date | null | undefined) {
  if (!locationUpdatedAt) {
    return false;
  }

  const timestamp = new Date(locationUpdatedAt).getTime();

  if (!Number.isFinite(timestamp)) {
    return false;
  }

  return Date.now() - timestamp <= 24 * 60 * 60 * 1000;
}

async function loadCurrentProfileLocation(app: FastifyInstance, userId: string) {
  return (await safeQueryRows<CurrentProfileLocationRow>(
    app,
    `select
       lat,
       lng,
       fuzzy_lat,
       fuzzy_lng,
       profile_sensitive_ciphertext,
       profile_sensitive_nonce,
       profile_sensitive_auth_tag,
       profile_sensitive_key_version
     from profiles
     where id = $1
     limit 1`,
    [userId]
  ))[0] ?? null;
}

async function loadActivityProfiles(app: FastifyInstance, userIds: string[]) {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];

  if (uniqueUserIds.length === 0) {
    return new Map<string, ActivityProfileRow>();
  }

  const rows = await safeQueryRows<ActivityProfileRow>(
    app,
    `select
       profiles.id::text as id,
       profiles.display_name,
       profiles.pronouns,
       profiles.photos,
       profiles.updated_at,
       profiles.location_updated_at,
       profiles.lat,
       profiles.lng,
       profiles.fuzzy_lat,
       profiles.fuzzy_lng,
       profiles.vibes,
       profiles.scenes,
       profiles.archetypes,
       profiles.profile_sensitive_ciphertext,
       profiles.profile_sensitive_nonce,
       profiles.profile_sensitive_auth_tag,
       profiles.profile_sensitive_key_version,
       user_privacy_settings.ghost_mode_enabled,
       user_privacy_settings.precise_location_visibility
     from profiles
     left join user_privacy_settings
       on user_privacy_settings.user_id = profiles.id
     where profiles.id = any($1::uuid[])`,
    [uniqueUserIds]
  );

  return new Map(rows.map((row) => [row.id, row]));
}

function isGhostProfile(profile: Pick<ActivityProfileRow, "ghost_mode_enabled"> | null | undefined) {
  return profile?.ghost_mode_enabled === true;
}

function otherUserIdForRecord(record: EncryptedRelationshipRecord, currentUserId: string) {
  return record.payload.actorUserId === currentUserId
    ? record.payload.targetUserId
    : record.payload.actorUserId;
}

async function hasActiveMutualCruush(app: FastifyInstance, firstUserId: string, secondUserId: string) {
  return Boolean(await findEncryptedRelationshipRecord(app, {
    type: "mutual_cruush",
    actorUserId: firstUserId,
    targetUserId: secondUserId
  }));
}

async function loadMutualCruushRows(app: FastifyInstance, userId: string) {
  const records = await listEncryptedRelationshipRecordsByParticipant(app, {
    participantUserId: userId,
    type: "mutual_cruush"
  });
  const otherUserIds = records.map((record) => otherUserIdForRecord(record, userId));
  const profilesById = await loadActivityProfiles(app, otherUserIds);
  const rows = await Promise.all(records.map(async (record): Promise<MutualCruushRow | null> => {
    const otherUserId = otherUserIdForRecord(record, userId);
    const profile = profilesById.get(otherUserId);

    if (!profile || isGhostProfile(profile)) {
      return null;
    }

    const relationship = await getRelationshipPermissions(app, userId, otherUserId);

    return {
      match_id: record.id,
      other_user_id: otherUserId,
      display_name: profile.display_name,
      pronouns: profile.pronouns,
      photos: profile.photos,
      updated_at: profile.updated_at,
      location_updated_at: profile.location_updated_at,
      lat: profile.lat,
      lng: profile.lng,
      fuzzy_lat: profile.fuzzy_lat,
      fuzzy_lng: profile.fuzzy_lng,
      vibes: profile.vibes,
      scenes: profile.scenes,
      archetypes: profile.archetypes,
      profile_sensitive_ciphertext: profile.profile_sensitive_ciphertext,
      profile_sensitive_nonce: profile.profile_sensitive_nonce,
      profile_sensitive_auth_tag: profile.profile_sensitive_auth_tag,
      profile_sensitive_key_version: profile.profile_sensitive_key_version,
      ghost_mode_enabled: profile.ghost_mode_enabled,
      precise_location_visibility: profile.precise_location_visibility,
      can_message: relationship.canMessage
    };
  }));

  return rows.filter((row): row is MutualCruushRow => row !== null);
}

function mapMutualCruushRow(
  app: FastifyInstance,
  row: MutualCruushRow,
  options: {
    currentCoordinates: { lat: number | null; lng: number | null } | null;
    currentCrowds: string[];
    viewerGhostMode: boolean;
  }
) {
  const preciseAllowed = row.can_message === true &&
    !options.viewerGhostMode &&
    row.ghost_mode_enabled !== true &&
    row.precise_location_visibility === "mutual_cruushes";
  const isRecentlyActiveOnMap = wasActiveOnMapRecently(row.location_updated_at);
  const coordinates = isRecentlyActiveOnMap
    ? getRowCoordinates(row, preciseAllowed)
    : { lat: null, lng: null };
  const sensitiveProfile = decryptSensitiveProfile(app.config, row);
  const otherCrowds = sensitiveProfile?.crowds ?? [];
  const currentCrowds = new Set(options.currentCrowds.map((crowd) => crowd.toLowerCase()));
  const sharedCrowds = otherCrowds.filter((crowd) => currentCrowds.has(crowd.toLowerCase()));
  const vibes = uniqueStrings([
    ...(row.vibes ?? []),
    ...(row.scenes ?? []),
    ...(row.archetypes ?? [])
  ]);

  return {
    id: row.match_id,
    matchId: row.match_id,
    createdAt: new Date(row.updated_at).toISOString(),
    locked: false,
    user: mapActivityPerson({
      userId: row.other_user_id,
      displayName: row.display_name,
      pronouns: row.pronouns,
      photos: row.photos
    }),
    mutualCrowds: sharedCrowds,
    vibes,
    distance: formatMaybeDistance(options.currentCoordinates, coordinates),
    lastActive: row.location_updated_at
      ? formatLastActiveFromDate(row.location_updated_at)
      : formatLastActiveFromDate(row.updated_at),
    canMessage: row.can_message === true,
    canRevealPreciseLocation: preciseAllowed,
    coordinates: coordinates.lat != null && coordinates.lng != null
      ? {
          lat: coordinates.lat,
          lng: coordinates.lng,
          precision: preciseAllowed ? "precise" : "fuzzy"
        }
      : null
  };
}

async function loadCruushActivityRecords(app: FastifyInstance, userId: string) {
  const [incomingRecords, sentRecords, viewRecords] = await Promise.all([
    listEncryptedRelationshipRecordsByTarget(app, {
      targetUserId: userId,
      type: "cruush"
    }),
    listEncryptedRelationshipRecordsByActor(app, {
      actorUserId: userId,
      type: "cruush"
    }),
    listEncryptedRelationshipRecordsByTarget(app, {
      targetUserId: userId,
      type: "profile_view"
    })
  ]);
  const profileIds = [
    ...incomingRecords.map((record) => record.payload.actorUserId),
    ...sentRecords.map((record) => record.payload.targetUserId),
    ...viewRecords.map((record) => record.payload.actorUserId)
  ];
  const profilesById = await loadActivityProfiles(app, profileIds);

  return {
    incomingRecords,
    sentRecords,
    viewRecords,
    profilesById
  };
}

async function mapIncomingCruushRecords(
  app: FastifyInstance,
  userId: string,
  records: EncryptedRelationshipRecord[],
  profilesById: Map<string, ActivityProfileRow>
) {
  const rows = await Promise.all(records.map(async (record) => {
    const senderUserId = record.payload.actorUserId;
    const senderProfile = profilesById.get(senderUserId);

    if (isGhostProfile(senderProfile)) {
      return null;
    }

    return {
      id: record.id,
      createdAt: new Date(record.payload.createdAt).toISOString(),
      mutual: await hasActiveMutualCruush(app, userId, senderUserId),
      locked: false,
      user: mapActivityPerson({
        userId: senderUserId,
        displayName: senderProfile?.display_name ?? null,
        pronouns: senderProfile?.pronouns ?? null,
        photos: senderProfile?.photos ?? null
      })
    };
  }));

  return rows.filter((row): row is NonNullable<typeof row> => row !== null);
}

async function mapSentCruushRecords(
  app: FastifyInstance,
  userId: string,
  records: EncryptedRelationshipRecord[],
  profilesById: Map<string, ActivityProfileRow>
) {
  return Promise.all(records.map(async (record) => {
    const targetUserId = record.payload.targetUserId;
    const targetProfile = profilesById.get(targetUserId);
    const snapshot = record.payload.targetSnapshot;

    return {
      id: record.id,
      createdAt: new Date(record.payload.createdAt).toISOString(),
      mutual: await hasActiveMutualCruush(app, userId, targetUserId),
      locked: false,
      user: mapActivityPerson({
        userId: targetUserId,
        displayName: targetProfile?.display_name ?? null,
        pronouns: targetProfile?.pronouns ?? null,
        photos: targetProfile?.photos ?? null,
        fallbackName: snapshot?.name ?? null,
        fallbackPronouns: snapshot?.pronouns ?? null,
        fallbackPhoto: snapshot?.photo ?? null
      })
    };
  }));
}

function mapProfileViewRecords(
  records: EncryptedRelationshipRecord[],
  profilesById: Map<string, ActivityProfileRow>
) {
  return records
    .map((record) => {
      const viewerUserId = record.payload.actorUserId;
      const viewerProfile = profilesById.get(viewerUserId);

      if (isGhostProfile(viewerProfile)) {
        return null;
      }

      return {
        id: record.id,
        createdAt: new Date(record.payload.createdAt).toISOString(),
        viewedAt: new Date(record.payload.createdAt).toISOString(),
        locked: false,
        user: mapActivityPerson({
          userId: viewerUserId,
          displayName: viewerProfile?.display_name ?? null,
          pronouns: viewerProfile?.pronouns ?? null,
          photos: viewerProfile?.photos ?? null
        })
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
}

export async function registerCruushRoutes(app: FastifyInstance) {
  app.get("/api/cruush/me", async (request, reply) => {
    const authenticatedUserId = await getAuthenticatedUserId(request);
    const entitlement = await getCruushEntitlement(app, authenticatedUserId);
    const isCruushPlus = entitlement.cruushPlus;
    const viewerPrivacy = await getPrivacySettings(app, authenticatedUserId);
    const currentProfile = await loadCurrentProfileLocation(app, authenticatedUserId);
    const currentSensitiveProfile = currentProfile
      ? decryptSensitiveProfile(app.config, currentProfile)
      : null;
    const currentCoordinates = currentProfile
      ? getRowCoordinates(currentProfile, false)
      : null;

    const [{ incomingRecords, sentRecords, viewRecords, profilesById }, mutualRows] = await Promise.all([
      loadCruushActivityRecords(app, authenticatedUserId),
      loadMutualCruushRows(app, authenticatedUserId)
    ]);
    const [incomingRows, sentRows] = await Promise.all([
      mapIncomingCruushRecords(app, authenticatedUserId, incomingRecords, profilesById),
      mapSentCruushRecords(app, authenticatedUserId, sentRecords, profilesById)
    ]);
    const viewRows = mapProfileViewRecords(viewRecords, profilesById);
    const incoming = lockable(incomingRows, isCruushPlus);
    const sent = sentRows;
    const mutual = mutualRows.map((row) => mapMutualCruushRow(app, row, {
      currentCoordinates,
      currentCrowds: currentSensitiveProfile?.crowds ?? [],
      viewerGhostMode: viewerPrivacy.ghostModeEnabled
    }));
    const views = lockable(viewRows, isCruushPlus);

    return reply.send({
      data: {
        entitlement,
        counts: {
          incoming: incomingRows.length,
          sent: sentRows.length,
          mutual: mutualRows.length,
          views: viewRows.length
        },
        incoming,
        sent,
        mutual,
        views
      }
    });
  });

  app.get("/api/cruush/mutual-map", async (request, reply) => {
    const authenticatedUserId = await getAuthenticatedUserId(request);
    const viewerPrivacy = await getPrivacySettings(app, authenticatedUserId);

    if (viewerPrivacy.ghostModeEnabled) {
      return reply.send({ data: [] });
    }

    const currentProfile = await loadCurrentProfileLocation(app, authenticatedUserId);
    const currentCoordinates = currentProfile
      ? getRowCoordinates(currentProfile, false)
      : null;
    const currentSensitiveProfile = currentProfile
      ? decryptSensitiveProfile(app.config, currentProfile)
      : null;
    const rows = await loadMutualCruushRows(app, authenticatedUserId);

    return reply.send({
      data: rows
        .map((row) => mapMutualCruushRow(app, row, {
          currentCoordinates,
          currentCrowds: currentSensitiveProfile?.crowds ?? [],
          viewerGhostMode: viewerPrivacy.ghostModeEnabled
        }))
        .filter((item) => item.coordinates !== null)
    });
  });

  app.delete("/api/cruush/matches/:otherUserId", async (request, reply) => {
    const authenticatedUserId = await getAuthenticatedUserId(request);
    const { otherUserId } = revokeMatchParamsSchema.parse(request.params);

    await revokeMutualCruushMatch(app, authenticatedUserId, otherUserId);

    return reply.send({
      data: {
        revoked: true
      }
    });
  });

  app.get("/api/cruush/:userId", async (request, reply) => {
    const authenticatedUserId = await getAuthenticatedUserId(request);
    const { userId: requestedUserId } = cruushActivityParamsSchema.parse(request.params);

    if (requestedUserId !== authenticatedUserId) {
      throw new ApiError(403, "FORBIDDEN", "You can only access your own cruush activity.");
    }

    const { incomingRecords, sentRecords, profilesById } = await loadCruushActivityRecords(app, authenticatedUserId);
    const [receivedRows, sentRows] = await Promise.all([
      mapIncomingCruushRecords(app, authenticatedUserId, incomingRecords, profilesById),
      mapSentCruushRecords(app, authenticatedUserId, sentRecords, profilesById)
    ]);

    return reply.send({
      data: {
        received: receivedRows.map((row) => ({
          id: row.id,
          fromUserId: row.user?.id ?? authenticatedUserId,
          toUserId: authenticatedUserId,
          createdAt: row.createdAt,
          mutual: row.mutual,
          user: row.user
        })),
        sent: sentRows.map((row) => ({
          id: row.id,
          fromUserId: authenticatedUserId,
          toUserId: row.user.id,
          createdAt: row.createdAt,
          mutual: row.mutual,
          user: row.user
        }))
      }
    });
  });

  app.post("/api/cruush", async (request, reply) => {
    const authenticatedUserId = await getAuthenticatedUserId(request);
    const payload = createCruushPayloadSchema.parse(request.body);

    if (payload.toUserId === authenticatedUserId) {
      throw new ApiError(400, "VALIDATION_ERROR", "You cannot send a cruush to yourself.");
    }

    const existingMutual = await findEncryptedRelationshipRecord(app, {
      type: "mutual_cruush",
      actorUserId: authenticatedUserId,
      targetUserId: payload.toUserId
    });

    if (existingMutual) {
      const existingCruush = await findEncryptedRelationshipRecord(app, {
        type: "cruush",
        actorUserId: authenticatedUserId,
        targetUserId: payload.toUserId
      });
      const relationship = await getRelationshipPermissions(app, authenticatedUserId, payload.toUserId);
      const createdAt = existingCruush?.payload.createdAt ?? existingMutual.payload.createdAt;

      return reply.code(200).send({
        data: {
          id: existingCruush?.id ?? existingMutual.id,
          fromUserId: authenticatedUserId,
          toUserId: payload.toUserId,
          createdAt: new Date(createdAt).toISOString(),
          mutual: true,
          permissions: {
            matchId: relationship.matchId ?? existingMutual.id,
            canMessage: relationship.canMessage,
            canRevealPreciseLocation: relationship.canRevealPreciseLocation
          }
        }
      });
    }

    const created = await upsertEncryptedRelationshipRecord(app, buildEncryptedRelationshipPayload({
      type: "cruush",
      actorUserId: authenticatedUserId,
      targetUserId: payload.toUserId,
      createdAt: new Date(),
      targetSnapshot: {
        name: payload.targetUser?.name ?? "",
        pronouns: payload.targetUser?.pronouns ?? "",
        photo: payload.targetUser?.photo ?? null
      }
    }));

    if (!created) {
      throw new ApiError(500, "INTERNAL_ERROR", "Failed to create cruush.");
    }

    const reciprocalCruush = await findEncryptedRelationshipRecord(app, {
      type: "cruush",
      actorUserId: payload.toUserId,
      targetUserId: authenticatedUserId
    });
    const isMutual = Boolean(reciprocalCruush);
    const match = isMutual
      ? await ensureMutualCruushMatch(app, authenticatedUserId, payload.toUserId)
      : null;
    const relationship = isMutual
      ? await getRelationshipPermissions(app, authenticatedUserId, payload.toUserId)
      : null;

    return reply.code(201).send({
      data: {
        id: created.id,
        fromUserId: created.payload.actorUserId,
        toUserId: created.payload.targetUserId,
        createdAt: new Date(created.payload.createdAt).toISOString(),
        mutual: isMutual,
        ...(isMutual ? {
          permissions: {
            matchId: match?.id ?? relationship?.matchId ?? null,
            canMessage: relationship?.canMessage ?? Boolean(match),
            canRevealPreciseLocation: relationship?.canRevealPreciseLocation ?? false
          }
        } : {})
      }
    });
  });
}
