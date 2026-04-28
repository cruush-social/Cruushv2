import "fastify";
import type { DbClient } from "../db.js";

declare module "fastify" {
  interface FastifyInstance {
    db: DbClient;
  }
}
