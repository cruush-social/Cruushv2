import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

const strongSecret = "0123456789abcdef0123456789abcdef";

describe("loadConfig", () => {
  it("allows local HTTP and HTTPS frontend origins by default", () => {
    const config = loadConfig({
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/cruush",
      SESSION_SECRET: "local-dev-secret"
    });

    expect(config.CORS_ORIGIN.split(",")).toEqual(expect.arrayContaining([
      "http://localhost:5173",
      "https://localhost:5173",
      "http://127.0.0.1:5173",
      "https://127.0.0.1:5173"
    ]));
    expect(config.APP_URL).toBe("https://localhost:5173");
  });

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
      PROFILE_TOKEN_KEY: strongSecret,
      RELATIONSHIP_ENCRYPTION_KEY: strongSecret,
      RELATIONSHIP_INDEX_KEY: strongSecret,
      MATCH_TOKEN_ENCRYPTION_KEY: strongSecret,
      MATCH_TOKEN_SIGNING_KEY: strongSecret,
      LOCATION_ENCRYPTION_KEY: strongSecret,
      LOCATION_INDEX_KEY: strongSecret,
      VISIBILITY_POLICY_ENCRYPTION_KEY: strongSecret,
      GHOST_DERIVATION_KEY: strongSecret,
      DISPLAY_TOKEN_ENCRYPTION_KEY: strongSecret
    })).toThrow();
  });

  it("requires Stream credentials when Stream moderation is enabled", () => {
    expect(() => loadConfig({
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/cruush",
      SESSION_SECRET: "local-dev-secret",
      STREAM_MODERATION_ENABLED: "true"
    })).toThrow();

    expect(loadConfig({
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/cruush",
      SESSION_SECRET: "local-dev-secret",
      STREAM_MODERATION_ENABLED: "true",
      STREAM_API_KEY: "stream-key",
      STREAM_API_SECRET: "stream-secret",
      STREAM_MODERATION_CONFIG_KEY: "cruush:automod"
    })).toMatchObject({
      STREAM_MODERATION_ENABLED: true,
      STREAM_API_KEY: "stream-key",
      STREAM_API_SECRET: "stream-secret",
      STREAM_MODERATION_CONFIG_KEY: "cruush:automod"
    });
  });

  it("requires PhotoDNA connection details when PhotoDNA is enabled", () => {
    expect(() => loadConfig({
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/cruush",
      SESSION_SECRET: "local-dev-secret",
      PHOTODNA_ENABLED: "true"
    })).toThrow();

    expect(loadConfig({
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/cruush",
      SESSION_SECRET: "local-dev-secret",
      PHOTODNA_ENABLED: "true",
      PHOTODNA_API_URL: "https://photodna.example.test/hash",
      PHOTODNA_OPERATION_PATH: "/match",
      PHOTODNA_SUBSCRIPTION_KEY: "photo-dna-key"
    })).toMatchObject({
      PHOTODNA_ENABLED: true,
      PHOTODNA_API_URL: "https://photodna.example.test/hash",
      PHOTODNA_OPERATION_PATH: "/match",
      PHOTODNA_SUBSCRIPTION_KEY: "photo-dna-key"
    });
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
      PROFILE_TOKEN_KEY: strongSecret,
      RELATIONSHIP_ENCRYPTION_KEY: strongSecret,
      RELATIONSHIP_INDEX_KEY: strongSecret,
      MATCH_TOKEN_ENCRYPTION_KEY: strongSecret,
      MATCH_TOKEN_SIGNING_KEY: strongSecret,
      MESSAGE_ENCRYPTION_KEY: strongSecret,
      FEED_ENCRYPTION_KEY: strongSecret,
      MEDIA_ENCRYPTION_KEY: strongSecret,
      LOCATION_ENCRYPTION_KEY: strongSecret,
      LOCATION_INDEX_KEY: strongSecret,
      VISIBILITY_POLICY_ENCRYPTION_KEY: strongSecret,
      GHOST_DERIVATION_KEY: strongSecret,
      DISPLAY_TOKEN_ENCRYPTION_KEY: strongSecret
    })).toMatchObject({
      NODE_ENV: "production",
      EMAIL_PREVIEW_ENABLED: false,
      PROFILE_ENCRYPTION_KEY: strongSecret,
      PROFILE_TOKEN_KEY: strongSecret,
      RELATIONSHIP_ENCRYPTION_KEY: strongSecret,
      RELATIONSHIP_INDEX_KEY: strongSecret,
      MATCH_TOKEN_ENCRYPTION_KEY: strongSecret,
      MATCH_TOKEN_SIGNING_KEY: strongSecret,
      MESSAGE_ENCRYPTION_KEY: strongSecret,
      FEED_ENCRYPTION_KEY: strongSecret,
      MEDIA_ENCRYPTION_KEY: strongSecret,
      LOCATION_ENCRYPTION_KEY: strongSecret,
      LOCATION_INDEX_KEY: strongSecret,
      VISIBILITY_POLICY_ENCRYPTION_KEY: strongSecret,
      GHOST_DERIVATION_KEY: strongSecret,
      DISPLAY_TOKEN_ENCRYPTION_KEY: strongSecret
    });
  });
});
