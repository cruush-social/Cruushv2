import "fastify";
import type { DbClient } from "../db.js";
import type { AppConfig } from "../config.js";

declare module "fastify" {
  interface FastifyInstance {
    config: AppConfig;
    db: DbClient;
  }
}
