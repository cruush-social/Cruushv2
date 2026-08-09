import { describe, expect, it, vi } from "vitest";
import { recordModerationSystemError, resolveModerationSystemErrors } from "./moderation-system-errors.js";

describe("moderation system errors", () => {
  it("deduplicates open provider failures by provider, surface, content type, and code", async () => {
    const query = vi.fn(async () => ({ rows: [] }));

    await recordModerationSystemError(query as never, {
      provider: "stream",
      surface: "feed",
      contentType: "image",
      errorCode: "provider_unavailable",
      error: new Error("gateway timeout\nwith details")
    });

    const calls = query.mock.calls as unknown as Array<[string, unknown[]?]>;
    const [sql, params] = calls[0] as [string, unknown[]];
    expect(sql).toContain("on conflict (fingerprint) where resolved_at is null");
    expect(params[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(params[5]).toBe("gateway timeout with details");
  });

  it("resolves open failures after provider recovery", async () => {
    const query = vi.fn(async () => ({ rows: [] }));

    await resolveModerationSystemErrors(query as never, {
      provider: "stream",
      surface: "profile",
      contentType: "text"
    });

    const calls = query.mock.calls as unknown as Array<[string, unknown[]?]>;
    expect(calls[0]?.[0]).toContain("set resolved_at = now()");
    expect(calls[0]?.[1]).toEqual(["stream", "profile", "text"]);
  });
});
