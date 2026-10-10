import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "./config.js";
import type { DbClient } from "./db.js";
import {
  buildClubEnrollmentPayload,
  createClubEnrollmentUserIndex,
  upsertClubEnrollment,
  type ClubEnrollmentStatus,
  type EncryptedClubEnrollmentRow
} from "./encrypted-club-enrollments.js";
import { loadLocationEnvelopes, type LocationPayload } from "./location-privacy.js";
import { loadTravelPins, type TravelPin } from "./travel-pins.js";
import { createAppNotification } from "./notification-service.js";
import { getNotificationPreferences, isWithinQuietHours, sendPushForNotification } from "./push-service.js";
import { notifyGroupPulseRecipients } from "./pulse-notifications.js";

vi.mock("./notification-service.js", () => ({ createAppNotification: vi.fn() }));
vi.mock("./push-service.js", () => ({
  getNotificationPreferences: vi.fn(), isWithinQuietHours: vi.fn(), sendPushForNotification: vi.fn()
}));
vi.mock("./location-privacy.js", async (original) => ({
  ...await original<typeof import("./location-privacy.js")>(), loadLocationEnvelopes: vi.fn()
}));
vi.mock("./travel-pins.js", async (original) => ({
  ...await original<typeof import("./travel-pins.js")>(), loadTravelPins: vi.fn()
}));

const senderId = "10000000-0000-4000-8000-000000000001";
const recipientId = "10000000-0000-4000-8000-000000000002";
const conversationId = "20000000-0000-4000-8000-000000000001";
const clubId = "30000000-0000-4000-8000-000000000001";
const otherClubId = "30000000-0000-4000-8000-000000000002";
const pulseId = "40000000-0000-4000-8000-000000000001";
const nowMs = Date.parse("2026-10-09T21:00:00.000Z");
const input = { groupPulseId: pulseId, conversationId, senderUserId: senderId, groupTitle: "Existing Club" };
const config = {
  SESSION_SECRET: "unit-test-club-notifications-only",
  CLUB_ENROLLMENT_ENCRYPTION_KEY: "unit-test-club-notifications-encryption-only",
  CLUB_ENROLLMENT_INDEX_KEY: "unit-test-club-notifications-index-only",
  CLUB_ENROLLMENT_ENCRYPTION_KEY_VERSION: "v1",
  CLUB_ENROLLMENT_INDEX_KEY_VERSION: "v1"
} as AppConfig;

function setArea(outside: boolean, activeMhc = false) {
  vi.mocked(loadLocationEnvelopes).mockResolvedValue(new Map([[recipientId, {
    latE7: outside ? 423601000 : 407128000,
    lonE7: outside ? -710589000 : -740060000
  } as LocationPayload]]));
  vi.mocked(loadTravelPins).mockResolvedValue(activeMhc ? new Map([[recipientId, {
    userId: recipientId, latitude: 40.7128, longitude: -74.006,
    setAtMs: nowMs, expiresAtMs: nowMs + 60_000
  } as TravelPin]]) : new Map());
}

async function makeApp(options: {
  status?: ClubEnrollmentStatus; noEnrollment?: boolean; opaqueMember?: boolean;
  tampered?: boolean; wrongClub?: boolean; stalePlainMember?: boolean;
  accountStatus?: string; closed?: boolean; muted?: boolean; timedMute?: boolean;
  reached?: boolean; interrupted?: boolean; duplicateClaim?: boolean;
} = {}) {
  const enrollmentRows: EncryptedClubEnrollmentRow[] = [];
  const members = [senderId, ...(options.opaqueMember === false ? [] : [recipientId])].map((userId) => ({
    user_id: null, member_index: createClubEnrollmentUserIndex(config, userId),
    club_id: clubId, muted: userId === recipientId && Boolean(options.muted || options.timedMute)
  }));
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("insert into encrypted_club_enrollments")) {
      const row = {
        id: `enrollment-${enrollmentRows.length}`, record_lookup_index: params[0], club_index: params[1],
        user_index: params[2], record_type_index: params[3], status_index: params[4],
        record_ciphertext: params[5], record_nonce: params[6], record_auth_tag: params[7],
        encryption_key_version: params[8], index_key_version: params[9], created_at: params[10], updated_at: params[10]
      } as EncryptedClubEnrollmentRow;
      enrollmentRows.push(row);
      return { rows: [row] };
    }
    if (sql.includes("from encrypted_club_enrollments")) {
      return { rows: enrollmentRows.filter((row) => row.club_index === params[0]
        && row.record_type_index === params[1] && row.status_index === params[2]
        && row.index_key_version === params[3]) };
    }
    if (sql.includes("from conversation_members")) {
      expect(params).toEqual([conversationId, senderId]);
      if (options.closed) return { rows: [] };
      // Reproduce the native storage boundary: the old plaintext-only inner
      // join cannot reach opaque Club conversation members at all.
      if (!sql.includes("member.member_index")) {
        return { rows: options.stalePlainMember ? [{ user_id: recipientId, muted: false }] : [] };
      }
      expect(sql).toContain("conversation.closed_at is null");
      expect(sql).toContain("member.user_id is null");
      expect(sql).toContain("coalesce(recipient.account_status, 'active') = 'active'");
      expect(sql).toContain("case when club.id is not null");
      expect(sql).toContain("else member.muted end as muted");
      if (options.timedMute) expect(sql).toContain("member.muted_until > now()");
      return { rows: members };
    }
    if (sql.includes("from app_users")) {
      expect(sql).toContain("coalesce(account_status, 'active') = 'active'");
      return { rows: (params[0] as string[]).filter((id) => id === recipientId
        && (!options.accountStatus || options.accountStatus === "active")).map((user_id) => ({ user_id })) };
    }
    if (sql.includes("from map_ping_notifications")) {
      const sameSender = sql.includes("sender_user_id = $1");
      expect(params[1]).toBe(new Date(nowMs - (sameSender ? 24 : 4) * 60 * 60 * 1000).toISOString());
      return { rows: (sameSender ? options.reached : options.interrupted) ? [{ recipient_user_id: recipientId }] : [] };
    }
    if (sql.includes("insert into map_ping_notifications")) {
      expect(params).toEqual([pulseId, senderId, recipientId]);
      expect(sql).toContain("on conflict do nothing");
      return { rows: options.duplicateClaim ? [] : [{ id: "claim-1" }] };
    }
    throw new Error("Unexpected Club Pulse test query");
  });
  const db = { query: query as DbClient["query"] };
  for (const userId of [senderId, ...(options.noEnrollment ? [] : [recipientId])]) {
    await upsertClubEnrollment({ config, db }, buildClubEnrollmentPayload({
      clubId: userId === recipientId && options.wrongClub ? otherClubId : clubId,
      userId, type: "membership", status: userId === senderId ? "active" : options.status ?? "active",
      role: userId === senderId ? "owner" : "member"
    }));
  }
  if (options.tampered && enrollmentRows[1]) enrollmentRows[1].record_auth_tag = Buffer.alloc(16).toString("base64");
  query.mockClear();
  return { app: { config, db, log: { warn: vi.fn() } } as unknown as FastifyInstance, query, enrollmentRows, members };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(createAppNotification).mockResolvedValue({ id: "notification-1" } as never);
  vi.mocked(getNotificationPreferences).mockResolvedValue({ pulseEnabled: true } as never);
  vi.mocked(isWithinQuietHours).mockReturnValue(false);
  vi.mocked(sendPushForNotification).mockResolvedValue({ attempted: true, sent: 1 });
  setArea(false);
});

describe("native encrypted Club Pulse recipients", () => {
  it("delivers to an active opaque Club member without persisting plaintext memberships", async () => {
    const { app, query, enrollmentRows, members } = await makeApp();
    expect(members.every((member) => member.user_id === null)).toBe(true);
    expect(JSON.stringify(enrollmentRows)).not.toContain(recipientId);
    expect(JSON.stringify(enrollmentRows)).not.toContain(clubId);
    expect(await notifyGroupPulseRecipients(app, input, nowMs)).toEqual({ notified: 1 });
    expect(createAppNotification).toHaveBeenCalledExactlyOnceWith(app, expect.objectContaining({
      userId: recipientId, actorUserId: senderId, conversationId,
      linkUrl: `/chat/group/${conversationId}`, dedupeKey: `group-pulse:${pulseId}:${recipientId}`
    }));
    expect(sendPushForNotification).toHaveBeenCalledExactlyOnceWith(app, { id: "notification-1" });
    expect(getNotificationPreferences).toHaveBeenCalledExactlyOnceWith(app, recipientId);
    const writes = query.mock.calls.filter(([sql]) => /^\s*(insert|update|delete)/i.test(sql));
    expect(writes).toHaveLength(1);
    expect(writes[0][0]).toContain("insert into map_ping_notifications");
  });

  it.each(["revoked", "pending", "denied"] as const)("excludes %s enrollments", async (status) => {
    const { app } = await makeApp({ status });
    expect(await notifyGroupPulseRecipients(app, input, nowMs)).toEqual({ notified: 0 });
    expect(createAppNotification).not.toHaveBeenCalled();
  });

  it.each([
    { noEnrollment: true }, { opaqueMember: false }, { tampered: true }, { wrongClub: true },
    { closed: true }, { noEnrollment: true, stalePlainMember: true }
  ])("requires a decryptable active membership and an opaque row: %j", async (options) => {
    const { app, query } = await makeApp(options);
    expect(await notifyGroupPulseRecipients(app, input, nowMs)).toEqual({ notified: 0 });
    expect(createAppNotification).not.toHaveBeenCalled();
    expect(query.mock.calls.some(([sql]) => sql.includes("insert into map_ping_notifications"))).toBe(false);
  });

  it.each(["banned", "deleted", "suspended"])("excludes %s recipient accounts", async (accountStatus) => {
    const { app } = await makeApp({ accountStatus });
    expect(await notifyGroupPulseRecipients(app, input, nowMs)).toEqual({ notified: 0 });
    expect(createAppNotification).not.toHaveBeenCalled();
  });

  it("honors the recipient Pulse opt-out before claiming delivery", async () => {
    vi.mocked(getNotificationPreferences).mockResolvedValue({ pulseEnabled: false } as never);
    const { app, query } = await makeApp();
    expect(await notifyGroupPulseRecipients(app, input, nowMs)).toEqual({ notified: 0 });
    expect(createAppNotification).not.toHaveBeenCalled();
    expect(query.mock.calls.some(([sql]) => sql.includes("insert into map_ping_notifications"))).toBe(false);
  });

  it.each([{ muted: true }, { timedMute: true }, { quiet: true }])("keeps in-app delivery but silences push: %j", async (options) => {
    vi.mocked(isWithinQuietHours).mockReturnValue("quiet" in options);
    const { app } = await makeApp(options);
    expect(await notifyGroupPulseRecipients(app, input, nowMs)).toEqual({ notified: 1 });
    expect(createAppNotification).toHaveBeenCalledOnce();
    expect(sendPushForNotification).not.toHaveBeenCalled();
  });

  it.each([{ reached: true }, { interrupted: true }, { duplicateClaim: true }])("retains repeat and idempotency limits: %j", async (options) => {
    const { app } = await makeApp(options);
    expect(await notifyGroupPulseRecipients(app, input, nowMs)).toEqual({ notified: 0 });
    expect(createAppNotification).not.toHaveBeenCalled();
    expect(sendPushForNotification).not.toHaveBeenCalled();
  });

  it.each([
    { outside: false, mhc: false, notified: 1 },
    { outside: true, mhc: false, notified: 0 },
    { outside: true, mhc: true, notified: 1 }
  ])("retains Purgatory/MHC eligibility: %j", async ({ outside, mhc, notified }) => {
    setArea(outside, mhc);
    const { app, query } = await makeApp();
    expect(await notifyGroupPulseRecipients(app, input, nowMs)).toEqual({ notified });
    expect(createAppNotification).toHaveBeenCalledTimes(notified);
    expect(sendPushForNotification).toHaveBeenCalledTimes(notified);
    expect(query.mock.calls.filter(([sql]) => sql.includes("insert into map_ping_notifications"))).toHaveLength(notified);
  });

  it("rechecks effective area before push after a recipient leaves or MHC expires", async () => {
    setArea(true, true);
    vi.mocked(createAppNotification).mockImplementationOnce(async () => {
      setArea(true, false);
      return { id: "notification-1" } as never;
    });
    const { app } = await makeApp();
    expect(await notifyGroupPulseRecipients(app, input, nowMs)).toEqual({ notified: 1 });
    expect(createAppNotification).toHaveBeenCalledOnce();
    expect(sendPushForNotification).not.toHaveBeenCalled();
  });

  it("fails closed when the encrypted recipient location is unavailable", async () => {
    vi.mocked(loadLocationEnvelopes).mockRejectedValue(new Error("Unavailable"));
    const { app } = await makeApp();
    expect(await notifyGroupPulseRecipients(app, input, nowMs)).toEqual({ notified: 0 });
    expect(createAppNotification).not.toHaveBeenCalled();
  });

  it("does not report or push a failed notification write as delivered", async () => {
    vi.mocked(createAppNotification).mockRejectedValue(new Error("Unavailable"));
    const { app } = await makeApp();
    expect(await notifyGroupPulseRecipients(app, input, nowMs)).toEqual({ notified: 0 });
    expect(createAppNotification).toHaveBeenCalledOnce();
    expect(sendPushForNotification).not.toHaveBeenCalled();
  });
});
