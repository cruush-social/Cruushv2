import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "./config.js";
import type { DbClient } from "./db.js";
import { createGroupPulse } from "./map-pings.js";
import {
  buildClubEnrollmentPayload,
  createClubEnrollmentUserIndex,
  upsertClubEnrollment,
  type ClubEnrollmentRole,
  type ClubEnrollmentStatus,
  type EncryptedClubEnrollmentRow
} from "./encrypted-club-enrollments.js";
import { loadLocationEnvelopes, type LocationPayload } from "./location-privacy.js";
import { loadTravelPins, type TravelPin } from "./travel-pins.js";
import { notifyGroupPulseRecipients } from "./pulse-notifications.js";
import { getSideQuestPingBalance } from "./side-quests.js";

vi.mock("./location-privacy.js", async (original) => ({
  ...await original<typeof import("./location-privacy.js")>(), loadLocationEnvelopes: vi.fn()
}));
vi.mock("./travel-pins.js", async (original) => ({
  ...await original<typeof import("./travel-pins.js")>(), loadTravelPins: vi.fn()
}));
vi.mock("./pulse-notifications.js", () => ({ notifyGroupPulseRecipients: vi.fn(), notifyPulseRecipients: vi.fn() }));
vi.mock("./side-quests.js", () => ({ getSideQuestPingBalance: vi.fn() }));

const senderId = "10000000-0000-4000-8000-000000000001";
const conversationId = "20000000-0000-4000-8000-000000000002";
const clubId = "30000000-0000-4000-8000-000000000003";
const pulseId = "40000000-0000-4000-8000-000000000004";
const idempotencyKey = "50000000-0000-4000-8000-000000000005";
const now = new Date("2026-10-09T21:00:00.000Z");
const input = { userId: senderId, conversationId, idempotencyKey };
const config = {
  SESSION_SECRET: "unit-test-club-pulse-only",
  CLUB_ENROLLMENT_ENCRYPTION_KEY: "unit-test-club-pulse-encryption-only",
  CLUB_ENROLLMENT_INDEX_KEY: "unit-test-club-pulse-index-only",
  CLUB_ENROLLMENT_ENCRYPTION_KEY_VERSION: "v1",
  CLUB_ENROLLMENT_INDEX_KEY_VERSION: "v1"
} as AppConfig;
const getEntitlement = vi.fn();

function setArea(outside: boolean, mhc = false) {
  vi.mocked(loadLocationEnvelopes).mockResolvedValue(new Map([[senderId, {
    subjectUserId: senderId, source: "GPS", latE7: outside ? 423601000 : 407128000,
    lonE7: outside ? -710589000 : -740060000, collectedAtMs: now.getTime(),
    expiresAtMs: now.getTime() + 60_000
  } as LocationPayload]]));
  vi.mocked(loadTravelPins).mockResolvedValue(mhc ? new Map([[senderId, {
    userId: senderId, latitude: 40.7128, longitude: -74.006,
    setAtMs: now.getTime(), expiresAtMs: now.getTime() + 60_000
  } as TravelPin]]) : new Map());
}

async function makeApp(options: {
  club?: boolean; role?: ClubEnrollmentRole | null; status?: ClubEnrollmentStatus;
  opaqueMember?: boolean; plainRole?: ClubEnrollmentRole; closed?: boolean;
  tampered?: boolean; quotaUsed?: boolean;
} = {}) {
  const isClub = options.club !== false;
  const role = options.role === undefined ? "owner" : options.role;
  const opaqueIndex = createClubEnrollmentUserIndex(config, senderId);
  const enrollmentRows: EncryptedClubEnrollmentRow[] = [];
  const insertedPulses: Array<Record<string, unknown>> = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("insert into encrypted_club_enrollments")) {
      const row = {
        id: "60000000-0000-4000-8000-000000000006",
        record_lookup_index: params[0], club_index: params[1], user_index: params[2],
        record_type_index: params[3], status_index: params[4], record_ciphertext: params[5],
        record_nonce: params[6], record_auth_tag: params[7], encryption_key_version: params[8],
        index_key_version: params[9], created_at: params[10], updated_at: params[10]
      } as EncryptedClubEnrollmentRow;
      enrollmentRows.push(row);
      return { rows: [row] };
    }
    if (sql.includes("from encrypted_club_enrollments")) {
      return { rows: enrollmentRows.filter((row) => row.record_lookup_index === params[0]
        && row.record_type_index === params[1] && row.status_index === params[2]
        && row.index_key_version === params[3]) };
    }
    if (sql.includes("from app_users")) return { rows: [{ id: senderId }] };
    if (sql.includes("from group_pulses pulse")) return { rows: insertedPulses };
    if (sql.includes("select conversation.title")) {
      expect(params.slice(0, 2)).toEqual([conversationId, senderId]);
      expect(sql).toContain("member.role in ('owner', 'admin')");
      if (options.closed) return { rows: [] };
      if (isClub) {
        // Native Club conversation rows have no plaintext user_id and carry
        // only the opaque member index. The old user_id-only join finds none.
        const canFindOpaque = options.opaqueMember !== false && sql.includes("member.member_index") && params.includes(opaqueIndex);
        const stalePlainOwner = options.plainRole === "owner";
        return { rows: canFindOpaque || stalePlainOwner ? [{ title: "Existing Club", club_id: clubId }] : [] };
      }
      return { rows: role === "owner" || role === "admin" ? [{ title: "Existing Group", club_id: null }] : [] };
    }
    if (sql.includes("select recent.created_at")) {
      return { rows: options.quotaUsed || insertedPulses.length ? [{ created_at: now.toISOString() }] : [] };
    }
    if (sql.includes("insert into group_pulses")) {
      const row = { id: pulseId, conversation_id: conversationId, sender_user_id: senderId, created_at: now.toISOString() };
      insertedPulses.push(row);
      return { rows: [row] };
    }
    return { rows: [] };
  });
  const db = {
    query: query as DbClient["query"], end: vi.fn(),
    transaction: async <T>(fn: (tx: DbClient) => Promise<T>): Promise<T> => fn(db)
  } as DbClient;
  if (isClub && role !== null) {
    await upsertClubEnrollment({ config, db }, buildClubEnrollmentPayload({
      type: "membership", status: options.status ?? "active", clubId, userId: senderId, role
    }));
  }
  if (options.tampered && enrollmentRows[0]) enrollmentRows[0].record_auth_tag = Buffer.alloc(16).toString("base64");
  query.mockClear();
  return { app: { config, db, log: { warn: vi.fn() } } as unknown as FastifyInstance, query, insertedPulses, enrollmentRows };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSideQuestPingBalance).mockResolvedValue(0);
  vi.mocked(notifyGroupPulseRecipients).mockResolvedValue({ notified: 0 });
  getEntitlement.mockResolvedValue({ cruushPlus: false, expiresAt: null });
  setArea(false);
});

describe("native encrypted Club Pulse authorization", () => {
  it.each(["owner", "admin"] as const)("allows the existing encrypted Club %s with no plaintext membership", async (role) => {
    const { app, query, insertedPulses, enrollmentRows } = await makeApp({ role });
    expect(JSON.stringify(enrollmentRows)).not.toContain(senderId);
    expect(JSON.stringify(enrollmentRows)).not.toContain(clubId);
    await createGroupPulse(app, input, { now: () => now, getEntitlement });
    expect(insertedPulses).toHaveLength(1);
    expect(query.mock.calls.some(([sql]) => sql.includes("from encrypted_club_enrollments"))).toBe(true);
    expect(notifyGroupPulseRecipients).toHaveBeenCalledWith(app, {
      groupPulseId: pulseId, conversationId, senderUserId: senderId, groupTitle: "Existing Club"
    }, now.getTime());
  });

  it("restores native encrypted owner access with an active in-area MHC pin", async () => {
    setArea(true, true);
    const { app, insertedPulses } = await makeApp();
    await createGroupPulse(app, input, { now: () => now, getEntitlement });
    expect(insertedPulses).toHaveLength(1);
  });

  it.each(["moderator", "member", null] as const)("does not elevate Club role %s, even with stale plaintext owner metadata", async (role) => {
    const { app, insertedPulses } = await makeApp({ role, plainRole: "owner" });
    await expect(createGroupPulse(app, input, { now: () => now, getEntitlement })).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    expect(insertedPulses).toHaveLength(0);
    expect(getSideQuestPingBalance).not.toHaveBeenCalled();
    expect(notifyGroupPulseRecipients).not.toHaveBeenCalled();
  });

  it.each(["revoked", "pending", "denied"] as const)("rejects a %s encrypted enrollment", async (status) => {
    const { app, insertedPulses } = await makeApp({ status });
    await expect(createGroupPulse(app, input, { now: () => now, getEntitlement })).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    expect(insertedPulses).toHaveLength(0);
  });

  it.each([{ tampered: true }, { opaqueMember: false }, { closed: true }])("fails closed for unavailable Club authority %j", async (options) => {
    const { app, insertedPulses } = await makeApp(options);
    await expect(createGroupPulse(app, input, { now: () => now, getEntitlement })).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    expect(insertedPulses).toHaveLength(0);
    expect(notifyGroupPulseRecipients).not.toHaveBeenCalled();
  });

  it("retains the outside/expired-MHC gate before authorization or spending", async () => {
    setArea(true);
    const { app, query, insertedPulses } = await makeApp();
    await expect(createGroupPulse(app, input, { now: () => now, getEntitlement })).rejects.toMatchObject({ statusCode: 403, code: "FEATURE_RESTRICTED" });
    expect(query).not.toHaveBeenCalled();
    expect(insertedPulses).toHaveLength(0);
  });

  it("retains the existing quota and duplicate-send boundary", async () => {
    const used = await makeApp({ quotaUsed: true });
    await expect(createGroupPulse(used.app, input, { now: () => now, getEntitlement })).rejects.toMatchObject({ statusCode: 429, code: "RATE_LIMITED" });
    expect(used.insertedPulses).toHaveLength(0);
    const fresh = await makeApp();
    await createGroupPulse(fresh.app, input, { now: () => now, getEntitlement });
    await createGroupPulse(fresh.app, input, { now: () => now, getEntitlement });
    expect(fresh.insertedPulses).toHaveLength(1);
    expect(notifyGroupPulseRecipients).toHaveBeenCalledOnce();
  });

  it.each(["owner", "admin", "moderator", "member"] as const)("preserves ordinary Group role %s", async (role) => {
    const { app, query, insertedPulses } = await makeApp({ club: false, role });
    const attempt = createGroupPulse(app, input, { now: () => now, getEntitlement });
    if (role === "owner" || role === "admin") {
      await attempt;
      expect(insertedPulses).toHaveLength(1);
    } else {
      await expect(attempt).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
      expect(insertedPulses).toHaveLength(0);
    }
    expect(query.mock.calls.some(([sql]) => sql.includes("from encrypted_club_enrollments"))).toBe(false);
  });
});
