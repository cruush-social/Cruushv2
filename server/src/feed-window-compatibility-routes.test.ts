import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "./config.js";
import { formatError, toApiError } from "./errors.js";
import { registerPostRoutes } from "./routes/posts.js";

vi.mock("./profile-oos-visibility.js", () => ({
  getViewerOutsideServiceArea: vi.fn().mockResolvedValue(false),
  loadOosHiddenProfileIds: vi.fn().mockResolvedValue(new Set())
}));
vi.mock("./out-of-sight-location.js", async (original) => ({
  ...await original<typeof import("./out-of-sight-location.js")>(),
  loadOutOfSightStatuses: vi.fn().mockResolvedValue(new Map())
}));
vi.mock("./match-relationships.js", async (original) => ({
  ...await original<typeof import("./match-relationships.js")>(),
  getSharedDistanceLabelMode: vi.fn().mockResolvedValue("approximate")
}));

const userId = "11111111-1111-4111-8111-111111111111";
const headers = { "x-user-id": userId };
const settings = (window: string | null) => ({
  feed_location_pin_visibility: "mutuals",
  feed_show_distance_labels: true,
  feed_post_expiry_default: "never",
  feed_window_default: window
});

describe("Feed window API compatibility", () => {
  let app: FastifyInstance;
  const query = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    query.mockReset().mockResolvedValue({ rows: [] });
    app = Fastify({ logger: false });
    app.decorate("config", { NODE_ENV: "test" } as AppConfig);
    app.decorate("db", { query, end: vi.fn() });
    app.setErrorHandler((error, _request, reply) => {
      const apiError = toApiError(error);
      return reply.code(apiError.statusCode).send(formatError(apiError));
    });
    await registerPostRoutes(app);
  });

  afterEach(async () => { await app.close(); });

  it.each([
    { search: "?within=never", expected: "30d" },
    { search: "?within=30d", expected: "30d" },
    { search: "", expected: "7d" }
  ])("bounds GET /api/posts$search by creation time", async ({ search, expected }) => {
    const response = await app.inject({ method: "GET", url: `/api/posts${search}`, headers });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [] });
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, values] = query.mock.calls[0];
    expect(values[1]).toBe(expected);
    expect(sql).toContain("p.expires_at > now()");
    expect(sql).toContain("p.created_at >= now() - case");
    expect(sql).toContain("split_part($2, 'd', 1)::integer * interval '1 day'");
    expect(sql).not.toContain("$2 = 'never'");
    expect(sql).not.toContain("p.expires_in = 'never' or");
  });

  it.each([
    { stored: "never", expected: "30d" },
    { stored: "30d", expected: "30d" },
    { stored: "7d", expected: "7d" },
    { stored: null, expected: "7d" }
  ])("reads saved window $stored as $expected without rewriting it", async ({ stored, expected }) => {
    query.mockResolvedValueOnce({ rows: [settings(stored)] });
    const response = await app.inject({ method: "GET", url: "/api/feed/settings", headers });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ feedWindow: expected, postExpiryDefault: "never" });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0].trim()).toMatch(/^select\b/);
  });

  it("accepts legacy PUT settings and persists only the bounded window", async () => {
    query.mockResolvedValueOnce({ rows: [settings("30d")] });
    const response = await app.inject({
      method: "PUT", url: "/api/feed/settings", headers,
      payload: { locationPinVisibility: "mutuals", feedWindow: "never", postExpiryDefault: "never" }
    });
    expect(response.statusCode).toBe(200);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual([userId, "mutuals", true, "never", "30d", null]);
    expect(response.json().data).toMatchObject({ feedWindow: "30d", postExpiryDefault: "never" });
  });

  it("normalizes legacy settings returned by a partial PUT without rewriting the omitted window", async () => {
    query.mockResolvedValueOnce({ rows: [settings("never")] });
    const response = await app.inject({
      method: "PUT", url: "/api/feed/settings", headers,
      payload: { locationPinVisibility: "mutuals" }
    });
    expect(response.statusCode).toBe(200);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual([userId, "mutuals", true, null, null, null]);
    expect(query.mock.calls[0][0]).toContain("feed_window_default = coalesce($5::text, user_privacy_settings.feed_window_default)");
    expect(response.json().data).toMatchObject({ feedWindow: "30d", postExpiryDefault: "never" });
  });

  it("still returns never-expiring posts as having no expiry", async () => {
    query.mockResolvedValueOnce({ rows: [{
      id: "post-1", user_id: userId, content: "No expiry", expires_in: "never",
      expires_at: "infinity", created_at: new Date().toISOString(),
      display_name: "Member", pronouns: [], photos: []
    }] });
    const response = await app.inject({ method: "GET", url: "/api/posts?within=never", headers });
    expect(response.statusCode).toBe(200);
    expect(response.json().data[0]).toMatchObject({ expiresIn: "never", expiresAt: null });
    expect(query.mock.calls[0][1][1]).toBe("30d");
  });

  it("continues rejecting unsupported windows", async () => {
    const response = await app.inject({ method: "GET", url: "/api/posts?within=31d", headers });
    expect(response.statusCode).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
});
