import { afterAll, describe, expect, it } from "vitest";
import { buildServer } from "./app.js";

const app = buildServer({
  NODE_ENV: "test",
  PORT: 3001,
  HOST: "127.0.0.1",
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/cruush",
  CORS_ORIGIN: "http://localhost:5173",
  SESSION_SECRET: "test-secret"
});

afterAll(async () => {
  await app.close();
});

describe("server", () => {
  it("returns metadata from /api/meta", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/meta"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      service: "cruush-server",
      auth: "planned",
      storage: "planned",
      migratedFromSupabase: true
    });
  });
});
