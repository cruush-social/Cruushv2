import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify from "fastify";
import { createPool, type DbClient } from "./db.js";
import type { AppConfig } from "./config.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerAdminModerationRoutes } from "./routes/admin-moderation.js";
import { registerBlockRoutes } from "./routes/blocks.js";
import { registerBillingRoutes } from "./routes/billing.js";
import { registerCruushRoutes } from "./routes/cruush.js";
import { ApiError, formatError, toApiError } from "./errors.js";
import { registerMediaRoutes } from "./routes/media.js";
import { registerMessageRoutes } from "./routes/messages.js";
import { registerInternalRoutes } from "./routes/internal.js";
import { registerNotificationRoutes } from "./routes/notifications.js";
import { registerPostRoutes } from "./routes/posts.js";
import { registerProfileRoutes } from "./routes/profiles.js";
import { registerPrivacyRoutes } from "./routes/privacy.js";
import { registerReportRoutes } from "./routes/reports.js";
import { registerSupportRoutes } from "./routes/support.js";
import { registerUserRoutes } from "./routes/users.js";
import { registerDevRoutes } from "./routes/dev.js";
import { createPostgresRateLimiter, type RateLimiter } from "./rate-limit.js";

type BuildServerDeps = {
  db?: DbClient;
  rateLimiter?: RateLimiter;
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

export function buildServer(config: AppConfig, deps: BuildServerDeps = {}) {
  const app = Fastify({
    logger: config.NODE_ENV !== "test"
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
      migratedFromSupabase: true
    };
  });

  void registerAuthRoutes(app);
  if (config.HUMAN_MODERATION_ENABLED) {
    void registerAdminModerationRoutes(app);
  }
  void registerBlockRoutes(app);
  void registerBillingRoutes(app);
  void registerMediaRoutes(app);
  void registerMessageRoutes(app);
  void registerNotificationRoutes(app);
  void registerUserRoutes(app);
  void registerCruushRoutes(app);
  void registerPostRoutes(app);
  void registerProfileRoutes(app);
  void registerPrivacyRoutes(app);
  void registerReportRoutes(app);
  void registerSupportRoutes(app);
  void registerInternalRoutes(app);
  if (config.NODE_ENV !== "production") {
    void registerDevRoutes(app);
  }

  return app;
}
