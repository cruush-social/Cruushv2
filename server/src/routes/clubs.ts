import type { FastifyInstance } from "fastify";
import {
  clubVisibilityPayloadSchema,
  clubDirectoryQuerySchema,
  clubParamsSchema,
  createClubPayloadSchema,
  reviewClubJoinRequestParamsSchema,
  reviewClubJoinRequestPayloadSchema,
  updateClubPayloadSchema
} from "../club-schema.js";
import { ApiError } from "../errors.js";
import {
  buildClubEnrollmentPayload,
  createClubEnrollmentUserIndex,
  deleteClubEnrollment,
  deleteClubEnrollmentsForClub,
  findClubEnrollment,
  listClubJoinRequests,
  listClubMemberships,
  listUserClubMemberships,
  upsertClubEnrollment,
} from "../encrypted-club-enrollments.js";
import { runTransaction, type DbClient } from "../db.js";
import { admitLockedClubMember, assertActiveClubJoiner, assertClubAdmissionOpen, MAX_CLUB_MEMBERS, withLockedClubAdmission } from "../club-admission.js";
import { loadLocationEnvelopes, locationPayloadToCoordinates } from "../location-privacy.js";
import { getRelationshipPermissions } from "../match-relationships.js";
import { moderateTextOrReject } from "../moderation-service.js";
import { OWNER_FULL_ACCESS_EMAIL } from "../owner-access.js";
import { getActiveAccountUserId, getAuthenticatedUserId } from "../request-auth.js";
import { distanceMiles } from "../service-area.js";
import { emptyProfile } from "../profile-schema.js";
import { decryptProfileVisibility, decryptSensitiveProfile, encryptProfileVisibility } from "../profile-sensitive.js";
import { canSubjectViewProfile, visibilityRulesArePublic, type VisibilitySubjectProfile } from "../profile-visibility.js";

type ClubRowBase = {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  current_user_role: "owner" | "admin" | "moderator" | "member" | null;
  conversation_id: string | null;
  member_count: number;
  requires_join_approval: boolean;
  visibility_ciphertext: string | null;
  visibility_nonce: string | null;
  visibility_auth_tag: string | null;
  visibility_key_version: string | null;
};
type ClubDirectoryRow = ClubRowBase & {
  pending_join_request_count: number;
  owner_user_id: string;
  last_activity_at: string | Date;
};
type ClubDetailRow = ClubRowBase & {
  join_request_pending: boolean;
  owner_user_id: string;
};
type ClubApplicantRow = {
  user_id: string;
  name: string;
  photo: string | null;
  requested_at: string | Date;
};
type ClubVisibilitySubjectRow = {
  display_name: string | null;
  bio: string | null;
  tags: string[] | null;
  photos: string[] | null;
  year_of_birth: number | null;
  identities: string[] | null;
  presentation: string[] | null;
  sexuality: string[] | null;
  body_type: string[] | null;
  body_hair: string[] | null;
  pubic_hair: string[] | null;
  facial_hair: string[] | null;
  looking_for: string[] | null;
  availability: string[] | null;
  hosting_travel: string[] | null;
  preferred_spots: string[] | null;
  vibes: string[] | null;
  zodiac: string[] | null;
  scenes: string[] | null;
  archetypes: string[] | null;
  hobbies: string[] | null;
  position: string[] | null;
  role: string[] | null;
  kinks: string[] | null;
  substance_boundaries: string[] | null;
  protection_boundaries: string[] | null;
  profile_sensitive_ciphertext: string | null;
  profile_sensitive_nonce: string | null;
  profile_sensitive_auth_tag: string | null;
  profile_sensitive_key_version: string | null;
  mile_high_club_member: boolean;
};

const adminRoles = new Set(["owner", "admin"]);
const requestReviewRoles = new Set(["owner", "admin", "moderator"]);
const CLUB_BROWSE_RADIUS_MILES = 50;

function mapClubDirectory(row: ClubDirectoryRow) {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    tags: row.tags,
    currentUserRole: row.current_user_role,
    conversationId: row.current_user_role ? row.conversation_id : null,
    pendingJoinRequestCount: row.pending_join_request_count,
    memberCount: row.member_count,
    requiresJoinApproval: row.requires_join_approval,
    lastActiveAt: new Date(row.last_activity_at).toISOString()
  };
}

function decryptClubVisibility(app: FastifyInstance, row: ClubRowBase, failClosed = false) {
  const rules = decryptProfileVisibility(app.config, {
    profile_visibility_ciphertext: row.visibility_ciphertext,
    profile_visibility_nonce: row.visibility_nonce,
    profile_visibility_auth_tag: row.visibility_auth_tag,
    profile_visibility_key_version: row.visibility_key_version
  });
  if (failClosed && !rules && (row.visibility_ciphertext || row.visibility_nonce || row.visibility_auth_tag)) {
    throw new ApiError(404, "NOT_FOUND", "Coven not found.");
  }
  return rules ?? emptyProfile.visibility_rules;
}

async function loadClubVisibilitySubject(app: FastifyInstance, userId: string, db: DbClient = app.db): Promise<VisibilitySubjectProfile | null> {
  const result = await db.query<ClubVisibilitySubjectRow>(
    `select
       profile.display_name,
       profile.bio,
       profile.tags,
       profile.photos,
       profile.year_of_birth,
       profile.identities,
       profile.presentation,
       profile.sexuality,
       profile.body_type,
       profile.body_hair,
       profile.pubic_hair,
       profile.facial_hair,
       profile.looking_for,
       profile.availability,
       profile.hosting_travel,
       profile.preferred_spots,
       profile.vibes,
       profile.zodiac,
       profile.scenes,
       profile.archetypes,
       profile.hobbies,
       profile.position,
       profile.role,
       profile.kinks,
       profile.substance_boundaries,
       profile.protection_boundaries,
       profile.profile_sensitive_ciphertext,
       profile.profile_sensitive_nonce,
       profile.profile_sensitive_auth_tag,
       profile.profile_sensitive_key_version,
       exists (
         select 1 from user_travel_pins travel
         where travel.user_id = profile.id and travel.set_at > now() - interval '24 hours'
       ) as mile_high_club_member
     from profiles profile
     where profile.id = $1`,
    [userId]
  );
  const row = result.rows[0];
  if (!row) return null;
  const sensitive = decryptSensitiveProfile(app.config, row);
  const kinks = sensitive?.kink_interests.length
    ? sensitive.kink_interests.map((interest) => interest.label ?? interest.kink_id)
    : sensitive?.kinks ?? row.kinks ?? [];

  return {
    display_name: row.display_name,
    bio: row.bio,
    tags: row.tags ?? [],
    has_photo: (row.photos?.length ?? 0) > 0,
    mile_high_club_member: row.mile_high_club_member,
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
    crowds: sensitive?.crowds ?? [],
    hobbies: row.hobbies ?? [],
    positions: row.position ?? [],
    roles: row.role ?? [],
    kinks,
    body_types: row.body_type ?? [],
    body_hair: row.body_hair ?? [],
    pubic_hair: row.pubic_hair ?? [],
    facial_hair: row.facial_hair ?? [],
    sexuality: row.sexuality ?? [],
    zodiac: row.zodiac ?? [],
    substance_boundaries: row.substance_boundaries ?? [],
    protection_boundaries: row.protection_boundaries ?? []
  };
}

async function assertClubVisibleToViewer(app: FastifyInstance, row: ClubDetailRow, userId: string, failClosed = false, db: DbClient = app.db) {
  if (row.current_user_role) return;
  const rules = decryptClubVisibility(app, row, failClosed);
  if (visibilityRulesArePublic(rules)) return;

  const subject = await loadClubVisibilitySubject(app, userId, db);
  const locations = await loadLocationEnvelopes({ config: app.config, db }, [userId, row.owner_user_id]);
  const viewerLocation = locations.get(userId);
  const ownerLocation = locations.get(row.owner_user_id);
  const viewer = subject && viewerLocation
    ? { ...subject, coordinates: locationPayloadToCoordinates(viewerLocation) }
    : subject;
  const ownerCoordinates = ownerLocation ? locationPayloadToCoordinates(ownerLocation) : null;

  if (!viewer || !canSubjectViewProfile(rules, viewer, ownerCoordinates)) {
    throw new ApiError(404, "NOT_FOUND", "Coven not found.");
  }
}

function mapClubDetail(app: FastifyInstance, row: ClubDetailRow) {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    tags: row.tags,
    memberCount: row.member_count,
    requiresJoinApproval: row.requires_join_approval,
    currentUserRole: row.current_user_role,
    conversationId: row.current_user_role ? row.conversation_id : null,
    joinRequestStatus: row.current_user_role
      ? "member" as const
      : row.join_request_pending
        ? "pending" as const
        : "none" as const,
    ...(adminRoles.has(row.current_user_role ?? "")
      ? { visibilityRules: decryptClubVisibility(app, row) }
      : {})
  };
}

async function assertMutualClubMembers(app: FastifyInstance, userId: string, memberIds: string[]) {
  for (const memberId of memberIds) {
    const relationship = await getRelationshipPermissions(app, userId, memberId);
    if (!relationship.canMessage || !relationship.isMutualCruush) {
      throw new ApiError(403, "MUTUAL_CRUUSH_REQUIRED", "Covens can only start with cruushes.");
    }
  }
}

async function moderateClubMetadata(
  app: FastifyInstance,
  userId: string,
  metadata: { title: string; summary: string; tags: string[] },
  clubId?: string
) {
  await moderateTextOrReject(app, {
    userId,
    surface: "group_message",
    text: [metadata.title, metadata.summary, ...metadata.tags].join("\n"),
    contentRef: { kind: "club_metadata", ...(clubId ? { clubId } : {}) },
    persistAllowedReview: false
  });
}

async function loadClubDetail(app: FastifyInstance, clubId: string, userId: string, db: DbClient = app.db) {
  const result = await db.query<Omit<ClubDetailRow, "current_user_role" | "conversation_id" | "join_request_pending" | "member_count" | "owner_user_id"> & { conversation_id: string | null }>(
    `select
       c.id::text as id,
       c.title,
       c.summary,
       c.requires_join_approval,
       coalesce((
         select array_agg(ct.tag order by ct.tag)
         from club_tags ct
         where ct.club_id = c.id
       ), '{}'::text[]) as tags,
       c.visibility_ciphertext,
       c.visibility_nonce,
       c.visibility_auth_tag,
       c.visibility_key_version,
       c.conversation_id::text as conversation_id
     from clubs c
     where c.id = $1 and c.directory_visible = true`,
    [clubId]
  );
  const rawClub = result.rows[0];
  if (!rawClub) throw new ApiError(404, "NOT_FOUND", "Coven not found.");
  const context = { config: app.config, db };
  const membership = await findClubEnrollment(context, { clubId, userId, type: "membership" });
  const joinRequest = await findClubEnrollment(context, { clubId, userId, type: "join_request" });
  const memberships = await listClubMemberships(context, clubId);
  const owner = memberships.find((record) => record.payload.role === "owner");
  const club: ClubDetailRow = {
    ...rawClub,
    current_user_role: membership?.payload.role ?? null,
    conversation_id: membership ? rawClub.conversation_id : null,
    join_request_pending: Boolean(joinRequest),
    member_count: memberships.length,
    owner_user_id: owner?.payload.userId ?? ""
  };
  return club;
}

async function requireClubRole(
  app: FastifyInstance,
  clubId: string,
  userId: string,
  allowedRoles: Set<string>,
  message: string,
  db: DbClient = app.db
) {
  const membership = await findClubEnrollment(
    { config: app.config, db },
    { clubId, userId, type: "membership" }
  );
  if (!membership?.payload.role || !allowedRoles.has(membership.payload.role)) {
    throw new ApiError(403, "FORBIDDEN", message);
  }
  return membership.payload.role;
}

export async function registerClubRoutes(app: FastifyInstance) {
  app.get("/api/clubs", async (request) => {
    const userId = await getAuthenticatedUserId(request);
    const query = clubDirectoryQuerySchema.parse(request.query);
    const result = await app.db.query<Omit<ClubDirectoryRow, "current_user_role" | "conversation_id" | "pending_join_request_count" | "member_count" | "owner_user_id"> & { conversation_id: string | null }>(
      `select
         c.id::text as id,
         c.title,
         c.summary,
         c.requires_join_approval,
         c.visibility_ciphertext,
         c.visibility_nonce,
         c.visibility_auth_tag,
         c.visibility_key_version,
         coalesce((select array_agg(ct.tag order by ct.tag) from club_tags ct where ct.club_id = c.id), '{}'::text[]) as tags,
         c.conversation_id::text as conversation_id,
         coalesce(latest_activity.created_at, c.created_at) as last_activity_at
       from clubs c
       left join lateral (
         select max(message.created_at) as created_at
         from messages message
         where message.conversation_id = c.conversation_id
           and (message.expires_at is null or message.expires_at > now())
       ) latest_activity on true
       where c.directory_visible = true
         and (
           (cardinality($1::text[]) = 0 and $2 = '')
           or lower(c.title) like '%' || $2 || '%'
           or lower(c.summary) like '%' || $2 || '%'
           or exists (
             select 1 from club_tags matching_tag
             where matching_tag.club_id = c.id and matching_tag.tag = any($1::text[])
           )
         )
       order by coalesce(latest_activity.created_at, c.created_at) desc, c.title, c.id`,
      [query.tags, query.q]
    );
    const context = { config: app.config, db: app.db };
    const viewerMemberships = await listUserClubMemberships(context, userId);
    const viewerRoleByClub = new Map(viewerMemberships.map((record) => [record.payload.clubId, record.payload.role ?? "member"]));
    const enrichedRows = await Promise.all(result.rows.map(async (row): Promise<ClubDirectoryRow> => {
      const [memberships, requests] = await Promise.all([
        listClubMemberships(context, row.id),
        listClubJoinRequests(context, row.id)
      ]);
      const role = viewerRoleByClub.get(row.id) ?? null;
      return {
        ...row,
        current_user_role: role,
        conversation_id: role ? row.conversation_id : null,
        pending_join_request_count: role && requestReviewRoles.has(role) ? requests.length : 0,
        member_count: memberships.length,
        owner_user_id: memberships.find((record) => record.payload.role === "owner")?.payload.userId ?? ""
      };
    }));
    let visibleRows = enrichedRows;
    const browseDistances = new Map<string, number>();
    try {
      const ownerUserIds = enrichedRows.map((row) => row.owner_user_id).filter(Boolean);
      const locations = await loadLocationEnvelopes(app, [userId, ...ownerUserIds]);
      const viewerLocation = locations.get(userId);
      const needsVisibilitySubject = enrichedRows.some((row) =>
        !row.current_user_role && !visibilityRulesArePublic(decryptClubVisibility(app, row))
      );
      const visibilitySubject = needsVisibilitySubject
        ? await loadClubVisibilitySubject(app, userId)
        : null;
      const viewerSubject = visibilitySubject && viewerLocation
        ? { ...visibilitySubject, coordinates: locationPayloadToCoordinates(viewerLocation) }
        : visibilitySubject;

      visibleRows = visibleRows.filter((row) => {
        if (row.current_user_role) return true;
        const rules = decryptClubVisibility(app, row);
        if (visibilityRulesArePublic(rules)) return true;
        const ownerLocation = locations.get(row.owner_user_id);
        const ownerCoordinates = ownerLocation ? locationPayloadToCoordinates(ownerLocation) : null;
        return Boolean(viewerSubject && canSubjectViewProfile(rules, viewerSubject, ownerCoordinates));
      });
      if (viewerLocation) {
        const viewerCoordinates = locationPayloadToCoordinates(viewerLocation);
        visibleRows = visibleRows.filter((row) => {
          if (row.current_user_role) return true;
          const ownerLocation = locations.get(row.owner_user_id);
          if (!ownerLocation) return false;
          const distance = distanceMiles(viewerCoordinates, locationPayloadToCoordinates(ownerLocation));
          browseDistances.set(row.id, distance);
          return distance <= CLUB_BROWSE_RADIUS_MILES;
        });
      }
    } catch (error) {
      app.log.warn({ err: error, userId }, "Club nearby filtering unavailable");
      visibleRows = visibleRows.filter((row) =>
        Boolean(row.current_user_role) || visibilityRulesArePublic(decryptClubVisibility(app, row))
      );
    }

    if (query.sort === "nearby") {
      visibleRows = [...visibleRows].sort((left, right) => {
        if (left.current_user_role || right.current_user_role) return 0;
        return (browseDistances.get(left.id) ?? Number.POSITIVE_INFINITY)
          - (browseDistances.get(right.id) ?? Number.POSITIVE_INFINITY);
      });
    }

    return { data: visibleRows.map(mapClubDirectory) };
  });

  app.post("/api/clubs", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const payload = createClubPayloadSchema.parse(request.body);
    const memberIds = payload.memberIds.filter((memberId) => memberId !== userId);
    if (memberIds.length >= MAX_CLUB_MEMBERS) {
      throw new ApiError(400, "VALIDATION_ERROR", `Covens can have at most ${MAX_CLUB_MEMBERS} members.`);
    }

    await assertMutualClubMembers(app, userId, memberIds);
    await moderateClubMetadata(app, userId, payload);
    const requestedVisibility = payload.visibilityRules
      ? encryptProfileVisibility(app.config, payload.visibilityRules)
      : null;
    const created = await runTransaction(app.db, async (db) => {
      const result = await db.query<{ id: string; conversation_id: string }>(
      `with eligible_creator as (
         select u.id,
                p.profile_visibility_ciphertext,
                p.profile_visibility_nonce,
                p.profile_visibility_auth_tag,
                p.profile_visibility_key_version,
                p.profile_visibility_token_key_version
         from app_users u
         join profiles p on p.id = u.id
         left join user_trust_profiles trust on trust.user_id = u.id
         where u.id = $1
           and (
             lower(u.email) = $5
             or (
               coalesce(trust.is_suspended, false) = false
               and coalesce(trust.trust_score, 50) > 20
               and not exists (
                 select 1 from suspensions suspension
                 where suspension.user_id = u.id
                   and (suspension.permanent or suspension.ends_at is null or suspension.ends_at > now())
               )
               and not exists (
                 select 1 from feature_restrictions restriction
                 where restriction.user_id = u.id
                   and restriction.feature = 'group_creation'
                   and (restriction.ends_at is null or restriction.ends_at > now())
               )
             )
           )
       ), inserted_conversation as (
         insert into conversations (kind, title, tags, created_by)
         select 'group', $2, $4::text[], id
         from eligible_creator
         returning id
       ), inserted_club as (
         insert into clubs (
           title, summary, directory_visible, conversation_id,
           visibility_ciphertext, visibility_nonce, visibility_auth_tag,
           visibility_key_version, visibility_token_key_version, requires_join_approval
         )
         select $2, $3, true, inserted_conversation.id,
                coalesce($6, eligible_creator.profile_visibility_ciphertext),
                coalesce($7, eligible_creator.profile_visibility_nonce),
                coalesce($8, eligible_creator.profile_visibility_auth_tag),
                coalesce($9, eligible_creator.profile_visibility_key_version, 'v1'),
                coalesce($10, eligible_creator.profile_visibility_token_key_version, 'v1'), $11
         from inserted_conversation cross join eligible_creator
         returning id, conversation_id
       ), inserted_tags as (
         insert into club_tags (club_id, tag)
         select inserted_club.id, tag from inserted_club cross join unnest($4::text[]) as tags(tag)
       )
       select id::text as id, conversation_id::text as conversation_id from inserted_club`,
      [
        userId,
        payload.title,
        payload.summary,
        payload.tags,
        OWNER_FULL_ACCESS_EMAIL,
        requestedVisibility?.profile_visibility_ciphertext ?? null,
        requestedVisibility?.profile_visibility_nonce ?? null,
        requestedVisibility?.profile_visibility_auth_tag ?? null,
        requestedVisibility?.profile_visibility_key_version ?? null,
        requestedVisibility?.profile_visibility_token_key_version ?? null,
        payload.requiresJoinApproval
      ]
      );
      const row = result.rows[0];
      if (!row) throw new ApiError(403, "FEATURE_RESTRICTED", "Coven creation is unavailable for this account.");
      const enrollments = [{ userId, role: "owner" as const }, ...memberIds.map((memberId) => ({ userId: memberId, role: "member" as const }))];
      for (const enrollment of enrollments) {
        await upsertClubEnrollment(
          { config: app.config, db },
          buildClubEnrollmentPayload({
            type: "membership",
            status: "active",
            clubId: row.id,
            userId: enrollment.userId,
            role: enrollment.role
          })
        );
        await db.query(
          `insert into conversation_members (conversation_id, user_id, member_index, role, last_read_at)
           values ($1, null, $2, 'member', case when $3 then now() else null end)
           on conflict (conversation_id, member_index) where member_index is not null do nothing`,
          [row.conversation_id, createClubEnrollmentUserIndex(app.config, enrollment.userId), enrollment.role === "owner"]
        );
      }
      return row;
    });

    return reply.code(201).send({
      data: {
        id: created.id,
        title: payload.title,
        summary: payload.summary,
        tags: payload.tags,
        currentUserRole: "owner",
        conversationId: created.conversation_id,
        memberCount: memberIds.length + 1,
        requiresJoinApproval: payload.requiresJoinApproval,
        joinRequestStatus: "member"
      }
    });
  });

  app.get("/api/clubs/:clubId", async (request) => {
    const userId = await getAuthenticatedUserId(request);
    const { clubId } = clubParamsSchema.parse(request.params);
    const club = await loadClubDetail(app, clubId, userId);
    await assertClubVisibleToViewer(app, club, userId);
    return { data: mapClubDetail(app, club) };
  });

  app.patch("/api/clubs/:clubId", async (request) => {
    const userId = await getActiveAccountUserId(request);
    const { clubId } = clubParamsSchema.parse(request.params);
    const payload = updateClubPayloadSchema.parse(request.body);
    await requireClubRole(app, clubId, userId, adminRoles, "Only Coven owners and admins can edit this Coven.");

    await moderateClubMetadata(app, userId, payload, clubId);
    await app.db.query(
      `with updated_club as (
         update clubs set title = $2, summary = $3, updated_at = now() where id = $1 returning conversation_id
       ), removed_tags as (
         delete from club_tags where club_id = $1 and not (tag = any($4::text[]))
       ), inserted_tags as (
         insert into club_tags (club_id, tag)
         select $1, tag from unnest($4::text[]) as tags(tag)
         on conflict (club_id, tag) do nothing
       )
       update conversations set title = $2, tags = $4::text[], updated_at = now()
       where id = (select conversation_id from updated_club)`,
      [clubId, payload.title, payload.summary, payload.tags]
    );
    return { data: mapClubDetail(app, await loadClubDetail(app, clubId, userId)) };
  });

  app.put("/api/clubs/:clubId/visibility", async (request) => {
    const userId = await getActiveAccountUserId(request);
    const { clubId } = clubParamsSchema.parse(request.params);
    const payload = clubVisibilityPayloadSchema.parse(request.body);
    const encrypted = encryptProfileVisibility(app.config, payload.visibilityRules);
    await requireClubRole(app, clubId, userId, adminRoles, "Only Coven owners and admins can edit Coven visibility.");
    const result = await app.db.query<{ id: string }>(
      `update clubs club
       set visibility_ciphertext = $2,
           visibility_nonce = $3,
           visibility_auth_tag = $4,
           visibility_key_version = $5,
           visibility_token_key_version = $6,
           updated_at = now()
       where club.id = $1
       returning club.id::text as id`,
      [
        clubId,
        encrypted.profile_visibility_ciphertext,
        encrypted.profile_visibility_nonce,
        encrypted.profile_visibility_auth_tag,
        encrypted.profile_visibility_key_version,
        encrypted.profile_visibility_token_key_version
      ]
    );
    if (!result.rows[0]) {
      throw new ApiError(403, "FORBIDDEN", "Only Coven owners and admins can edit Coven visibility.");
    }
    return { data: { visibilityRules: payload.visibilityRules } };
  });

  app.delete("/api/clubs/:clubId", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const { clubId } = clubParamsSchema.parse(request.params);
    const result = await app.db.query<{ id: string }>(
      "select id::text as id from clubs where id = $1",
      [clubId]
    );

    if (!result.rows[0]) {
      throw new ApiError(404, "NOT_FOUND", "Coven not found.");
    }
    await requireClubRole(app, clubId, userId, adminRoles, "Only Coven owners and admins can delete this Coven.");

    const conversation = await app.db.query<{ conversation_id: string | null }>(
      "select conversation_id::text as conversation_id from clubs where id = $1",
      [clubId]
    );
    await runTransaction(app.db, async (db) => {
      await db.query("delete from clubs where id = $1", [clubId]);
      if (conversation.rows[0]?.conversation_id) {
        await db.query("delete from conversations where id::text = $1", [conversation.rows[0].conversation_id]);
      }
      await deleteClubEnrollmentsForClub({ config: app.config, db }, clubId);
    });
    return reply.code(204).send();
  });

  app.post("/api/clubs/:clubId/join-requests", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const { clubId } = clubParamsSchema.parse(request.params);
    const data = await withLockedClubAdmission(app, clubId, async (context) => {
      await assertActiveClubJoiner(context, userId);
      const club = await loadClubDetail(app, clubId, userId, context.db);
      await assertClubVisibleToViewer(app, club, userId, true, context.db);
      assertClubAdmissionOpen(context);
      if (context.club.requires_join_approval === false) {
        await admitLockedClubMember(context, userId);
        return { joinRequestStatus: "member" as const, conversationId: context.club.conversation_id };
      }
      const membership = await findClubEnrollment(context, { clubId, userId, type: "membership" });
      if (membership) throw new ApiError(409, "VALIDATION_ERROR", "You are already a Coven member.");
      await upsertClubEnrollment(context, buildClubEnrollmentPayload({
        type: "join_request", status: "pending", clubId, userId, applicationAnswer: null
      }));
      return { joinRequestStatus: "pending" as const };
    });
    return reply.code(201).send({ data });
  });

  app.get("/api/clubs/:clubId/join-requests", async (request) => {
    const userId = await getActiveAccountUserId(request);
    const { clubId } = clubParamsSchema.parse(request.params);
    await requireClubRole(app, clubId, userId, requestReviewRoles, "Only Coven owners, admins, and moderators can review requests.");
    const requests = await listClubJoinRequests({ config: app.config, db: app.db }, clubId);
    if (requests.length === 0) return { data: [] };
    const applicantIds = requests.map((record) => record.payload.userId);
    const result = await app.db.query<Omit<ClubApplicantRow, "requested_at">>(
      `select applicant.id::text as user_id,
         coalesce(profile.display_name, applicant.display_name, applicant.email) as name,
         profile.photos[1] as photo,
         applicant.id
       from app_users applicant
       left join profiles profile on profile.id = applicant.id
       where applicant.id = any($1::uuid[])`,
      [applicantIds]
    );
    const applicants = new Map(result.rows.map((row) => [row.user_id, row]));
    return {
      data: requests.flatMap((record) => {
        const row = applicants.get(record.payload.userId);
        return row ? [{
          userId: row.user_id,
          name: row.name,
          photo: row.photo,
          requestedAt: record.payload.createdAt
        }] : [];
      })
    };
  });

  app.post("/api/clubs/:clubId/join-requests/:requesterUserId", async (request) => {
    const userId = await getActiveAccountUserId(request);
    const { clubId, requesterUserId } = reviewClubJoinRequestParamsSchema.parse(request.params);
    const { decision } = reviewClubJoinRequestPayloadSchema.parse(request.body);
    await withLockedClubAdmission(app, clubId, async (txContext) => {
      await requireClubRole(app, clubId, userId, requestReviewRoles, "Only Coven owners, admins, and moderators can review requests.", txContext.db);
      const pending = await findClubEnrollment(txContext, { clubId, userId: requesterUserId, type: "join_request" });
      if (!pending) throw new ApiError(404, "NOT_FOUND", "Join request not found.");
      if (decision === "approve") {
        await admitLockedClubMember(txContext, requesterUserId);
      }
      await deleteClubEnrollment(txContext, { clubId, userId: requesterUserId, type: "join_request" });
    });
    return { data: { decision } };
  });
}
