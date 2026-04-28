import cors from "@fastify/cors";
import Fastify from "fastify";
import { createPool } from "./db.js";
import type { AppConfig } from "./config.js";

export function buildServer(config: AppConfig) {
  const app = Fastify({
    logger: config.NODE_ENV !== "test"
  });
  const db = createPool(config);

  void app.register(cors, {
    origin: config.CORS_ORIGIN,
    credentials: true
  });

  app.decorate("db", db);

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
      auth: "planned",
      storage: "planned",
      migratedFromSupabase: true
    };
  });

  return app;
}
