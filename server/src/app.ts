import cors from "@fastify/cors";
import Fastify from "fastify";
import { createPool, type DbClient } from "./db.js";
import type { AppConfig } from "./config.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerCruushRoutes } from "./routes/cruush.js";
import { ApiError, formatError, toApiError } from "./errors.js";
import { registerMessageRoutes } from "./routes/messages.js";
import { registerPostRoutes } from "./routes/posts.js";
import { registerProfileRoutes } from "./routes/profiles.js";
import { registerPrivacyRoutes } from "./routes/privacy.js";
import { registerUserRoutes } from "./routes/users.js";
import { registerDevRoutes } from "./routes/dev.js";
import { createPostgresRateLimiter, type RateLimiter } from "./rate-limit.js";

type BuildServerDeps = {
  db?: DbClient;
  rateLimiter?: RateLimiter;
};

const stateChangingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

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
    methods: ["GET", "POST", "PUT", "OPTIONS"],
    credentials: true
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

    if (origin && !allowedCorsOrigins.has(origin)) {
      throw new ApiError(403, "FORBIDDEN", "Request origin is not allowed.");
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
  void registerMessageRoutes(app);
  void registerUserRoutes(app);
  void registerCruushRoutes(app);
  void registerPostRoutes(app);
  void registerProfileRoutes(app);
  void registerPrivacyRoutes(app);
  if (config.NODE_ENV !== "production") {
    void registerDevRoutes(app);
  }

  return app;
}
