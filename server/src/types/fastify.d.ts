import "fastify";
import type { DbClient } from "../db.js";
import type { AppConfig } from "../config.js";
import type { RateLimiter } from "../rate-limit.js";

declare module "fastify" {
  interface FastifyInstance {
    config: AppConfig;
    db: DbClient;
    rateLimiter: RateLimiter;
  }
}
