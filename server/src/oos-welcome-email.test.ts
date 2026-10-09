import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import { runTransaction, type DbClient } from "./db.js";
import { deliverOutOfSightWelcomeEmail, loadStoredOutOfSightStatuses, queueOutOfSightWelcomeEmail, sendPendingOutOfSightWelcomeEmails } from "./oos-welcome-email.js";
import { sendOutOfSightWelcomeEmail, sendSinnersWelcomeEmail } from "./mailer.js";
import { loadLocationEnvelope, type LocationPayload } from "./location-privacy.js";
import { decryptOosState, encryptOosState, type OosStateCryptoConfig } from "./oos-state-crypto.js";
import { decryptServiceAreaEmailPayload, encryptServiceAreaEmailPayload, type ServiceAreaEmailOutboxRow } from "./service-area-email-outbox.js";

const stateCryptoConfig = {
  SESSION_SECRET: "synthetic-oos-state-test-secret",
  LOCATION_ENCRYPTION_KEY: Buffer.alloc(32, 0x4f).toString("base64"),
  LOCATION_ENCRYPTION_KEY_VERSION: "v1",
  LOCATION_ENCRYPTION_KEY_PREVIOUS: undefined
} as OosStateCryptoConfig;

// Multiple existing per-user fixtures behind one scheduler connection. The
// candidate mock follows the SQL gates/order, so the old unfiltered FIFO query
// reproduces starvation rather than silently fixing it inside test fixtures.
async function sweepFixture(blockedCount: number) {
  const entries = await Promise.all(Array.from({ length: blockedCount + 1 }, async (_, index) => {
    const userId = "sweep-user-" + index;
    const f = fixture(userId);
    const eventId = (await f.save(outside))!;
    f.data.email = "sweep-" + index + "@example.invalid";
    return { f, eventId, userId, queuedAt: Date.now() - 10_000 + index };
  }));
  const users = new Map(entries.map(entry => [entry.userId, entry]));
  const events = new Map(entries.map(entry => [entry.eventId, entry]));
  const selectedBatchSizes: number[] = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("order by") && sql.includes("limit 200")) {
      const filtersEligibility = sql.includes("u.account_status = 'active'")
        && sql.includes("u.email_verified_at is not null")
        && sql.includes("p.display_name is not null and p.year_of_birth is not null");
      const rotates = sql.includes("coalesce(w.claimed_until, w.queued_at)")
        && sql.includes("set claimed_until = now()");
      const candidates = entries.filter(({ f, eventId }) => {
        const event = f.data.events.get(eventId)!;
        return !event.sent && !event.cancelled && !event.reconciliation && event.claimed_until <= Date.now()
          && (!filtersEligibility || (f.data.active && f.data.verified && f.data.complete));
      }).sort((left, right) => {
        const priority = (entry: typeof left) => rotates
          ? entry.f.data.events.get(entry.eventId)!.claimed_until || entry.queuedAt
          : entry.queuedAt;
        return priority(left) - priority(right) || left.queuedAt - right.queuedAt;
      }).slice(0, 200);
      if (rotates) for (const entry of candidates) entry.f.data.events.get(entry.eventId)!.claimed_until = Date.now();
      selectedBatchSizes.push(candidates.length);
      return { rows: candidates.map(entry => ({ user_id: entry.userId, event_id: entry.eventId })) };
    }
    const entry = users.get(String(params[0])) ?? events.get(String(params[0]));
    if (!entry) throw new Error("Unexpected sweep fixture query");
    return entry.f.db.query(sql, params);
  });
  const db: DbClient = {
    query: query as DbClient["query"], end: async () => {},
    async transaction<T>(fn: (client: DbClient) => Promise<T>) {
      for (const entry of entries) entry.f.data.depth++;
      try { return await fn(db); }
      finally { for (const entry of entries) entry.f.data.depth--; }
    }
  };
  const app = { db, config: entries[0].f.app.config, log: { warn: vi.fn(), error: vi.fn() } } as unknown as FastifyInstance;
  return { entries, app, query, selectedBatchSizes, healthy: entries.at(-1)! };
}

describe("bounded fair OOS welcome sweep", () => {
  it.each(["active", "verified", "complete"] as const)("skips 201 old %s-ineligible rows before the limit and delivers the later eligible entry", async (gate) => {
    const f = await sweepFixture(201);
    for (const entry of f.entries.slice(0, -1)) entry.f.data[gate] = false;
    expect(await sendPendingOutOfSightWelcomeEmails(f.app)).toBe(1);
    expect(f.selectedBatchSizes).toEqual([1]);
    expect(sendOutOfSightWelcomeEmail).toHaveBeenCalledOnce();
    expect(sendOutOfSightWelcomeEmail).toHaveBeenCalledWith(expect.objectContaining({ email: f.healthy.f.data.email }));
    expect(f.entries.slice(0, -1).every(entry => !entry.f.data.events.get(entry.eventId)!.sent)).toBe(true);
    expect(f.entries.every(entry => entry.f.data.events.size === 1)).toBe(true);
  });

  it.each(["expired", "unreadable"] as const)("progresses past 201 old %s GPS rows in bounded sweeps without allowing them to send", async (failure) => {
    const f = await sweepFixture(201);
    vi.mocked(loadLocationEnvelope).mockImplementation(async (_app, userId) => {
      if (userId === f.healthy.userId) return envelope();
      if (failure === "unreadable") throw new Error("private encrypted GPS fixture");
      return null; // loadLocationEnvelope returns null for an expired envelope.
    });
    expect(await sendPendingOutOfSightWelcomeEmails(f.app)).toBe(200);
    expect(sendOutOfSightWelcomeEmail).not.toHaveBeenCalled();
    await sendPendingOutOfSightWelcomeEmails(f.app);
    expect(f.selectedBatchSizes.every(count => count <= 200)).toBe(true);
    expect(f.selectedBatchSizes).toHaveLength(2);
    expect(sendOutOfSightWelcomeEmail).toHaveBeenCalledOnce();
    expect(sendOutOfSightWelcomeEmail).toHaveBeenCalledWith(expect.objectContaining({ email: f.healthy.f.data.email }));
    expect(f.entries.slice(0, -1).every(entry => {
      const event = entry.f.data.events.get(entry.eventId)!;
      return !event.sent && !event.cancelled && event.email_started_at === null;
    })).toBe(true);
    expect(JSON.stringify(vi.mocked(f.app.log.warn).mock.calls)).not.toContain("private encrypted");
  });

  it("does not select or shorten a live delivery lease while rotating failed candidates", async () => {
    const f = await sweepFixture(1);
    const claimed = f.entries[0].f.data.events.get(f.entries[0].eventId)!;
    const activeLease = Date.now() + 300_000;
    claimed.claimed_until = activeLease;
    expect(await sendPendingOutOfSightWelcomeEmails(f.app)).toBe(1);
    expect(claimed.claimed_until).toBe(activeLease);
    expect(claimed.sent).toBe(false);
    expect(sendOutOfSightWelcomeEmail).toHaveBeenCalledOnce();
    const sql = f.query.mock.calls[0][0];
    expect(sql).toContain("for update of w skip locked");
    expect(sql).toContain("limit 200");
    expect(sql).not.toMatch(/delete|cancelled_at =|queued_at =/);
  });
});

vi.mock("./mailer.js", () => ({ sendOutOfSightWelcomeEmail: vi.fn(), sendSinnersWelcomeEmail: vi.fn() }));
vi.mock("./location-privacy.js", async (original) => ({
  ...await original<typeof import("./location-privacy.js")>(),
  loadLocationEnvelope: vi.fn()
}));

const inside = { lat: 40.7128, lng: -74.006 };
const outside = { lat: 34.0522, lng: -118.2437 };
const member = "member-fixture";
function envelope(location = outside, source: LocationPayload["source"] = "GPS") {
  return { latE7: location.lat * 10_000_000, lonE7: location.lng * 10_000_000,
    source, expiresAtMs: Date.now() + 60_000 } as LocationPayload;
}
type Event = ServiceAreaEmailOutboxRow & {
  dedupe_token: string;
  email_started_at: Date | null;
  email_sent_at: Date | null;
  claimed_until: number;
  claim_token: unknown;
  sent: boolean;
  cancelled: boolean;
  reconciliation: boolean;
};
const eventPayload = (event: Event) => decryptServiceAreaEmailPayload(stateCryptoConfig, event);

// Models transaction/state-row serialization and rollback for delivery and
// accepted GPS writes. This is unit coverage with real payload crypto, not a
// substitute for the separately owned PostgreSQL migration/locking proof.
function fixture(subjectId = member) {
  const data = {
    state: null as { is_outside: boolean; current_event_id: string | null } | null,
    events: new Map<string, Event>(),
    returnOutbox: new Map<string, Event>(),
    returnEvents: new Map<string, string>(),
    active: true, verified: true, complete: true, email: "first@example.invalid", corruptState: false,
    beforeTransaction: null as null | (() => Promise<void>),
    depth: 0, transactions: 0
  };
  const allowed = (event?: Event) => Boolean(event && !event.sent && !event.cancelled
    && !event.reconciliation && data.active && data.verified && data.complete);
  const allEvents = () => [...data.events.values(), ...data.returnOutbox.values()];
  function encryptedPayload(params: unknown[], offset: number) {
    const encrypted = {
      payload_ciphertext: String(params[offset]), payload_nonce: String(params[offset + 1]),
      payload_auth_tag: String(params[offset + 2]), wrapped_payload_dek: String(params[offset + 3]),
      payload_dek_nonce: String(params[offset + 4]), payload_dek_auth_tag: String(params[offset + 5]),
      payload_key_version: String(params[offset + 6])
    };
    expect(Buffer.from(encrypted.payload_ciphertext, "base64")).toHaveLength(2048);
    expect(JSON.stringify(params)).not.toMatch(/outside_entry|service_return|first_coc|oos-welcome\/|sinners-welcome\/|@example\.invalid/);
    return encrypted;
  }
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    const [id, second, third] = params;
    const event = data.events.get(String(id)) ?? data.returnOutbox.get(String(id));
    if (sql.startsWith("insert into oos_service_area_state")) {
      data.state ??= { is_outside: false, current_event_id: null };
    } else if (sql.startsWith("select user_id::text, state_ciphertext")) {
      if (sql.includes("for update")) expect(data.depth).toBe(1);
      expect(params).toEqual([subjectId]);
      if (!data.state) return { rows: [] };
      const encrypted = encryptOosState(stateCryptoConfig, subjectId, data.state);
      return { rows: [{ user_id: subjectId, ...encrypted,
        ...(data.corruptState ? { state_auth_tag: "corrupt" } : {}) }] };
    } else if (sql.includes("from service_area_email_outbox where user_id = $1")) {
      return { rows: allEvents().filter(item => item.user_id === id) };
    } else if (sql.startsWith("insert into service_area_email_outbox")) {
      expect(data.depth).toBe(1);
      expect(params).toHaveLength(10);
      expect(second).toBe(subjectId);
      expect(sql).toContain("on conflict (dedupe_token) do nothing");
      if (allEvents().some(item => item.dedupe_token === third)) return { rows: [] };
      const added: Event = {
        event_id: String(id), user_id: String(second), dedupe_token: String(third),
        ...encryptedPayload(params, 3), email_started_at: null, email_sent_at: null,
        claimed_until: 0, claim_token: null, sent: false, cancelled: false, reconciliation: false
      };
      const payload = eventPayload(added);
      if (payload.kind === "service_return") {
        // Return history is encrypted in the same generic outbox, before the
        // accepted GPS transaction clears the old outside state.
        expect(data.state?.is_outside).toBe(true);
        expect(payload.priorOutsideEventId).toBe(data.state!.current_event_id);
        expect(payload.providerIdempotencyKey).toBe("sinners-welcome/return/" + data.state!.current_event_id);
        data.returnEvents.set(payload.priorOutsideEventId!, payload.providerIdempotencyKey);
        data.returnOutbox.set(added.event_id, added);
      } else {
        expect(payload.kind).toBe("outside_entry");
        expect(payload.providerIdempotencyKey).toBe("oos-welcome/" + id);
        data.events.set(added.event_id, added);
      }
    } else if (sql.startsWith("update oos_service_area_state")) {
      data.state = decryptOosState(stateCryptoConfig, subjectId, {
        state_ciphertext: String(params[1]), state_nonce: String(params[2]), state_auth_tag: String(params[3]),
        wrapped_state_dek: String(params[4]), state_dek_nonce: String(params[5]),
        state_dek_auth_tag: String(params[6]), state_key_version: String(params[7])
      });
    } else if (sql.includes("set cancelled_at")) {
      expect(id).toBe(subjectId);
      const previous = data.events.get(String(second));
      if (previous && !previous.sent) previous.cancelled = true;
    } else if (sql.startsWith("select u.email")) {
      expect(data.depth).toBe(1);
      expect(sql).toContain("for share of u");
      expect(sql).toContain("u.account_status = 'active' and u.email_verified_at is not null");
      expect(sql).toContain("p.display_name is not null and p.year_of_birth is not null");
      return { rows: id === subjectId && data.active && data.verified && data.complete
        ? [{ email: data.email, code_of_conduct_accepted_version: "accepted-version" }] : [] };
    } else if (sql.includes("set claim_token")) {
      expect(sql).toContain("cancelled_at is null");
      if (!allowed(event) || event!.user_id !== second || event!.claimed_until > Date.now()) return { rows: [] };
      event!.claim_token = third;
      event!.claimed_until = Date.now() + 300_000;
      return { rows: [{ ...event }] };
    } else if (sql.includes("set email_started_at")) {
      if (!event || event.claim_token !== second || !allowed(event)) return { rows: [] };
      event.email_started_at ??= new Date();
      Object.assign(event, encryptedPayload(params, 2));
      expect(eventPayload(event).emailTo).toBeTruthy();
    } else if (sql.includes("set reconciliation_required_at")) {
      if (event && event.claim_token === second) event.reconciliation = true;
    } else if (sql.startsWith("select event_id::text")) {
      expect(sql).toContain("claimed_until > now()");
      expect(sql).toContain("for update");
      return { rows: allowed(event) && event!.user_id === second && event!.claim_token === third
        && event!.claimed_until > Date.now() ? [{ ...event }] : [] };
    } else if (sql.includes("set email_sent_at")) {
      if (event && event.claim_token === second) {
        event.sent = true; event.email_sent_at = new Date();
        Object.assign(event, encryptedPayload(params, 2));
        expect(eventPayload(event).emailTo).toBeNull();
        expect(eventPayload(event).providerMessageId).toBe("fixture-provider");
      }
    } else if (sql.startsWith("update service_area_email_outbox set claimed_until = now()")) {
      if (event && event.claim_token === second) event.claimed_until = Date.now();
    } else if (sql.startsWith("with sweep_candidates")) {
      expect(sql).not.toContain("join oos_service_area_state");
      expect(sql).toContain("w.cancelled_at is null");
      const pending = allEvents().filter(item => allowed(item) && item.claimed_until <= Date.now());
      for (const item of pending) item.claimed_until = Date.now();
      return { rows: pending.map(item => ({ user_id: subjectId, event_id: item.event_id })) };
    } else {
      throw new Error("Unexpected fixture SQL");
    }
    return { rows: [] };
  });
  let tail = Promise.resolve();
  const db: DbClient = {
    query: query as DbClient["query"],
    end: async () => {},
    async transaction<T>(fn: (client: DbClient) => Promise<T>): Promise<T> {
      const preceding = tail;
      let unlock!: () => void;
      tail = new Promise<void>((resolve) => { unlock = resolve; });
      await preceding;
      data.transactions++;
      data.depth++;
      try {
        const hook = data.beforeTransaction;
        data.beforeTransaction = null;
        if (hook) await hook();
        const snapshot = structuredClone({ state: data.state, events: data.events,
          returnOutbox: data.returnOutbox, returnEvents: data.returnEvents });
        try { return await fn(db); }
        catch (error) { Object.assign(data, snapshot); throw error; }
      } finally {
        data.depth--;
        unlock();
      }
    }
  };
  const log = { warn: vi.fn(), error: vi.fn() };
  const app = { db, config: { ...stateCryptoConfig, RESEND_API_KEY: "fixture", MAIL_FROM: "fixture" }, log } as unknown as FastifyInstance;
  const save = (location: typeof inside) => runTransaction(db, (transaction) => queueOutOfSightWelcomeEmail(transaction, subjectId, location, stateCryptoConfig));
  return { data, db, query, app, log, save };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadLocationEnvelope).mockReset().mockResolvedValue(envelope());
  vi.mocked(sendOutOfSightWelcomeEmail).mockReset().mockResolvedValue({ accepted: true, providerMessageId: "fixture-provider" });
  vi.mocked(sendSinnersWelcomeEmail).mockReset().mockResolvedValue({ accepted: true, providerMessageId: "fixture-provider" });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("External HTTP forbidden"); }));
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("physical OOS entry emails", () => {
  it("reads last-known encrypted classification only for authorized caller IDs", async () => {
    const insideId = "00000000-0000-4000-8000-000000000001";
    const outsideId = "00000000-0000-4000-8000-000000000002";
    const damagedId = "00000000-0000-4000-8000-000000000003";
    const missingId = "00000000-0000-4000-8000-000000000004";
    const rows = [
      { user_id: insideId, ...encryptOosState(stateCryptoConfig, insideId, { is_outside: false, current_event_id: null }) },
      { user_id: outsideId, ...encryptOosState(stateCryptoConfig, outsideId,
        { is_outside: true, current_event_id: "00000000-0000-4000-8000-000000000005" }) },
      { user_id: damagedId, ...encryptOosState(stateCryptoConfig, damagedId,
        { is_outside: true, current_event_id: "00000000-0000-4000-8000-000000000006" }), state_auth_tag: "damaged" }
    ];
    const query = vi.fn(async (_sql: string, _params: unknown[]) => ({ rows }));
    const result = await loadStoredOutOfSightStatuses({ config: stateCryptoConfig,
      db: { query: query as DbClient["query"] } }, [insideId, outsideId, damagedId, missingId, insideId]);
    expect([...result]).toEqual([[insideId, "in_area"], [outsideId, "out_of_sight"],
      [damagedId, "unknown"], [missingId, "unknown"]]);
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0]).not.toMatch(/latitude|longitude|encrypted_location_envelopes|travel_pins/i);
  });

  it("keeps state-only SQL encrypted and fails closed on unreadable state", async () => {
    const f = fixture();
    const eventId = (await f.save(outside))!;
    const stateWrites = f.query.mock.calls.filter(([sql]) => sql.startsWith("insert into oos_service_area_state")
      || sql.startsWith("update oos_service_area_state"));
    expect(JSON.stringify(stateWrites)).not.toContain(eventId);
    expect(JSON.stringify(stateWrites)).not.toContain("is_outside");
    expect(JSON.stringify(stateWrites)).not.toContain("current_event_id");
    f.data.corruptState = true;
    await expect(f.save(inside)).rejects.toThrow();
    expect(f.data.state?.current_event_id).toBe(eventId);
    expect(f.data.returnEvents.size).toBe(0);
    await expect(deliverOutOfSightWelcomeEmail(f.app, member)).rejects.toThrow();
    expect(sendOutOfSightWelcomeEmail).not.toHaveBeenCalled();
  });

  it("records inside fixes, queues the first outside detection, and deduplicates repeated outside fixes", async () => {
    const f = fixture();
    await f.save(inside);
    expect(f.data.events.size).toBe(0);
    const first = await f.save(outside);
    expect(await f.save(outside)).toBe(first);
    expect(f.data.events.size).toBe(1);
    expect(sendOutOfSightWelcomeEmail).not.toHaveBeenCalled();
  });

  it("queues a first-ever outside fix even during onboarding", async () => {
    const f = fixture();
    f.data.complete = false;
    expect(await f.save(outside)).toBeTruthy();
    expect(f.data.events.size).toBe(1);
    expect(await deliverOutOfSightWelcomeEmail(f.app, member)).toBe(false);
    expect(sendOutOfSightWelcomeEmail).not.toHaveBeenCalled();
  });

  it("serializes simultaneous accepted outside GPS transactions to one event", async () => {
    const f = fixture();
    const entries = await Promise.all(Array.from({ length: 12 }, () => f.save(outside)));
    expect(new Set(entries).size).toBe(1);
    expect(f.data.events.size).toBe(1);
  });

  it("preserves cancelled history and gives each inside-to-outside re-entry its own key", async () => {
    const f = fixture();
    const first = await f.save(outside);
    await f.save(inside);
    expect(f.data.events.get(first!)?.cancelled).toBe(true);
    const second = await f.save(outside);
    expect(second).not.toBe(first);
    expect(f.data.events.size).toBe(2);
    expect(new Set([...f.data.events.values()].map((event) => eventPayload(event).providerIdempotencyKey)).size).toBe(2);
    expect(await deliverOutOfSightWelcomeEmail(f.app, member)).toBe(true);
    expect(sendOutOfSightWelcomeEmail).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: "oos-welcome/" + second }));
    expect(f.data.events.get(first!)?.sent).toBe(false);
  });

  it("permits a later re-entry after a successfully delivered entry without resending while still outside", async () => {
    const f = fixture();
    const first = await f.save(outside);
    await deliverOutOfSightWelcomeEmail(f.app, member);
    await f.save(outside);
    expect(await deliverOutOfSightWelcomeEmail(f.app, member)).toBe(false);
    await f.save(inside);
    const second = await f.save(outside);
    await deliverOutOfSightWelcomeEmail(f.app, member);
    expect(sendOutOfSightWelcomeEmail).toHaveBeenCalledTimes(2);
    expect(f.data.events.get(first!)?.sent).toBe(true);
    expect(f.data.events.get(second!)?.sent).toBe(true);
  });

  it("claims once under simultaneous delivery workers", async () => {
    const f = fixture();
    await f.save(outside);
    const results = await Promise.all(Array.from({ length: 8 }, () => deliverOutOfSightWelcomeEmail(f.app, member)));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(sendOutOfSightWelcomeEmail).toHaveBeenCalledTimes(1);
  });

  it("commits attempt metadata first and retries an ambiguous failure using the same event key and frozen recipient", async () => {
    const f = fixture();
    const id = (await f.save(outside))!;
    const beforeDelivery = f.data.transactions;
    vi.mocked(sendOutOfSightWelcomeEmail).mockImplementationOnce(async () => {
      expect(f.data.events.get(id)?.email_started_at).toBeInstanceOf(Date);
      expect(f.data.transactions).toBe(beforeDelivery + 2);
      expect(f.data.depth).toBe(1);
      throw new Error("synthetic ambiguous provider error");
    });
    await expect(deliverOutOfSightWelcomeEmail(f.app, member)).rejects.toThrow("synthetic ambiguous");
    expect(f.data.events.get(id)!.claimed_until).toBeLessThanOrEqual(Date.now());
    f.data.email = "changed@example.invalid";
    expect(await deliverOutOfSightWelcomeEmail(f.app, member)).toBe(true);
    expect(vi.mocked(sendOutOfSightWelcomeEmail).mock.calls.map(([input]) => [input.idempotencyKey, input.email]))
      .toEqual([["oos-welcome/" + id, "first@example.invalid"], ["oos-welcome/" + id, "first@example.invalid"]]);
  });

  it("retries a provider non-acceptance without marking the entry sent", async () => {
    const f = fixture();
    const id = (await f.save(outside))!;
    vi.mocked(sendOutOfSightWelcomeEmail).mockResolvedValueOnce({ accepted: false, providerMessageId: null });
    expect(await deliverOutOfSightWelcomeEmail(f.app, member)).toBe(false);
    expect(f.data.events.get(id)?.sent).toBe(false);
    expect(await deliverOutOfSightWelcomeEmail(f.app, member)).toBe(true);
  });

  it("keeps the same key if provider acceptance is followed by a database recording failure", async () => {
    const f = fixture();
    const id = (await f.save(outside))!;
    const originalQuery = f.query.getMockImplementation()!;
    let failRecording = true;
    f.query.mockImplementation(async (sql, params) => {
      if (failRecording && sql.includes("set email_sent_at")) {
        failRecording = false;
        throw new Error("synthetic database recording failure");
      }
      return originalQuery(sql, params);
    });
    await expect(deliverOutOfSightWelcomeEmail(f.app, member)).rejects.toThrow("synthetic database recording failure");
    expect(f.data.events.get(id)?.sent).toBe(false);
    expect(f.data.events.get(id)?.email_started_at).toBeInstanceOf(Date);
    expect(await deliverOutOfSightWelcomeEmail(f.app, member)).toBe(true);
    expect(vi.mocked(sendOutOfSightWelcomeEmail).mock.calls.map(([input]) => input.idempotencyKey))
      .toEqual(["oos-welcome/" + id, "oos-welcome/" + id]);
  });

  it("waits for an existing claim lease to expire before retrying", async () => {
    const f = fixture();
    const id = (await f.save(outside))!;
    f.data.events.get(id)!.claimed_until = Date.now() + 60_000;
    expect(await deliverOutOfSightWelcomeEmail(f.app, member)).toBe(false);
    expect(sendOutOfSightWelcomeEmail).not.toHaveBeenCalled();
    f.data.events.get(id)!.claimed_until = Date.now() - 1;
    expect(await deliverOutOfSightWelcomeEmail(f.app, member)).toBe(true);
  });

  it("preserves a legacy queued row's original idempotency key", async () => {
    const f = fixture();
    const id = (await f.save(outside))!;
    const event = f.data.events.get(id)!;
    Object.assign(event, encryptServiceAreaEmailPayload(stateCryptoConfig, member, id,
      { ...eventPayload(event), providerIdempotencyKey: "oos-welcome/legacy-member-fixture" }));
    await deliverOutOfSightWelcomeEmail(f.app, member);
    expect(sendOutOfSightWelcomeEmail).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: "oos-welcome/legacy-member-fixture" }));
  });

  it.each([23, 24, 48])("holds an ambiguous attempt aged %s hours for reconciliation", async (hours) => {
    const f = fixture();
    const id = (await f.save(outside))!;
    const event = f.data.events.get(id)!;
    Object.assign(event, encryptServiceAreaEmailPayload(stateCryptoConfig, member, id,
      { ...eventPayload(event), emailTo: "first@example.invalid" }));
    event.email_started_at = new Date(Date.now() - hours * 3_600_000);
    expect(await deliverOutOfSightWelcomeEmail(f.app, member)).toBe(false);
    expect(f.data.events.get(id)?.reconciliation).toBe(true);
    expect(f.data.events.get(id)!.claimed_until).toBeLessThanOrEqual(Date.now());
    expect(sendOutOfSightWelcomeEmail).not.toHaveBeenCalled();
    expect(f.log.warn).toHaveBeenCalledWith("Service-area email needs delivery reconciliation");
  });

  it.each(["active", "verified", "complete"] as const)("requires %s eligibility before claiming", async (gate) => {
    const f = fixture();
    await f.save(outside);
    f.data[gate] = false;
    expect(await deliverOutOfSightWelcomeEmail(f.app, member)).toBe(false);
    expect(sendOutOfSightWelcomeEmail).not.toHaveBeenCalled();
    f.data[gate] = true;
    expect(await deliverOutOfSightWelcomeEmail(f.app, member)).toBe(true);
  });

  it("rechecks eligibility after the initial claim", async () => {
    const f = fixture();
    await f.save(outside);
    vi.mocked(loadLocationEnvelope).mockImplementationOnce(async () => {
      f.data.beforeTransaction = async () => { f.data.verified = false; };
      return envelope();
    });
    expect(await deliverOutOfSightWelcomeEmail(f.app, member)).toBe(false);
    expect(sendOutOfSightWelcomeEmail).not.toHaveBeenCalled();
  });

  it("does not deliver stale pending events after an accepted inside fix", async () => {
    const f = fixture();
    const id = (await f.save(outside))!;
    await f.save(inside);
    // The shared sweep now sees the genuine return, but never the cancelled
    // outside-entry notification. Only its corresponding welcome may send.
    expect(await sendPendingOutOfSightWelcomeEmails(f.app)).toBe(1);
    expect(await deliverOutOfSightWelcomeEmail(f.app, member)).toBe(false);
    expect(f.data.events.get(id)?.cancelled).toBe(true);
    expect(sendOutOfSightWelcomeEmail).not.toHaveBeenCalled();
    expect(sendSinnersWelcomeEmail).toHaveBeenCalledOnce();
    expect(sendSinnersWelcomeEmail).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: "sinners-welcome/return/" + id }));
  });

  it("defers inside GPS without inventing a transition; only an accepted fix records the return", async () => {
    const f = fixture();
    const id = (await f.save(outside))!;
    vi.mocked(loadLocationEnvelope).mockResolvedValue(envelope(inside));
    f.query.mockClear();
    expect(await deliverOutOfSightWelcomeEmail(f.app, member)).toBe(false);
    expect(await sendPendingOutOfSightWelcomeEmails(f.app)).toBe(1);
    expect(f.data.events.get(id)?.cancelled).toBe(false);
    expect(f.data.events.get(id)?.email_started_at).toBeNull();
    expect(f.data.state).toEqual({ is_outside: true, current_event_id: id });
    expect(f.data.returnEvents.size).toBe(0);
    expect(f.query.mock.calls.map(([sql]) => sql).join("\n"))
      .not.toMatch(/insert into|update oos_service_area_state|set cancelled_at/);
    expect(sendOutOfSightWelcomeEmail).not.toHaveBeenCalled();
    expect(sendSinnersWelcomeEmail).not.toHaveBeenCalled();
    await f.save(inside);
    expect(f.data.events.get(id)?.cancelled).toBe(true);
    expect(f.data.state?.is_outside).toBe(false);
    expect(f.data.returnEvents.get(id)).toBe("sinners-welcome/return/" + id);
    expect(sendOutOfSightWelcomeEmail).not.toHaveBeenCalled();
  });

  it("defers GPS that moves inside between claim and provider checks without transition writes", async () => {
    const f = fixture();
    const id = (await f.save(outside))!;
    vi.mocked(loadLocationEnvelope).mockResolvedValueOnce(envelope()).mockResolvedValue(envelope(inside));
    f.query.mockClear();
    expect(await deliverOutOfSightWelcomeEmail(f.app, member)).toBe(false);
    expect(loadLocationEnvelope).toHaveBeenCalledTimes(2);
    expect(f.data.state).toEqual({ is_outside: true, current_event_id: id });
    expect(f.data.events.get(id)?.cancelled).toBe(false);
    expect(f.data.events.get(id)?.sent).toBe(false);
    expect(f.data.returnEvents.size).toBe(0);
    expect(f.query.mock.calls.map(([sql]) => sql).join("\n"))
      .not.toMatch(/insert into|update oos_service_area_state|set cancelled_at/);
    expect(sendOutOfSightWelcomeEmail).not.toHaveBeenCalled();
    expect(sendSinnersWelcomeEmail).not.toHaveBeenCalled();
  });

  it("rechecks the entry after a GPS exit/re-entry between claim commit and provider send", async () => {
    const f = fixture();
    const first = (await f.save(outside))!;
    vi.mocked(loadLocationEnvelope).mockImplementationOnce(async () => {
      f.data.beforeTransaction = async () => {
        await queueOutOfSightWelcomeEmail(f.db, member, inside, stateCryptoConfig);
        await queueOutOfSightWelcomeEmail(f.db, member, outside, stateCryptoConfig);
      };
      return envelope();
    }).mockResolvedValue(envelope());
    expect(await deliverOutOfSightWelcomeEmail(f.app, member)).toBe(false);
    expect(f.data.events.size).toBe(2);
    expect(f.data.events.get(first)?.cancelled).toBe(true);
    expect(sendOutOfSightWelcomeEmail).not.toHaveBeenCalled();
    expect(await deliverOutOfSightWelcomeEmail(f.app, member)).toBe(true);
  });

  it("keeps the state lock through provider acceptance, serializing a concurrent GPS exit", async () => {
    const f = fixture();
    await f.save(outside);
    let signalStarted!: () => void;
    let finishSend!: () => void;
    const started = new Promise<void>((resolve) => { signalStarted = resolve; });
    const finish = new Promise<void>((resolve) => { finishSend = resolve; });
    vi.mocked(sendOutOfSightWelcomeEmail).mockImplementationOnce(async () => {
      signalStarted();
      await finish;
      return { accepted: true, providerMessageId: "fixture-provider" };
    });
    const delivery = deliverOutOfSightWelcomeEmail(f.app, member);
    await started;
    const leaving = f.save(inside);
    await Promise.resolve();
    expect(f.data.state?.is_outside).toBe(true);
    finishSend();
    expect(await delivery).toBe(true);
    await leaving;
    expect(f.data.state?.is_outside).toBe(false);
  });

  it.each([null, envelope(outside, "MANUAL"), envelope({ lat: NaN, lng: 0 })])("fails closed on absent or nonphysical GPS", async (location) => {
    const f = fixture();
    await f.save(outside);
    vi.mocked(loadLocationEnvelope).mockResolvedValue(location);
    expect(await deliverOutOfSightWelcomeEmail(f.app, member)).toBe(false);
    expect(sendOutOfSightWelcomeEmail).not.toHaveBeenCalled();
  });

  it.each(["claim", "pre-provider"] as const)("defers expired physical GPS at %s without changing accepted state or history", async (phase) => {
    const f = fixture();
    const id = (await f.save(outside))!;
    const expired = { ...envelope(), expiresAtMs: Date.now() - 1 };
    if (phase === "pre-provider") vi.mocked(loadLocationEnvelope).mockResolvedValueOnce(envelope());
    vi.mocked(loadLocationEnvelope).mockResolvedValue(expired);
    f.query.mockClear();
    expect(await deliverOutOfSightWelcomeEmail(f.app, member)).toBe(false);
    expect(loadLocationEnvelope).toHaveBeenCalledTimes(phase === "claim" ? 1 : 2);
    expect(f.data.state).toEqual({ is_outside: true, current_event_id: id });
    expect(f.data.events.size).toBe(1);
    expect(f.data.returnOutbox.size).toBe(0);
    expect(f.data.events.get(id)?.sent).toBe(false);
    expect(f.data.events.get(id)?.cancelled).toBe(false);
    expect(f.query.mock.calls.map(([sql]) => sql).join("\n"))
      .not.toMatch(/insert into|update oos_service_area_state|set cancelled_at/);
    expect(sendOutOfSightWelcomeEmail).not.toHaveBeenCalled();
    expect(sendSinnersWelcomeEmail).not.toHaveBeenCalled();
  });

  it.each(["claim", "pre-provider"] as const)("authenticates the encrypted outbox again at %s and fails closed on tampering", async (phase) => {
    const f = fixture();
    const id = (await f.save(outside))!;
    const damage = async () => {
      const event = f.data.events.get(id)!;
      const tag = Buffer.from(event.payload_auth_tag, "base64"); tag[0] ^= 1;
      event.payload_auth_tag = tag.toString("base64");
    };
    if (phase === "claim") await damage();
    else vi.mocked(loadLocationEnvelope).mockImplementationOnce(async () => {
      f.data.beforeTransaction = damage; return envelope();
    });
    f.query.mockClear();
    await expect(deliverOutOfSightWelcomeEmail(f.app, member)).rejects.toThrow();
    expect(f.data.events.get(id)?.sent).toBe(false);
    expect(f.data.events.get(id)!.claimed_until).toBeLessThanOrEqual(Date.now());
    expect(f.data.state).toEqual({ is_outside: true, current_event_id: id });
    expect(f.query.mock.calls.map(([sql]) => sql).join("\n"))
      .not.toMatch(/insert into|update oos_service_area_state|set cancelled_at/);
    expect(sendOutOfSightWelcomeEmail).not.toHaveBeenCalled();
    expect(sendSinnersWelcomeEmail).not.toHaveBeenCalled();
    expect(await sendPendingOutOfSightWelcomeEmails(f.app)).toBe(1);
    expect(f.log.warn).toHaveBeenCalledWith("Service-area email delivery failed; will retry");
    const logs = JSON.stringify(f.log.warn.mock.calls);
    expect(logs).not.toContain(f.data.email);
    expect(logs).not.toContain(id);
    expect(logs).not.toContain(f.data.events.get(id)!.payload_ciphertext);
  });

  it("retries unreadable encrypted locations with generic logs only and never calls external geography", async () => {
    const f = fixture();
    await f.save(outside);
    vi.mocked(loadLocationEnvelope).mockRejectedValue(new Error("private-coordinate-and-address-fixture"));
    expect(await sendPendingOutOfSightWelcomeEmails(f.app)).toBe(1);
    expect(f.log.warn).toHaveBeenCalledWith("Service-area email delivery failed; will retry");
    expect(JSON.stringify(f.log.warn.mock.calls)).not.toContain("private-coordinate");
    expect(sendOutOfSightWelcomeEmail).not.toHaveBeenCalled();
    const source = await readFile(new URL("./oos-welcome-email.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/fetch\(|getTravelPin|getViewerOutsideServiceArea/);
  });

  it("never persists coordinates in queue SQL and ignores invalid fixes", async () => {
    const f = fixture();
    await f.save(outside);
    const parameters = JSON.stringify(f.query.mock.calls.map(([, params]) => params));
    expect(parameters).not.toContain(String(outside.lat));
    expect(parameters).not.toContain(String(outside.lng));
    f.query.mockClear();
    await f.save({ lat: NaN, lng: 0 });
    expect(f.query).not.toHaveBeenCalled();
  });

  it("keeps GPS queueing inside the location transaction and delivery after its commit", async () => {
    const source = await readFile(new URL("./routes/profiles.ts", import.meta.url), "utf8");
    const start = source.indexOf('app.put("/api/profiles/me/location"');
    const route = source.slice(start, source.indexOf("const policy = await getEffectiveVisibilityPolicy", start));
    expect(route).toContain("await queueOutOfSightWelcomeEmail(db, userId, { lat: payload.lat, lng: payload.lng }, app.config)");
    expect(route.indexOf("await storeLocationEnvelope")).toBeLessThan(route.indexOf("await queueOutOfSightWelcomeEmail"));
    expect(route.indexOf("await queueOutOfSightWelcomeEmail")).toBeLessThan(route.indexOf("void deliverOutOfSightWelcomeEmail"));
    expect(route).not.toContain("shouldQueueOutOfSightWelcomeEmail");
  });

  it("expands legacy 215 in place without deleting history or enrolling unrelated members", async () => {
    const sql = await readFile(new URL("../sql/215_oos_welcome_email.sql", import.meta.url), "utf8");
    expect(sql).toContain("add column if not exists event_id");
    expect(sql).toContain("primary key (event_id)");
    expect(sql).toContain("'oos-welcome/' || user_id::text");
    expect(sql).toContain("from oos_welcome_emails");
    expect(sql).toContain("on conflict (user_id) do nothing");
    expect(sql).not.toMatch(/delete from|truncate|drop table|insert into\s+oos_welcome_emails/i);
  });

  it.each(["RESEND_API_KEY", "MAIL_FROM"] as const)("does no DB/decrypt work when %s is absent", async (key) => {
    const f = fixture();
    await f.save(outside);
    f.data.corruptState = true; // A decrypt before the config gate would throw.
    f.query.mockClear();
    f.app.config[key] = "";
    expect(await deliverOutOfSightWelcomeEmail(f.app, member)).toBe(false);
    expect(await sendPendingOutOfSightWelcomeEmails(f.app)).toBe(0);
    expect(f.query).not.toHaveBeenCalled();
    expect(loadLocationEnvelope).not.toHaveBeenCalled();
    expect(sendOutOfSightWelcomeEmail).not.toHaveBeenCalled();
    expect(sendSinnersWelcomeEmail).not.toHaveBeenCalled();
  });
});
