import Fastify from "fastify";
import pg from "pg";
import { describe, expect, it, vi } from "vitest";
import { loadBannedUserIds, nonBannedAccountSql, nonBannedNotificationSql } from "./banned-content.js";
import type { DbClient, DbQueryResult } from "./db.js";
import { registerContentVisibilityRoutes } from "./routes/content-visibility.js";

vi.mock("./request-auth.js", () => ({ getAuthenticatedUserId: async () => "fixture-viewer" }));

const databaseUrl = process.env.CRUUSH_CONTENT_VISIBILITY_POSTGRES_URL;
const ids = {
  active: "79000000-0000-4000-8000-000000000001",
  deleted: "79000000-0000-4000-8000-000000000002",
  banned: "79000000-0000-4000-8000-000000000003",
  suspended: "79000000-0000-4000-8000-000000000004",
  replacement: "79000000-0000-4000-8000-000000000005",
};

describe.skipIf(!databaseUrl)("deleted account visibility with PostgreSQL", () => {
  it("hides retained deleted profiles and changes the mounted-content revision after soft or hard deletion", async () => {
    const url = new URL(databaseUrl!);
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || !url.pathname.startsWith("/cruush_")) {
      throw new Error("Use an isolated local cruush fixture database.");
    }
    const client = new pg.Client({ connectionString: databaseUrl });
    const app = Fastify();
    try {
      await client.connect();
      // All fixture writes are connection-local; existing database rows are untouched.
      await client.query(`
        create temp table app_users (id uuid primary key, account_status text,
          account_status_updated_at timestamptz, created_at timestamptz);
        create temp table profiles (id uuid, display_name text, photos text[]);
        create temp table app_notifications (id uuid, actor_user_id uuid, type text, metadata jsonb);
        create temp table posts (id uuid, user_id uuid);
      `);
      for (const [kind, id] of Object.entries(ids).filter(([kind]) => kind !== "replacement")) {
        await client.query(`insert into app_users values ($1, $2, '2026-10-01', '2026-10-01')`, [id, kind]);
        await client.query("insert into profiles values ($1, '', '{}')", [id]);
      }
      const db: DbClient = {
        query<T>(sql: string, values?: unknown[]) {
          return client.query(sql, values) as unknown as Promise<DbQueryResult<T>>;
        },
        end: async () => undefined,
      };
      app.decorate("db", db);
      await registerContentVisibilityRoutes(app);
      const revision = async () => {
        const response = await app.inject("/api/content/visibility-revision");
        expect(response.statusCode).toBe(200);
        expect(response.headers["cache-control"]).toBe("private, no-store");
        expect(Object.keys(response.json().data)).toEqual(["revision"]);
        return response.json().data.revision as string;
      };

      const visible = await client.query(`select id::text from profiles where ${nonBannedAccountSql("profiles.id")} order by id`);
      expect(visible.rows.map(row => row.id)).toEqual([ids.active, ids.suspended]);
      // Blank active profiles stay available; retained deleted and banned rows disappear.
      expect(await loadBannedUserIds(db, Object.values(ids))).toEqual(new Set([ids.deleted, ids.banned]));
      await client.query("insert into app_notifications values ($1, null, 'nearby_member', $2::jsonb)",
        [ids.deleted, JSON.stringify({ sourceUserId: ids.deleted })]);
      expect((await client.query(`select id from app_notifications notice where ${nonBannedNotificationSql("notice")}`)).rows).toEqual([]);

      const before = await revision();
      await client.query("update app_users set account_status='deleted', account_status_updated_at='2026-10-02' where id=$1", [ids.active]);
      const afterSoftDelete = await revision();
      expect(afterSoftDelete).not.toBe(before);

      // Delete a non-newest row: timestamp maxima stay fixed, so count must detect it.
      await client.query("delete from app_users where id=$1", [ids.suspended]);
      const afterHardDelete = await revision();
      expect(afterHardDelete).not.toBe(afterSoftDelete);

      // Even when a signup restores the old count, its creation time changes the token.
      await client.query("insert into app_users values ($1, 'active', '2026-10-01', '2026-10-03')", [ids.replacement]);
      expect(await revision()).not.toBe(afterSoftDelete);
      expect((await client.query("select count(*)::int as total from profiles")).rows[0].total).toBe(4);
    } finally {
      await app.close();
      await client.end();
    }
  });
});
