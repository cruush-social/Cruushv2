import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

const strongSecret = "0123456789abcdef0123456789abcdef";

describe("loadConfig", () => {
  it("rejects production config without dedicated profile keys", () => {
    expect(() => loadConfig({
      NODE_ENV: "production",
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/cruush",
      SESSION_SECRET: strongSecret,
      CORS_ORIGIN: "https://staging.cruush.app",
      APP_URL: "https://staging.cruush.app"
    })).toThrow();
  });

  it("rejects production email preview mode", () => {
    expect(() => loadConfig({
      NODE_ENV: "production",
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/cruush",
      SESSION_SECRET: strongSecret,
      CORS_ORIGIN: "https://staging.cruush.app",
      APP_URL: "https://staging.cruush.app",
      EMAIL_PREVIEW_ENABLED: "true",
      PROFILE_ENCRYPTION_KEY: strongSecret,
      PROFILE_TOKEN_KEY: strongSecret
    })).toThrow();
  });

  it("accepts production config with strong secrets and preview disabled", () => {
    expect(loadConfig({
      NODE_ENV: "production",
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/cruush",
      SESSION_SECRET: strongSecret,
      CORS_ORIGIN: "https://staging.cruush.app",
      APP_URL: "https://staging.cruush.app",
      EMAIL_PREVIEW_ENABLED: "false",
      PROFILE_ENCRYPTION_KEY: strongSecret,
      PROFILE_TOKEN_KEY: strongSecret
    })).toMatchObject({
      NODE_ENV: "production",
      EMAIL_PREVIEW_ENABLED: false,
      PROFILE_ENCRYPTION_KEY: strongSecret,
      PROFILE_TOKEN_KEY: strongSecret
    });
  });
});
