import { describe, expect, it, vi } from "vitest";
import type { AppConfig } from "./config.js";
import type { DbClient } from "./db.js";

const { deleteEncryptedMediaObject } = vi.hoisted(() => ({
  deleteEncryptedMediaObject: vi.fn()
}));

vi.mock("./media-storage.js", () => ({
  deleteEncryptedMediaObject
}));

import { cleanupAccountDeletionMedia, cleanupOwnedAccountDeletionMedia } from "./account-deletion-media-cleanup.js";

const config = {} as AppConfig;

function createDb(candidate: { object_key: string; attempt_count: number }): DbClient & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    async query<T = Record<string, unknown>>(sql: string): Promise<{ rows: T[] }> {
      calls.push([sql]);
      if (sql.includes("with candidates as")) {
        return { rows: [candidate as T] };
      }

      return { rows: [] };
    },
    end: vi.fn()
  };
}

describe("account deletion media cleanup", () => {
  it("deletes claimed objects and removes their identifying cleanup key", async () => {
    deleteEncryptedMediaObject.mockResolvedValueOnce(undefined);
    const db = createDb({ object_key: "originals/account.enc", attempt_count: 1 });

    await expect(cleanupAccountDeletionMedia(db, config, 10)).resolves.toEqual({
      scanned: 1,
      completed: 1,
      failed: 0
    });

    expect(deleteEncryptedMediaObject).toHaveBeenCalledWith(config, "originals/account.enc");
    expect(db.calls[1]?.[0]).toContain("delete from account_deletion_media_cleanup");
    expect(db.calls[0]?.[0]).toContain("delete from account_deletion_media_cleanup where completed_at is not null");
  });

  it("keeps failed objects queued with a retry delay", async () => {
    deleteEncryptedMediaObject.mockRejectedValueOnce(new Error("storage unavailable"));
    const db = createDb({ object_key: "variants/account/display.webp.enc", attempt_count: 2 });

    await expect(cleanupAccountDeletionMedia(db, config, 10)).resolves.toEqual({
      scanned: 1,
      completed: 0,
      failed: 1
    });

    expect(db.calls[1]?.[0]).toContain("set next_attempt_at");
  });

  it("scopes immediate deletion to owned keys without waiting for the scheduler", async () => {
    deleteEncryptedMediaObject.mockResolvedValueOnce(undefined);
    const db = createDb({ object_key: "originals/account.enc", attempt_count: 1 });
    expect(await cleanupOwnedAccountDeletionMedia(db, config, ["originals/account.enc"]))
      .toEqual({ scanned: 1, completed: 1, failed: 0 });
    expect(db.calls[0]?.[0]).toContain("object_key = any($3::text[])");
  });

  it("bounds the response wait when object storage stalls while keeping cleanup active", async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    deleteEncryptedMediaObject.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    const db = createDb({ object_key: "originals/account.enc", attempt_count: 1 });
    try {
      const cleanup = cleanupOwnedAccountDeletionMedia(db, config, ["originals/account.enc"], 20);
      await vi.advanceTimersByTimeAsync(20);
      expect(await cleanup).toBeNull();
      expect(db.calls).toHaveLength(1);
      finish();
      await vi.advanceTimersByTimeAsync(0);
      expect(db.calls[1]?.[0]).toContain("delete from account_deletion_media_cleanup");
    } finally { vi.useRealTimers(); }
  });
});
