import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { isWithinBetaLaunchArea } from "./beta-access.js";
import { encryptTextContent } from "./content-encryption.js";
import { runTransaction, type DbClient } from "./db.js";
import { ApiError } from "./errors.js";
import {
  distanceMiles,
  loadLocationEnvelope,
  loadVisibilityPolicyStrict,
  locationPayloadToCoordinates,
  resolveViewerGhostCoordinate,
  type LocationPayload,
  type VisibilityPolicyPayload
} from "./location-privacy.js";
import {
  getCruushEntitlement,
  effectiveVisibilityPolicyForEntitlement,
  getRelationshipPermissions,
  type CruushEntitlement
} from "./match-relationships.js";
import { moderateTextOrReject } from "./moderation-service.js";
import {
  decryptProfileVisibility,
  decryptSensitiveProfile,
  type ProfileVisibilityRules
} from "./profile-sensitive.js";
import {
  canSubjectViewProfile,
  type VisibilityCoordinates,
  type VisibilitySubjectProfile
} from "./profile-visibility.js";
import { postExpirySchema, type PostExpiry } from "./post-schema.js";
import { getTravelPin, type TravelPin } from "./travel-pins.js";
import { notifyGroupPulseRecipients, notifyPulseRecipients } from "./pulse-notifications.js";
import { getSideQuestPingBalance } from "./side-quests.js";

export const MAP_PING_RADIUS_MILES = [1, 3, 5, 10, 15, 25, 50] as const;
export type MapPingRadiusMiles = typeof MAP_PING_RADIUS_MILES[number];

export const MAP_PING_ACTIVE_MS = 30 * 60 * 1000;
export const MAP_PING_WINDOW_MS = 24 * 60 * 60 * 1000;
export const MAP_PING_BASIC_DAILY_LIMIT = 1;
export const MAP_PING_PLUS_DAILY_LIMIT = 5;
export const MAP_PING_SENDER_LOCATION_MAX_AGE_MS = 15 * 60 * 1000;
export const MAP_PING_RECIPIENT_LOCATION_MAX_AGE_MS = 60 * 60 * 1000;
const MAP_PING_LOCATION_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const FEED_POST_EXPIRY_MS: Record<Exclude<PostExpiry, "never">, number> = {
  "30m": 30 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "3h": 3 * 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "12h": 12 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "2d": 2 * 24 * 60 * 60 * 1000,
  "3d": 3 * 24 * 60 * 60 * 1000,
  "5d": 5 * 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000
};

type MapPingRow = {
  id: string;
  user_id: string;
  radius_miles: number;
  created_at: string | Date;
  expires_at: string | Date;
};

type MapPingTimestampRow = {
  created_at: string | Date;
};

type GroupPulseRow = {
  id: string;
  conversation_id: string;
  sender_user_id: string;
  created_at: string | Date;
};

type SenderProfileRow = {
  signal: string | null;
  profile_visibility_ciphertext: string | null;
  profile_visibility_nonce: string | null;
  profile_visibility_auth_tag: string | null;
  profile_visibility_key_version: string | null;
};

type RecipientProfileRow = {
  id: string;
  tags: string[] | null;
  year_of_birth: number | null;
  identities: string[] | null;
  presentation: string[] | null;
  looking_for: string[] | null;
  availability: string[] | null;
  hosting_travel: string[] | null;
  preferred_spots: string[] | null;
  vibes: string[] | null;
  scenes: string[] | null;
  archetypes: string[] | null;
  hobbies: string[] | null;
  position: string[] | null;
  role: string[] | null;
  body_type: string[] | null;
  sexuality: string[] | null;
  substance_boundaries: string[] | null;
  protection_boundaries: string[] | null;
  profile_sensitive_ciphertext: string | null;
  profile_sensitive_nonce: string | null;
  profile_sensitive_auth_tag: string | null;
  profile_sensitive_key_version: string | null;
};

type ReceivedMapPingRow = {
  id: string;
  source_user_id: string;
  radius_miles: number;
  expires_at: string | Date;
};

export type MapPingDependencies = {
  now: () => Date;
  getEntitlement: (app: FastifyInstance, userId: string) => Promise<CruushEntitlement>;
  loadLocation: typeof loadLocationEnvelope;
  loadStrictVisibilityPolicy: typeof loadVisibilityPolicyStrict;
  moderateSignal: typeof moderateTextOrReject;
  resolveGhostCoordinate: typeof resolveViewerGhostCoordinate;
  getRelationship: typeof getRelationshipPermissions;
};

type MapPingDispatchContext = {
  sourceLocation: LocationPayload;
  senderRules: ProfileVisibilityRules;
  signal: string;
  visibilityPolicy: VisibilityPolicyPayload;
};

function locationPayloadFromMileHighClubPin(userId: string, pin: TravelPin): LocationPayload {
  return {
    version: 1,
    subjectUserId: userId,
    locationVersion: 1,
    latE7: Math.round(pin.latitude * 10_000_000),
    lonE7: Math.round(pin.longitude * 10_000_000),
    accuracyM: 0,
    source: "MANUAL",
    deviceReportedAtMs: pin.setAtMs,
    collectedAtMs: pin.setAtMs,
    expiresAtMs: pin.expiresAtMs,
    keyVersion: "mile-high-club"
  };
}

export type MapPingStatus = {
  bonusCredits: number;
  allowance: {
    unlimited: boolean;
    limit: number | null;
    used: number;
    remaining: number | null;
    nextEligibleAt: string | null;
  };
  activePing: {
    id: string;
    expiresAt: string;
  } | null;
  receivedPings: Array<{
    id: string;
    sourceUserId: string;
    expiresAt: string;
  }>;
};

const defaultDependencies: MapPingDependencies = {
  now: () => new Date(),
  getEntitlement: getCruushEntitlement,
  loadLocation: loadLocationEnvelope,
  loadStrictVisibilityPolicy: loadVisibilityPolicyStrict,
  moderateSignal: moderateTextOrReject,
  resolveGhostCoordinate: resolveViewerGhostCoordinate,
  getRelationship: getRelationshipPermissions
};

function resolveDependencies(overrides: Partial<MapPingDependencies> = {}): MapPingDependencies {
  return {
    ...defaultDependencies,
    ...overrides
  };
}

function toTimestamp(value: string | Date) {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function toIso(value: string | Date) {
  return new Date(value).toISOString();
}

function buildAllowance(
  createdAtValues: Array<string | Date>,
  entitlement: CruushEntitlement,
  now: Date
) {
  const nowMs = now.getTime();
  const unlimited = entitlement.cruushPlus && entitlement.expiresAt === null;
  const limit = unlimited
    ? null
    : entitlement.cruushPlus ? MAP_PING_PLUS_DAILY_LIMIT : MAP_PING_BASIC_DAILY_LIMIT;
  const timestamps = createdAtValues
    .map(toTimestamp)
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp > nowMs - MAP_PING_WINDOW_MS)
    .sort((first, second) => first - second);
  const used = timestamps.length;
  let nextEligibleMs = nowMs;

  if (limit !== null && used >= limit) {
    const limitingTimestamp = timestamps[used - limit];

    if (limitingTimestamp != null) {
      nextEligibleMs = Math.max(nextEligibleMs, limitingTimestamp + MAP_PING_WINDOW_MS);
    }
  }

  return {
    unlimited,
    limit,
    used,
    remaining: limit === null ? null : Math.max(0, limit - used),
    nextEligibleAt: nextEligibleMs > nowMs ? new Date(nextEligibleMs).toISOString() : null
  };
}

function withBonusCredits(allowance: MapPingStatus["allowance"], bonusCredits: number) {
  if (allowance.unlimited || allowance.limit === null || allowance.remaining === null) {
    return allowance;
  }

  return {
    ...allowance,
    limit: allowance.limit + bonusCredits,
    remaining: allowance.remaining + bonusCredits,
    nextEligibleAt: bonusCredits > 0 ? null : allowance.nextEligibleAt
  };
}

function assertLocationIsFresh(location: LocationPayload, userId: string, now: Date, maxAgeMs: number) {
  const nowMs = now.getTime();

  if (
    location.subjectUserId !== userId ||
    !Number.isFinite(location.collectedAtMs) ||
    !Number.isFinite(location.expiresAtMs) ||
    location.collectedAtMs > nowMs + MAP_PING_LOCATION_FUTURE_TOLERANCE_MS ||
    location.collectedAtMs <= nowMs - maxAgeMs ||
    location.expiresAtMs <= nowMs
  ) {
    throw new ApiError(
      409,
      "LOCATION_STORAGE_UNAVAILABLE",
      "Refresh your location before sending a Pulse."
    );
  }
}

function recipientVisibilitySubject(
  app: FastifyInstance,
  row: RecipientProfileRow,
  coordinates: VisibilityCoordinates
): VisibilitySubjectProfile | null {
  const sensitiveProfile = decryptSensitiveProfile(app.config, row);

  if (!sensitiveProfile) {
    return null;
  }

  return {
    tags: row.tags ?? [],
    year_of_birth: row.year_of_birth,
    identities: row.identities ?? [],
    presentations: row.presentation ?? [],
    looking_for: row.looking_for ?? [],
    timing: row.availability ?? [],
    hosting: row.hosting_travel ?? [],
    preferred_spots: row.preferred_spots ?? [],
    vibes: row.vibes ?? [],
    scenes: row.scenes ?? [],
    archetypes: row.archetypes ?? [],
    crowds: sensitiveProfile.crowds,
    hobbies: row.hobbies ?? [],
    positions: row.position ?? [],
    roles: row.role ?? [],
    kinks: sensitiveProfile.kink_interests.length > 0
      ? sensitiveProfile.kink_interests.map((interest) => interest.label ?? interest.kink_id)
      : sensitiveProfile.kinks,
    body_types: row.body_type ?? [],
    sexuality: row.sexuality ?? [],
    substance_boundaries: row.substance_boundaries ?? [],
    protection_boundaries: row.protection_boundaries ?? [],
    coordinates
  };
}

async function loadSenderDispatchContext(
  app: FastifyInstance,
  db: DbClient,
  userId: string,
  now: Date,
  dependencies: MapPingDependencies,
  knownEntitlement?: CruushEntitlement
): Promise<MapPingDispatchContext> {
  const profileResult = await db.query<SenderProfileRow>(
    `select
       profile.signal,
       profile.profile_visibility_ciphertext,
       profile.profile_visibility_nonce,
       profile.profile_visibility_auth_tag,
       profile.profile_visibility_key_version
     from profiles profile
     join app_users app_user on app_user.id = profile.id
     left join user_trust_profiles trust on trust.user_id = profile.id
     where profile.id = $1
       and coalesce(app_user.account_status, 'active') = 'active'
       and coalesce(trust.is_suspended, false) = false
       and coalesce(trust.trust_score, 50) > 20
       and not exists (
         select 1
         from suspensions suspension
         where suspension.user_id = profile.id
           and suspension.starts_at <= $2::timestamptz
           and (suspension.permanent or suspension.ends_at is null or suspension.ends_at > $2::timestamptz)
       )
       and not exists (
         select 1
         from feature_restrictions restriction
         where restriction.user_id = profile.id
           and restriction.feature = 'map_visibility'
           and restriction.starts_at <= $2::timestamptz
           and (restriction.ends_at is null or restriction.ends_at > $2::timestamptz)
       )
       and not exists (
         select 1
         from feature_restrictions restriction
         where restriction.user_id = profile.id
           and restriction.feature = 'feed_posting'
           and restriction.starts_at <= $2::timestamptz
           and (restriction.ends_at is null or restriction.ends_at > $2::timestamptz)
       )
     limit 1`,
    [userId, now.toISOString()]
  );
  const profile = profileResult.rows[0];

  if (!profile) {
    throw new ApiError(403, "FEATURE_RESTRICTED", "Pulse is unavailable for this account.");
  }

  if (!profile.signal?.trim()) {
    throw new ApiError(409, "VALIDATION_ERROR", "Add a signal to your profile before sending a Pulse.");
  }

  const senderRules = decryptProfileVisibility(app.config, profile);

  if (!senderRules) {
    throw new ApiError(409, "FEATURE_RESTRICTED", "Pulse privacy settings are unavailable.");
  }

  let visibilityPolicy = await dependencies.loadStrictVisibilityPolicy({ config: app.config, db }, userId);

  if (!visibilityPolicy) {
    throw new ApiError(409, "FEATURE_RESTRICTED", "Pulse privacy settings are unavailable.");
  }

  if (visibilityPolicy.baseMode === "STEALTH") {
    const entitlement = knownEntitlement ?? await dependencies.getEntitlement(app, userId);
    visibilityPolicy = effectiveVisibilityPolicyForEntitlement(visibilityPolicy, entitlement.cruushPlus);
  }

  if (visibilityPolicy.baseMode === "STEALTH") {
    throw new ApiError(403, "FEATURE_RESTRICTED", "Pulse is unavailable in Dark Room.");
  }

  let sourceLocation: LocationPayload | null = null;
  const mileHighClubPin = await getTravelPin(app, userId);

  if (mileHighClubPin) {
    sourceLocation = locationPayloadFromMileHighClubPin(userId, mileHighClubPin);
  } else {
    try {
      sourceLocation = await dependencies.loadLocation({ config: app.config, db }, userId);
    } catch {
      sourceLocation = null;
    }
  }

  if (!sourceLocation) {
    throw new ApiError(409, "LOCATION_STORAGE_UNAVAILABLE", "Refresh your location before sending a Pulse.");
  }

  if (!mileHighClubPin) {
    assertLocationIsFresh(sourceLocation, userId, now, MAP_PING_SENDER_LOCATION_MAX_AGE_MS);
  }
  const sourceCoordinates = locationPayloadToCoordinates(sourceLocation);

  if (
    !Number.isFinite(sourceCoordinates.lat) ||
    !Number.isFinite(sourceCoordinates.lng) ||
    !isWithinBetaLaunchArea(sourceCoordinates)
  ) {
    throw new ApiError(403, "FEATURE_RESTRICTED", "Pulse is unavailable outside the current beta service area.");
  }

  return {
    sourceLocation,
    senderRules,
    signal: profile.signal.trim(),
    visibilityPolicy
  };
}

async function loadSenderSignalForModeration(
  app: FastifyInstance,
  userId: string,
  now: Date
) {
  const result = await app.db.query<{
    signal: string | null;
  }>(
    `select profile.signal
     from profiles profile
     join app_users app_user on app_user.id = profile.id
     left join user_trust_profiles trust on trust.user_id = profile.id
     where profile.id = $1
       and coalesce(app_user.account_status, 'active') = 'active'
       and coalesce(trust.is_suspended, false) = false
       and coalesce(trust.trust_score, 50) > 20
       and not exists (
         select 1
         from suspensions suspension
         where suspension.user_id = profile.id
           and suspension.starts_at <= $2::timestamptz
           and (suspension.permanent or suspension.ends_at is null or suspension.ends_at > $2::timestamptz)
       )
       and not exists (
         select 1
         from feature_restrictions restriction
         where restriction.user_id = profile.id
           and restriction.feature in ('feed_posting', 'map_visibility')
           and restriction.starts_at <= $2::timestamptz
           and (restriction.ends_at is null or restriction.ends_at > $2::timestamptz)
       )
     limit 1`,
    [userId, now.toISOString()]
  );
  const row = result.rows[0];
  const signal = row?.signal?.trim();

  if (!signal) {
    throw new ApiError(409, "VALIDATION_ERROR", "Add a signal to your profile before sending a Pulse.");
  }

  return signal;
}

async function loadSavedFeedExpiry(db: DbClient, userId: string) {
  const row = (await db.query<{
    feed_post_expiry_default: string | null;
  }>(
    `select feed_post_expiry_default
     from user_privacy_settings
     where user_id = $1
     for share`,
    [userId]
  )).rows[0];
  const expiry = postExpirySchema.safeParse(row?.feed_post_expiry_default ?? "never");

  if (!expiry.success) {
    throw new ApiError(409, "FEATURE_RESTRICTED", "Feed expiry settings are unavailable.");
  }

  return expiry.data;
}

function feedPostExpiresAt(expiry: PostExpiry, now: Date) {
  return expiry === "never"
    ? "infinity"
    : new Date(now.getTime() + FEED_POST_EXPIRY_MS[expiry]).toISOString();
}

async function loadEligibleRecipients(
  app: FastifyInstance,
  sourceUserId: string,
  now: Date,
  recipientUserId?: string
) {
  const result = await app.db.query<RecipientProfileRow>(
    `select
       profile.id::text as id,
       profile.tags,
       profile.year_of_birth,
       profile.identities,
       profile.presentation,
       profile.looking_for,
       profile.availability,
       profile.hosting_travel,
       profile.preferred_spots,
       profile.vibes,
       profile.scenes,
       profile.archetypes,
       profile.hobbies,
       profile.position,
       profile.role,
       profile.body_type,
       profile.sexuality,
       profile.substance_boundaries,
       profile.protection_boundaries,
       profile.profile_sensitive_ciphertext,
       profile.profile_sensitive_nonce,
       profile.profile_sensitive_auth_tag,
       profile.profile_sensitive_key_version
     from profiles profile
     join app_users app_user on app_user.id = profile.id
     left join user_trust_profiles trust on trust.user_id = profile.id
     where profile.id <> $1
       and ($4::uuid is null or profile.id = $4::uuid)
       and coalesce(app_user.account_status, 'active') = 'active'
       and coalesce(trust.is_suspended, false) = false
       and profile.location_updated_at >= $2::timestamptz
       and not exists (
         select 1
         from suspensions suspension
         where suspension.user_id = profile.id
           and suspension.starts_at <= $3::timestamptz
           and (suspension.permanent or suspension.ends_at is null or suspension.ends_at > $3::timestamptz)
       )
       and not exists (
         select 1
         from feature_restrictions restriction
         where restriction.user_id = profile.id
           and restriction.feature = 'map_visibility'
           and restriction.starts_at <= $3::timestamptz
           and (restriction.ends_at is null or restriction.ends_at > $3::timestamptz)
       )
       and not exists (
         select 1
         from user_blocks block
         where (block.blocker_user_id = $1 and block.blocked_user_id = profile.id)
            or (block.blocker_user_id = profile.id and block.blocked_user_id = $1)
       )`,
    [
      sourceUserId,
      new Date(now.getTime() - MAP_PING_RECIPIENT_LOCATION_MAX_AGE_MS).toISOString(),
      now.toISOString(),
      recipientUserId ?? null
    ]
  );

  return result.rows;
}

async function recipientCanReceiveMapPing(
  app: FastifyInstance,
  ping: Pick<MapPingRow, "id" | "user_id" | "radius_miles">,
  context: MapPingDispatchContext,
  recipient: RecipientProfileRow,
  now: Date,
  dependencies: MapPingDependencies
) {
  const sourceCoordinates = locationPayloadToCoordinates(context.sourceLocation);
  const mileHighClubPin = await getTravelPin(app, recipient.id);
  const recipientLocation = mileHighClubPin
    ? locationPayloadFromMileHighClubPin(recipient.id, mileHighClubPin)
    : await dependencies.loadLocation(app, recipient.id);

  if (!recipientLocation) {
    return false;
  }

  if (!mileHighClubPin) {
    assertLocationIsFresh(
      recipientLocation,
      recipient.id,
      now,
      MAP_PING_RECIPIENT_LOCATION_MAX_AGE_MS
    );
  }
  const recipientCoordinates = locationPayloadToCoordinates(recipientLocation);
  const relationship = context.visibilityPolicy.baseMode === "GHOST"
    ? await dependencies.getRelationship(app, recipient.id, ping.user_id)
    : null;
  const displayedSourceCoordinates = context.visibilityPolicy.baseMode === "GHOST" &&
    relationship?.canRevealPreciseLocation !== true
    ? (await dependencies.resolveGhostCoordinate(app, {
        subjectUserId: ping.user_id,
        viewerUserId: recipient.id,
        policy: context.visibilityPolicy,
        location: context.sourceLocation,
        nowMs: now.getTime()
      })).coordinate
    : sourceCoordinates;

  if (
    !Number.isFinite(recipientCoordinates.lat) ||
    !Number.isFinite(recipientCoordinates.lng) ||
    !Number.isFinite(displayedSourceCoordinates.lat) ||
    !Number.isFinite(displayedSourceCoordinates.lng) ||
    !isWithinBetaLaunchArea(recipientCoordinates) ||
    !isWithinBetaLaunchArea(displayedSourceCoordinates) ||
    distanceMiles(
      displayedSourceCoordinates.lat,
      displayedSourceCoordinates.lng,
      recipientCoordinates.lat,
      recipientCoordinates.lng
    ) > ping.radius_miles
  ) {
    return false;
  }

  const subject = recipientVisibilitySubject(app, recipient, recipientCoordinates);

  return Boolean(subject && canSubjectViewProfile(context.senderRules, subject, displayedSourceCoordinates));
}

async function loadRecentPingRows(db: DbClient, userId: string, now: Date) {
  const result = await db.query<MapPingTimestampRow>(
    `select recent.created_at
     from (
       select created_at
       from map_pings
       where user_id = $1
         and coalesce((to_jsonb(map_pings)->>'bonus_credit_used')::boolean, false) = false
       union all
       select created_at
       from group_pulses
       where sender_user_id = $1
         and bonus_credit_used = false
     ) recent
     where recent.created_at > $2::timestamptz
     order by created_at asc`,
    [userId, new Date(now.getTime() - MAP_PING_WINDOW_MS).toISOString()]
  );

  return result.rows;
}

export async function createGroupPulse(
  app: FastifyInstance,
  input: {
    userId: string;
    conversationId: string;
    idempotencyKey: string;
  },
  overrides: Partial<MapPingDependencies> = {}
) {
  const dependencies = resolveDependencies(overrides);
  const now = dependencies.now();
  const entitlement = await dependencies.getEntitlement(app, input.userId);
  const result = await runTransaction(app.db, async (db) => {
    const account = await db.query<{ id: string }>(
      `select id::text as id
       from app_users
       where id = $1
         and coalesce(account_status, 'active') = 'active'
       for update`,
      [input.userId]
    );

    if (!account.rows[0]) {
      throw new ApiError(403, "FEATURE_RESTRICTED", "Pulse is unavailable for this account.");
    }

    const existing = (await db.query<GroupPulseRow>(
      `select
         pulse.id::text as id,
         pulse.conversation_id::text as conversation_id,
         pulse.sender_user_id::text as sender_user_id,
         pulse.created_at
       from group_pulses pulse
       where pulse.sender_user_id = $1
         and pulse.idempotency_key = $2::uuid
       limit 1`,
      [input.userId, input.idempotencyKey]
    )).rows[0];

    if (existing) {
      return { pulse: existing, created: false, title: "Group chat" };
    }

    const group = (await db.query<{ title: string | null }>(
      `select conversation.title
       from conversations conversation
       join conversation_members member
         on member.conversation_id = conversation.id
        and member.user_id = $2
       where conversation.id::text = $1
         and conversation.kind = 'group'
         and conversation.closed_at is null
         and member.role in ('owner', 'admin')
       limit 1`,
      [input.conversationId, input.userId]
    )).rows[0];

    if (!group) {
      throw new ApiError(403, "FORBIDDEN", "Only group admins can send a group Pulse.");
    }

    const recentRows = await loadRecentPingRows(db, input.userId, now);
    const allowance = buildAllowance(recentRows.map((row) => row.created_at), entitlement, now);
    const bonusCredits = await getSideQuestPingBalance(db, input.userId);
    const useBonusCredit = Boolean(allowance.nextEligibleAt && bonusCredits > 0);

    if (allowance.nextEligibleAt && !useBonusCredit) {
      throw new ApiError(
        429,
        "RATE_LIMITED",
        "Your next Pulse is not available yet.",
        { nextEligibleAt: allowance.nextEligibleAt }
      );
    }

    const inserted = (await db.query<GroupPulseRow>(
      `insert into group_pulses (
         conversation_id,
         sender_user_id,
         idempotency_key,
         bonus_credit_used,
         created_at
       )
       values ($1::uuid, $2, $3::uuid, $4, $5::timestamptz)
       returning
         id::text as id,
         conversation_id::text as conversation_id,
         sender_user_id::text as sender_user_id,
         created_at`,
      [input.conversationId, input.userId, input.idempotencyKey, useBonusCredit, now.toISOString()]
    )).rows[0];

    if (!inserted) {
      throw new ApiError(500, "INTERNAL_ERROR", "Group Pulse could not be sent.");
    }

    return { pulse: inserted, created: true, title: group.title?.trim() || "Group chat" };
  });

  if (result.created) {
    void notifyGroupPulseRecipients(app, {
      groupPulseId: result.pulse.id,
      conversationId: result.pulse.conversation_id,
      senderUserId: result.pulse.sender_user_id,
      groupTitle: result.title
    }, now.getTime()).catch((error) => {
      app.log.warn({ err: error, groupPulseId: result.pulse.id }, "group Pulse notification dispatch failed");
    });
  }

  return getMapPingStatus(app, input.userId, {
    ...overrides,
    now: () => now
  });
}

export async function getMapPingStatus(
  app: FastifyInstance,
  userId: string,
  overrides: Partial<MapPingDependencies> = {}
): Promise<MapPingStatus> {
  const dependencies = resolveDependencies(overrides);
  const now = dependencies.now();
  const entitlement = await dependencies.getEntitlement(app, userId);
  const [recentRows, activeResult, receivedResult, bonusCredits] = await Promise.all([
    loadRecentPingRows(app.db, userId, now),
    app.db.query<MapPingRow>(
      `select
         id::text as id,
         user_id::text as user_id,
         radius_miles,
         created_at,
         expires_at
       from map_pings
       where user_id = $1
         and expires_at > $2::timestamptz
       order by created_at desc
       limit 1`,
      [userId, now.toISOString()]
    ),
    app.db.query<ReceivedMapPingRow>(
       `select distinct
         ping.id::text as id,
         ping.user_id::text as source_user_id,
         ping.radius_miles,
         ping.expires_at
       from map_pings ping
       join app_users source_user on source_user.id = ping.user_id
       where ping.user_id <> $1
         and ping.expires_at > $2::timestamptz
         and coalesce(source_user.account_status, 'active') = 'active'
         and not exists (
           select 1
           from feature_restrictions restriction
           where restriction.user_id = ping.user_id
             and restriction.feature = 'map_visibility'
             and restriction.starts_at <= $2::timestamptz
             and (restriction.ends_at is null or restriction.ends_at > $2::timestamptz)
         )
         and not exists (
           select 1
           from user_blocks block
           where (block.blocker_user_id = $1 and block.blocked_user_id = ping.user_id)
              or (block.blocker_user_id = ping.user_id and block.blocked_user_id = $1)
         )
       order by ping.expires_at asc`,
      [userId, now.toISOString()]
    ),
    getSideQuestPingBalance(app.db, userId)
  ]);
  const activePing = activeResult.rows[0];
  const currentReceivedPings = (await Promise.all(receivedResult.rows.map(async (ping) => {
    try {
      const context = await loadSenderDispatchContext(
        app,
        app.db,
        ping.source_user_id,
        now,
        dependencies
      );
      const recipient = (await loadEligibleRecipients(
        app,
        ping.source_user_id,
        now,
        userId
      ))[0];

      if (!recipient) {
        return null;
      }

      return await recipientCanReceiveMapPing(app, {
        id: ping.id,
        user_id: ping.source_user_id,
        radius_miles: ping.radius_miles
      }, context, recipient, now, dependencies)
        ? ping
        : null;
    } catch (error) {
      app.log.warn({ err: error, pingId: ping.id }, "received map Ping visibility check failed");
      return null;
    }
  }))).filter((ping): ping is ReceivedMapPingRow => ping !== null);

  return {
    bonusCredits,
    allowance: withBonusCredits(buildAllowance(recentRows.map((row) => row.created_at), entitlement, now), bonusCredits),
    activePing: activePing
      ? {
          id: activePing.id,
          expiresAt: toIso(activePing.expires_at)
        }
      : null,
    receivedPings: currentReceivedPings.map((ping) => ({
      id: ping.id,
      sourceUserId: ping.source_user_id,
      expiresAt: toIso(ping.expires_at)
    }))
  };
}

export async function createMapPing(
  app: FastifyInstance,
  input: {
    userId: string;
    radiusMiles: MapPingRadiusMiles;
    idempotencyKey: string;
  },
  overrides: Partial<MapPingDependencies> = {}
): Promise<MapPingStatus> {
  const dependencies = resolveDependencies(overrides);
  const now = dependencies.now();
  const existingBeforeModeration = (await app.db.query<MapPingRow>(
    `select
       id::text as id,
       user_id::text as user_id,
       radius_miles,
       created_at,
       expires_at
     from map_pings
     where user_id = $1
       and idempotency_key = $2::uuid
     limit 1`,
    [input.userId, input.idempotencyKey]
  )).rows[0];

  if (existingBeforeModeration) {
    return getMapPingStatus(app, input.userId, {
      ...overrides,
      now: () => now
    });
  }

  const entitlement = await dependencies.getEntitlement(app, input.userId);
  const preflightRecentRows = await loadRecentPingRows(app.db, input.userId, now);
  const preflightAllowance = buildAllowance(
    preflightRecentRows.map((row) => row.created_at),
    entitlement,
    now
  );
  const preflightBonusCredits = await getSideQuestPingBalance(app.db, input.userId);

  if (preflightAllowance.nextEligibleAt && (preflightAllowance.unlimited || preflightBonusCredits < 1)) {
    throw new ApiError(
      429,
      "RATE_LIMITED",
      "Your next Pulse is not available yet.",
      { nextEligibleAt: preflightAllowance.nextEligibleAt }
    );
  }

  const moderatedSignal = await loadSenderSignalForModeration(app, input.userId, now);
  const moderation = await dependencies.moderateSignal(app, {
    userId: input.userId,
    surface: "feed",
    text: moderatedSignal,
    contentRef: {
      source: "map_ping"
    }
  });
  const encryptedSignal = encryptTextContent(app.config, "feed", moderatedSignal);
  const postId = randomUUID();
  const createdPing = await runTransaction(app.db, async (db) => {
    const account = await db.query<{ id: string }>(
      `select id::text as id
       from app_users
       where id = $1
         and coalesce(account_status, 'active') = 'active'
       for update`,
      [input.userId]
    );

    if (!account.rows[0]) {
      throw new ApiError(403, "FEATURE_RESTRICTED", "Pulse is unavailable for this account.");
    }

    const existingResult = await db.query<MapPingRow>(
      `select
         id::text as id,
         user_id::text as user_id,
         radius_miles,
         created_at,
         expires_at
       from map_pings
       where user_id = $1
         and idempotency_key = $2::uuid
       limit 1`,
      [input.userId, input.idempotencyKey]
    );
    const existing = existingResult.rows[0];

    if (existing) {
      return existing;
    }

    const dispatchContext = await loadSenderDispatchContext(
      app,
      db,
      input.userId,
      now,
      dependencies,
      entitlement
    );

    if (dispatchContext.signal !== moderatedSignal) {
      throw new ApiError(409, "VALIDATION_ERROR", "Your signal changed. Send the Pulse again.");
    }
    const feedExpiry = await loadSavedFeedExpiry(db, input.userId);
    const postExpiresAt = feedPostExpiresAt(feedExpiry, now);
    const recentRows = await loadRecentPingRows(db, input.userId, now);
    const allowance = buildAllowance(recentRows.map((row) => row.created_at), entitlement, now);
    const bonusCredits = await getSideQuestPingBalance(db, input.userId);
    const useBonusCredit = Boolean(!allowance.unlimited && allowance.nextEligibleAt && bonusCredits > 0);

    if (allowance.nextEligibleAt && !useBonusCredit) {
      throw new ApiError(
        429,
        "RATE_LIMITED",
        "Your next Pulse is not available yet.",
        { nextEligibleAt: allowance.nextEligibleAt }
      );
    }

    const expiresAt = new Date(now.getTime() + MAP_PING_ACTIVE_MS);
    const insertSql = useBonusCredit
      ? `insert into map_pings (
         user_id,
         radius_miles,
         idempotency_key,
         created_at,
         expires_at,
         bonus_credit_used
       )
       values ($1, $2, $3::uuid, $4::timestamptz, $5::timestamptz, $6)
       returning
         id::text as id,
         user_id::text as user_id,
         radius_miles,
         created_at,
         expires_at`
      : `insert into map_pings (
         user_id,
         radius_miles,
         idempotency_key,
         created_at,
         expires_at
       )
       values ($1, $2, $3::uuid, $4::timestamptz, $5::timestamptz)
       returning
         id::text as id,
         user_id::text as user_id,
         radius_miles,
         created_at,
         expires_at`;
    const insertResult = await db.query<MapPingRow>(
      insertSql,
      [
        input.userId,
        input.radiusMiles,
        input.idempotencyKey,
        now.toISOString(),
        expiresAt.toISOString(),
        ...(useBonusCredit ? [true] : [])
      ]
    );
    const ping = insertResult.rows[0];

    if (!ping) {
      throw new ApiError(500, "INTERNAL_ERROR", "Pulse could not be created.");
    }

    await db.query(
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
       )
       values (
         $1,
         'feed',
         'text',
         'allowed',
         $2,
         $3::jsonb,
         $4,
         $5,
         $6::jsonb,
         $7::jsonb,
         'allowed',
         null,
         $4,
         $8::jsonb,
         $9::timestamptz
       )`,
      [
        input.userId,
        postId,
        JSON.stringify({ mapPingId: ping.id }),
        moderation.providerResult.provider,
        moderation.providerResult.provider_request_id,
        JSON.stringify(moderation.providerResult.labels),
        JSON.stringify(moderation.decision),
        JSON.stringify(moderation.providerResult.raw_result ?? {}),
        now.toISOString()
      ]
    );

    // A Pulse posts the sender's signal to the feed. Sending another Pulse
    // while the previous one's post was still live stacked a second copy of
    // the same signal, so the feed showed the post twice. Retire the earlier
    // one and the feed carries only the Pulse that is running now.
    await db.query(
      `update posts
          set expires_at = $2::timestamptz
        where user_id = $1
          and map_ping_id is not null
          and expires_at > $2::timestamptz`,
      [input.userId, now.toISOString()]
    );

    await db.query(
      `insert into posts (
         id,
         user_id,
         content,
         content_ciphertext,
         content_nonce,
         content_auth_tag,
         content_key_version,
         expires_in,
         expires_at,
         created_at,
         map_ping_id
       )
       values (
         $1,
         $2,
         '[encrypted]',
         $3,
         $4,
         $5,
         $6,
         $7,
         $8::timestamptz,
         $9::timestamptz,
         $10::uuid
       )
       on conflict (map_ping_id) where map_ping_id is not null do nothing`,
      [
        postId,
        input.userId,
        encryptedSignal.ciphertext,
        encryptedSignal.nonce,
        encryptedSignal.authTag,
        encryptedSignal.keyVersion,
        feedExpiry,
        postExpiresAt,
        now.toISOString(),
        ping.id
      ]
    );

    return ping;
  });

  // Who hears about it is a much narrower question than who can see it. The
  // send does not wait on the answer: a Pulse is time-sensitive and the sender
  // should not watch a spinner while other people's phones are worked out.
  if (createdPing) {
    void notifyPulseRecipients(app, {
      pingId: createdPing.id,
      senderUserId: input.userId,
      radiusMiles: input.radiusMiles
    }, now.getTime()).catch((error) => {
      app.log.warn({ err: error, pingId: createdPing.id }, "pulse notification dispatch failed");
    });
  }

  return getMapPingStatus(app, input.userId, {
    ...overrides,
    now: () => now,
    getEntitlement: async () => entitlement
  });
}
