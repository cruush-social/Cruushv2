import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "./config.js";
import { formatError, toApiError } from "./errors.js";
import { encryptOosState, type EncryptedOosState } from "./oos-state-crypto.js";
import { registerBlockRoutes } from "./routes/blocks.js";

const viewerId = "11111111-1111-4111-8111-111111111111";
const memberId = (n: number) => `22222222-2222-4222-8222-${String(n).padStart(12, "0")}`;
const config = {
  NODE_ENV: "test",
  SESSION_SECRET: "synthetic-blocked-list-state-test-only",
  LOCATION_ENCRYPTION_KEY: Buffer.alloc(32, 0x47).toString("base64"),
  LOCATION_ENCRYPTION_KEY_VERSION: "v1"
} as AppConfig;
const createdAt = "2026-10-09T12:00:00.000Z";
const blockedRow = (id: string) => ({
  id, display_name: " Synthetic member ", photo: null, photo_explicit: false,
  created_at: createdAt
});
const baseResponse = (id: string) => ({
  userId: id, displayName: "Synthetic member", photo: null, photoExplicit: false,
  createdAt
});
function stateRow(id: string, outside: boolean) {
  return { user_id: id, ...encryptOosState(config, id, {
    is_outside: outside, current_event_id: outside ? "synthetic-entry" : null
  }) };
}

let app: FastifyInstance;
const query = vi.fn();
let rows: ReturnType<typeof blockedRow>[];
let states: (EncryptedOosState & { user_id: string })[];
let failStateRead: boolean;
const stateCalls = () => query.mock.calls.filter(([sql]) => String(sql).includes("from oos_service_area_state"));
const getList = () => app.inject({ method: "GET", url: "/api/blocks", headers: { "x-user-id": viewerId } });

beforeEach(async () => {
  rows = [blockedRow(memberId(1)), blockedRow(memberId(2))];
  states = [stateRow(memberId(1), true), stateRow(memberId(2), false)];
  failStateRead = false;
  query.mockReset();
  query.mockImplementation(async (sql: string, values: unknown[]) => {
    if (sql.includes("from user_blocks block")) {
      expect(values).toEqual([viewerId]);
      expect(sql).toContain("where block.blocker_user_id = $1");
      expect(sql).toContain("coalesce(blocked.account_status, 'active') <> 'deleted'");
      expect(sql).toContain("order by block.created_at desc");
      expect(sql).toContain("limit 200");
      return { rows };
    }
    if (sql.includes("from oos_service_area_state")) {
      if (failStateRead) throw new Error("Synthetic metadata storage failure");
      expect(values).toEqual([rows.map((row) => row.id)]);
      return { rows: states };
    }
    throw new Error("Unexpected query: no GPS, MHC, private fields or writes allowed");
  });
  app = Fastify();
  app.decorate("config", config);
  app.decorate("db", { query } as never);
  app.setErrorHandler((error, _request, reply) => {
    const apiError = toApiError(error);
    reply.code(apiError.statusCode).send(formatError(apiError));
  });
  await registerBlockRoutes(app);
  await app.ready();
});

afterEach(async () => { await app.close(); });

describe("blocked-list stored membership metadata", () => {
  it("adds only known boolean flags in one authorized batch without live GPS", async () => {
    const response = await getList();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { blockedUsers: [
      { ...baseResponse(memberId(1)), outOfSight: true },
      { ...baseResponse(memberId(2)), outOfSight: false }
    ] } });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]?.[0]).toContain("from user_blocks block");
    expect(stateCalls()).toHaveLength(1);
  });

  it("omits missing, corrupt and wrong-member state without inventing false", async () => {
    rows = [1, 2, 3, 4].map((n) => blockedRow(memberId(n)));
    states = [
      stateRow(memberId(1), true),
      { ...stateRow(memberId(3), true), state_auth_tag: Buffer.alloc(16).toString("base64") },
      { ...stateRow(memberId(9), true), user_id: memberId(4) },
      stateRow(memberId(99), true)
    ];
    const response = await getList();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { blockedUsers: [
      { ...baseResponse(memberId(1)), outOfSight: true },
      ...[2, 3, 4].map((n) => baseResponse(memberId(n)))
    ] } });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("keeps the existing management list on a metadata read failure", async () => {
    failStateRead = true;
    const response = await getList();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { blockedUsers: rows.map((row) => baseResponse(row.id)) } });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("handles the existing 200-member cap with one state query, not N+1", async () => {
    rows = Array.from({ length: 200 }, (_, n) => blockedRow(memberId(n + 1)));
    states = rows.map((row, n) => stateRow(row.id, n % 2 === 0));
    const response = await getList();
    expect(response.statusCode).toBe(200);
    expect(response.json().data.blockedUsers).toEqual(rows.map((row, n) => ({
      ...baseResponse(row.id), outOfSight: n % 2 === 0
    })));
    expect(query).toHaveBeenCalledTimes(2);
    expect(stateCalls()).toHaveLength(1);
  });

  it("does not read state for an empty blocked list", async () => {
    rows = [];
    const response = await getList();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { blockedUsers: [] } });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("does not query any members or state before authentication", async () => {
    const response = await app.inject({ method: "GET", url: "/api/blocks" });
    expect(response.statusCode).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it("does not read state if the original authorized-list query fails", async () => {
    query.mockRejectedValueOnce(new Error("Synthetic list failure"));
    const response = await getList();
    expect(response.statusCode).toBe(500);
    expect(query).toHaveBeenCalledTimes(1);
    expect(stateCalls()).toHaveLength(0);
  });
});
