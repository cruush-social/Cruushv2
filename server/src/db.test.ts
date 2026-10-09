import { describe, expect, it, vi } from "vitest";
import { runTransaction, type DbClient } from "./db.js";

describe("runTransaction", () => {
  it("commits fallback transactions", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const db: DbClient = {
      query,
      end: vi.fn()
    };

    await expect(runTransaction(db, async (client) => {
      await client.query("select 1");
      return "done";
    })).resolves.toBe("done");

    expect(query.mock.calls.map((call) => call[0])).toEqual([
      "begin",
      "select 1",
      "commit"
    ]);
  });

  it("rolls back fallback transactions when the callback fails", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const db: DbClient = {
      query,
      end: vi.fn()
    };

    await expect(runTransaction(db, async () => {
      throw new Error("fail");
    })).rejects.toThrow("fail");

    expect(query.mock.calls.map((call) => call[0])).toEqual([
      "begin",
      "rollback"
    ]);
  });
});
