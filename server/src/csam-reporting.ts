import { createHash, randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { ApiError } from "./errors.js";
import { encryptMediaBytes } from "./media-encryption.js";
import { writeEncryptedMediaObject } from "./media-storage.js";
import { sendTrustSafetyAlertEmail } from "./mailer.js";
import type { ModerationSurface } from "./moderation-types.js";
import { checkPhotoDna, type PhotoDnaResult } from "./photodna.js";
import {
  persistSevereAccessBan,
  type SevereAccessBanIdentity
} from "./severe-access-bans.js";

// Deliberately does not say what matched. It does give a way to appeal, which
// a member with a false positive otherwise had no route to.
const PHOTO_REJECTED_MESSAGE = "This photo was not saved because an automated safety check rejected it. Write to reports@cruush.app if you think this is wrong.";
const PHOTODNA_UNAVAILABLE_MESSAGE = "Automated photo safety checks are temporarily unavailable. Try again later.";

export type PhotoDnaUploadInput = {
  userId: string;
  surface: Extract<ModerationSurface, "profile_photo" | "direct_message" | "group_message">;
  imageBytes: Buffer;
  mimeType: string;
  filename?: string;
  sourceRoute: string;
  requestIp?: string;
  userAgent?: string;
  severeAccessBanIdentity?: SevereAccessBanIdentity;
  contentId?: string;
  contentRef?: Record<string, unknown>;
};

type CsamIncidentRow = {
  id: string;
  user_id: string | null;
  user_email: string | null;
  user_display_name: string | null;
  surface: string;
  status: string;
  reporting_mode: string;
  test_mode: boolean;
  environment: string;
  provider: string;
  provider_request_id: string | null;
  photodna_result: Record<string, unknown>;
  alert_status: string;
  alert_error: string | null;
  cybertipline_report_id: string | null;
  ncmec_reported_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
};

type CsamEvidenceRow = {
  id: string;
  object_key: string;
  sha256_hex: string;
  original_filename: string | null;
  mime_type: string;
  byte_size: number;
  source_route: string;
  request_ip: string | null;
  user_agent: string | null;
  created_at: string | Date;
};

type CsamEventRow = {
  id: string;
  event_type: string;
  metadata: Record<string, unknown>;
  created_at: string | Date;
};

function toIso(value: string | Date | null) {
  return value ? new Date(value).toISOString() : null;
}

function sha256Hex(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function extensionForMimeType(mimeType: string) {
  if (mimeType === "image/jpeg") {
    return "jpg";
  }

  if (mimeType === "image/webp") {
    return "webp";
  }

  return "png";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function insertIncidentEvent(app: FastifyInstance, incidentId: string, eventType: string, metadata: Record<string, unknown> = {}) {
  await app.db.query(
    `insert into csam_incident_events (incident_id, event_type, metadata)
     values ($1, $2, $3::jsonb)`,
    [incidentId, eventType, JSON.stringify(metadata)]
  );
}

async function lockAccountForCsamMatch(
  app: FastifyInstance,
  userId: string,
  incidentId: string,
  severeAccessBanIdentity?: SevereAccessBanIdentity
) {
  await app.db.query(
    `insert into user_trust_profiles (user_id, trust_score, trust_level, report_weight, max_future_trust, is_suspended)
     values ($1, 0, 'restricted', 0, 0, true)
     on conflict (user_id) do update
     set trust_score = 0,
         trust_level = 'restricted',
         report_weight = 0,
         max_future_trust = 0,
         is_suspended = true,
         updated_at = now()`,
    [userId]
  );
  await app.db.query(
    `update app_users
     set account_status = 'suspended',
         account_status_updated_at = now()
     where id = $1`,
    [userId]
  );
  await app.db.query(
    "delete from app_sessions where user_id = $1",
    [userId]
  );
  await app.db.query(
    `insert into trust_events (user_id, event_type, value, decays, permanent, source, metadata)
     values ($1, 'photodna_csam_match', -100, false, true, 'automod', $2::jsonb)`,
    [userId, JSON.stringify({ incidentId })]
  );
  await app.db.query(
    `insert into suspensions (user_id, reason_code, permanent)
     values ($1, 'photodna_csam_match', true)`,
    [userId]
  );
  await app.db.query(
    `insert into feature_restrictions (user_id, feature, scope, reason_code)
     values
       ($1, 'photo_uploads', 'global', 'photodna_csam_match'),
       ($1, 'direct_messages', 'global', 'photodna_csam_match'),
       ($1, 'group_messages', 'global', 'photodna_csam_match'),
       ($1, 'feed_posting', 'global', 'photodna_csam_match'),
       ($1, 'group_creation', 'global', 'photodna_csam_match'),
       ($1, 'profile_updates', 'global', 'photodna_csam_match'),
       ($1, 'map_visibility', 'global', 'photodna_csam_match'),
       ($1, 'crowd_visibility', 'global', 'photodna_csam_match')`,
    [userId]
  );
  await persistSevereAccessBan(
    app.db,
    userId,
    "photodna_csam_match",
    severeAccessBanIdentity
  );
}

async function recordPhotoDnaContentReview(app: FastifyInstance, input: PhotoDnaUploadInput, incidentId: string, photoDnaResult: PhotoDnaResult) {
  const providerRequestId = photoDnaResult.providerRequestId ?? incidentId;

  await app.db.query(
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
     values ($1, $2, 'image', 'rejected', $3, $4::jsonb, 'photodna', $5, $6::jsonb, $7::jsonb, 'blocked', 'photodna_csam_match', 'photodna', $8::jsonb, now())
     returning id`,
    [
      input.userId,
      input.surface,
      input.contentId ?? null,
      JSON.stringify({
        ...(input.contentRef ?? {}),
        incidentId,
        ...(input.filename ? { originalFilename: input.filename } : {})
      }),
      providerRequestId,
      JSON.stringify([{
        provider_label: "photodna_match",
        normalized_label: "csam_match",
        confidence: 1,
        severity: "critical"
      }]),
      JSON.stringify({
        decision: "reject",
        category: "csam",
        severity: "critical",
        confidence: 1,
        reason_code: "photodna_csam_match"
      }),
      JSON.stringify(photoDnaResult.rawResult ?? {})
    ]
  );
}

export async function checkPhotoDnaForUploadOrReject(app: FastifyInstance, input: PhotoDnaUploadInput) {
  let photoDnaResult: PhotoDnaResult;

  try {
    photoDnaResult = await checkPhotoDna(app.config, input.imageBytes);
  } catch (error) {
    app.log.error({
      err: error,
      surface: input.surface,
      sourceRoute: input.sourceRoute,
      contentId: input.contentId,
      photoDnaEnabled: app.config.PHOTODNA_ENABLED,
      apiUrlConfigured: Boolean(app.config.PHOTODNA_API_URL),
      operationPathConfigured: Boolean(app.config.PHOTODNA_OPERATION_PATH),
      subscriptionKeyConfigured: Boolean(app.config.PHOTODNA_SUBSCRIPTION_KEY),
      timeoutMs: app.config.PHOTODNA_TIMEOUT_MS
    }, "photodna check unavailable");
    throw new ApiError(503, "MODERATION_UNAVAILABLE", PHOTODNA_UNAVAILABLE_MESSAGE);
  }

  if (photoDnaResult.status === "blocked") {
    await handlePhotoDnaMatch(app, input, photoDnaResult);
  }

  return photoDnaResult;
}

export async function handlePhotoDnaMatch(app: FastifyInstance, input: PhotoDnaUploadInput, photoDnaResult: PhotoDnaResult): Promise<never> {
  if (!app.config.CSAM_REPORTING_ENABLED) {
    app.log.error({ userId: input.userId, surface: input.surface }, "photodna match without csam reporting enabled");
    throw new ApiError(503, "MODERATION_UNAVAILABLE", PHOTODNA_UNAVAILABLE_MESSAGE);
  }

  const userResult = await app.db.query<{ email: string | null; display_name: string | null }>(
    "select email, display_name from app_users where id = $1",
    [input.userId]
  );
  const user = userResult.rows[0] ?? { email: null, display_name: null };
  const incidentResult = await app.db.query<{ id: string; created_at: string | Date }>(
    `insert into csam_incidents (
       user_id,
       user_email,
       user_display_name,
       surface,
       status,
       reporting_mode,
       test_mode,
       environment,
       provider,
       provider_request_id,
       photodna_result
     )
     values ($1, $2, $3, $4, 'awaiting_submission', $5, $6, $7, 'photodna', $8, $9::jsonb)
     returning id::text as id, created_at`,
    [
      input.userId,
      user.email,
      user.display_name,
      input.surface,
      app.config.CSAM_REPORTING_MODE ?? "manual_packet",
      Boolean(app.config.CSAM_REPORTING_TEST_MODE),
      app.config.NODE_ENV,
      photoDnaResult.providerRequestId ?? null,
      JSON.stringify(photoDnaResult.rawResult ?? {})
    ]
  );
  const incident = incidentResult.rows[0];

  if (!incident) {
    throw new ApiError(500, "INTERNAL_ERROR", "Failed to create CSAM incident.");
  }

  const encryptedEvidence = encryptMediaBytes(app.config, input.imageBytes);
  const objectKey = `csam-evidence/${incident.id}/${randomUUID()}.${extensionForMimeType(input.mimeType)}.enc`;

  await writeEncryptedMediaObject(app.config, objectKey, encryptedEvidence.ciphertext);
  await app.db.query(
    `insert into csam_incident_evidence (
       incident_id,
       object_key,
       sha256_hex,
       original_filename,
       mime_type,
       byte_size,
       encrypted_data_key,
       data_key_nonce,
       data_key_auth_tag,
       content_nonce,
       content_auth_tag,
       key_version,
       source_route,
       request_ip,
       user_agent
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     returning id`,
    [
      incident.id,
      objectKey,
      sha256Hex(input.imageBytes),
      input.filename ?? null,
      input.mimeType,
      input.imageBytes.length,
      encryptedEvidence.encryptedDataKey,
      encryptedEvidence.dataKeyNonce,
      encryptedEvidence.dataKeyAuthTag,
      encryptedEvidence.nonce,
      encryptedEvidence.authTag,
      encryptedEvidence.keyVersion,
      input.sourceRoute,
      input.requestIp ?? null,
      input.userAgent ?? null
    ]
  );
  await recordPhotoDnaContentReview(app, input, incident.id, photoDnaResult);
  await lockAccountForCsamMatch(
    app,
    input.userId,
    incident.id,
    input.severeAccessBanIdentity
  );
  await insertIncidentEvent(app, incident.id, "match_detected", {
    providerRequestId: photoDnaResult.providerRequestId ?? null,
    surface: input.surface
  });
  await insertIncidentEvent(app, incident.id, "evidence_preserved", {
    objectKey,
    sha256Hex: sha256Hex(input.imageBytes)
  });
  await insertIncidentEvent(app, incident.id, "content_review_recorded");
  await insertIncidentEvent(app, incident.id, "account_locked");

  try {
    await sendTrustSafetyAlertEmail({
      config: app.config,
      logger: app.log,
      incident: {
        id: incident.id,
        userId: input.userId,
        userEmail: user.email,
        surface: input.surface,
        environment: app.config.NODE_ENV,
        testMode: Boolean(app.config.CSAM_REPORTING_TEST_MODE),
        providerRequestId: photoDnaResult.providerRequestId ?? null,
        createdAt: new Date(incident.created_at).toISOString(),
        internalReviewUrl: new URL(`/api/internal/csam-incidents/${incident.id}`, app.config.APP_URL).toString()
      }
    });
    await app.db.query(
      `update csam_incidents
       set alert_status = 'sent',
           updated_at = now()
       where id = $1`,
      [incident.id]
    );
    await insertIncidentEvent(app, incident.id, "alert_sent");
  } catch (error) {
    const message = errorMessage(error).slice(0, 1000);
    app.log.error({ err: error, incidentId: incident.id }, "csam incident alert failed");
    await app.db.query(
      `update csam_incidents
       set alert_status = 'failed',
           alert_error = $2,
           updated_at = now()
       where id = $1`,
      [incident.id, message]
    );
    await insertIncidentEvent(app, incident.id, "alert_failed", { message });
  }

  throw new ApiError(400, "CONTENT_REJECTED", PHOTO_REJECTED_MESSAGE);
}

function mapIncident(row: CsamIncidentRow) {
  return {
    id: row.id,
    userId: row.user_id,
    userEmail: row.user_email,
    userDisplayName: row.user_display_name,
    surface: row.surface,
    status: row.status,
    reportingMode: row.reporting_mode,
    testMode: row.test_mode,
    environment: row.environment,
    provider: row.provider,
    providerRequestId: row.provider_request_id,
    photoDnaResult: row.photodna_result,
    alertStatus: row.alert_status,
    alertError: row.alert_error,
    cyberTiplineReportId: row.cybertipline_report_id,
    ncmecReportedAt: toIso(row.ncmec_reported_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapEvidence(row: CsamEvidenceRow) {
  return {
    id: row.id,
    objectKey: row.object_key,
    sha256Hex: row.sha256_hex,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    sourceRoute: row.source_route,
    requestIp: row.request_ip,
    userAgent: row.user_agent,
    createdAt: toIso(row.created_at)
  };
}

function mapEvent(row: CsamEventRow) {
  return {
    id: row.id,
    eventType: row.event_type,
    metadata: row.metadata,
    createdAt: toIso(row.created_at)
  };
}

export async function getCsamIncidentDetails(app: FastifyInstance, incidentId: string) {
  const incident = await app.db.query<CsamIncidentRow>(
    `select
       id::text as id,
       user_id::text as user_id,
       user_email,
       user_display_name,
       surface,
       status,
       reporting_mode,
       test_mode,
       environment,
       provider,
       provider_request_id,
       photodna_result,
       alert_status,
       alert_error,
       cybertipline_report_id,
       ncmec_reported_at,
       created_at,
       updated_at
     from csam_incidents
     where id = $1`,
    [incidentId]
  );

  if (!incident.rows[0]) {
    throw new ApiError(404, "NOT_FOUND", "CSAM incident not found.");
  }

  const [evidence, events] = await Promise.all([
    app.db.query<CsamEvidenceRow>(
      `select
         id::text as id,
         object_key,
         sha256_hex,
         original_filename,
         mime_type,
         byte_size,
         source_route,
         request_ip,
         user_agent,
         created_at
       from csam_incident_evidence
       where incident_id = $1
       order by created_at asc`,
      [incidentId]
    ),
    app.db.query<CsamEventRow>(
      `select
         id::text as id,
         event_type,
         metadata,
         created_at
       from csam_incident_events
       where incident_id = $1
       order by created_at asc`,
      [incidentId]
    )
  ]);

  return {
    incident: mapIncident(incident.rows[0]),
    evidence: evidence.rows.map(mapEvidence),
    events: events.rows.map(mapEvent)
  };
}

export async function buildCsamReportPacket(app: FastifyInstance, incidentId: string) {
  const details = await getCsamIncidentDetails(app, incidentId);

  await insertIncidentEvent(app, incidentId, "report_packet_generated");

  return {
    ...details,
    reporting: {
      destination: "NCMEC CyberTipline",
      mode: details.incident.reportingMode,
      testMode: details.incident.testMode,
      directSubmissionEnabled: false,
      instructions: "Use this metadata packet for manual CyberTipline submission. Do not email evidence bytes."
    }
  };
}

export async function markCsamIncidentSubmitted(app: FastifyInstance, input: {
  incidentId: string;
  cyberTiplineReportId: string;
  submittedBy?: string;
  notes?: string;
}) {
  const result = await app.db.query<{
    id: string;
    status: string;
    cybertipline_report_id: string;
    ncmec_reported_at: string | Date;
  }>(
    `update csam_incidents
     set status = 'submitted',
         cybertipline_report_id = $2,
         ncmec_reported_at = now(),
         updated_at = now()
     where id = $1
     returning id::text as id, status, cybertipline_report_id, ncmec_reported_at`,
    [input.incidentId, input.cyberTiplineReportId]
  );
  const row = result.rows[0];

  if (!row) {
    throw new ApiError(404, "NOT_FOUND", "CSAM incident not found.");
  }

  await insertIncidentEvent(app, input.incidentId, "ncmec_submitted", {
    cyberTiplineReportId: input.cyberTiplineReportId,
    submittedBy: input.submittedBy ?? null,
    hasNotes: Boolean(input.notes?.trim())
  });

  return {
    id: row.id,
    status: row.status,
    cyberTiplineReportId: row.cybertipline_report_id,
    ncmecReportedAt: toIso(row.ncmec_reported_at)
  };
}
