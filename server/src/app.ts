import cors from "@fastify/cors";
import Fastify from "fastify";
import { createPool, type DbClient } from "./db.js";
import type { AppConfig } from "./config.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerCruushRoutes } from "./routes/cruush.js";
import { formatError, toApiError } from "./errors.js";
import { registerPostRoutes } from "./routes/posts.js";
import { registerProfileRoutes } from "./routes/profiles.js";
import { registerUserRoutes } from "./routes/users.js";

type BuildServerDeps = {
  db?: DbClient;
};

export function buildServer(config: AppConfig, deps: BuildServerDeps = {}) {
  const app = Fastify({
    logger: config.NODE_ENV !== "test"
  });
  const db = deps.db ?? createPool(config);

  void app.register(cors, {
    origin: config.CORS_ORIGIN,
    credentials: true
  });

  app.decorate("config", config);
  app.decorate("db", db);

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
      auth: "session-cookie-with-dev-x-user-id-fallback",
      storage: "postgres",
      migratedFromSupabase: true
    };
  });

  void registerAuthRoutes(app);
  void registerUserRoutes(app);
  void registerCruushRoutes(app);
  void registerPostRoutes(app);
  void registerProfileRoutes(app);

  return app;
}
