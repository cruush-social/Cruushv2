import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify, { type FastifyServerOptions } from "fastify";
import { getAlphaTestState } from "./alpha-test.js";
import { createPool, type DbClient } from "./db.js";
import type { AppConfig } from "./config.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerAdminModerationRoutes } from "./routes/admin-moderation.js";
import { registerBetaAccessRoutes } from "./routes/beta-access.js";
import { registerBlockRoutes } from "./routes/blocks.js";
import { registerBillingRoutes } from "./routes/billing.js";
import { registerCruushRoutes } from "./routes/cruush.js";
import { registerEventRoutes } from "./routes/events.js";
import { ApiError, formatError, toApiError } from "./errors.js";
import { registerMediaRoutes } from "./routes/media.js";
import { registerModerationMediaRoutes } from "./routes/moderation-media.js";
import { registerMessageRoutes } from "./routes/messages.js";
import { registerInternalRoutes } from "./routes/internal.js";
import { registerNotificationRoutes } from "./routes/notifications.js";
import { registerPostRoutes } from "./routes/posts.js";
import { registerProfileRoutes } from "./routes/profiles.js";
import { registerPrivacyRoutes } from "./routes/privacy.js";
import { registerReportRoutes } from "./routes/reports.js";
import { registerSupportRoutes } from "./routes/support.js";
import { registerUserNoticeRoutes } from "./routes/user-notices.js";
import { registerUserRoutes } from "./routes/users.js";
import { registerDevRoutes } from "./routes/dev.js";
import { registerRewardRoutes } from "./routes/rewards.js";
import { photoUploadAvailability } from "./photo-upload-availability.js";
import { createPostgresRateLimiter, type RateLimiter } from "./rate-limit.js";

type BuildServerDeps = {
  db?: DbClient;
  rateLimiter?: RateLimiter;
  logger?: FastifyServerOptions["logger"];
};

const stateChangingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function headerOrigin(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  return rawValue?.split(",")[0]?.trim() ?? "";
}

function refererOrigin(value: string | string[] | undefined) {
  const referer = headerOrigin(value);

  if (!referer) {
    return "";
  }

  try {
    return new URL(referer).origin;
  } catch {
    return "";
  }
}

function moderationRuntimeStatus(config: AppConfig) {
  return {
    provider: config.STREAM_MODERATION_ENABLED ? "stream" : "mock",
    streamModeration: config.STREAM_MODERATION_ENABLED,
    streamImageBridge: config.STREAM_IMAGE_BRIDGE_ENABLED,
    profilePhotoStreamAutomod: config.PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED,
    profilePhotoRekognition: config.PROFILE_PHOTO_REKOGNITION_ENABLED,
    mediaPublicBaseUrlConfigured: Boolean(config.MEDIA_PUBLIC_BASE_URL),
    streamConfigKeyConfigured: Boolean(config.STREAM_MODERATION_CONFIG_KEY),
    streamAppIdConfigured: Boolean(config.STREAM_APP_ID)
  };
}

export function buildServer(config: AppConfig, deps: BuildServerDeps = {}) {
  const app = Fastify({
    logger: deps.logger ?? config.NODE_ENV !== "test",
    trustProxy: (config.TRUST_PROXY_HOPS ?? 0) > 0 ? config.TRUST_PROXY_HOPS : false
  });
  const db = deps.db ?? createPool(config);
  const allowedCorsOrigins = new Set<string>();
  for (const origin of config.CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean)) {
    allowedCorsOrigins.add(origin);
    try {
      const url = new URL(origin);
      if (url.hostname.startsWith("www.")) {
        url.hostname = url.hostname.replace(/^www\./, "");
        allowedCorsOrigins.add(url.origin);
      } else if (url.hostname.includes(".") && !url.hostname.startsWith("localhost") && !url.hostname.startsWith("127.")) {
        url.hostname = `www.${url.hostname}`;
        allowedCorsOrigins.add(url.origin);
      }
    } catch {
      // Ignore invalid URL formatting
    }
  }

  void app.register(cors, {
    origin: (origin, callback) => {
      if (!origin || allowedCorsOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true
  });
  void app.register(multipart, {
    limits: {
      fileSize: 5 * 1024 * 1024,
      files: 1
    }
  });
  app.decorate("config", config);
  app.decorate("db", db);
  app.decorate("rateLimiter", deps.rateLimiter ?? createPostgresRateLimiter(db));

  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-content-type-options", "nosniff");
    reply.header("x-frame-options", "DENY");
    reply.header("referrer-policy", "no-referrer");
    reply.header("permissions-policy", "camera=(), microphone=(), geolocation=()");
    reply.header("cross-origin-resource-policy", "same-site");

    if (config.NODE_ENV === "production") {
      reply.header("strict-transport-security", "max-age=31536000; includeSubDomains");
    }

    if (!stateChangingMethods.has(request.method)) {
      return;
    }

    const origin = typeof request.headers.origin === "string" ? request.headers.origin : "";
    const requestOrigin = origin || (
      config.NODE_ENV === "production"
        ? refererOrigin(request.headers.referer)
        : ""
    );

    if (requestOrigin && !allowedCorsOrigins.has(requestOrigin)) {
      throw new ApiError(403, "FORBIDDEN", "Request origin is not allowed.");
    }

    if (config.NODE_ENV === "production" && !requestOrigin) {
      throw new ApiError(403, "FORBIDDEN", "Request origin is required.");
    }
  });

  app.setErrorHandler((error, _request, reply) => {
    const apiError = toApiError(error);

    if (apiError.statusCode >= 500) {
      app.log.error({ err: error }, "request failed");
    }

    void reply.code(apiError.statusCode).send(formatError(apiError));
  });

  app.addHook("onClose", async () => {
    await db.end();
  });

  app.get("/health", async () => {
    const result = await db.query("select now() as now");

    return {
      ok: true,
      timestamp: result.rows[0]?.now ?? null
    };
  });

  app.get("/api/meta", async () => {
    return {
      service: "cruush-server",
      auth: "session-cookie",
      storage: "postgres",
      migratedFromSupabase: true,
      alphaTest: getAlphaTestState(config),
      betaAccess: {
        enabled: Boolean(config.BETA_ACCESS_GEOFENCE_ENABLED),
        center: {
          lat: config.BETA_ACCESS_CENTER_LATITUDE ?? 40.70982,
          lng: config.BETA_ACCESS_CENTER_LONGITUDE ?? -73.92256
        },
        radiusMiles: config.BETA_ACCESS_RADIUS_MILES ?? 15,
        venueName: config.BETA_ACCESS_VENUE_NAME ?? "70 Scott Ave"
      },
      photoUploads: photoUploadAvailability(config),
      moderation: moderationRuntimeStatus(config)
    };
  });

  void registerAuthRoutes(app);
  void registerAdminModerationRoutes(app);
  void registerBetaAccessRoutes(app);
  void registerBlockRoutes(app);
  void registerBillingRoutes(app);
  void registerModerationMediaRoutes(app);
  void registerMediaRoutes(app);
  void registerMessageRoutes(app);
  void registerNotificationRoutes(app);
  void registerUserNoticeRoutes(app);
  void registerUserRoutes(app);
  void registerCruushRoutes(app);
  void registerEventRoutes(app);
  void registerPostRoutes(app);
  void registerProfileRoutes(app);
  void registerPrivacyRoutes(app);
  void registerReportRoutes(app);
  void registerRewardRoutes(app);
  void registerSupportRoutes(app);
  void registerInternalRoutes(app);
  if (config.NODE_ENV !== "production") {
    void registerDevRoutes(app);
  }

  return app;
}
