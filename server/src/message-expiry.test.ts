import { describe, expect, it, vi } from "vitest";
import { expireDisappearingMessages } from "./message-expiry.js";

const { deleteEncryptedMediaObject } = vi.hoisted(() => ({
  deleteEncryptedMediaObject: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("./media-storage.js", () => ({
  deleteEncryptedMediaObject
}));

describe("message expiry", () => {
  it("deletes expired messages and unreferenced message media", async () => {
    const queries: string[] = [];
    const db = {
      async query<T>(sql: string, params?: unknown[]) {
        queries.push(sql);

        if (/^(begin|commit|rollback)$/i.test(sql.trim())) {
          return { rows: [] as T[] };
        }

        if (sql.includes("from messages") && sql.includes("expires_at <= now()")) {
          return { rows: [{ id: "message-1" }] as T[] };
        }

        if (sql.includes("delete from messages")) {
          expect(params).toEqual([["message-1"]]);
          return { rows: [] as T[] };
        }

        if (sql.includes("delete from media_objects")) {
          expect(params).toEqual(["media-1"]);
          return { rows: [] as T[] };
        }

        if (sql.includes("from media_objects media") && sql.includes("message_media_attachments")) {
          return {
            rows: [{
              id: "media-1",
              object_key: "originals/media-1.enc",
              variant_object_keys: ["variants/media-1/display.webp.enc"]
            }] as T[]
          };
        }

        if (sql.includes("update media_objects")) {
          expect(params).toEqual([["media-1"]]);
          return { rows: [] as T[] };
        }

        throw new Error(`Unexpected query: ${sql}`);
      },
      async end() {
        return undefined;
      }
    };

    deleteEncryptedMediaObject.mockClear();
    const result = await expireDisappearingMessages({
      db,
      config: {} as never,
      log: { error: vi.fn() } as never
    });

    expect(result).toEqual({
      expiredMessages: 1,
      cleanedMediaObjects: 1,
      failedMediaObjects: 0
    });
    expect(deleteEncryptedMediaObject).toHaveBeenCalledTimes(2);
    expect(queries.some((sql) => sql.includes("delete from messages"))).toBe(true);
  });
});
