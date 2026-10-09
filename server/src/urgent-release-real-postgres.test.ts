import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "./app.js";
import { loadConfig } from "./config.js";
import { createPool, type DbClient } from "./db.js";

const realPostgresUrl = process.env.CRUUSH_REAL_POSTGRES_URL;
const ownerId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";
const groupId = "33333333-3333-4333-8333-333333333333";

describe.skipIf(!realPostgresUrl)("urgent release real PostgreSQL route smoke", () => {
  let db: DbClient;
  let app: ReturnType<typeof buildServer>;

  beforeAll(async () => {
    if (!realPostgresUrl) {
      return;
    }

    const config = loadConfig({
      ...process.env,
      NODE_ENV: "test",
      DATABASE_URL: realPostgresUrl,
      SESSION_SECRET: process.env.SESSION_SECRET ?? "urgent-release-real-postgres-test",
      CORS_ORIGIN: process.env.CORS_ORIGIN ?? "http://localhost:5173"
    });
    db = createPool(config);

    await db.query("delete from conversations where id = $1::uuid", [groupId]);
    await db.query("delete from app_users where id in ($1::uuid, $2::uuid)", [ownerId, memberId]);
    await db.query(
      `insert into app_users (id, email, password_hash)
       values ($1::uuid, 'urgent-release-owner@example.test', 'test-hash'),
              ($2::uuid, 'urgent-release-member@example.test', 'test-hash')`,
      [ownerId, memberId]
    );
    await db.query(
      `insert into profiles (id, display_name)
       values ($1::uuid, 'Release owner'), ($2::uuid, 'Release member')`,
      [ownerId, memberId]
    );
    await db.query(
      `insert into conversations (id, kind, title, created_by, disappearing_timer)
       values ($1::uuid, 'group', 'Real Postgres smoke group', $2::uuid, 'off')`,
      [groupId, ownerId]
    );
    await db.query(
      `insert into conversation_members (conversation_id, user_id, role, last_read_at)
       values ($1::uuid, $2::uuid, 'owner', now()),
              ($1::uuid, $3::uuid, 'member', null)`,
      [groupId, ownerId, memberId]
    );

    app = buildServer(config, { db });
    await app.ready();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it("persists group timer and clear-for-everyone updates through real PostgreSQL", async () => {
    const headers = {
      origin: "http://localhost:5173",
      "x-user-id": ownerId
    };

    const groupUpdate = await app.inject({
      method: "PATCH",
      url: `/api/conversations/groups/${groupId}`,
      headers,
      payload: {
        title: "Real Postgres smoke group updated",
        disappearingTimer: "7d"
      }
    });

    expect(groupUpdate.statusCode).toBe(200);
    expect(groupUpdate.json().data).toMatchObject({
      id: groupId,
      kind: "group",
      disappearingTimer: "7d",
      currentUserRole: "owner"
    });

    const storedAfterGroupUpdate = await db.query<{
      title: string;
      disappearing_timer: string;
    }>(
      "select title, disappearing_timer from conversations where id = $1::uuid",
      [groupId]
    );
    expect(storedAfterGroupUpdate.rows[0]).toMatchObject({
      title: "Real Postgres smoke group updated",
      disappearing_timer: "7d"
    });

    const memberUpdate = await app.inject({
      method: "PATCH",
      url: `/api/conversations/${groupId}/disappearing-timer`,
      headers: { ...headers, "x-user-id": memberId },
      payload: { disappearingTimer: "24h" }
    });
    expect(memberUpdate.statusCode).toBe(403);

    const timerUpdate = await app.inject({
      method: "PATCH",
      url: `/api/conversations/${groupId}/disappearing-timer`,
      headers,
      payload: { disappearingTimer: "24h" }
    });
    expect(timerUpdate.statusCode).toBe(200);
    expect(timerUpdate.json().data.disappearingTimer).toBe("24h");

    const clear = await app.inject({
      method: "POST",
      url: `/api/conversations/${groupId}/clear-for-everyone`,
      headers
    });
    expect(clear.statusCode).toBe(200);
    expect(clear.json().data.id).toBe(groupId);

    const storedAfterClear = await db.query<{
      cleared_at: string | Date | null;
      cleared_by: string | null;
      disappearing_timer: string;
    }>(
      "select cleared_at, cleared_by::text as cleared_by, disappearing_timer from conversations where id = $1::uuid",
      [groupId]
    );
    expect(storedAfterClear.rows[0]?.cleared_at).not.toBeNull();
    expect(storedAfterClear.rows[0]).toMatchObject({
      cleared_by: ownerId,
      disappearing_timer: "24h"
    });
  });
});
