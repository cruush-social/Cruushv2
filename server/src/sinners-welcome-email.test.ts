import { readFile } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runTransaction, type DbClient } from "./db.js";
import { sendOutOfSightWelcomeEmail, sendSinnersWelcomeEmail } from "./mailer.js";
import { loadLocationEnvelope } from "./location-privacy.js";
import { decryptServiceAreaEmailPayload, type ServiceAreaEmailOutboxRow } from "./service-area-email-outbox.js";
import { queueOutOfSightWelcomeEmail, startOutOfSightWelcomeEmailScheduler } from "./oos-welcome-email.js";
import { decryptOosState, type EncryptedOosState, type OosStateCryptoConfig } from "./oos-state-crypto.js";
import {
  acceptCodeOfConductAndQueueSinnersWelcome, deliverPendingSinnersWelcomeEmailsForUser,
  deliverSinnersWelcomeEmail, queueSinnersReturnWelcomeEmail, sendPendingSinnersWelcomeEmails,
  startSinnersWelcomeEmailScheduler
} from "./sinners-welcome-email.js";

vi.mock("./mailer.js", () => ({ sendSinnersWelcomeEmail: vi.fn(), sendOutOfSightWelcomeEmail: vi.fn() }));
vi.mock("./location-privacy.js", async original => ({
  ...await original<typeof import("./location-privacy.js")>(), loadLocationEnvelope: vi.fn()
}));
const member = "10000000-0000-4000-8000-000000000001";
const inside = { lat: 40.7128, lng: -74.006 };
const outside = { lat: 34.0522, lng: -118.2437 };
const stateCryptoConfig = {
  SESSION_SECRET: "synthetic-sinners-session-secret-only",
  LOCATION_ENCRYPTION_KEY: Buffer.alloc(32, 0x53).toString("base64"),
  LOCATION_ENCRYPTION_KEY_VERSION: "v1",
  LOCATION_ENCRYPTION_KEY_PREVIOUS: undefined
} satisfies OosStateCryptoConfig;
type Event = ServiceAreaEmailOutboxRow & {
  dedupe_token: string; email_sent_at: Date | null; cancelled_at: Date | null; reconciliation_required_at: Date | null;
  claim_token: unknown; claimed_until: number; queued_at: number;
};
const eventPayload = (event: Event) => decryptServiceAreaEmailPayload(stateCryptoConfig, event);

// Models row serialization and rollback with real payload crypto, not
// PostgreSQL parsing or the separately owned migration/locking proof.
function fixture() {
  const data = {
    exists: true, active: true, verified: true, complete: true, version: null as string | null,
    email: "first@example.invalid", events: new Map<string, Event>(), outsideEvents: new Map<string, Event>(),
    state: null as EncryptedOosState | null,
    depth: 0, transactions: 0, failRecordOnce: false,
    beforeTransaction: null as null | (() => void)
  };
  const eligible = () => data.exists && data.active && data.verified && data.complete;
  const pending = (event: Event) => !event.email_sent_at && !event.cancelled_at && !event.reconciliation_required_at;
  const allEvents = () => [...data.events.values(), ...data.outsideEvents.values()];
  function encryptedPayload(params: unknown[], offset: number) {
    const encrypted = {
      payload_ciphertext: String(params[offset]), payload_nonce: String(params[offset + 1]),
      payload_auth_tag: String(params[offset + 2]), wrapped_payload_dek: String(params[offset + 3]),
      payload_dek_nonce: String(params[offset + 4]), payload_dek_auth_tag: String(params[offset + 5]),
      payload_key_version: String(params[offset + 6])
    };
    expect(Buffer.from(encrypted.payload_ciphertext, "base64")).toHaveLength(2048);
    expect(JSON.stringify(params)).not.toMatch(/first_coc|service_return|outside_entry|sinners-welcome\/|oos-welcome\/|@example\.invalid/);
    return encrypted;
  }
  function encryptedState(params: unknown[]): EncryptedOosState {
    expect(data.depth).toBe(1);
    expect(params).toHaveLength(8);
    expect(params[0]).toBe(member);
    for (const value of params.slice(1)) expect(typeof value).toBe("string");
    const row = {
      state_ciphertext: params[1] as string, state_nonce: params[2] as string,
      state_auth_tag: params[3] as string, wrapped_state_dek: params[4] as string,
      state_dek_nonce: params[5] as string, state_dek_auth_tag: params[6] as string,
      state_key_version: params[7] as string
    };
    expect(row.state_key_version).toBe(stateCryptoConfig.LOCATION_ENCRYPTION_KEY_VERSION);
    expect(Buffer.from(row.state_nonce, "base64")).toHaveLength(12);
    expect(Buffer.from(row.state_dek_nonce, "base64")).toHaveLength(12);
    expect(Buffer.from(row.state_auth_tag, "base64")).toHaveLength(16);
    expect(Buffer.from(row.state_dek_auth_tag, "base64")).toHaveLength(16);
    expect(Buffer.from(row.wrapped_state_dek, "base64")).toHaveLength(32);
    const decoded = decryptOosState(stateCryptoConfig, member, row);
    expect(Object.keys(decoded).sort()).toEqual(["current_event_id", "is_outside"]);
    expect(JSON.stringify(row)).not.toMatch(/is_outside|current_event_id|40\.7128|-74\.006|34\.0522|-118\.2437/);
    if (decoded.current_event_id) expect(JSON.stringify(row)).not.toContain(decoded.current_event_id);
    return row;
  }
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    const [id, second, third] = params;
    const event = data.events.get(String(id)) ?? data.outsideEvents.get(String(id));
    if (sql.startsWith("select id::text, code_of_conduct_accepted_version")) {
      expect(data.depth).toBe(1);
      expect(sql).toContain("for update"); expect(params).toEqual([member]);
      return { rows: data.exists ? [{ id: member, code_of_conduct_accepted_version: data.version }] : [] };
    } else if (sql.startsWith("update app_users set code_of_conduct_accepted_version")) {
      expect(data.depth).toBe(1); expect(id).toBe(member);
      data.version = String(second); return { rows: [{ id: member }] };
    } else if (sql.includes("from service_area_email_outbox where user_id = $1")) {
      return { rows: allEvents().filter(e => e.user_id === id) };
    } else if (sql.startsWith("insert into service_area_email_outbox")) {
      expect(data.depth).toBe(1); expect(params).toHaveLength(10);
      expect(sql).toContain("on conflict (dedupe_token) do nothing");
      if (allEvents().some(e => e.dedupe_token === third)) return { rows: [] };
      const added: Event = { event_id: String(id), user_id: String(second), dedupe_token: String(third),
        ...encryptedPayload(params, 3), email_started_at: null, email_sent_at: null, cancelled_at: null,
        reconciliation_required_at: null, claim_token: null, claimed_until: 0, queued_at: Date.now() };
      const decoded = eventPayload(added);
      (decoded.kind === "outside_entry" ? data.outsideEvents : data.events).set(added.event_id, added);
    } else if (sql.startsWith("insert into oos_service_area_state")) {
      expect(sql).toContain("on conflict (user_id) do nothing");
      expect(sql).not.toMatch(/is_outside|current_event_id/);
      const initial = encryptedState(params);
      expect(decryptOosState(stateCryptoConfig, member, initial))
        .toEqual({ is_outside: false, current_event_id: null });
      data.state ??= initial;
    } else if (sql.startsWith("select user_id::text, state_ciphertext")) {
      expect(data.depth).toBe(1);
      expect(params).toEqual([member]);
      expect(sql).toContain("from oos_service_area_state where user_id = $1 for update");
      return { rows: data.state ? [{ user_id: member, ...data.state }] : [] };
    } else if (sql.includes("set cancelled_at")) {
      expect(id).toBe(member);
      const outsideEvent = data.outsideEvents.get(String(second));
      if (outsideEvent && !outsideEvent.email_sent_at) outsideEvent.cancelled_at = new Date();
    } else if (sql.startsWith("update oos_service_area_state")) {
      expect(sql).toContain("state_key_version = $8");
      expect(sql).not.toMatch(/is_outside|current_event_id/);
      data.state = encryptedState(params);
    } else if (sql.startsWith("select u.email")) {
      expect(data.depth).toBe(1);
      expect(sql).toContain("for share of u");
      expect(sql).toContain("u.account_status = 'active' and u.email_verified_at is not null");
      expect(sql).toContain("p.display_name is not null and p.year_of_birth is not null");
      return { rows: eligible() && id === member ? [{ email: data.email, code_of_conduct_accepted_version: data.version }] : [] };
    } else if (sql.includes("set claim_token")) {
      if (!event || event.user_id !== second || !pending(event) || event.claimed_until > Date.now()) return { rows: [] };
      event.claim_token = third; event.claimed_until = Date.now() + 300_000;
      return { rows: [{ ...event }] };
    } else if (sql.includes("set email_started_at")) {
      if (!event || event.claim_token !== second) return { rows: [] };
      event.email_started_at ??= new Date(); Object.assign(event, encryptedPayload(params, 2));
      expect(eventPayload(event).emailTo).toBeTruthy();
    } else if (sql.includes("set reconciliation_required_at")) {
      if (event && event.claim_token === second) event.reconciliation_required_at = new Date();
    } else if (sql.startsWith("select event_id::text")) {
      expect(sql).toContain("for update");
      return { rows: event && event.user_id === second && event.claim_token === third
        && event.claimed_until > Date.now() && pending(event) ? [{ ...event }] : [] };
    } else if (sql.includes("set email_sent_at")) {
      if (data.failRecordOnce) { data.failRecordOnce = false; throw new Error("synthetic record failure"); }
      if (event && event.claim_token === second) {
        event.email_sent_at = new Date(); Object.assign(event, encryptedPayload(params, 2));
        expect(eventPayload(event).emailTo).toBeNull();
        expect(eventPayload(event).providerMessageId).toBe("synthetic-provider");
      }
    } else if (sql.startsWith("update service_area_email_outbox set claimed_until")) {
      if (event && event.claim_token === second) event.claimed_until = Date.now();
    } else if (sql.startsWith("with sweep_candidates")) {
      expect(sql).not.toContain("oos_service_area_state");
      expect(sql).toContain("for update of w skip locked");
      expect(sql).toContain("p.display_name is not null and p.year_of_birth is not null");
      if (!eligible() || id && id !== member) return { rows: [] };
      const rows = allEvents().filter(e => pending(e) && e.claimed_until <= Date.now())
        .sort((a, b) => (a.claimed_until || a.queued_at) - (b.claimed_until || b.queued_at)).slice(0, 200);
      for (const row of rows) row.claimed_until = Date.now();
      return { rows: rows.map(e => ({ event_id: e.event_id, user_id: e.user_id })) };
    } else { throw new Error("Unexpected Sinners fixture SQL"); }
    return { rows: [] };
  });
  let tail = Promise.resolve();
  const db: DbClient = { query: query as DbClient["query"], end: async () => {},
    async transaction<T>(fn: (client: DbClient) => Promise<T>) {
      const preceding = tail;
      let unlock!: () => void;
      tail = new Promise<void>(resolve => { unlock = resolve; });
      await preceding;
      data.transactions++;
      data.beforeTransaction?.();
      const snapshot = structuredClone({ events: data.events, outsideEvents: data.outsideEvents, state: data.state, version: data.version });
      data.depth++;
      try { return await fn(db); }
      catch (error) { Object.assign(data, snapshot); throw error; }
      finally { data.depth--; unlock(); }
    }
  };
  const log = { warn: vi.fn(), error: vi.fn() };
  const app = { db, config: { ...stateCryptoConfig, RESEND_API_KEY: "synthetic", MAIL_FROM: "synthetic" }, log } as unknown as FastifyInstance;
  const accept = (version = "first-version") => acceptCodeOfConductAndQueueSinnersWelcome(app, member, version);
  const save = (location: typeof inside) => runTransaction(db, tx => queueOutOfSightWelcomeEmail(tx, member, location, app.config));
  const eventId = () => [...data.events.keys()][0]!;
  return { data, db, query, app, log, accept, save, eventId };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-09T12:00:00Z"));
  vi.mocked(sendSinnersWelcomeEmail).mockReset().mockResolvedValue({ accepted: true, providerMessageId: "synthetic-provider" });
  vi.mocked(sendOutOfSightWelcomeEmail).mockReset().mockResolvedValue({ accepted: true, providerMessageId: "synthetic-provider" });
  vi.mocked(loadLocationEnvelope).mockReset().mockResolvedValue(null);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("External HTTP forbidden"); }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("Sinners first acceptance and physical return events", () => {
  it("keeps main's best-effort GPS dispatch after the location transaction commits", async () => {
    const source = await readFile(new URL("./routes/profiles.ts", import.meta.url), "utf8");
    const start = source.indexOf('app.put("/api/profiles/me/location"');
    const route = source.slice(start, source.indexOf("const policy = await getEffectiveVisibilityPolicy", start));
    const transaction = /await runTransaction\(app\.db, async \(db\) => \{([\s\S]*?)\n      \}\);/.exec(route);
    expect(transaction).not.toBeNull();
    expect(transaction![1]).toContain("await storeLocationEnvelope");
    expect(transaction![1]).toContain("await queueOutOfSightWelcomeEmail");
    expect(transaction![1]).not.toContain("deliverPendingSinnersWelcomeEmailsForUser");
    expect(route.indexOf("void deliverPendingSinnersWelcomeEmailsForUser(app, userId).catch"))
      .toBeGreaterThan(transaction!.index + transaction![0].length);
    expect(route).toContain('app.log.warn("Sinners welcome email delivery deferred")');
  });

  it("queues first acceptance once across repeats, concurrency and later versions", async () => {
    const f = fixture();
    await Promise.all(Array.from({ length: 8 }, () => f.accept()));
    await f.accept("later-version");
    expect(f.data.events.size).toBe(1);
    expect(eventPayload(f.data.events.get(f.eventId())!).kind).toBe("first_coc");
    expect(f.data.version).toBe("later-version");
  });
  it("does not enroll an already-accepted historical member on a later version", async () => {
    const f = fixture(); f.data.version = "historical-version";
    await f.accept("new-version"); expect(f.data.events.size).toBe(0);
  });
  it("does not accept or enqueue for a missing account", async () => {
    const f = fixture(); f.data.exists = false;
    expect((await f.accept()).rows).toEqual([]); expect(f.data.events.size).toBe(0);
  });
  it("does not confuse initial/unchanged inside GPS with a return; repeated fixes dedupe", async () => {
    const f = fixture(); await f.save(inside); await f.save(inside);
    expect(f.data.events.size).toBe(0);
    const prior = await f.save(outside); await f.save(outside);
    await Promise.all([f.save(inside), f.save(inside)]);
    expect(f.data.events.size).toBe(1);
    expect(eventPayload(f.data.events.get(f.eventId())!).providerIdempotencyKey).toBe("sinners-welcome/return/" + prior);
    const insert = f.query.mock.calls.reduce((last, [sql], index) =>
      sql.startsWith("insert into service_area_email_outbox") ? index : last, -1);
    expect(insert).toBeGreaterThanOrEqual(0);
    expect(f.query.mock.calls[insert + 1]?.[0]).toContain("update oos_service_area_state");
  });
  it("retains every genuine return through an outage and a later outside state", async () => {
    const f = fixture(); f.data.version = "accepted";
    f.app.config.RESEND_API_KEY = "";
    await f.save(outside); await f.save(inside); await f.save(outside); await f.save(inside); await f.save(outside);
    expect(f.data.events.size).toBe(2);
    expect(await deliverPendingSinnersWelcomeEmailsForUser(f.app, member)).toBe(0);
    f.app.config.RESEND_API_KEY = "synthetic";
    // The shared scheduler also attempts the latest outside entry, whose absent
    // GPS defers only that email. Neither historical return may be skipped.
    expect(await deliverPendingSinnersWelcomeEmailsForUser(f.app, member)).toBe(3);
    expect(sendSinnersWelcomeEmail).toHaveBeenCalledTimes(2);
    expect(sendOutOfSightWelcomeEmail).not.toHaveBeenCalled();
    expect(new Set(vi.mocked(sendSinnersWelcomeEmail).mock.calls.map(([input]) => input.idempotencyKey)).size).toBe(2);
  });
  it("rolls return insertion back with the GPS transaction and stores no geography", async () => {
    const f = fixture(); await f.save(outside);
    await expect(runTransaction(f.db, async tx => {
      await queueOutOfSightWelcomeEmail(tx, member, inside, f.app.config); throw new Error("synthetic rollback");
    })).rejects.toThrow("synthetic rollback");
    expect(f.data.events.size).toBe(0);
    expect(decryptOosState(f.app.config, member, f.data.state!).is_outside).toBe(true);
    await f.save(inside);
    const inserts = f.query.mock.calls.filter(([sql]) => sql.startsWith("insert into service_area_email_outbox"));
    expect(JSON.stringify(inserts)).not.toMatch(/40\.7128|-74\.006|34\.0522|-118\.2437/);
  });
  it("deduplicates direct return retries by the prior outside event, not the member", async () => {
    const f = fixture();
    for (const prior of ["prior-a", "prior-a", "prior-b"]) await runTransaction(f.db, tx => queueSinnersReturnWelcomeEmail(tx, f.app.config, member, prior));
    expect(f.data.events.size).toBe(2);
  });
});

describe("Sinners durable delivery", () => {
  it("claims once under concurrent workers and never resends a completed event", async () => {
    const f = fixture(); await f.accept();
    const results = await Promise.all(Array.from({ length: 8 }, () => deliverSinnersWelcomeEmail(f.app, member, f.eventId())));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(sendSinnersWelcomeEmail).toHaveBeenCalledOnce();
    expect(eventPayload(f.data.events.get(f.eventId())!).emailTo).toBeNull();
    expect(await deliverSinnersWelcomeEmail(f.app, member, f.eventId())).toBe(false);
  });
  it("commits attempt metadata then holds the account lock through send; keeps key/recipient after ambiguous failure", async () => {
    const f = fixture(); await f.accept();
    const beforeDelivery = f.data.transactions;
    vi.mocked(sendSinnersWelcomeEmail).mockImplementationOnce(async () => {
      expect(f.data.transactions).toBe(beforeDelivery + 2); expect(f.data.depth).toBe(1);
      expect(f.data.events.get(f.eventId())?.email_started_at).toBeInstanceOf(Date);
      throw new Error("synthetic ambiguity");
    });
    await expect(deliverSinnersWelcomeEmail(f.app, member, f.eventId())).rejects.toThrow("synthetic ambiguity");
    f.data.email = "changed@example.invalid";
    expect(await deliverSinnersWelcomeEmail(f.app, member, f.eventId())).toBe(true);
    expect(vi.mocked(sendSinnersWelcomeEmail).mock.calls.map(([input]) => [input.email, input.idempotencyKey]))
      .toEqual(Array(2).fill(["first@example.invalid", "sinners-welcome/first-coc/" + member]));
  });
  it("retains committed attempt metadata after provider success but failed DB recording", async () => {
    const f = fixture(); await f.accept(); f.data.failRecordOnce = true;
    await expect(deliverSinnersWelcomeEmail(f.app, member, f.eventId())).rejects.toThrow("synthetic record failure");
    const first = { ...f.data.events.get(f.eventId())! };
    expect(first.email_sent_at).toBeNull(); expect(eventPayload(first).emailTo).toBe("first@example.invalid");
    expect(await deliverSinnersWelcomeEmail(f.app, member, f.eventId())).toBe(true);
    expect(vi.mocked(sendSinnersWelcomeEmail).mock.calls.map(([input]) => input.idempotencyKey))
      .toEqual([eventPayload(first).providerIdempotencyKey, eventPayload(first).providerIdempotencyKey]);
  });
  it.each(["exists", "active", "verified", "complete"] as const)("defers when %s is false without losing pending history", async field => {
    const f = fixture(); await f.accept(); f.data[field] = false;
    expect(await sendPendingSinnersWelcomeEmails(f.app)).toBe(0);
    expect(await deliverSinnersWelcomeEmail(f.app, member, f.eventId())).toBe(false);
    expect(sendSinnersWelcomeEmail).not.toHaveBeenCalled(); expect(f.data.events.size).toBe(1);
  });
  it.each(["exists", "active", "verified", "complete"] as const)("revalidates %s after the claim commits", async field => {
    const f = fixture(); await f.accept();
    const beforeSend = f.data.transactions + 2;
    f.data.beforeTransaction = () => { if (f.data.transactions === beforeSend) f.data[field] = false; };
    expect(await deliverSinnersWelcomeEmail(f.app, member, f.eventId())).toBe(false);
    expect(sendSinnersWelcomeEmail).not.toHaveBeenCalled();
  });
  it("requires accepted CoC before sending a queued return", async () => {
    const f = fixture(); await f.save(outside); await f.save(inside);
    expect(await sendPendingSinnersWelcomeEmails(f.app)).toBe(1);
    expect(sendSinnersWelcomeEmail).not.toHaveBeenCalled();
    await f.accept(); expect(await sendPendingSinnersWelcomeEmails(f.app)).toBe(2);
  });
  it("rejects another member's event and a deleted claimed event", async () => {
    const f = fixture(); await f.accept();
    expect(await deliverSinnersWelcomeEmail(f.app, "other-member", f.eventId())).toBe(false);
    const id = f.eventId();
    const beforeSend = f.data.transactions + 2;
    f.data.beforeTransaction = () => { if (f.data.transactions === beforeSend) f.data.events.clear(); };
    expect(await deliverSinnersWelcomeEmail(f.app, member, id)).toBe(false);
    expect(sendSinnersWelcomeEmail).not.toHaveBeenCalled();
  });
  it("will not steal an unexpired lease and can recover an expired one", async () => {
    const f = fixture(); await f.accept();
    f.data.events.get(f.eventId())!.claimed_until = Date.now() + 1000;
    expect(await deliverSinnersWelcomeEmail(f.app, member, f.eventId())).toBe(false);
    vi.setSystemTime(Date.now() + 1001);
    expect(await deliverSinnersWelcomeEmail(f.app, member, f.eventId())).toBe(true);
  });
  it("stops ambiguous retries at 23 hours and rechecks the cutoff after waiting for a lock", async () => {
    const f = fixture(); await f.accept();
    vi.mocked(sendSinnersWelcomeEmail).mockRejectedValueOnce(new Error("synthetic ambiguity"));
    await expect(deliverSinnersWelcomeEmail(f.app, member, f.eventId())).rejects.toThrow();
    vi.setSystemTime(Date.now() + 23 * 60 * 60 * 1000 - 1);
    const beforeSend = f.data.transactions + 2;
    f.data.beforeTransaction = () => { if (f.data.transactions === beforeSend) vi.setSystemTime(Date.now() + 1); };
    expect(await deliverSinnersWelcomeEmail(f.app, member, f.eventId())).toBe(false);
    expect(f.data.events.get(f.eventId())?.reconciliation_required_at).toBeInstanceOf(Date);
    expect(sendSinnersWelcomeEmail).toHaveBeenCalledOnce();
    expect(await sendPendingSinnersWelcomeEmails(f.app)).toBe(0);
  });
  it("does not mark a provider non-acceptance sent", async () => {
    const f = fixture(); await f.accept();
    vi.mocked(sendSinnersWelcomeEmail).mockResolvedValueOnce({ accepted: false, providerMessageId: null });
    expect(await deliverSinnersWelcomeEmail(f.app, member, f.eventId())).toBe(false);
    expect(await deliverSinnersWelcomeEmail(f.app, member, f.eventId())).toBe(true);
  });
  it("rotates a full failing batch so later return events are not starved", async () => {
    const f = fixture(); f.data.version = "accepted";
    for (let i = 0; i < 201; i++) await runTransaction(f.db, tx => queueSinnersReturnWelcomeEmail(tx, f.app.config, member, String(i)));
    vi.setSystemTime(Date.now() + 1000);
    vi.mocked(sendSinnersWelcomeEmail).mockRejectedValue(new Error("private recipient/provider detail"));
    expect(await sendPendingSinnersWelcomeEmails(f.app)).toBe(200);
    expect([...f.data.events.values()].filter(e => e.email_started_at)).toHaveLength(200);
    vi.setSystemTime(Date.now() + 1000);
    await sendPendingSinnersWelcomeEmails(f.app);
    expect([...f.data.events.values()].filter(e => e.email_started_at)).toHaveLength(201);
    expect(JSON.stringify(f.log.warn.mock.calls)).not.toContain("private recipient");
  });
  it("does no provider or DB work without credentials", async () => {
    const f = fixture(); f.app.config.RESEND_API_KEY = "";
    expect(await sendPendingSinnersWelcomeEmails(f.app)).toBe(0);
    expect(await deliverSinnersWelcomeEmail(f.app, member, "unused")).toBe(false);
    expect(f.query).not.toHaveBeenCalled();
  });
  it("registers and stops its scheduler without changing the Purgatory lifecycle", async () => {
    vi.useFakeTimers();
    const f = fixture(); f.app.config.RESEND_API_KEY = "";
    const stop = startSinnersWelcomeEmailScheduler(f.app, 1000);
    expect(vi.getTimerCount()).toBe(1); await vi.advanceTimersByTimeAsync(1000);
    stop(); expect(vi.getTimerCount()).toBe(0);
    const source = await readFile(new URL("./index.ts", import.meta.url), "utf8");
    expect(source).toContain("stopSinnersWelcomeEmailScheduler = startSinnersWelcomeEmailScheduler(app)");
    expect(source).toContain("stopSinnersWelcomeEmailScheduler?.()");
    expect(source).toContain("stopOutOfSightWelcomeEmailScheduler = startOutOfSightWelcomeEmailScheduler(app)");
  });
  it("shares one nonoverlapping sweep between both legacy scheduler wrappers", async () => {
    vi.useFakeTimers();
    const f = fixture();
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    f.query.mockImplementationOnce(async (sql) => {
      expect(sql).toContain("with sweep_candidates");
      await pending;
      return { rows: [] };
    });
    const stopOutside = startOutOfSightWelcomeEmailScheduler(f.app, 1000);
    const stopSinners = startSinnersWelcomeEmailScheduler(f.app, 1000);
    try {
      expect(vi.getTimerCount()).toBe(1);
      expect(f.query).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(3000);
      expect(f.query).toHaveBeenCalledOnce(); // A held sweep must not overlap itself.
      stopOutside();
      expect(vi.getTimerCount()).toBe(1);
      release();
      await vi.advanceTimersByTimeAsync(1000);
      expect(f.query).toHaveBeenCalledTimes(2);
      expect(sendOutOfSightWelcomeEmail).not.toHaveBeenCalled();
      expect(sendSinnersWelcomeEmail).not.toHaveBeenCalled();
    } finally {
      release(); stopSinners();
    }
    expect(vi.getTimerCount()).toBe(0);
  });
});
