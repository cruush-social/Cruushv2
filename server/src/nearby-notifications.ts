import type { FastifyInstance } from "fastify";
import { canSubjectViewProfile, type VisibilityCoordinates, type VisibilitySubjectProfile } from "./profile-visibility.js";
import { decryptProfileVisibility, decryptSensitiveProfile, type ProfileVisibilityRules } from "./profile-sensitive.js";
import { createAppNotificationAndPush } from "./notification-service.js";
import {
  distanceMiles,
  loadLocationEnvelopes,
  locationPayloadToCoordinates,
  resolveViewerGhostCoordinate,
  type LocationPayload,
  type VisibilityPolicyPayload
} from "./location-privacy.js";

const NEARBY_NOTIFICATION_RADIUS_MILES = 5;
const NEARBY_NOTIFICATION_RECIPIENT_WINDOW_MS = 4 * 24 * 60 * 60 * 1000;

type NearbyNotificationSourceRow = {
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
  kinks: string[] | null;
  body_type: string[] | null;
  sexuality: string[] | null;
  substance_boundaries: string[] | null;
  protection_boundaries: string[] | null;
  lat: number | null;
  lng: number | null;
  fuzzy_lat: number | null;
  fuzzy_lng: number | null;
  profile_sensitive_ciphertext: string | null;
  profile_sensitive_nonce: string | null;
  profile_sensitive_auth_tag: string | null;
  profile_sensitive_key_version: string | null;
};

type NearbyNotificationRecipientRow = {
  id: string;
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
  kinks: string[] | null;
  body_type: string[] | null;
  sexuality: string[] | null;
  substance_boundaries: string[] | null;
  protection_boundaries: string[] | null;
  lat: number | null;
  lng: number | null;
  fuzzy_lat: number | null;
  fuzzy_lng: number | null;
  profile_visibility_ciphertext: string | null;
  profile_visibility_nonce: string | null;
  profile_visibility_auth_tag: string | null;
  profile_visibility_key_version: string | null;
  updated_at: string | Date;
};

type CoordinateRow = {
  lat: number | null;
  lng: number | null;
  fuzzy_lat: number | null;
  fuzzy_lng: number | null;
};

function asVisibilityCoordinates(row: CoordinateRow): VisibilityCoordinates {
  return {
    lat: row.fuzzy_lat ?? row.lat ?? null,
    lng: row.fuzzy_lng ?? row.lng ?? null
  };
}

function toVisibilitySubject(
  app: FastifyInstance,
  row: NearbyNotificationSourceRow,
  coordinates: VisibilityCoordinates
): VisibilitySubjectProfile {
  const sensitiveProfile = decryptSensitiveProfile(app.config, row);

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
    crowds: sensitiveProfile?.crowds ?? [],
    hobbies: row.hobbies ?? [],
    positions: row.position ?? [],
    roles: row.role ?? [],
    kinks: sensitiveProfile?.kink_interests.length
      ? sensitiveProfile.kink_interests.map((interest) => interest.label ?? interest.kink_id)
      : sensitiveProfile?.kinks ?? row.kinks ?? [],
    body_types: row.body_type ?? [],
    sexuality: row.sexuality ?? [],
    substance_boundaries: row.substance_boundaries ?? [],
    protection_boundaries: row.protection_boundaries ?? [],
    coordinates
  };
}

function recipientRules(app: FastifyInstance, row: NearbyNotificationRecipientRow): ProfileVisibilityRules | null {
  return decryptProfileVisibility(app.config, row);
}

async function loadSourceProfile(app: FastifyInstance, sourceUserId: string) {
  const result = await app.db.query<NearbyNotificationSourceRow>(
    `select
       tags,
       year_of_birth,
       identities,
       presentation,
       looking_for,
       availability,
       hosting_travel,
       preferred_spots,
       vibes,
       scenes,
       archetypes,
       hobbies,
       position,
       role,
       kinks,
       body_type,
       sexuality,
       substance_boundaries,
       protection_boundaries,
       lat,
       lng,
       fuzzy_lat,
       fuzzy_lng,
       profile_sensitive_ciphertext,
       profile_sensitive_nonce,
       profile_sensitive_auth_tag,
       profile_sensitive_key_version
     from profiles
     where id = $1`,
    [sourceUserId]
  );

  return result.rows[0] ?? null;
}

async function loadNearbyNotificationRecipients(app: FastifyInstance, sourceUserId: string) {
  const result = await app.db.query<NearbyNotificationRecipientRow>(
    `select
       p.id::text as id,
       p.year_of_birth,
       p.identities,
       p.presentation,
       p.looking_for,
       p.availability,
       p.hosting_travel,
       p.preferred_spots,
       p.vibes,
       p.scenes,
       p.archetypes,
       p.hobbies,
       p.position,
       p.role,
       p.kinks,
       p.body_type,
       p.sexuality,
       p.substance_boundaries,
       p.protection_boundaries,
       p.lat,
       p.lng,
       p.fuzzy_lat,
       p.fuzzy_lng,
       p.profile_visibility_ciphertext,
       p.profile_visibility_nonce,
       p.profile_visibility_auth_tag,
       p.profile_visibility_key_version,
       p.updated_at
     from profiles p
     join app_users u on u.id = p.id
     left join notification_preferences preferences
       on preferences.user_id = p.id
     where p.id <> $1
       and coalesce(u.account_status, 'active') = 'active'
       and p.location_updated_at >= now() - interval '4 days'
       and coalesce(preferences.nearby_enabled, true) = true
       and not exists (
         select 1
         from user_blocks block
         where (block.blocker_user_id = $1 and block.blocked_user_id = p.id)
            or (block.blocker_user_id = p.id and block.blocked_user_id = $1)
       )`,
    [sourceUserId]
  );

  return result.rows;
}

export async function notifyNearbyUsersForLocationUpdate(app: FastifyInstance, input: {
  sourceUserId: string;
  location: LocationPayload;
  visibilityPolicy: VisibilityPolicyPayload;
}) {
  if (input.visibilityPolicy.baseMode === "STEALTH") {
    return {
      attempted: false,
      sent: 0
    };
  }

  const sourceRow = await loadSourceProfile(app, input.sourceUserId);
  if (!sourceRow) {
    return {
      attempted: false,
      sent: 0
    };
  }

  // Gate delivery on the decoy for Ghost subjects, never on the true point.
  //
  // Removing the distance from the notification payload was not enough: the
  // decision to deliver at all is itself a one-bit oracle on the subject's real
  // position. An attacker positions several accounts, and each learns whether
  // the subject is inside its radius; intersecting those discs localises the
  // subject far below the ghost cell. The recipient's own visibility distance
  // rule is attacker-tunable too, which turns that bit into a bisectable
  // boundary. Deciding on the decoy means those bits describe the location the
  // subject already publishes, not the one Ghost Mode exists to hide.
  const trueCoordinates = locationPayloadToCoordinates(input.location);
  let sourceCoordinates = trueCoordinates;

  if (input.visibilityPolicy.baseMode === "GHOST") {
    const ghost = await resolveViewerGhostCoordinate(app, {
      subjectUserId: input.sourceUserId,
      viewerUserId: input.sourceUserId,
      policy: input.visibilityPolicy,
      location: input.location
    });

    sourceCoordinates = { lat: ghost.coordinate.lat, lng: ghost.coordinate.lng };
  }

  const sourceSubject = toVisibilitySubject(app, sourceRow, sourceCoordinates);
  // Location updates already dispatch only when the source returns after four
  // days. Use the same four-day window for each recipient so a dense map cannot
  // turn several distinct returning people into a notification burst.
  const recipientWindowBucket = Math.floor(input.location.collectedAtMs / NEARBY_NOTIFICATION_RECIPIENT_WINDOW_MS);
  const recipients = await loadNearbyNotificationRecipients(app, input.sourceUserId);
  const recipientLocationEnvelopes = await loadLocationEnvelopes(app, recipients.map((row) => row.id));
  let sent = 0;

  for (const recipient of recipients) {
    const envelope = recipientLocationEnvelopes.get(recipient.id);
    const recipientCoordinates = envelope
      ? locationPayloadToCoordinates(envelope)
      : asVisibilityCoordinates(recipient);

    if (recipientCoordinates.lat == null || recipientCoordinates.lng == null) {
      continue;
    }

    const distance = distanceMiles(
      sourceCoordinates.lat,
      sourceCoordinates.lng,
      recipientCoordinates.lat,
      recipientCoordinates.lng
    );

    if (!Number.isFinite(distance) || distance > NEARBY_NOTIFICATION_RADIUS_MILES) {
      continue;
    }

    const rules = recipientRules(app, recipient);
    if (rules && !canSubjectViewProfile(rules, sourceSubject, recipientCoordinates)) {
      continue;
    }

    const notification = await createAppNotificationAndPush(app, {
      userId: recipient.id,
      type: "nearby_activity",
      title: "Someone nearby",
      body: "Someone within your radar may be in your area.",
      linkUrl: "/map?layer=nearby",
      dedupeKey: `nearby:${recipient.id}:${recipientWindowBucket}`,
      // Server-only lookup for the anonymous area. Public serialization strips identity.
      metadata: {
        sourceUserId: input.sourceUserId
      }
    });
    if (notification) {
      sent += 1;
    }
  }

  return {
    attempted: true,
    sent
  };
}
