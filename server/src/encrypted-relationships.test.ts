import { describe, expect, it, vi } from "vitest";
import type { AppConfig } from "./config.js";
import type { DbClient } from "./db.js";
import {
  buildEncryptedRelationshipPayload,
  createRelationshipBlindIndex,
  decryptRelationshipPayload,
  hasActiveEncryptedRelationshipToken,
  issueEncryptedRelationshipToken,
  upsertEncryptedRelationshipRecord,
  verifyEncryptedRelationshipToken
} from "./encrypted-relationships.js";

const config: AppConfig = {
  NODE_ENV: "test",
  PORT: 3001,
  HOST: "127.0.0.1",
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/cruush",
  CORS_ORIGIN: "http://localhost:5173",
  SESSION_SECRET: "test-secret",
  APP_URL: "https://cruush.test",
  RESEND_API_KEY: "",
  MAIL_FROM: "",
  EMAIL_PREVIEW_ENABLED: true,
  DEVELOPMENT_ADMIN_ENABLED: false,
  DEVELOPMENT_ADMIN_PASSWORD: "",
  TURNSTILE_SECRET_KEY: "",
  PROFILE_ENCRYPTION_KEY: "",
  PROFILE_TOKEN_KEY: "",
  PROFILE_TOKEN_KEY_VERSION: "v1",
  RELATIONSHIP_ENCRYPTION_KEY: "relationship-encryption-key-32b",
  RELATIONSHIP_INDEX_KEY: "relationship-index-key-32-bytes",
  RELATIONSHIP_ENCRYPTION_KEY_VERSION: "v1",
  RELATIONSHIP_INDEX_KEY_VERSION: "v1",
  MATCH_TOKEN_ENCRYPTION_KEY: "match-token-encryption-key-32b",
  MATCH_TOKEN_SIGNING_KEY: "match-token-signing-key-32-bytes",
  MATCH_TOKEN_KEY_VERSION: "v1"
};

function createRecordReturningDb() {
  const query = vi.fn(async (_sql: string, params: unknown[] = []) => ({
    rows: [{
      id: "9c5290ed-1960-4a87-8f5d-21a6e8b82874",
      record_lookup_index: params[0],
      actor_user_index: params[1],
      target_user_index: params[2],
      ordered_pair_index: params[3],
      participant_one_index: params[4],
      participant_two_index: params[5],
      relationship_type_index: params[6],
      relationship_status_index: params[7],
      dedupe_bucket_index: params[8],
      record_ciphertext: params[9],
      record_nonce: params[10],
      record_auth_tag: params[11],
      encryption_key_version: params[12],
      index_key_version: params[13],
      expires_at: params[14],
      created_at: params[15],
      updated_at: "2026-06-02T12:00:00.000Z"
    }]
  }));

  return { query } as unknown as Pick<DbClient, "query"> & { query: typeof query };
}

describe("encrypted relationship storage", () => {
  it("encrypts records non-deterministically and does not send raw relationship data to storage", async () => {
    const db = createRecordReturningDb();
    const payload = buildEncryptedRelationshipPayload({
      type: "cruush",
      actorUserId: "d271f6da-c51d-4d73-a322-d9c56f45d4fa",
      targetUserId: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
      createdAt: "2026-06-02T12:00:00.000Z",
      targetSnapshot: {
        name: "Jordan",
        pronouns: "they/them",
        photo: "https://example.com/jordan.jpg"
      }
    });

    const first = await upsertEncryptedRelationshipRecord({ config, db }, payload);
    const firstParams = db.query.mock.calls[0]?.[1] as unknown[];
    const second = await upsertEncryptedRelationshipRecord({ config, db }, payload);
    const secondParams = db.query.mock.calls[1]?.[1] as unknown[];
    const serializedParams = JSON.stringify(firstParams);

    expect(first?.payload).toEqual(payload);
    expect(second?.payload).toEqual(payload);
    expect(firstParams[9]).not.toBe(secondParams[9]);
    expect(firstParams[10]).not.toBe(secondParams[10]);
    expect(serializedParams).not.toContain("d271f6da-c51d-4d73-a322-d9c56f45d4fa");
    expect(serializedParams).not.toContain("53fd68d7-24fc-4cff-8cd7-a97ec0cadf97");
    expect(serializedParams).not.toContain("Jordan");
    expect(serializedParams).not.toContain("cruush");
    expect(serializedParams).not.toContain("active");
  });

  it("keeps blind indexes stable per version and changes across versions", () => {
    const first = createRelationshipBlindIndex(config, "record", "cruush:a:b");
    const second = createRelationshipBlindIndex(config, "record", "cruush:a:b");
    const rotated = createRelationshipBlindIndex(config, "record", "cruush:a:b", "v2");

    expect(first).toBe(second);
    expect(first).not.toBe(rotated);
  });

  it("fails decryption when ciphertext metadata is tampered", async () => {
    const db = createRecordReturningDb();
    const payload = buildEncryptedRelationshipPayload({
      type: "profile_view",
      actorUserId: "d271f6da-c51d-4d73-a322-d9c56f45d4fa",
      targetUserId: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
      dedupeBucket: "2026-06-02T12:00:00.000Z"
    });
    const record = await upsertEncryptedRelationshipRecord({ config, db }, payload);

    expect(() => decryptRelationshipPayload(config, {
      ...record!,
      record_auth_tag: Buffer.alloc(16).toString("base64")
    })).toThrow();
  });

  it("verifies encrypted match tokens and rejects tampered, expired, or revoked rows", async () => {
    const tokenQuery = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [] }));
    const tokenDb = { query: tokenQuery } as unknown as Pick<DbClient, "query">;
    await issueEncryptedRelationshipToken({
      config,
      db: tokenDb
    }, {
      relationshipRecordId: "9c5290ed-1960-4a87-8f5d-21a6e8b82874",
      userOneId: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
      userTwoId: "d271f6da-c51d-4d73-a322-d9c56f45d4fa",
      purpose: "permissions",
      expiresAt: new Date(Date.now() + 60_000)
    });

    const params = (tokenQuery.mock.calls[0]?.[1] ?? []) as unknown[];
    const tokenRow = {
      id: "token-1",
      relationship_record_id: params[0] as string,
      purpose_index: params[1] as string,
      token_lookup_index: params[2] as string,
      token_ciphertext: params[3] as string,
      token_nonce: params[4] as string,
      token_auth_tag: params[5] as string,
      token_signature: params[6] as string,
      token_key_version: params[7] as string,
      expires_at: params[8] as string,
      created_at: "2026-06-02T12:00:00.000Z",
      revoked_at: null
    };

    expect(verifyEncryptedRelationshipToken(config, tokenRow)).toMatchObject({
      relationshipRecordId: "9c5290ed-1960-4a87-8f5d-21a6e8b82874",
      purpose: "permissions"
    });
    expect(verifyEncryptedRelationshipToken(config, {
      ...tokenRow,
      token_signature: "0".repeat(64)
    })).toBeNull();

    const activeDb = {
      query: vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [tokenRow] }))
    } as unknown as Pick<DbClient, "query">;
    await expect(hasActiveEncryptedRelationshipToken({
      config,
      db: activeDb
    }, {
      relationshipRecordId: "9c5290ed-1960-4a87-8f5d-21a6e8b82874",
      userOneId: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
      userTwoId: "d271f6da-c51d-4d73-a322-d9c56f45d4fa",
      purpose: "permissions"
    })).resolves.toBe(true);

    const inactiveDb = {
      query: vi.fn(async (_sql: string, _params?: unknown[]) => ({
        rows: [{
          ...tokenRow,
          expires_at: new Date(Date.now() - 60_000).toISOString(),
          revoked_at: "2026-06-02T12:05:00.000Z"
        }]
      }))
    } as unknown as Pick<DbClient, "query">;
    await expect(hasActiveEncryptedRelationshipToken({
      config,
      db: inactiveDb
    }, {
      relationshipRecordId: "9c5290ed-1960-4a87-8f5d-21a6e8b82874",
      userOneId: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
      userTwoId: "d271f6da-c51d-4d73-a322-d9c56f45d4fa",
      purpose: "permissions"
    })).resolves.toBe(false);
  });
});
