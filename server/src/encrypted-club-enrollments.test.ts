import { describe, expect, it, vi } from "vitest";
import type { AppConfig } from "./config.js";
import type { DbClient } from "./db.js";
import {
  buildClubEnrollmentPayload,
  createClubEnrollmentUserIndex,
  decryptClubEnrollmentPayload,
  upsertClubEnrollment
} from "./encrypted-club-enrollments.js";

const config = {
  SESSION_SECRET: "session-secret-for-club-tests",
  CLUB_ENROLLMENT_ENCRYPTION_KEY: "club-enrollment-encryption-key-for-tests-123456",
  CLUB_ENROLLMENT_INDEX_KEY: "club-enrollment-index-key-for-tests-123456789",
  CLUB_ENROLLMENT_ENCRYPTION_KEY_VERSION: "v1",
  CLUB_ENROLLMENT_INDEX_KEY_VERSION: "v1"
} as AppConfig;

function mockInsert() {
  return vi.fn(async (_sql: string, params: unknown[] = []) => ({
    rows: [{
      id: "11111111-1111-4111-8111-111111111111",
      record_lookup_index: params[0],
      club_index: params[1],
      user_index: params[2],
      record_type_index: params[3],
      status_index: params[4],
      record_ciphertext: params[5],
      record_nonce: params[6],
      record_auth_tag: params[7],
      encryption_key_version: params[8],
      index_key_version: params[9],
      created_at: params[10],
      updated_at: params[10]
    }]
  }));
}

describe("encrypted Club enrollments", () => {
  it("stores only blind indexes and authenticated ciphertext", async () => {
    const payload = buildClubEnrollmentPayload({
      type: "membership",
      status: "active",
      clubId: "22222222-2222-4222-8222-222222222222",
      userId: "33333333-3333-4333-8333-333333333333",
      role: "owner"
    });
    const query = mockInsert();
    const stored = await upsertClubEnrollment({ config, db: { query: query as DbClient["query"] } }, payload);
    const params = query.mock.calls[0]?.[1] as unknown[];

    expect(JSON.stringify(params)).not.toContain(payload.clubId);
    expect(JSON.stringify(params)).not.toContain(payload.userId);
    expect(stored?.payload).toEqual(payload);
    expect(decryptClubEnrollmentPayload(config, stored!)).toEqual(payload);
  });

  it("uses stable user indexes and fresh nonces for repeated writes", async () => {
    const payload = buildClubEnrollmentPayload({
      type: "join_request",
      status: "pending",
      clubId: "22222222-2222-4222-8222-222222222222",
      userId: "33333333-3333-4333-8333-333333333333",
      applicationAnswer: "Private answer"
    });
    const query = mockInsert();
    await upsertClubEnrollment({ config, db: { query: query as DbClient["query"] } }, payload);
    await upsertClubEnrollment({ config, db: { query: query as DbClient["query"] } }, payload);
    const first = query.mock.calls[0]?.[1] as unknown[];
    const second = query.mock.calls[1]?.[1] as unknown[];

    expect(createClubEnrollmentUserIndex(config, payload.userId)).toBe(first[2]);
    expect(first[0]).toBe(second[0]);
    expect(first[5]).not.toBe(second[5]);
    expect(first[6]).not.toBe(second[6]);
  });

  it("rejects tampered ciphertext", async () => {
    const query = mockInsert();
    const stored = await upsertClubEnrollment({ config, db: { query: query as DbClient["query"] } }, buildClubEnrollmentPayload({
      type: "membership",
      status: "active",
      clubId: "22222222-2222-4222-8222-222222222222",
      userId: "33333333-3333-4333-8333-333333333333",
      role: "member"
    }));
    const tampered = { ...stored!, record_ciphertext: `${stored!.record_ciphertext.slice(0, -2)}AA` };
    expect(() => decryptClubEnrollmentPayload(config, tampered)).toThrow();
  });
});
