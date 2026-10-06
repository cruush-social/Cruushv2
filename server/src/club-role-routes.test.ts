import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "./app.js";
import type { AppConfig } from "./config.js";
import type { DbClient } from "./db.js";
import { createMemoryRateLimiter } from "./rate-limit.js";

const mocks = vi.hoisted(() => ({ findClubEnrollment: vi.fn(), upsertClubEnrollment: vi.fn(), deleteClubEnrollment: vi.fn(), listClubMemberships: vi.fn() }));
vi.mock("./encrypted-club-enrollments.js", async () => ({ ...(await vi.importActual<typeof import("./encrypted-club-enrollments.js")>("./encrypted-club-enrollments.js")), ...mocks }));
const userId = "11111111-1111-4111-8111-111111111111";
const conversationId = "22222222-2222-4222-8222-222222222222";
const memberId = "33333333-3333-4333-8333-333333333333";
const clubId = "44444444-4444-4444-8444-444444444444";
const now = "2026-10-02T12:00:00.000Z";
const query = vi.fn();
const db: DbClient = { query: query as DbClient["query"], end: vi.fn().mockResolvedValue(undefined), transaction: async <T>(fn: (client: DbClient) => Promise<T>) => fn(db) };
const app = buildServer({ NODE_ENV: "test", PORT: 3001, HOST: "127.0.0.1", DATABASE_URL: "postgres://localhost/cruush", CORS_ORIGIN: "http://localhost:5173", SESSION_SECRET: "test-secret", CLUB_ENROLLMENT_ENCRYPTION_KEY: "club-enrollment-encryption-key-for-tests-123456", CLUB_ENROLLMENT_INDEX_KEY: "club-enrollment-index-key-for-tests-123456789", APP_URL: "https://cruush.test" } as AppConfig, { db, rateLimiter: createMemoryRateLimiter() });
function record(targetUserId: string, role: "owner" | "admin" | "moderator" | "member") { return { payload: { version: 1, type: "membership", status: "active", clubId, userId: targetUserId, role, applicationAnswer: null, createdAt: now, updatedAt: now } }; }
function conversation() { return { id: conversationId, kind: "group", title: "Club", tags: [], role: "member", current_user_role: "member", disappearing_timer: "off", closed_at: null, cleared_at: null, updated_at: now, last_message: "", last_message_ciphertext: null, last_message_nonce: null, last_message_auth_tag: null, last_message_key_version: null, unread_count: 0, pinned: false, muted: false, notification_level: "all", muted_until: null, other_user_id: null, other_user_name: "Club", other_user_pronouns: null, other_user_photo: null, member_count: 2, club_id: clubId }; }

describe("encrypted Club conversation roles", () => {
  beforeEach(() => { query.mockReset(); Object.values(mocks).forEach((mock) => mock.mockReset()); mocks.upsertClubEnrollment.mockResolvedValue({}); });
  it("changes a Club member role only in encrypted enrollment data", async () => {
    query.mockResolvedValueOnce({ rows: [conversation()] });
    mocks.findClubEnrollment.mockResolvedValueOnce(record(userId, "owner")).mockResolvedValueOnce(record(memberId, "member"));
    const response = await app.inject({ method: "PATCH", url: `/api/conversations/groups/${conversationId}/members/${memberId}/club-role`, headers: { "x-user-id": userId }, payload: { role: "moderator" } });
    expect(response.statusCode).toBe(204);
    expect(mocks.upsertClubEnrollment).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ role: "moderator", userId: memberId }));
    expect(query.mock.calls.every((call) => !String(call[0]).includes("club_memberships"))).toBe(true);
  });
  it("removes an encrypted membership and its opaque conversation row", async () => {
    query.mockResolvedValueOnce({ rows: [conversation()] }).mockResolvedValueOnce({ rows: [] });
    mocks.findClubEnrollment.mockResolvedValueOnce(record(userId, "owner")).mockResolvedValueOnce(record(memberId, "member"));
    const response = await app.inject({ method: "DELETE", url: `/api/conversations/groups/${conversationId}/members/${memberId}`, headers: { "x-user-id": userId } });
    expect(response.statusCode).toBe(204);
    expect(mocks.deleteClubEnrollment).toHaveBeenCalledWith(expect.anything(), { clubId, userId: memberId, type: "membership" });
    expect(String(query.mock.calls[1]?.[0])).toContain("member_index");
    expect(JSON.stringify(query.mock.calls[1]?.[1])).not.toContain(memberId);
  });
});
