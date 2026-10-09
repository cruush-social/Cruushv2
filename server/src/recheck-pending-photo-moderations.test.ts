import { describe, expect, it, vi } from "vitest";

const { deleteEncryptedMediaObject } = vi.hoisted(() => ({
  deleteEncryptedMediaObject: vi.fn()
}));

vi.mock("./media-storage.js", () => ({
  deleteEncryptedMediaObject,
  readEncryptedMediaObject: vi.fn(),
  writeEncryptedMediaObject: vi.fn()
}));

import {
  PENDING_PHOTO_MODERATION_RETENTION_MS,
  recheckPendingPhotoModerations
} from "./recheck-pending-photo-moderations.js";

describe("pending photo moderation retention", () => {
  it("purges expired holds and excludes them from retry claims", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const app = {
      db: { query },
      log: {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn()
      }
    } as never;

    await expect(recheckPendingPhotoModerations(app, 7)).resolves.toEqual({
      scanned: 0,
      completed: 0,
      purged: 0
    });

    expect(query).toHaveBeenCalledTimes(2);
    expect(String(query.mock.calls[0]?.[0])).toContain("media.created_at <= now() - ($2 * interval '1 millisecond')");
    expect(query.mock.calls[0]?.[1]).toEqual([7, PENDING_PHOTO_MODERATION_RETENTION_MS, 5 * 60 * 1000]);
    expect(String(query.mock.calls[1]?.[0])).toContain("media.created_at > now() - ($3 * interval '1 millisecond')");
    expect(query.mock.calls[1]?.[1]).toEqual([7, 5 * 60 * 1000, PENDING_PHOTO_MODERATION_RETENTION_MS]);
  });

  it("deletes expired encrypted originals, variants, and the hold row", async () => {
    deleteEncryptedMediaObject.mockReset();
    deleteEncryptedMediaObject.mockResolvedValue(undefined);
    const expired = {
      id: "10000000-0000-4000-8000-000000000001",
      owner_user_id: "20000000-0000-4000-8000-000000000002",
      surface: "profile_photo",
      object_key: "originals/expired.enc",
      mime_type: "image/jpeg",
      byte_size: 128,
      width: 240,
      height: 160,
      encrypted_data_key: "encrypted-key",
      data_key_nonce: "key-nonce",
      data_key_auth_tag: "key-tag",
      content_nonce: "content-nonce",
      content_auth_tag: "content-tag",
      key_version: "v1",
      moderation_hold: { kind: "profile_photo" },
      variant_keys: ["variants/expired/display.webp.enc", "variants/expired/thumbnail.webp.enc"]
    };
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [expired] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const app = {
      db: { query },
      config: {},
      log: {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn()
      }
    } as never;

    await expect(recheckPendingPhotoModerations(app, 1)).resolves.toEqual({
      scanned: 0,
      completed: 0,
      purged: 1
    });

    expect(deleteEncryptedMediaObject.mock.calls.map(([, objectKey]) => objectKey)).toEqual([
      "originals/expired.enc",
      "variants/expired/display.webp.enc",
      "variants/expired/thumbnail.webp.enc"
    ]);
    expect(query.mock.calls[1]?.[0]).toBe("delete from media_objects where id = $1");
    expect(query.mock.calls[1]?.[1]).toEqual([expired.id]);
  });
});
