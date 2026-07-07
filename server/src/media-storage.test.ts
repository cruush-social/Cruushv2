import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "./config.js";
import {
  createEncryptedMediaObjectStorage,
  deleteEncryptedMediaObject,
  readEncryptedMediaObject,
  writeEncryptedMediaObject
} from "./media-storage.js";

const fixedNow = new Date("2026-07-07T12:34:56.000Z");

const s3Config = {
  NODE_ENV: "production",
  MEDIA_OBJECT_STORAGE_DRIVER: "s3",
  MEDIA_S3_BUCKET: "cruush-media-staging",
  MEDIA_S3_ENDPOINT: "https://account-id.r2.cloudflarestorage.com",
  MEDIA_S3_REGION: "auto",
  MEDIA_S3_ACCESS_KEY_ID: "test-access-key",
  MEDIA_S3_SECRET_ACCESS_KEY: "test-secret-key"
} as AppConfig;

describe("encrypted media object storage", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it("stores, reads, and deletes encrypted objects locally for development", async () => {
    const mediaDir = await mkdtemp(path.join(tmpdir(), "cruush-media-storage-"));
    tempDirs.push(mediaDir);
    const config = {
      NODE_ENV: "test",
      MEDIA_OBJECT_STORAGE_DRIVER: "local",
      MEDIA_STORAGE_DIR: mediaDir
    } as AppConfig;

    await writeEncryptedMediaObject(config, "profile-photos/test.enc", Buffer.from("encrypted"));

    await expect(readEncryptedMediaObject(config, "profile-photos/test.enc"))
      .resolves.toEqual(Buffer.from("encrypted"));

    await deleteEncryptedMediaObject(config, "profile-photos/test.enc");

    await expect(readEncryptedMediaObject(config, "profile-photos/test.enc")).rejects.toThrow();
  });

  it("writes encrypted objects to an R2/S3-compatible bucket with signed requests", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));
    const storage = createEncryptedMediaObjectStorage(s3Config, {
      fetch: fetchImpl,
      now: () => fixedNow
    });

    await storage.write("profile-photos/user-id/photo.enc", Buffer.from("encrypted"));

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const call = fetchImpl.mock.calls[0];
    expect(call).toBeDefined();
    const [url, init] = call as unknown as [string, RequestInit];
    const headers = init?.headers as Record<string, string>;

    expect(url).toBe("https://account-id.r2.cloudflarestorage.com/cruush-media-staging/profile-photos/user-id/photo.enc");
    expect(init?.method).toBe("PUT");
    expect(init?.body).toEqual(Buffer.from("encrypted"));
    expect(headers.authorization).toContain("AWS4-HMAC-SHA256");
    expect(headers.authorization).toContain("Credential=test-access-key/20260707/auto/s3/aws4_request");
    expect(headers.authorization).toContain("SignedHeaders=host;x-amz-content-sha256;x-amz-date");
    expect(headers["x-amz-date"]).toBe("20260707T123456Z");
    expect(headers["x-amz-content-sha256"]).toMatch(/^[a-f0-9]{64}$/);
  });

  it("reads and deletes encrypted objects from an R2/S3-compatible bucket", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const storage = createEncryptedMediaObjectStorage(s3Config, {
      fetch: fetchImpl,
      now: () => fixedNow
    });

    await expect(storage.read("profile-photos/user-id/photo.enc"))
      .resolves.toEqual(Buffer.from([1, 2, 3]));
    await expect(storage.delete("profile-photos/user-id/photo.enc")).resolves.toBeUndefined();

    expect(fetchImpl.mock.calls[0]?.[1]?.method).toBe("GET");
    expect(fetchImpl.mock.calls[1]?.[1]?.method).toBe("DELETE");
  });

  it("fails closed when the object store rejects an operation", async () => {
    const fetchImpl = vi.fn(async () => new Response("denied", { status: 403 }));
    const storage = createEncryptedMediaObjectStorage(s3Config, {
      fetch: fetchImpl,
      now: () => fixedNow
    });

    await expect(storage.write("profile-photos/user-id/photo.enc", Buffer.from("encrypted")))
      .rejects.toThrow("Encrypted media object storage PUT failed with status 403.");
  });
});
