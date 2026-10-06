import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "./app.js";
import type { AppConfig } from "./config.js";
import type { DbClient } from "./db.js";
import { createMemoryRateLimiter } from "./rate-limit.js";

const mocks = vi.hoisted(() => ({
  getCruushEntitlement: vi.fn(), getRelationshipPermissions: vi.fn(), loadLocationEnvelopes: vi.fn(), moderateTextOrReject: vi.fn(),
  findClubEnrollment: vi.fn(), listClubMemberships: vi.fn(), listClubJoinRequests: vi.fn(), listUserClubMemberships: vi.fn(),
  upsertClubEnrollment: vi.fn(), deleteClubEnrollment: vi.fn(), deleteClubEnrollmentsForClub: vi.fn()
}));
vi.mock("./match-relationships.js", async () => ({ ...(await vi.importActual<typeof import("./match-relationships.js")>("./match-relationships.js")), getCruushEntitlement: mocks.getCruushEntitlement, getRelationshipPermissions: mocks.getRelationshipPermissions }));
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
  return { id: clubId, title: "Brooklyn techno", summary: "A Club for local dancers.", tags: ["leather", "techno"], conversation_id: conversationId, visibility_ciphertext: null, visibility_nonce: null, visibility_auth_tag: null, visibility_key_version: "v1", last_activity_at: now };
}

describe("encrypted Club directory routes", () => {
  beforeEach(() => {
    query.mockReset(); Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getCruushEntitlement.mockResolvedValue({ cruushPlus: true, expiresAt: null, ownerFullAccess: false });
    mocks.getRelationshipPermissions.mockResolvedValue({ canMessage: true, isMutualCruush: true });
    mocks.loadLocationEnvelopes.mockResolvedValue(new Map()); mocks.moderateTextOrReject.mockResolvedValue({ decision: { decision: "allow" } });
    mocks.findClubEnrollment.mockResolvedValue(null); mocks.listClubMemberships.mockResolvedValue([enrollment(memberId, "owner")]);
    mocks.listClubJoinRequests.mockResolvedValue([]); mocks.listUserClubMemberships.mockResolvedValue([]); mocks.upsertClubEnrollment.mockResolvedValue({});
  });

  it("browses published Clubs and exposes membership only after encrypted lookup", async () => {
    query.mockResolvedValueOnce({ rows: [rawClub()] });
    mocks.listUserClubMemberships.mockResolvedValueOnce([enrollment(userId, "admin")]);
    mocks.listClubJoinRequests.mockResolvedValueOnce([enrollment(memberId, "member", "join_request")]);
    const response = await app.inject({ method: "GET", url: "/api/clubs?tags=Techno,techno", headers: { "x-user-id": userId } });
    expect(response.statusCode).toBe(200);
    expect(query.mock.calls[0]?.[0]).not.toMatch(/club_memberships|club_join_requests|owner_user_id/);
    expect(query.mock.calls[0]?.[1]).toEqual([["techno"], ""]);
    expect(response.json().data[0]).toMatchObject({ id: clubId, currentUserRole: "admin", conversationId, pendingJoinRequestCount: 1, memberCount: 1 });
  });

  it("creates encrypted enrollments and opaque Club conversation members", async () => {
    query.mockResolvedValueOnce({ rows: [{ id: clubId, conversation_id: conversationId }] }).mockResolvedValue({ rows: [] });
    const response = await app.inject({ method: "POST", url: "/api/clubs", headers: { "x-user-id": userId }, payload: { title: "Brooklyn techno", summary: "A Club for local dancers.", tags: ["Techno", "Leather"], memberIds: [memberId] } });
    expect(response.statusCode).toBe(201);
    expect(mocks.upsertClubEnrollment).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]?.[0]).not.toMatch(/club_memberships|owner_user_id/);
    expect(query.mock.calls.slice(1).every((call) => String(call[0]).includes("member_index"))).toBe(true);
    expect(query.mock.calls.slice(1).every((call) => !JSON.stringify(call[1]).includes(memberId))).toBe(true);
  });

  it("creates a Club with only its owner", async () => {
    query.mockResolvedValueOnce({ rows: [{ id: clubId, conversation_id: conversationId }] }).mockResolvedValue({ rows: [] });
    const response = await app.inject({ method: "POST", url: "/api/clubs", headers: { "x-user-id": userId }, payload: { title: "Night Garden", summary: "A Club for night people.", tags: ["nightlife"], memberIds: [] } });
    expect(response.statusCode).toBe(201);
    expect(response.json().data.memberCount).toBe(1);
    expect(mocks.getRelationshipPermissions).not.toHaveBeenCalled();
    expect(mocks.upsertClubEnrollment).toHaveBeenCalledTimes(1);
    expect(mocks.upsertClubEnrollment).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userId, role: "owner" }));
    expect(query.mock.calls.slice(1)).toHaveLength(1);
    expect(String(query.mock.calls[1]?.[0])).toContain("member_index");
  });

  it("returns detail membership from encrypted records", async () => {
    query.mockResolvedValueOnce({ rows: [rawClub()] });
    mocks.findClubEnrollment.mockResolvedValueOnce(enrollment(userId, "member")).mockResolvedValueOnce(null);
    const response = await app.inject({ method: "GET", url: `/api/clubs/${clubId}`, headers: { "x-user-id": userId } });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ currentUserRole: "member", conversationId, joinRequestStatus: "member" });
  });

  it("writes a pending request only through the encrypted store", async () => {
    query.mockResolvedValueOnce({ rows: [rawClub()] });
    const response = await app.inject({ method: "POST", url: `/api/clubs/${clubId}/join-requests`, headers: { "x-user-id": userId } });
    expect(response.statusCode).toBe(201);
    expect(mocks.upsertClubEnrollment).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: "join_request", status: "pending", clubId, userId }));
    expect(query.mock.calls.every((call) => !String(call[0]).includes("club_join_requests"))).toBe(true);
  });

  it("approves a request with encrypted membership and an opaque chat index", async () => {
    mocks.findClubEnrollment.mockResolvedValueOnce(enrollment(userId, "moderator")).mockResolvedValueOnce(enrollment(memberId, "member", "join_request"));
    query.mockResolvedValueOnce({ rows: [{ conversation_id: conversationId }] }).mockResolvedValueOnce({ rows: [] });
    const response = await app.inject({ method: "POST", url: `/api/clubs/${clubId}/join-requests/${memberId}`, headers: { "x-user-id": userId }, payload: { decision: "approve" } });
    expect(response.statusCode).toBe(200);
    expect(mocks.upsertClubEnrollment).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: "membership", userId: memberId }));
    expect(mocks.deleteClubEnrollment).toHaveBeenCalledWith(expect.anything(), { clubId, userId: memberId, type: "join_request" });
    expect(String(query.mock.calls[1]?.[0])).toContain("member_index");
    expect(JSON.stringify(query.mock.calls[1]?.[1])).not.toContain(memberId);
  });

  it("keeps the migration free of plaintext Club identity edges", async () => {
    const migration = await readFile(new URL("../sql/203_encrypted_club_enrollments.sql", import.meta.url), "utf8");
    expect(migration).toContain("encrypted_club_enrollments"); expect(migration).toContain("member_index");
    expect(migration).not.toContain("requester_user_id"); expect(migration).not.toContain("owner_user_id");
  });
});
