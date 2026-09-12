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
import { registerVerotelRoutes } from "./routes/verotel.js";
import { registerCruushRoutes } from "./routes/cruush.js";
import { registerCryptoPaymentRoutes } from "./routes/crypto-payments.js";
import { registerEventRoutes } from "./routes/events.js";
import { ApiError, formatError, toApiError } from "./errors.js";
import { registerMediaRoutes } from "./routes/media.js";
import { registerModerationMediaRoutes } from "./routes/moderation-media.js";
import { registerMessageRoutes } from "./routes/messages.js";
import { registerInternalRoutes } from "./routes/internal.js";
import { registerMapPingRoutes } from "./routes/map-pings.js";
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

function buildMetadata(config: AppConfig) {
  const sha = config.APP_BUILD_SHA?.trim() || null;

  return {
    sha,
    shortSha: sha ? sha.slice(0, 12) : null,
    stage: config.APP_DEPLOYMENT_STAGE ?? "development"
  };
}

export function buildServer(config: AppConfig, deps: BuildServerDeps = {}) {
  const logger = deps.logger ?? config.NODE_ENV !== "test";
  const app = Fastify({
    logger: logger === false ? false : {
      ...(typeof logger === "object" ? logger : {}),
      serializers: {
        // Log only route metadata, never a raw URL, headers, body or token.
        req: (request) => ({
          method: request.method,
          url: request.routeOptions?.url ?? "[unmatched]"
        }),
        res: (reply) => ({ statusCode: reply.statusCode }),
        // Error messages/stacks can echo request URLs or submitted secrets.
        err: (error) => ({
          type: error.name,
          code: error.code,
          statusCode: error.statusCode,
          message: "[omitted]",
          stack: ""
        })
      }
    },
    // Request logging is reproduced by the hooks below so that the container
    // healthcheck can be excluded from it.
    disableRequestLogging: true,
    trustProxy: (config.TRUST_PROXY_HOPS ?? 0) > 0 ? config.TRUST_PROXY_HOPS : false
  });

  // The container healthcheck polls /health every 15s. At two log lines per
  // request that is roughly 11.5k lines a day, which buries real traffic and
  // caps how far back the retained logs reach. These hooks restore Fastify's
  // default request logging for everything else.
  app.addHook("onRequest", (request, _reply, done) => {
    if (request.url !== "/health") {
      request.log.info({ req: request }, "incoming request");
    }

    done();
  });

  app.addHook("onResponse", (request, reply, done) => {
    if (request.url !== "/health") {
      request.log.info({ res: reply, responseTime: reply.elapsedTime }, "request completed");
    }

    done();
  });

  const db = deps.db ?? createPool(config);
  const allowedCorsOrigins = new Set(
    config.CORS_ORIGIN
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  );

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
      build: buildMetadata(config),
      alphaTest: getAlphaTestState(config),
      betaAccess: {
        enabled: Boolean(config.BETA_ACCESS_GEOFENCE_ENABLED)
      },
      photoUploads: photoUploadAvailability(config),
      moderation: moderationRuntimeStatus(config)
    };
  });

  app.get("/api/build", async () => {
    return {
      service: "cruush-server",
      ...buildMetadata(config)
    };
  });

  void registerAuthRoutes(app);
  void registerAdminModerationRoutes(app);
  void registerBetaAccessRoutes(app);
  void registerBlockRoutes(app);
  void registerBillingRoutes(app);
  void registerVerotelRoutes(app);
  void registerModerationMediaRoutes(app);
  void registerMediaRoutes(app);
  void registerMessageRoutes(app);
  void registerMapPingRoutes(app);
  void registerNotificationRoutes(app);
  void registerUserNoticeRoutes(app);
  void registerUserRoutes(app);
  void registerCruushRoutes(app);
  void registerCryptoPaymentRoutes(app);
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
