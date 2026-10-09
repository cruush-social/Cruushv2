import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "./config.js";
import type { DbClient } from "./db.js";
import { hashSessionToken } from "./auth.js";
import { formatError, toApiError } from "./errors.js";
import { emptyProfile } from "./profile-schema.js";
import { moderateProfileOrReject } from "./moderation-service.js";
import { ALLOW_POLICY_DECISION } from "./moderation-types.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerProfileRoutes } from "./routes/profiles.js";

// Requested scope: "also remove ability to change your birth year". Exercise
// the genuine Fastify routes, schemas, session auth, crypto and SQL parameters.
// Only moderation is stubbed: its deterministic barrier models slow preflight.
vi.mock("./moderation-service.js", async original => ({
  ...await original<typeof import("./moderation-service.js")>(),
  moderateProfileOrReject: vi.fn()
}));

const userId = "10000000-0000-4000-8000-000000000001";
const otherId = "10000000-0000-4000-8000-000000000002";
const syntheticToken = "birth-year-test-session-not-a-real-token";
const cookie = "cruush_session=" + syntheticToken;
const now = new Date("2026-10-09T16:00:00.000Z");
const config = {
  // Production mode disables the test-only x-user-id authentication shortcut.
  NODE_ENV: "production", ALPHA_TEST_ENABLED: false,
  SESSION_SECRET: "synthetic-birth-year-session-only",
  PROFILE_ENCRYPTION_KEY: Buffer.alloc(32, 0x62).toString("base64"),
  PROFILE_ENCRYPTION_KEY_VERSION: "v1",
  PROFILE_TOKEN_KEY: "synthetic-birth-year-token-key-only",
  PROFILE_TOKEN_KEY_VERSION: "v1"
} as unknown as AppConfig;
const moderationResult: Awaited<ReturnType<typeof moderateProfileOrReject>> = {
  decision: ALLOW_POLICY_DECISION,
  providerResult: { provider: "synthetic", provider_request_id: "synthetic", labels: [], latency_ms: 0 }
};

function barrier() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}
type ProfileRow = Record<string, unknown> & { year_of_birth: number | null };
type State = {
  exists: boolean; signupYear: number | null; ageVerifiedAt: Date | null;
  accountStatus: string; profile: ProfileRow | null;
};
type Transaction = { id: number; state: State | null; unlock: (() => void) | null };
type Options = { profileYear?: number | null; signupYear?: number | null; ageVerified?: boolean };
const apps: FastifyInstance[] = [];

async function fixture(options: Options = {}) {
  let state: State = {
    exists: true, signupYear: options.signupYear ?? null,
    ageVerifiedAt: options.ageVerified === false ? null : new Date(now), accountStatus: "active",
    profile: options.profileYear === undefined ? null : {
      ...emptyProfile, id: userId, display_name: "Synthetic member", ethnicity: [],
      year_of_birth: options.profileYear, updated_at: now.toISOString()
    }
  };
  const controls = { sessionValid: true, removeAccountAtLock: false };
  const trace: string[] = [];
  const profileInputs: Array<number | null> = [];
  const stats = { lockAttempts: 0, commits: 0, rollbacks: 0 };
  const blocked = barrier();
  let lockTail = Promise.resolve();
  let lockOccupied = false;
  let nextTransaction = 0;
  let holdNextLock: { entered: ReturnType<typeof barrier>; resume: ReturnType<typeof barrier> } | null = null;

  // Independent clients contend only at the actual account FOR UPDATE query,
  // not at transaction entry. Committed reads and staged writes model the
  // relevant Read Committed interleavings, not PostgreSQL itself.
  async function lock(tx: Transaction) {
    expect(tx.state).toBeNull();
    stats.lockAttempts++;
    if (lockOccupied) blocked.release();
    const preceding = lockTail;
    const next = barrier();
    lockTail = next.promise;
    await preceding;
    lockOccupied = true;
    tx.unlock = () => { lockOccupied = false; next.release(); };
    if (controls.removeAccountAtLock) {
      state.exists = false;
      controls.removeAccountAtLock = false;
    }
    tx.state = structuredClone(state);
    trace.push(`${tx.id}:locked`);
    const pause = holdNextLock;
    holdNextLock = null;
    if (pause) { pause.entered.release(); await pause.resume.promise; }
  }

  const query = vi.fn(async (sql: string, params: unknown[] = [], tx: Transaction | null = null) => {
    const normalized = sql.replace(/\s+/g, " ").trim();
    if (normalized.includes("from app_sessions s")) {
      expect(tx).toBeNull();
      expect(normalized).toContain("s.expires_at > now()");
      const valid = controls.sessionValid && state.exists && params[0] === hashSessionToken(syntheticToken);
      return { rows: valid ? [{ user_id: userId, email: "synthetic@example.invalid",
        account_status: state.accountStatus, age_verified_at: state.ageVerifiedAt }] : [] };
    }
    if (normalized.startsWith("delete from app_sessions")) {
      controls.sessionValid = false;
      return { rows: [] };
    }
    if (normalized.includes("from app_users") && normalized.endsWith("for update")) {
      expect(tx).not.toBeNull();
      expect(params).toEqual([userId]);
      await lock(tx!);
      return { rows: tx!.state!.exists ? [{ id: userId, signup_birth_year: tx!.state!.signupYear }] : [] };
    }
    const current = tx?.state ?? state;
    if (normalized.startsWith("select year_of_birth from profiles")) {
      expect(tx?.state).toBeTruthy(); // The auth check must follow its account lock.
      expect(params).toEqual([userId]);
      trace.push(`${tx!.id}:auth-profile-read`);
      return { rows: current.profile ? [{ year_of_birth: current.profile.year_of_birth }] : [] };
    }
    if (normalized.startsWith("select profile_sensitive_ciphertext") && normalized.includes("from profiles")) {
      expect(params).toEqual([userId]);
      if (tx) expect(tx.state).toBeTruthy();
      trace.push(`${tx?.id ?? "preflight"}:profile-identity-read`);
      return { rows: current.profile ? [structuredClone(current.profile)] : [] };
    }
    if (normalized === "select signup_birth_year from app_users where id = $1") {
      expect(params).toEqual([userId]);
      if (tx) expect(tx.state).toBeTruthy();
      trace.push(`${tx?.id ?? "preflight"}:signup-read`);
      return { rows: current.exists ? [{ signup_birth_year: current.signupYear }] : [] };
    }
    if (normalized.startsWith("update app_users") && normalized.includes("age_verified_at")) {
      expect(tx?.state).toBeTruthy();
      expect(params[0]).toBe(userId);
      expect(normalized).toContain("signup_birth_year = coalesce(signup_birth_year, $2)");
      expect(normalized).toContain("age_verified_at = coalesce(age_verified_at, now())");
      expect(typeof params[1]).toBe("number");
      current.signupYear ??= params[1] as number;
      current.ageVerifiedAt ??= new Date();
      trace.push(`${tx!.id}:auth-write`);
      return { rows: [] };
    }
    if (normalized.startsWith("insert into profiles")) {
      expect(tx?.state).toBeTruthy();
      expect(normalized).toContain("year_of_birth = coalesce(profiles.year_of_birth, excluded.year_of_birth)");
      const columns = /^insert into profiles \(([^)]+)\)/.exec(normalized)![1].split(", ");
      expect(params).toHaveLength(columns.length);
      const incoming = Object.fromEntries(columns.map((column, index) => [column, params[index]])) as ProfileRow;
      expect(incoming.id).toBe(userId);
      expect(columns).not.toContain("date_of_birth");
      profileInputs.push(incoming.year_of_birth);
      current.profile = { ...incoming, year_of_birth: current.profile?.year_of_birth ?? incoming.year_of_birth,
        updated_at: new Date().toISOString() };
      trace.push(`${tx!.id}:profile-write`);
      return { rows: [structuredClone(current.profile)] };
    }
    if (normalized.startsWith("update app_users set display_name")
      || normalized.startsWith("delete from profile_kink_interests")
      || normalized.startsWith("delete from profile_sensitive_tokens")
      || normalized.startsWith("insert into profile_sensitive_tokens")) {
      expect(tx?.state).toBeTruthy();
      expect(params[0]).toBe(userId);
      return { rows: [] };
    }
    if (normalized.includes("left join profiles p on p.id = u.id") && normalized.includes("u.signup_birth_year")) {
      expect(tx).toBeNull();
      expect(params).toEqual([userId]);
      return { rows: state.exists ? [{ id: userId, email: "synthetic@example.invalid", app_display_name: "Synthetic member",
        email_verified_at: now, created_at: now, profile_display_name: state.profile?.display_name ?? null,
        year_of_birth: state.profile?.year_of_birth ?? null, signup_birth_year: state.signupYear,
        age_verified_at: state.ageVerifiedAt, account_status: state.accountStatus,
        code_of_conduct_accepted_version: "2026-07-07", code_of_conduct_accepted_at: now }] : [] };
    }
    throw new Error("Unexpected birth-year fixture SQL: " + normalized);
  });
  const db: DbClient = {
    query: ((sql: string, params?: unknown[]) => query(sql, params)) as DbClient["query"],
    end: async () => {},
    async transaction<T>(fn: (client: DbClient) => Promise<T>) {
      const tx: Transaction = { id: ++nextTransaction, state: null, unlock: null };
      trace.push(`${tx.id}:begin`);
      const client: DbClient = { query: ((sql: string, params?: unknown[]) => query(sql, params, tx)) as DbClient["query"],
        end: async () => {} };
      try {
        const result = await fn(client);
        expect(tx.state).toBeTruthy();
        state = tx.state!;
        trace.push(`${tx.id}:commit`); stats.commits++;
        return result;
      } catch (error) {
        trace.push(`${tx.id}:rollback`); stats.rollbacks++;
        throw error;
      } finally { tx.unlock?.(); }
    }
  };
  const app = Fastify({ logger: false });
  apps.push(app);
  app.decorate("config", { ...config }); app.decorate("db", db);
  app.decorate("rateLimiter", { assert: vi.fn().mockResolvedValue(undefined) });
  app.setErrorHandler((error, _request, reply) => {
    const apiError = toApiError(error);
    return reply.code(apiError.statusCode).send(formatError(apiError));
  });
  await registerAuthRoutes(app); await registerProfileRoutes(app); await app.ready();
  const age = (payload: Record<string, unknown>, headers: Record<string, string> = { cookie }) =>
    app.inject({ method: "POST", url: "/api/auth/age-verification", headers, payload });
  const profile = (payload: Record<string, unknown> = {}, headers: Record<string, string> = { cookie }) =>
    app.inject({ method: "PUT", url: "/api/profiles/me", headers,
      payload: { display_name: "Synthetic member", ...payload } });
  return { app, query, age, profile, trace, profileInputs, controls, stats, blocked,
    state: () => state,
    holdAccountLock() {
      const pause = { entered: barrier(), resume: barrier() };
      holdNextLock = pause; return pause;
    }
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

function assertNoIdentityWrites(f: Fixture) {
  expect(f.query.mock.calls.some(([sql]) => /update app_users|insert into profiles/.test(sql))).toBe(false);
  expect(f.stats.commits).toBe(0);
}
function assertImmutableError(response: { statusCode: number; json: () => unknown }) {
  expect(response.statusCode).toBe(400);
  expect(response.json()).toEqual({ error: { code: "VALIDATION_ERROR", message: "Birth year cannot be changed.", details: null } });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
  vi.mocked(moderateProfileOrReject).mockReset().mockResolvedValue(moderationResult);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("External HTTP forbidden"); }));
});
afterEach(async () => {
  await Promise.all(apps.splice(0).map(app => app.close()));
  vi.useRealTimers(); vi.unstubAllGlobals();
});

describe("birth-year immutability through actual age-verification routes", () => {
  it.each([
    { profileYear: 1990 }, { signupYear: 1990 }, { profileYear: 1990, signupYear: 1990 },
    { profileYear: 1990, signupYear: 1992 }, { profileYear: 1992, signupYear: 1990 }
  ])("rejects a different full-DOB year against either established source: %j", async options => {
    const f = await fixture({ ...options, ageVerified: false });
    assertImmutableError(await f.age({ dateOfBirth: "1992-06-15" }));
    expect(f.state().signupYear).toBe(options.signupYear ?? null);
    expect(f.state().profile?.year_of_birth ?? null).toBe(options.profileYear ?? null);
    expect(f.state().ageVerifiedAt).toBeNull();
    expect(f.trace).toEqual(["1:begin", "1:locked", "1:auth-profile-read", "1:rollback"]);
    assertNoIdentityWrites(f);
  });

  it.each([{ profileYear: 1990 }, { signupYear: 1990 }, { profileYear: 1990, signupYear: 1990 }])(
    "allows same-year verification and preserves established timestamps: %j", async options => {
      const f = await fixture(options);
      const verifiedAt = f.state().ageVerifiedAt!.getTime();
      vi.setSystemTime(now.getTime() + 60_000);
      const response = await f.age({ dateOfBirth: "1990-12-31" });
      expect(response.statusCode).toBe(200);
      expect(response.json().data.needsAgeVerification).toBe(false);
      expect(f.state().signupYear).toBe(1990);
      expect(f.state().ageVerifiedAt!.getTime()).toBe(verifiedAt);
      expect(f.state().profile?.year_of_birth ?? null).toBe(options.profileYear ?? null);
    });

  it("allows first legacy verification, then rejects a subsequent conflicting year", async () => {
    const f = await fixture({ profileYear: null, ageVerified: false });
    const first = await f.age({ dateOfBirth: "1990-06-15" });
    expect(first.statusCode).toBe(200);
    expect(first.json().data.needsAgeVerification).toBe(false);
    expect(f.state().signupYear).toBe(1990);
    expect(f.state().ageVerifiedAt).toEqual(now);
    expect(f.state().profile?.year_of_birth).toBeNull(); // Verification does not rewrite a profile.
    assertImmutableError(await f.age({ dateOfBirth: "1992-06-15" }));
    expect(f.state().signupYear).toBe(1990);
    const writes = f.query.mock.calls.filter(([sql]) => sql.startsWith("update app_users"));
    expect(writes).toHaveLength(1);
    expect(writes[0][1]).toEqual([userId, 1990]); // No complete DOB is persisted.
  });

  it.each([{}, { dateOfBirth: null }, { dateOfBirth: "" }, { yearOfBirth: 1992 },
    { dateOfBirth: "1990-01-01", yearOfBirth: 1992 }])("rejects missing/null/year-only or extra-field tampering: %j", async payload => {
    const f = await fixture({ signupYear: 1990 });
    const response = await f.age(payload);
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
    expect(f.stats.lockAttempts).toBe(0); assertNoIdentityWrites(f);
    expect(f.state().signupYear).toBe(1990);
  });

  it.each([{}, { signupYear: 1990, profileYear: 1990 }])("keeps the full-DOB under-18 guard before writes: %j", async options => {
    const f = await fixture({ ...options, ageVerified: false });
    const response = await f.age({ dateOfBirth: "2008-10-10" });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatchObject({ code: "VALIDATION_ERROR", message: "You must be at least 18 to use cruush." });
    expect(f.state().ageVerifiedAt).toBeNull();
    expect(f.stats.lockAttempts).toBe(0); assertNoIdentityWrites(f);
  });
});

describe("birth-year immutability through actual profile saves", () => {
  const edits = [
    { label: "year tamper", payload: { year_of_birth: 1992 } },
    { label: "full DOB tamper", payload: { date_of_birth: "1992-06-15" } },
    { label: "both tampered", payload: { year_of_birth: 1992, date_of_birth: "1993-06-15" } },
    { label: "null year", payload: { year_of_birth: null } },
    { label: "omitted year", payload: {} }
  ];
  it.each(edits)("preserves an established profile year for $label, while saving other fields", async ({ payload }) => {
    const f = await fixture({ profileYear: 1990 });
    const response = await f.profile({ ...payload, bio: "Unrelated permitted edit", show_age: false });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ year_of_birth: 1990, bio: "Unrelated permitted edit", show_age: false });
    expect(f.state().profile).toMatchObject({ year_of_birth: 1990, bio: "Unrelated permitted edit", show_age: false });
    expect(f.profileInputs).toEqual([1990]);
  });
  it.each(edits)("preserves signup year when the profile has no year: $label", async ({ payload }) => {
    const f = await fixture({ signupYear: 1990, profileYear: null });
    const response = await f.profile(payload);
    expect(response.statusCode).toBe(200);
    expect(response.json().data.year_of_birth).toBe(1990);
    expect(f.state().signupYear).toBe(1990);
    expect(f.state().profile?.year_of_birth).toBe(1990);
    expect(f.profileInputs).toEqual([1990]);
  });
  it.each([{}, { year_of_birth: null }])("does not invent a birth year for an unfinished legacy profile: %j", async payload => {
    const f = await fixture();
    const response = await f.profile(payload);
    expect(response.statusCode).toBe(200);
    expect(response.json().data.year_of_birth).toBeNull();
    expect(f.state().signupYear).toBeNull(); expect(f.profileInputs).toEqual([null]);
  });
  it.each([{ year_of_birth: 1990 }, { date_of_birth: "1990-06-15" }])("allows the initial legacy profile year only once: %j", async payload => {
    const f = await fixture();
    expect((await f.profile(payload)).statusCode).toBe(200);
    expect((await f.profile({ year_of_birth: 1992 })).statusCode).toBe(200);
    expect(f.state().profile?.year_of_birth).toBe(1990);
    expect(f.profileInputs).toEqual([1990, 1990]);
  });
  it.each([{ date_of_birth: null }, { date_of_birth: "2008-10-10" }, { year_of_birth: 2012 }])(
    "preserves full-DOB/null/type and under-18 validation before writes: %j", async payload => {
      const f = await fixture({ profileYear: 1990 });
      const response = await f.profile(payload);
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
      expect(f.state().profile?.year_of_birth).toBe(1990);
      expect(f.stats.lockAttempts).toBe(0); assertNoIdentityWrites(f);
    });
});

describe("birth-year route authentication", () => {
  it.each(["age", "profile"] as const)("rejects missing or invalid sessions and forged member headers on %s", async route => {
    const f = await fixture({ signupYear: 1990, profileYear: 1990 });
    const payload = route === "age" ? { dateOfBirth: "1990-06-15" } : { year_of_birth: 1992 };
    const attempts: Array<Record<string, string>> = [{}, { "x-user-id": userId }, { cookie: "cruush_session=invalid", "x-user-id": userId }];
    for (const headers of attempts) {
      const response = await f[route](payload, headers);
      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe("AUTH_REQUIRED");
    }
    expect(f.stats.lockAttempts).toBe(0); assertNoIdentityWrites(f);
  });
  it.each(["age", "profile"] as const)("uses the session member, ignoring another member header on %s", async route => {
    const f = await fixture({ signupYear: 1990, profileYear: 1990 });
    const response = await f[route](route === "age" ? { dateOfBirth: "1990-06-15" } : { year_of_birth: 1992 },
      { cookie, "x-user-id": otherId });
    expect(response.statusCode).toBe(200);
    expect(f.query.mock.calls.every(([, params]) => !params?.includes(otherId))).toBe(true);
    expect(f.state().signupYear).toBe(1990); expect(f.state().profile?.year_of_birth).toBe(1990);
  });
  it.each(["age", "profile"] as const)("blocks a suspended account on %s", async route => {
    const f = await fixture({ signupYear: 1990, profileYear: 1990 }); f.state().accountStatus = "suspended";
    const response = await f[route](route === "age" ? { dateOfBirth: "1990-06-15" } : { year_of_birth: 1992 });
    expect(response.statusCode).toBe(401); expect(response.json().error.code).toBe("AUTH_REQUIRED");
    expect(f.controls.sessionValid).toBe(false); assertNoIdentityWrites(f);
  });
  it("keeps profile writes behind required age verification", async () => {
    const f = await fixture({ ageVerified: false });
    const response = await f.profile({ year_of_birth: 1990 });
    expect(response.statusCode).toBe(403); expect(response.json().error.code).toBe("AGE_VERIFICATION_REQUIRED");
    assertNoIdentityWrites(f);
  });
  it("rejects an account removed after session lookup but before the auth lock", async () => {
    const f = await fixture({ ageVerified: false }); f.controls.removeAccountAtLock = true;
    const response = await f.age({ dateOfBirth: "1990-06-15" });
    expect(response.statusCode).toBe(401); expect(response.json().error.code).toBe("AUTH_REQUIRED");
    expect(f.trace).toEqual(["1:begin", "1:locked", "1:rollback"]);
    assertNoIdentityWrites(f);
  });
});

describe("deterministic birth-year concurrency through the routes", () => {
  it("serializes conflicting first age verifications; the loser reads the committed year and rolls back", async () => {
    const f = await fixture({ ageVerified: false }); const gate = f.holdAccountLock();
    const first = f.age({ dateOfBirth: "1990-06-15" }).then(response => response);
    await gate.entered.promise;
    const second = f.age({ dateOfBirth: "1992-06-15" }).then(response => response);
    try {
      await f.blocked.promise;
      expect(f.stats.commits).toBe(0); expect(f.state().signupYear).toBeNull();
    } finally { gate.resume.release(); }
    expect((await first).statusCode).toBe(200); assertImmutableError(await second);
    expect(f.state().signupYear).toBe(1990); expect(f.stats.commits).toBe(1); expect(f.stats.rollbacks).toBe(1);
    expect(f.trace.indexOf("2:locked")).toBeGreaterThan(f.trace.indexOf("1:commit"));
  });

  it("recomputes a profile year after concurrent age verification releases the shared account lock", async () => {
    const f = await fixture(); const gate = f.holdAccountLock();
    const verification = f.age({ dateOfBirth: "1990-06-15" }).then(response => response);
    await gate.entered.promise;
    const saving = f.profile({ year_of_birth: 1992 }).then(response => response);
    try { await f.blocked.promise; expect(f.profileInputs).toEqual([]); }
    finally { gate.resume.release(); }
    expect((await verification).statusCode).toBe(200);
    const response = await saving;
    expect(response.statusCode).toBe(200); expect(response.json().data.year_of_birth).toBe(1990);
    expect(f.state().signupYear).toBe(1990); expect(f.profileInputs).toEqual([1990]);
    expect(f.trace.indexOf("2:signup-read")).toBeGreaterThan(f.trace.indexOf("1:commit"));
  });

  it("rejects conflicting verification after a first profile save commits under the same lock", async () => {
    const f = await fixture(); const gate = f.holdAccountLock();
    const saving = f.profile({ date_of_birth: "1990-06-15" }).then(response => response);
    await gate.entered.promise;
    const verification = f.age({ dateOfBirth: "1992-06-15" }).then(response => response);
    try { await f.blocked.promise; expect(f.state().profile).toBeNull(); }
    finally { gate.resume.release(); }
    expect((await saving).statusCode).toBe(200); assertImmutableError(await verification);
    expect(f.state().signupYear).toBeNull(); expect(f.state().profile?.year_of_birth).toBe(1990);
    expect(f.trace.indexOf("2:auth-profile-read")).toBeGreaterThan(f.trace.indexOf("1:commit"));
  });

  it.each(["age", "profile"] as const)("refreshes stale profile preflight after a %s request establishes the first year", async winner => {
    const f = await fixture(); const entered = barrier(); const resume = barrier();
    vi.mocked(moderateProfileOrReject).mockImplementationOnce(async () => {
      entered.release(); await resume.promise; return moderationResult;
    });
    const stale = f.profile({ year_of_birth: 1992 }).then(response => response);
    await entered.promise;
    try {
      expect(f.stats.lockAttempts).toBe(0);
      expect(f.trace).toEqual(["preflight:profile-identity-read", "preflight:signup-read"]);
      const first = await f[winner](winner === "age" ? { dateOfBirth: "1990-06-15" } : { date_of_birth: "1990-06-15" });
      expect(first.statusCode).toBe(200); expect(f.stats.commits).toBe(1);
    } finally { resume.release(); }
    const response = await stale;
    expect(response.statusCode).toBe(200); expect(response.json().data.year_of_birth).toBe(1990);
    // Assert the bound INSERT year as well as the result: SQL coalesce alone
    // must not mask a missing post-lock re-read of the incoming year.
    expect(f.profileInputs).toEqual(winner === "age" ? [1990] : [1990, 1990]);
    expect(f.state().profile?.year_of_birth).toBe(1990);
    expect(f.trace.indexOf("2:profile-identity-read")).toBeGreaterThan(f.trace.indexOf("1:commit"));
  });
});
