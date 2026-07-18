import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

const strongSecret = "0123456789abcdef0123456789abcdef";

function validProductionEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
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
    MEDIA_PUBLIC_BASE_URL: "https://api-staging.cruush.app",
    MEDIA_MODERATION_URL_SECRET: strongSecret,
    MEDIA_MODERATION_URL_TTL_SECONDS: "120",
    MEDIA_OBJECT_STORAGE_DRIVER: "s3",
    MEDIA_S3_BUCKET: "cruush-media-staging",
    MEDIA_S3_ENDPOINT: "https://account-id.r2.cloudflarestorage.com",
    MEDIA_S3_REGION: "auto",
    MEDIA_S3_ACCESS_KEY_ID: "test-access-key",
    MEDIA_S3_SECRET_ACCESS_KEY: "test-secret-key",
    RESEND_API_KEY: "resend-key",
    MAIL_FROM: "Cruush <hello@cruush.app>",
    LOCATION_ENCRYPTION_KEY: strongSecret,
    LOCATION_INDEX_KEY: strongSecret,
    VISIBILITY_POLICY_ENCRYPTION_KEY: strongSecret,
    GHOST_DERIVATION_KEY: strongSecret,
    DISPLAY_TOKEN_ENCRYPTION_KEY: strongSecret,
    STREAM_MODERATION_ENABLED: "true",
    STREAM_API_KEY: "stream-key",
    STREAM_API_SECRET: "stream-secret",
    STREAM_MODERATION_CONFIG_KEY: "cruush:automod",
    PHOTODNA_ENABLED: "true",
    PHOTODNA_API_URL: "https://photodna.example.test",
    PHOTODNA_OPERATION_PATH: "/match",
    PHOTODNA_SUBSCRIPTION_KEY: "photodna-key",
    ...overrides
  };
}

describe("loadConfig", () => {
  it("keeps human moderation dormant unless explicitly enabled", () => {
    const baseEnv = {
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/cruush",
      SESSION_SECRET: "local-dev-secret"
    };

    expect(loadConfig(baseEnv).HUMAN_MODERATION_ENABLED).toBe(false);
    expect(loadConfig({
      ...baseEnv,
      HUMAN_MODERATION_ENABLED: "true"
    }).HUMAN_MODERATION_ENABLED).toBe(true);
  });

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

  it("requires Resend delivery settings in production", () => {
    expect(() => loadConfig({
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
      MEDIA_OBJECT_STORAGE_DRIVER: "s3",
      MEDIA_S3_BUCKET: "cruush-media-staging",
      MEDIA_S3_ENDPOINT: "https://account-id.r2.cloudflarestorage.com",
      MEDIA_S3_REGION: "auto",
      MEDIA_S3_ACCESS_KEY_ID: "test-access-key",
      MEDIA_S3_SECRET_ACCESS_KEY: "test-secret-key",
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
      STREAM_MODERATION_CONFIG_KEY: "cruush:automod",
      MEDIA_PUBLIC_BASE_URL: "http://localhost:3001",
      MEDIA_MODERATION_URL_SECRET: strongSecret
    })).toMatchObject({
      STREAM_MODERATION_ENABLED: true,
      STREAM_API_KEY: "stream-key",
      STREAM_API_SECRET: "stream-secret",
      STREAM_MODERATION_CONFIG_KEY: "cruush:automod",
      MEDIA_PUBLIC_BASE_URL: "http://localhost:3001",
      MEDIA_MODERATION_URL_SECRET: strongSecret
    });
  });

  it("keeps the Stream image bridge off by default and validates its private staging prerequisites", () => {
    expect(loadConfig({
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/cruush",
      SESSION_SECRET: "local-dev-secret"
    }).STREAM_IMAGE_BRIDGE_ENABLED).toBe(false);

    expect(() => loadConfig({
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/cruush",
      SESSION_SECRET: "local-dev-secret",
      STREAM_IMAGE_BRIDGE_ENABLED: "true"
    })).toThrow(/STREAM_MODERATION_ENABLED/);

    expect(loadConfig({
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/cruush",
      SESSION_SECRET: "local-dev-secret",
      STREAM_IMAGE_BRIDGE_ENABLED: "true",
      STREAM_MODERATION_ENABLED: "true",
      STREAM_API_KEY: "stream-key",
      STREAM_API_SECRET: "stream-secret",
      STREAM_MODERATION_CONFIG_KEY: "cruush:automod",
      MEDIA_PUBLIC_BASE_URL: "http://localhost:3001",
      MEDIA_MODERATION_URL_SECRET: strongSecret,
      MODERATION_MEDIA_BASE_URL: "https://moderation-media-staging.cruush.app",
      STREAM_PSEUDONYM_KEY: strongSecret
    })).toMatchObject({
      STREAM_IMAGE_BRIDGE_ENABLED: true,
      MODERATION_MEDIA_BASE_URL: "https://moderation-media-staging.cruush.app",
      STREAM_PSEUDONYM_KEY: strongSecret
    });
  });

  it("keeps shared Stream profile-photo automod off by default and prevents manual-review fallback", () => {
    const base = {
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/cruush",
      SESSION_SECRET: "local-dev-secret"
    };
    const streamAutomod = {
      ...base,
      APP_DEPLOYMENT_STAGE: "staging",
      PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED: "true",
      STREAM_IMAGE_BRIDGE_ENABLED: "true",
      STREAM_MODERATION_ENABLED: "true",
      STREAM_API_KEY: "stream-key",
      STREAM_API_SECRET: "stream-secret",
      STREAM_MODERATION_CONFIG_KEY: "cruush:automod",
      MEDIA_PUBLIC_BASE_URL: "https://api-staging.cruush.app",
      MEDIA_MODERATION_URL_SECRET: strongSecret,
      MODERATION_MEDIA_BASE_URL: "https://moderation-media-staging.cruush.app",
      STREAM_PSEUDONYM_KEY: strongSecret
    };

    expect(loadConfig(base).PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED).toBe(false);
    expect(loadConfig(streamAutomod)).toMatchObject({
      PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED: true,
      BANK_PROFILE_PHOTO_MANUAL_REVIEW_ENABLED: false,
      STREAM_IMAGE_BRIDGE_ENABLED: true
    });

    expect(() => loadConfig({
      ...base,
      PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED: "true"
    })).toThrow(/STREAM_IMAGE_BRIDGE_ENABLED/);

    expect(() => loadConfig({
      ...streamAutomod,
      BANK_PROFILE_PHOTO_MANUAL_REVIEW_ENABLED: "true",
      BANK_PROFILE_PHOTO_TESTER_USER_IDS: "11111111-1111-4111-8111-111111111111",
      INTERNAL_API_SECRET: strongSecret,
      MEDIA_OBJECT_STORAGE_DRIVER: "s3",
      MEDIA_S3_BUCKET: "cruush-media-staging",
      MEDIA_S3_ENDPOINT: "https://account-id.r2.cloudflarestorage.com",
      MEDIA_S3_ACCESS_KEY_ID: "test-access-key",
      MEDIA_S3_SECRET_ACCESS_KEY: "test-secret-key"
    })).toThrow(/BANK_PROFILE_PHOTO_MANUAL_REVIEW_ENABLED/);
  });

  it("keeps bank profile-photo review off by default and requires its staging privacy guardrails", () => {
    const base = {
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/cruush",
      SESSION_SECRET: "local-dev-secret"
    };

    expect(loadConfig(base)).toMatchObject({
      APP_DEPLOYMENT_STAGE: "development",
      BANK_PROFILE_PHOTO_MANUAL_REVIEW_ENABLED: false,
      BANK_PROFILE_PHOTO_TESTER_USER_IDS: []
    });

    expect(() => loadConfig({
      ...base,
      BANK_PROFILE_PHOTO_MANUAL_REVIEW_ENABLED: "true"
    })).toThrow(/APP_DEPLOYMENT_STAGE/);

    const protectedStagingConfig = {
      ...base,
      APP_DEPLOYMENT_STAGE: "staging",
      BANK_PROFILE_PHOTO_MANUAL_REVIEW_ENABLED: "true",
      BANK_PROFILE_PHOTO_TESTER_USER_IDS: "11111111-1111-4111-8111-111111111111, 22222222-2222-4222-8222-222222222222",
      INTERNAL_API_SECRET: strongSecret,
      STREAM_IMAGE_BRIDGE_ENABLED: "true",
      STREAM_MODERATION_ENABLED: "true",
      STREAM_API_KEY: "stream-key",
      STREAM_API_SECRET: "stream-secret",
      STREAM_MODERATION_CONFIG_KEY: "cruush:automod",
      MEDIA_PUBLIC_BASE_URL: "https://api-staging.cruush.app",
      MEDIA_MODERATION_URL_SECRET: strongSecret,
      MODERATION_MEDIA_BASE_URL: "https://moderation-media-staging.cruush.app",
      STREAM_PSEUDONYM_KEY: strongSecret,
      MEDIA_OBJECT_STORAGE_DRIVER: "s3",
      MEDIA_S3_BUCKET: "cruush-media-staging",
      MEDIA_S3_ENDPOINT: "https://account-id.r2.cloudflarestorage.com",
      MEDIA_S3_REGION: "auto",
      MEDIA_S3_ACCESS_KEY_ID: "test-access-key",
      MEDIA_S3_SECRET_ACCESS_KEY: "test-secret-key"
    };

    expect(loadConfig(protectedStagingConfig)).toMatchObject({
      APP_DEPLOYMENT_STAGE: "staging",
      BANK_PROFILE_PHOTO_MANUAL_REVIEW_ENABLED: true,
      BANK_PROFILE_PHOTO_TESTER_USER_IDS: [
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222"
      ]
    });

    expect(() => loadConfig({
      ...protectedStagingConfig,
      APP_DEPLOYMENT_STAGE: "production"
    })).toThrow(/APP_DEPLOYMENT_STAGE/);

    expect(() => loadConfig({
      ...protectedStagingConfig,
      BANK_PROFILE_PHOTO_TESTER_USER_IDS: "not-a-user-id"
    })).toThrow(/BANK_PROFILE_PHOTO_TESTER_USER_IDS/);

    expect(() => loadConfig({
      ...protectedStagingConfig,
      INTERNAL_API_SECRET: "short"
    })).toThrow(/INTERNAL_API_SECRET/);
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

  it("requires CSAM reporting guardrails before enabling PhotoDNA in production", () => {
    const productionPhotoDnaConfig = {
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
      MEDIA_OBJECT_STORAGE_DRIVER: "s3",
      MEDIA_S3_BUCKET: "cruush-media-staging",
      MEDIA_S3_ENDPOINT: "https://account-id.r2.cloudflarestorage.com",
      MEDIA_S3_REGION: "auto",
      MEDIA_S3_ACCESS_KEY_ID: "test-access-key",
      MEDIA_S3_SECRET_ACCESS_KEY: "test-secret-key",
      LOCATION_ENCRYPTION_KEY: strongSecret,
      LOCATION_INDEX_KEY: strongSecret,
      VISIBILITY_POLICY_ENCRYPTION_KEY: strongSecret,
      GHOST_DERIVATION_KEY: strongSecret,
      DISPLAY_TOKEN_ENCRYPTION_KEY: strongSecret,
      PHOTODNA_ENABLED: "true",
      PHOTODNA_API_URL: "https://photodna.example.test/hash",
      PHOTODNA_OPERATION_PATH: "/match",
      PHOTODNA_SUBSCRIPTION_KEY: "photo-dna-key"
    };

    expect(() => loadConfig(productionPhotoDnaConfig)).toThrow(/CSAM_REPORTING_ENABLED/);
    expect(() => loadConfig({
      ...productionPhotoDnaConfig,
      CSAM_REPORTING_ENABLED: "true"
    })).toThrow(/TRUST_SAFETY_ALERT_EMAIL/);

    expect(loadConfig({
      ...productionPhotoDnaConfig,
      CSAM_REPORTING_ENABLED: "true",
      CSAM_REPORTING_MODE: "manual_packet",
      TRUST_SAFETY_ALERT_EMAIL: "trust-safety@cruush.app",
      RESEND_API_KEY: "re_test",
      MAIL_FROM: "cruush <hello@cruush.app>"
    })).toMatchObject({
      PHOTODNA_ENABLED: true,
      CSAM_REPORTING_ENABLED: true,
      CSAM_REPORTING_MODE: "manual_packet",
      TRUST_SAFETY_ALERT_EMAIL: "trust-safety@cruush.app"
    });
  });

  it("requires R2/S3 media storage details when S3 media storage is enabled", () => {
    expect(() => loadConfig({
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/cruush",
      SESSION_SECRET: "local-dev-secret",
      MEDIA_OBJECT_STORAGE_DRIVER: "s3"
    })).toThrow();

    expect(loadConfig({
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/cruush",
      SESSION_SECRET: "local-dev-secret",
      MEDIA_OBJECT_STORAGE_DRIVER: "s3",
      MEDIA_S3_BUCKET: "cruush-media-staging",
      MEDIA_S3_ENDPOINT: "https://account-id.r2.cloudflarestorage.com",
      MEDIA_S3_REGION: "auto",
      MEDIA_S3_ACCESS_KEY_ID: "test-access-key",
      MEDIA_S3_SECRET_ACCESS_KEY: "test-secret-key"
    })).toMatchObject({
      MEDIA_OBJECT_STORAGE_DRIVER: "s3",
      MEDIA_S3_BUCKET: "cruush-media-staging",
      MEDIA_S3_ENDPOINT: "https://account-id.r2.cloudflarestorage.com",
      MEDIA_S3_REGION: "auto",
      MEDIA_S3_ACCESS_KEY_ID: "test-access-key",
      MEDIA_S3_SECRET_ACCESS_KEY: "test-secret-key"
    });
  });

  it("rejects production config that would store beta media on the API filesystem", () => {
    expect(() => loadConfig({
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
      DISPLAY_TOKEN_ENCRYPTION_KEY: strongSecret,
      MEDIA_OBJECT_STORAGE_DRIVER: "local"
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
      PROFILE_TOKEN_KEY: strongSecret,
      RELATIONSHIP_ENCRYPTION_KEY: strongSecret,
      RELATIONSHIP_INDEX_KEY: strongSecret,
      MATCH_TOKEN_ENCRYPTION_KEY: strongSecret,
      MATCH_TOKEN_SIGNING_KEY: strongSecret,
      MESSAGE_ENCRYPTION_KEY: strongSecret,
      FEED_ENCRYPTION_KEY: strongSecret,
      MEDIA_ENCRYPTION_KEY: strongSecret,
      MEDIA_OBJECT_STORAGE_DRIVER: "s3",
      MEDIA_S3_BUCKET: "cruush-media-staging",
      MEDIA_S3_ENDPOINT: "https://account-id.r2.cloudflarestorage.com",
      MEDIA_S3_REGION: "auto",
      MEDIA_S3_ACCESS_KEY_ID: "test-access-key",
      MEDIA_S3_SECRET_ACCESS_KEY: "test-secret-key",
      MEDIA_PUBLIC_BASE_URL: "https://api-staging.cruush.app",
      MEDIA_MODERATION_URL_SECRET: strongSecret,
      RESEND_API_KEY: "resend-key",
      MAIL_FROM: "cruush <hello@cruush.app>",
      LOCATION_ENCRYPTION_KEY: strongSecret,
      LOCATION_INDEX_KEY: strongSecret,
      VISIBILITY_POLICY_ENCRYPTION_KEY: strongSecret,
      GHOST_DERIVATION_KEY: strongSecret,
      DISPLAY_TOKEN_ENCRYPTION_KEY: strongSecret,
      STREAM_MODERATION_ENABLED: "true",
      STREAM_API_KEY: "stream-key",
      STREAM_API_SECRET: "stream-secret",
      STREAM_MODERATION_CONFIG_KEY: "cruush:automod",
      PHOTODNA_ENABLED: "false"
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
      MEDIA_PUBLIC_BASE_URL: "https://api-staging.cruush.app",
      MEDIA_MODERATION_URL_SECRET: strongSecret,
      MEDIA_MODERATION_URL_TTL_SECONDS: 120,
      MEDIA_OBJECT_STORAGE_DRIVER: "s3",
      RESEND_API_KEY: "resend-key",
      MAIL_FROM: "cruush <hello@cruush.app>",
      LOCATION_ENCRYPTION_KEY: strongSecret,
      LOCATION_INDEX_KEY: strongSecret,
      VISIBILITY_POLICY_ENCRYPTION_KEY: strongSecret,
      GHOST_DERIVATION_KEY: strongSecret,
      DISPLAY_TOKEN_ENCRYPTION_KEY: strongSecret,
      STREAM_MODERATION_ENABLED: true,
      PHOTODNA_ENABLED: false,
      HUMAN_MODERATION_ENABLED: false
    });
  });
});
