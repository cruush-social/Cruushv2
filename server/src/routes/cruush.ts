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

async function loadMutualCruushRows(app: FastifyInstance, userId: string) {
  return safeQueryRows<MutualCruushRow>(
    app,
    `select
       m.id::text as match_id,
       other_profile.id::text as other_user_id,
       other_profile.display_name,
       other_profile.pronouns,
       other_profile.photos,
       other_profile.updated_at,
       other_profile.lat,
       other_profile.lng,
       other_profile.fuzzy_lat,
       other_profile.fuzzy_lng,
       other_profile.vibes,
       other_profile.scenes,
       other_profile.archetypes,
       other_profile.profile_sensitive_ciphertext,
       other_profile.profile_sensitive_nonce,
       other_profile.profile_sensitive_auth_tag,
       other_profile.profile_sensitive_key_version,
       other_settings.ghost_mode_enabled,
       other_settings.precise_location_visibility,
       exists (
         select 1
         from cruush_match_tokens token
         where token.match_id = m.id
           and token.purpose = 'permissions'
           and token.revoked_at is null
           and token.expires_at > now()
       ) as can_message
     from cruush_matches m
     join profiles other_profile
       on other_profile.id = case
         when m.user_one_id = $1::uuid then m.user_two_id
         else m.user_one_id
       end
     left join user_privacy_settings other_settings
       on other_settings.user_id = other_profile.id
     where (m.user_one_id = $1::uuid or m.user_two_id = $1::uuid)
       and m.revoked_at is null
       and coalesce(other_settings.ghost_mode_enabled, false) = false
     order by other_profile.updated_at desc`,
    [userId]
  );
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
  const coordinates = getRowCoordinates(row, preciseAllowed);
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
    lastActive: formatLastActiveFromDate(row.updated_at),
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

    const [incomingRows, sentRows, mutualRows, viewRows] = await Promise.all([
      safeQueryRows<ReceivedCruushRow>(
        app,
        `select
           c.id,
           c.from_user_id,
           c.to_user_id,
           c.created_at,
           exists(
             select 1
             from cruushes back
             where back.from_user_id = $1
               and back.to_user_id = c.from_user_id::text
           ) as mutual,
           sender.display_name,
           sender.pronouns,
           sender.photos
         from cruushes c
         left join profiles sender on sender.id = c.from_user_id
         left join user_privacy_settings sender_settings on sender_settings.user_id = sender.id
         where c.to_user_id = $1::text
           and coalesce(sender_settings.ghost_mode_enabled, false) = false
         order by c.created_at desc`,
        [authenticatedUserId]
      ),
      safeQueryRows<SentCruushRow>(
        app,
        `select
           c.id,
           c.from_user_id,
           c.to_user_id,
           c.created_at,
           exists(
             select 1
             from cruushes back
             where back.from_user_id::text = c.to_user_id
               and back.to_user_id = $1::text
           ) as mutual,
           target.id::text as profile_user_id,
           target.display_name,
           target.pronouns,
           target.photos,
           c.to_user_name,
           c.to_user_pronouns,
           c.to_user_photo
         from cruushes c
         left join profiles target on target.id::text = c.to_user_id
         where c.from_user_id = $1
         order by c.created_at desc`,
        [authenticatedUserId]
      ),
      loadMutualCruushRows(app, authenticatedUserId),
      safeQueryRows<ProfileViewRow>(
        app,
        `select
           pve.id::text as id,
           pve.viewed_at,
           viewer.id::text as viewer_user_id,
           viewer.display_name,
           viewer.pronouns,
           viewer.photos
         from profile_view_events pve
         join profiles viewer on viewer.id = pve.viewer_user_id
         left join user_privacy_settings viewer_settings on viewer_settings.user_id = viewer.id
         where pve.target_user_id = $1
           and coalesce(viewer_settings.ghost_mode_enabled, false) = false
         order by pve.viewed_at desc`,
        [authenticatedUserId]
      )
    ]);

    const incoming = lockable(
      incomingRows.map((row) => ({
        id: row.id,
        createdAt: new Date(row.created_at).toISOString(),
        mutual: row.mutual,
        locked: false,
        user: mapActivityPerson({
          userId: row.from_user_id,
          displayName: row.display_name,
          pronouns: row.pronouns,
          photos: row.photos
        })
      })),
      isCruushPlus
    );
    const sent = sentRows.map((row) => ({
      id: row.id,
      createdAt: new Date(row.created_at).toISOString(),
      mutual: row.mutual,
      locked: false,
      user: mapActivityPerson({
        userId: row.profile_user_id ?? row.to_user_id,
        displayName: row.display_name,
        pronouns: row.pronouns,
        photos: row.photos,
        fallbackName: row.to_user_name,
        fallbackPronouns: row.to_user_pronouns,
        fallbackPhoto: row.to_user_photo
      })
    }));
    const mutual = mutualRows.map((row) => mapMutualCruushRow(app, row, {
      currentCoordinates,
      currentCrowds: currentSensitiveProfile?.crowds ?? [],
      viewerGhostMode: viewerPrivacy.ghostModeEnabled
    }));
    const views = lockable(
      viewRows.map((row) => ({
        id: row.id,
        createdAt: new Date(row.viewed_at).toISOString(),
        viewedAt: new Date(row.viewed_at).toISOString(),
        locked: false,
        user: mapActivityPerson({
          userId: row.viewer_user_id,
          displayName: row.display_name,
          pronouns: row.pronouns,
          photos: row.photos
        })
      })),
      isCruushPlus
    );

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

    const [receivedResult, sentResult] = await Promise.all([
      app.db.query<ReceivedCruushRow>(
        `select
           c.id,
           c.from_user_id,
           c.to_user_id,
           c.created_at,
           exists(
             select 1
             from cruushes back
             where back.from_user_id = $1
               and back.to_user_id = c.from_user_id::text
           ) as mutual,
           sender.display_name,
           sender.pronouns,
           sender.photos
         from cruushes c
         left join profiles sender on sender.id = c.from_user_id
         where c.to_user_id = $1::text
         order by c.created_at desc`,
        [authenticatedUserId]
      ),
      app.db.query<SentCruushRow>(
        `select
           c.id,
           c.from_user_id,
           c.to_user_id,
           c.created_at,
           exists(
             select 1
             from cruushes back
             where back.from_user_id::text = c.to_user_id
               and back.to_user_id = $1::text
           ) as mutual,
           target.id::text as profile_user_id,
           target.display_name,
           target.pronouns,
           target.photos,
           c.to_user_name,
           c.to_user_pronouns,
           c.to_user_photo
         from cruushes c
         left join profiles target on target.id::text = c.to_user_id
         where c.from_user_id = $1
         order by c.created_at desc`,
        [authenticatedUserId]
      )
    ]);

    return reply.send({
      data: {
        received: receivedResult.rows.map(mapReceivedCruushRow),
        sent: sentResult.rows.map(mapSentCruushRow)
      }
    });
  });

  app.post("/api/cruush", async (request, reply) => {
    const authenticatedUserId = await getAuthenticatedUserId(request);
    const payload = createCruushPayloadSchema.parse(request.body);

    if (payload.toUserId === authenticatedUserId) {
      throw new ApiError(400, "VALIDATION_ERROR", "You cannot send a cruush to yourself.");
    }

    const [userOneId, userTwoId] = [authenticatedUserId, payload.toUserId].sort();
    const existingMutual = (await app.db.query<ExistingMutualCruushRow>(
      `select
         coalesce(c.id::text, m.id::text) as id,
         $1::text as from_user_id,
         $2::text as to_user_id,
         coalesce(c.created_at, m.created_at) as created_at,
         true as mutual,
         m.id::text as match_id
       from cruush_matches m
       left join cruushes c
         on c.from_user_id = $1::uuid
        and c.to_user_id = $2::text
       where m.user_one_id = $3::uuid
         and m.user_two_id = $4::uuid
         and m.revoked_at is null
       limit 1`,
      [authenticatedUserId, payload.toUserId, userOneId, userTwoId]
    )).rows[0];

    if (existingMutual) {
      const relationship = await getRelationshipPermissions(app, authenticatedUserId, payload.toUserId);

      return reply.code(200).send({
        data: {
          id: existingMutual.id,
          fromUserId: existingMutual.from_user_id,
          toUserId: existingMutual.to_user_id,
          createdAt: new Date(existingMutual.created_at).toISOString(),
          mutual: true,
          permissions: {
            matchId: relationship.matchId ?? existingMutual.match_id,
            canMessage: relationship.canMessage,
            canRevealPreciseLocation: relationship.canRevealPreciseLocation
          }
        }
      });
    }

    const result = await app.db.query<CreatedCruushRow>(
      `with upserted as (
         insert into cruushes (
           from_user_id,
           to_user_id,
           to_user_name,
           to_user_pronouns,
           to_user_photo
         )
         values ($1, $2, $3, $4, $5)
         on conflict (from_user_id, to_user_id) do update
         set
           to_user_name = excluded.to_user_name,
           to_user_pronouns = excluded.to_user_pronouns,
           to_user_photo = excluded.to_user_photo,
           created_at = now()
         returning id, from_user_id, to_user_id, created_at
       )
       select
         u.id,
         u.from_user_id,
         u.to_user_id,
         u.created_at,
         exists(
           select 1
           from cruushes back
           where back.from_user_id::text = u.to_user_id
             and back.to_user_id = u.from_user_id::text
         ) as mutual
       from upserted u`,
      [
        authenticatedUserId,
        payload.toUserId,
        payload.targetUser?.name ?? "",
        payload.targetUser?.pronouns ?? "",
        payload.targetUser?.photo ?? null
      ]
    );

    const created = result.rows[0];
    const match = created.mutual
      ? await ensureMutualCruushMatch(app, authenticatedUserId, payload.toUserId)
      : null;
    const relationship = created.mutual
      ? await getRelationshipPermissions(app, authenticatedUserId, payload.toUserId)
      : null;

    return reply.code(201).send({
      data: {
        id: created.id,
        fromUserId: created.from_user_id,
        toUserId: created.to_user_id,
        createdAt: new Date(created.created_at).toISOString(),
        mutual: created.mutual,
        ...(created.mutual ? {
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
