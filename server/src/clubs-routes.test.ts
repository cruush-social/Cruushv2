import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "./app.js";
import type { AppConfig } from "./config.js";
import type { DbClient } from "./db.js";
import { createMemoryRateLimiter } from "./rate-limit.js";

const mocks = vi.hoisted(() => ({
  getRelationshipPermissions: vi.fn(), loadLocationEnvelopes: vi.fn(), moderateTextOrReject: vi.fn(),
  findClubEnrollment: vi.fn(), listClubMemberships: vi.fn(), listClubJoinRequests: vi.fn(), listUserClubMemberships: vi.fn(),
  upsertClubEnrollment: vi.fn(), deleteClubEnrollment: vi.fn(), deleteClubEnrollmentsForClub: vi.fn()
}));
vi.mock("./match-relationships.js", async () => ({ ...(await vi.importActual<typeof import("./match-relationships.js")>("./match-relationships.js")), getRelationshipPermissions: mocks.getRelationshipPermissions }));
vi.mock("./moderation-service.js", async () => ({ ...(await vi.importActual<typeof import("./moderation-service.js")>("./moderation-service.js")), moderateTextOrReject: mocks.moderateTextOrReject }));
vi.mock("./location-privacy.js", async () => ({ ...(await vi.importActual<typeof import("./location-privacy.js")>("./location-privacy.js")), loadLocationEnvelopes: mocks.loadLocationEnvelopes }));
vi.mock("./encrypted-club-enrollments.js", async () => ({
  ...(await vi.importActual<typeof import("./encrypted-club-enrollments.js")>("./encrypted-club-enrollments.js")),
  findClubEnrollment: mocks.findClubEnrollment, listClubMemberships: mocks.listClubMemberships,
  listClubJoinRequests: mocks.listClubJoinRequests, listUserClubMemberships: mocks.listUserClubMemberships,
  upsertClubEnrollment: mocks.upsertClubEnrollment, deleteClubEnrollment: mocks.deleteClubEnrollment,
  deleteClubEnrollmentsForClub: mocks.deleteClubEnrollmentsForClub
}));

const userId = "11111111-1111-4111-8111-111111111111";
const clubId = "22222222-2222-4222-8222-222222222222";
const memberId = "33333333-3333-4333-8333-333333333333";
const conversationId = "44444444-4444-4444-8444-444444444444";
const now = "2026-10-02T12:00:00.000Z";
const query = vi.fn();
const db: DbClient = { query: query as DbClient["query"], end: vi.fn().mockResolvedValue(undefined), transaction: async <T>(fn: (client: DbClient) => Promise<T>) => fn(db) };
const app = buildServer({
  NODE_ENV: "test", PORT: 3001, HOST: "127.0.0.1", DATABASE_URL: "postgres://postgres:postgres@localhost:5432/cruush",
  CORS_ORIGIN: "http://localhost:5173", SESSION_SECRET: "test-secret",
  CLUB_ENROLLMENT_ENCRYPTION_KEY: "club-enrollment-encryption-key-for-tests-123456",
  CLUB_ENROLLMENT_INDEX_KEY: "club-enrollment-index-key-for-tests-123456789",
  APP_URL: "https://cruush.test", HUMAN_MODERATION_ENABLED: true
} as AppConfig, { db, rateLimiter: createMemoryRateLimiter() });

function enrollment(targetUserId: string, role: "owner" | "admin" | "moderator" | "member" = "member", type: "membership" | "join_request" = "membership") {
  return { payload: { version: 1 as const, type, status: type === "membership" ? "active" as const : "pending" as const, clubId, userId: targetUserId, role: type === "membership" ? role : undefined, applicationAnswer: null, createdAt: now, updatedAt: now } };
}
function rawClub() {
  return { id: clubId, title: "Brooklyn techno", summary: "A Club for local dancers.", tags: ["leather", "techno"], conversation_id: conversationId, requires_join_approval: true, visibility_ciphertext: null, visibility_nonce: null, visibility_auth_tag: null, visibility_key_version: "v1", last_activity_at: now };
}

function mockAdmission(options: { approval?: boolean; count?: number; account?: string; closed?: boolean; unreadable?: boolean } = {}) {
  query.mockImplementation(async (sql: string) => {
    if (sql.includes("from clubs where id = $1 for update")) return { rows: [{ id: clubId, conversation_id: conversationId, requires_join_approval: options.approval ?? true }] };
    if (sql.includes("select closed_at from conversations")) return { rows: [{ closed_at: options.closed ? now : null }] };
    if (sql.includes("as account_status from app_users")) return { rows: [{ account_status: options.account ?? "active" }] };
    if (sql.includes("count(*)::int as member_count")) return { rows: [{ member_count: options.count ?? 1, already_member: options.unreadable ?? false }] };
    if (sql.includes("from clubs c")) return { rows: [{ ...rawClub(), requires_join_approval: options.approval ?? true }] };
    return { rows: [] };
  });
}

describe("encrypted Club directory routes", () => {
  beforeEach(() => {
    query.mockReset().mockResolvedValue({ rows: [] }); Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getRelationshipPermissions.mockResolvedValue({ canMessage: true, isMutualCruush: true });
    mocks.loadLocationEnvelopes.mockResolvedValue(new Map()); mocks.moderateTextOrReject.mockResolvedValue({ decision: { decision: "allow" } });
    mocks.findClubEnrollment.mockResolvedValue(null); mocks.listClubMemberships.mockResolvedValue([enrollment(memberId, "owner")]);
    mocks.listClubJoinRequests.mockResolvedValue([]); mocks.listUserClubMemberships.mockResolvedValue([]); mocks.upsertClubEnrollment.mockResolvedValue({});
  });

  it.each([
    { role: "owner" as const, initial: true, next: false },
    { role: "admin" as const, initial: false, next: true },
    { role: "owner" as const, initial: true, next: undefined },
    { role: "admin" as const, initial: false, next: undefined },
  ])("updates approval for $role and preserves omission ($initial → $next)", async ({ role, initial, next }) => {
    let approval = initial;
    mocks.findClubEnrollment.mockImplementation(async (_context, lookup) => lookup.type === "membership" ? enrollment(userId, role) : null);
    query.mockImplementation(async (sql: string, values: unknown[]) => {
      if (sql.includes("with updated_club as")) {
        expect(sql).toContain("requires_join_approval = coalesce($5::boolean, requires_join_approval)");
        approval = (values[4] ?? approval) as boolean;
        return { rows: [] };
      }
      if (sql.includes("from clubs c")) return { rows: [{ ...rawClub(), requires_join_approval: approval }] };
      return { rows: [] };
    });
    const response = await app.inject({ method: "PATCH", url: `/api/clubs/${clubId}`, headers: { "x-user-id": userId },
      payload: { title: "Night Garden", summary: "", tags: ["night"], ...(next === undefined ? {} : { requiresJoinApproval: next }) } });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.requiresJoinApproval).toBe(next ?? initial);
    const update = query.mock.calls.find(([sql]) => String(sql).includes("with updated_club as"));
    expect(update?.[1]).toEqual([clubId, "Night Garden", "", ["night"], next ?? null]);
    expect(mocks.upsertClubEnrollment).not.toHaveBeenCalled();
  });

  it.each(["member", "moderator", null] as const)("does not let %s change approval", async (role) => {
    mocks.findClubEnrollment.mockResolvedValue(role ? enrollment(userId, role) : null);
    const response = await app.inject({ method: "PATCH", url: `/api/clubs/${clubId}`, headers: { "x-user-id": userId },
      payload: { title: "Night Garden", summary: "", tags: ["night"], requiresJoinApproval: false } });
    expect(response.statusCode).toBe(403);
    expect(query).not.toHaveBeenCalled();
    expect(mocks.moderateTextOrReject).not.toHaveBeenCalled();
    expect(mocks.upsertClubEnrollment).not.toHaveBeenCalled();
  });

  it("fails closed for nonmember Clubs when privacy/location lookup fails", async () => {
    query.mockResolvedValueOnce({ rows: [rawClub()] });
    mocks.loadLocationEnvelopes.mockRejectedValue(new Error("privacy unavailable"));
    const response = await app.inject({ method: "GET", url: "/api/clubs?sort=nearby", headers: { "x-user-id": userId } });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([]);
  });

  it("preserves memberships when directory privacy lookup fails", async () => {
    query.mockResolvedValueOnce({ rows: [rawClub()] });
    mocks.listUserClubMemberships.mockResolvedValueOnce([enrollment(userId, "member")]);
    mocks.loadLocationEnvelopes.mockRejectedValue(new Error("privacy unavailable"));
    const response = await app.inject({ method: "GET", url: "/api/clubs?sort=nearby", headers: { "x-user-id": userId } });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(1);
  });

  it("browses published Clubs and exposes membership only after encrypted lookup", async () => {
    query.mockResolvedValueOnce({ rows: [rawClub()] });
    mocks.listUserClubMemberships.mockResolvedValueOnce([enrollment(userId, "admin")]);
    mocks.listClubJoinRequests.mockResolvedValueOnce([enrollment(memberId, "member", "join_request")]);
    const response = await app.inject({ method: "GET", url: "/api/clubs?tags=Techno,techno", headers: { "x-user-id": userId } });
    expect(response.statusCode).toBe(200);
    expect(query.mock.calls[0]?.[0]).not.toMatch(/club_memberships|club_join_requests|owner_user_id/);
    expect(query.mock.calls[0]?.[1]).toEqual([["techno"], ""]);
    expect(response.json().data[0]).toMatchObject({ id: clubId, currentUserRole: "admin", conversationId, pendingJoinRequestCount: 1, memberCount: 1, requiresJoinApproval: true });
  });

  it("hides banned member and applicant counts without removing the Coven or its enrollments", async () => {
    query.mockImplementation(async (sql: string) => ({ rows: sql.includes("from clubs c") ? [rawClub()] : sql.includes("account_status = 'banned'") ? [{ id: memberId }] : [] }));
    mocks.listUserClubMemberships.mockResolvedValue([enrollment(userId, "admin")]);
    mocks.listClubJoinRequests.mockResolvedValue([enrollment(memberId, "member", "join_request")]);
    const response = await app.inject({ method: "GET", url: "/api/clubs", headers: { "x-user-id": userId } });
    expect(response.statusCode).toBe(200);
    expect(response.json().data[0]).toMatchObject({ id: clubId, memberCount: 0, pendingJoinRequestCount: 0 });
    expect(mocks.deleteClubEnrollment).not.toHaveBeenCalled();
    expect(mocks.deleteClubEnrollmentsForClub).not.toHaveBeenCalled();
  });

  it("creates encrypted enrollments and opaque Club conversation members", async () => {
    query.mockResolvedValueOnce({ rows: [{ id: clubId, conversation_id: conversationId }] }).mockResolvedValue({ rows: [] });
    const response = await app.inject({ method: "POST", url: "/api/clubs", headers: { "x-user-id": userId }, payload: { title: "Brooklyn techno", summary: "A Club for local dancers.", tags: ["Techno", "Leather"], memberIds: [memberId] } });
    expect(response.statusCode).toBe(201);
    expect(mocks.upsertClubEnrollment).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]?.[0]).not.toMatch(/club_memberships|owner_user_id/);
    expect(query.mock.calls.slice(1).every((call) => String(call[0]).includes("member_index"))).toBe(true);
    const writes = query.mock.calls.slice(1);
    expect(writes.every((call) => !JSON.stringify(call[1]?.slice(0, 3)).includes(memberId))).toBe(true);
    expect(writes.every((call) => String(call[0]).includes("select $1, null, $2"))).toBe(true);
    expect(writes.every((call) => String(call[0]).includes("where id = $4::uuid for key share"))).toBe(true);
    expect(writes.map((call) => call[1]?.[3])).toEqual([userId, memberId]);
  });

  it("creates a Club with only its owner", async () => {
    query.mockResolvedValueOnce({ rows: [{ id: clubId, conversation_id: conversationId }] }).mockResolvedValue({ rows: [] });
    const response = await app.inject({ method: "POST", url: "/api/clubs", headers: { "x-user-id": userId }, payload: { title: "Night Garden", summary: "A Club for night people.", tags: ["nightlife"], memberIds: [] } });
    expect(response.statusCode).toBe(201);
    expect(response.json().data.memberCount).toBe(1);
    expect(response.json().data.requiresJoinApproval).toBe(true);
    expect(mocks.getRelationshipPermissions).not.toHaveBeenCalled();
    expect(mocks.upsertClubEnrollment).toHaveBeenCalledTimes(1);
    expect(mocks.upsertClubEnrollment).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userId, role: "owner" }));
    expect(query.mock.calls.slice(1)).toHaveLength(1);
    expect(String(query.mock.calls[1]?.[0])).toContain("member_index");
  });

  it("lets a basic member create a Club", async () => {
    query.mockResolvedValueOnce({ rows: [{ id: clubId, conversation_id: conversationId }] }).mockResolvedValue({ rows: [] });
    const response = await app.inject({ method: "POST", url: "/api/clubs", headers: { "x-user-id": userId }, payload: { title: "Free Club", summary: "A Club anyone can start.", tags: ["community"], memberIds: [] } });
    expect(response.statusCode).toBe(201);
    expect(response.json().data).toMatchObject({ title: "Free Club", currentUserRole: "owner" });
  });

  it("returns detail membership from encrypted records", async () => {
    query.mockResolvedValueOnce({ rows: [rawClub()] });
    mocks.findClubEnrollment.mockResolvedValueOnce(enrollment(userId, "member")).mockResolvedValueOnce(null);
    const response = await app.inject({ method: "GET", url: `/api/clubs/${clubId}`, headers: { "x-user-id": userId } });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ currentUserRole: "member", conversationId, joinRequestStatus: "member", requiresJoinApproval: true });
  });

  it("writes a pending request only through the encrypted store", async () => {
    mockAdmission();
    const response = await app.inject({ method: "POST", url: `/api/clubs/${clubId}/join-requests`, headers: { "x-user-id": userId } });
    expect(response.statusCode).toBe(201);
    expect(response.json().data).toEqual({ joinRequestStatus: "pending" });
    expect(mocks.upsertClubEnrollment).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: "join_request", status: "pending", clubId, userId }));
    expect(query.mock.calls.every((call) => !String(call[0]).includes("club_join_requests"))).toBe(true);
  });

  it("approves a request with encrypted membership and an opaque chat index", async () => {
    mocks.findClubEnrollment.mockResolvedValueOnce(enrollment(userId, "moderator")).mockResolvedValueOnce(enrollment(memberId, "member", "join_request"));
    mockAdmission();
    const response = await app.inject({ method: "POST", url: `/api/clubs/${clubId}/join-requests/${memberId}`, headers: { "x-user-id": userId }, payload: { decision: "approve" } });
    expect(response.statusCode).toBe(200);
    expect(mocks.upsertClubEnrollment).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: "membership", userId: memberId }));
    expect(mocks.deleteClubEnrollment).toHaveBeenCalledWith(expect.anything(), { clubId, userId: memberId, type: "join_request" });
    const chatInsert = query.mock.calls.find((call) => String(call[0]).includes("insert into conversation_members"));
    expect(String(chatInsert?.[0])).toContain("member_index");
    expect(JSON.stringify(chatInsert?.[1]?.slice(0, 2))).not.toContain(memberId);
    expect(String(chatInsert?.[0])).toContain("select $1, null, $2");
    expect(String(chatInsert?.[0])).toContain("where id = $3::uuid for key share");
    expect(chatInsert?.[1]?.[2]).toBe(memberId);
  });

  it("creates an open Coven only when selected and returns the selected mode", async () => {
    query.mockResolvedValueOnce({ rows: [{ id: clubId, conversation_id: conversationId }] }).mockResolvedValue({ rows: [] });
    const response = await app.inject({ method: "POST", url: "/api/clubs", headers: { "x-user-id": userId }, payload: { title: "Night Garden", summary: "", tags: ["night"], memberIds: [], requiresJoinApproval: false } });
    expect(response.statusCode).toBe(201);
    expect(response.json().data.requiresJoinApproval).toBe(false);
    expect(query.mock.calls[0]?.[1]?.at(-1)).toBe(false);
    expect(String(query.mock.calls[0]?.[0])).toContain("requires_join_approval");
  });

  it("joins an open Coven immediately without creating a pending request", async () => {
    mockAdmission({ approval: false });
    const response = await app.inject({ method: "POST", url: `/api/clubs/${clubId}/join-requests`, headers: { "x-user-id": userId } });
    expect(response.statusCode).toBe(201);
    expect(response.json().data).toEqual({ joinRequestStatus: "member", conversationId });
    expect(mocks.upsertClubEnrollment).toHaveBeenCalledTimes(1);
    expect(mocks.upsertClubEnrollment).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: "membership", status: "active", role: "member", userId }));
    expect(mocks.deleteClubEnrollment).toHaveBeenCalledWith(expect.anything(), { clubId, userId, type: "join_request" });
    const chatInsert = query.mock.calls.find((call) => String(call[0]).includes("insert into conversation_members"));
    expect(String(chatInsert?.[0])).toContain("null, $2");
    expect(JSON.stringify(chatInsert?.[1]?.slice(0, 2))).not.toContain(userId);
    expect(String(chatInsert?.[0])).toContain("where id = $3::uuid for key share");
    expect(chatInsert?.[1]?.[2]).toBe(userId);
  });

  it.each(["owner", "admin", "moderator", "member"] as const)("does not downgrade an existing %s on repeated open join", async (role) => {
    mockAdmission({ approval: false, count: 1000 });
    mocks.findClubEnrollment.mockImplementation(async (_context, input) => input.type === "membership" ? enrollment(userId, role) : null);
    const response = await app.inject({ method: "POST", url: `/api/clubs/${clubId}/join-requests`, headers: { "x-user-id": userId } });
    expect(response.statusCode).toBe(201);
    expect(response.json().data).toEqual({ joinRequestStatus: "member", conversationId });
    expect(mocks.upsertClubEnrollment).not.toHaveBeenCalled();
  });

  it.each([
    [{ count: 1000 }, 409], [{ account: "banned" }, 403],
    [{ closed: true }, 400], [{ unreadable: true }, 409]
  ] as const)("fails closed before writing membership for %j", async (options, code) => {
    mockAdmission({ approval: false, ...options });
    const response = await app.inject({ method: "POST", url: `/api/clubs/${clubId}/join-requests`, headers: { "x-user-id": userId } });
    expect(response.statusCode).toBe(code);
    expect(mocks.upsertClubEnrollment).not.toHaveBeenCalled();
  });

  it("keeps a pending request when approval hits the cap", async () => {
    mockAdmission({ count: 1000 });
    mocks.findClubEnrollment.mockResolvedValueOnce(enrollment(userId, "moderator")).mockResolvedValueOnce(enrollment(memberId, "member", "join_request"));
    const response = await app.inject({ method: "POST", url: `/api/clubs/${clubId}/join-requests/${memberId}`, headers: { "x-user-id": userId }, payload: { decision: "approve" } });
    expect(response.statusCode).toBe(409);
    expect(mocks.upsertClubEnrollment).not.toHaveBeenCalled();
    expect(mocks.deleteClubEnrollment).not.toHaveBeenCalled();
  });

  it("keeps the migration free of plaintext Club identity edges", async () => {
    const migration = await readFile(new URL("../sql/203_encrypted_club_enrollments.sql", import.meta.url), "utf8");
    expect(migration).toContain("encrypted_club_enrollments"); expect(migration).toContain("member_index");
    expect(migration).not.toContain("requester_user_id"); expect(migration).not.toContain("owner_user_id");
  });
});
