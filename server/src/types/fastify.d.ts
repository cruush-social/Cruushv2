import "fastify";
import type pg from "pg";

declare module "fastify" {
  interface FastifyInstance {
    db: pg.Pool;
  }
}
