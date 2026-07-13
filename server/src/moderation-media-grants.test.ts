import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "./config.js";
import type { DbClient } from "./db.js";
import {
  createModerationMediaGrant,
  cleanupModerationMediaGrants,
  hashModerationMediaToken,
  MODERATION_MEDIA_GRANT_TTL_MS,
  wasModerationMediaGrantRedeemed,
  redeemModerationMediaGrant
} from "./moderation-media-grants.js";
import { readEncryptedMediaObject, writeEncryptedMediaObject } from "./media-storage.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe("moderation media grants", () => {
  it("persists only a SHA-256 token hash with a 90-second expiry", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const now = new Date("2026-07-10T12:00:00.000Z");
    const grant = await createModerationMediaGrant({ query } as unknown as DbClient, {
      mediaObjectId: "33333333-3333-4333-8333-333333333333",
      ownerUserId: "11111111-1111-4111-8111-111111111111",
      objectKey: "profile-photos/22222222-2222-4222-8222-222222222222.enc",
      mimeType: "image/jpeg",
      byteSize: 123,
      encryptedDataKey: "encrypted-key",
      dataKeyNonce: "data-key-nonce",
      dataKeyAuthTag: "data-key-tag",
      contentNonce: "content-nonce",
      contentAuthTag: "content-tag",
      keyVersion: "v1"
    }, { now: () => now });

    expect(grant.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(grant.expiresAt.getTime() - now.getTime()).toBe(MODERATION_MEDIA_GRANT_TTL_MS);
    const params = query.mock.calls[0]?.[1] as unknown[];
    expect(params).not.toContain(grant.token);
    expect(params[1]).toBe("33333333-3333-4333-8333-333333333333");
    expect(params).toContain(hashModerationMediaToken(grant.token));
    expect(hashModerationMediaToken(grant.token)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("uses an atomic update so only the first unexpired, unrevoked GET can redeem", async () => {
    const row = {
      id: "grant-1",
      object_key: "profile-photos/object.enc",
      mime_type: "image/png",
      byte_size: 4,
      encrypted_data_key: "key",
      data_key_nonce: "nonce",
      data_key_auth_tag: "tag",
      content_nonce: "content-nonce",
      content_auth_tag: "content-tag",
      key_version: "v1"
    };
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({ rows: [] });
    const db = { query } as unknown as DbClient;

    await expect(redeemModerationMediaGrant(db, "one-time-token")).resolves.toEqual(row);
    await expect(redeemModerationMediaGrant(db, "one-time-token")).resolves.toBeNull();

    expect(query.mock.calls[0]?.[0]).toContain("update moderation_media_grants");
    expect(query.mock.calls[0]?.[0]).toContain("redeemed_at is null");
    expect(query.mock.calls[0]?.[0]).toContain("revoked_at is null");
    expect(query.mock.calls[0]?.[0]).toContain("expires_at > now()");
    expect(query.mock.calls[0]?.[1]).toEqual([hashModerationMediaToken("one-time-token")]);
  });

  it("requires a successful provider GET before a bridge result can publish", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ redeemed: false }] })
      .mockResolvedValueOnce({ rows: [{ redeemed: true }] });
    const db = { query } as unknown as DbClient;

    await expect(wasModerationMediaGrantRedeemed(db, "grant-id")).resolves.toBe(false);
    await expect(wasModerationMediaGrantRedeemed(db, "grant-id")).resolves.toBe(true);
    expect(query.mock.calls[0]).toEqual([
      expect.stringContaining("redeemed_at is not null"),
      ["grant-id"]
    ]);
  });

  it("deletes every expired asset object and its database row before removing its grant", async () => {
    const mediaDir = await mkdtemp(path.join(tmpdir(), "cruush-grant-cleanup-"));
    tempDirs.push(mediaDir);
    const config = {
      NODE_ENV: "test",
      MEDIA_STORAGE_DIR: mediaDir,
      MEDIA_OBJECT_STORAGE_DRIVER: "local"
    } as AppConfig;
    const objectKey = "originals/expired.enc";
    const variantKey = "variants/expired/display.webp.enc";
    await writeEncryptedMediaObject(config, objectKey, Buffer.from("ciphertext"));
    await writeEncryptedMediaObject(config, variantKey, Buffer.from("variant-ciphertext"));
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{
        id: "expired-grant",
        media_object_id: "33333333-3333-4333-8333-333333333333",
        object_key: objectKey
      }] })
      .mockResolvedValueOnce({ rows: [{ object_key: objectKey }, { object_key: variantKey }] })
      .mockResolvedValue({ rows: [] });

    await expect(cleanupModerationMediaGrants({ query } as unknown as DbClient, config, 10)).resolves.toBe(1);
    await expect(readEncryptedMediaObject(config, objectKey)).rejects.toThrow();
    await expect(readEncryptedMediaObject(config, variantKey)).rejects.toThrow();
    expect(query.mock.calls[0]?.[0]).toContain("expires_at <= now()");
    expect(query.mock.calls.some(([sql]) => String(sql).includes("delete from media_objects"))).toBe(true);
  });

  it("also selects abandoned pending media that never received a grant", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });

    await expect(cleanupModerationMediaGrants(
      { query } as unknown as DbClient,
      { NODE_ENV: "test", MEDIA_OBJECT_STORAGE_DRIVER: "local" } as AppConfig,
      25
    )).resolves.toBe(0);

    const cleanupSql = String(query.mock.calls[0]?.[0]);
    expect(cleanupSql).toContain("media.moderation_status = 'pending'");
    expect(cleanupSql).toContain("interval '5 minutes'");
    expect(cleanupSql).toContain("not exists");
  });
});
