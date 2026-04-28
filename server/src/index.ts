import Fastify from "fastify";
import cors from "@fastify/cors";
import { loadConfig } from "./config.js";
import { createPool } from "./db.js";

const config = loadConfig();
const db = createPool(config);

const app = Fastify({
  logger: true
});

await app.register(cors, {
  origin: config.CORS_ORIGIN,
  credentials: true
});

app.decorate("db", db);

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

const shutdown = async () => {
  await app.close();
  await db.end();
};

process.on("SIGINT", () => {
  void shutdown();
});

process.on("SIGTERM", () => {
  void shutdown();
});

await app.listen({
  host: config.HOST,
  port: config.PORT
});
