import { describe, expect, it, vi } from "vitest";
import type { DbClient } from "./db.js";
import type { OosStateCryptoConfig } from "./oos-state-crypto.js";
import {
  decryptServiceAreaEmailPayload,
  encryptServiceAreaEmailPayload,
  queueServiceAreaEmail,
  serviceAreaEmailDedupeToken,
  type EncryptedServiceAreaEmailPayload,
  type ServiceAreaEmailKind,
  type ServiceAreaEmailOutboxRow,
  type ServiceAreaEmailPayload
} from "./service-area-email-outbox.js";

const config = {
  SESSION_SECRET: "synthetic-outbox-session-only",
  LOCATION_ENCRYPTION_KEY: Buffer.alloc(32, 0x61).toString("base64"),
  LOCATION_ENCRYPTION_KEY_VERSION: "v1",
  LOCATION_ENCRYPTION_KEY_PREVIOUS: undefined
} satisfies OosStateCryptoConfig;
const userId = "10000000-0000-4000-8000-000000000001";
const otherUserId = "10000000-0000-4000-8000-000000000002";
const eventId = "20000000-0000-4000-8000-000000000001";
const otherEventId = "20000000-0000-4000-8000-000000000002";
const priorOutsideEventId = "30000000-0000-4000-8000-000000000001";
const kinds: ServiceAreaEmailKind[] = ["outside_entry", "first_coc", "service_return"];

function payload(kind: ServiceAreaEmailKind = "outside_entry"): ServiceAreaEmailPayload {
  return {
    kind,
    priorOutsideEventId: kind === "service_return" ? priorOutsideEventId : null,
    providerIdempotencyKey: kind === "outside_entry" ? "oos-welcome/" + eventId
      : kind === "first_coc" ? "sinners-welcome/first-coc/" + userId
        : "sinners-welcome/return/" + priorOutsideEventId,
    emailTo: null,
    providerMessageId: null
  };
}

function row(value = payload(), cryptoConfig: OosStateCryptoConfig = config): ServiceAreaEmailOutboxRow {
  return { user_id: userId, event_id: eventId, email_started_at: null,
    ...encryptServiceAreaEmailPayload(cryptoConfig, userId, eventId, value) };
}

function flipBit(encoded: string) {
  const bytes = Buffer.from(encoded, "base64");
  bytes[0] ^= 1;
  return bytes.toString("base64");
}

describe("service-area outbox payload encryption", () => {
  it.each(kinds)("roundtrips %s without plaintext kind, prior event, recipient or provider metadata", kind => {
    const value = { ...payload(kind), emailTo: "frozen-recipient@example.invalid", providerMessageId: "synthetic-provider-receipt" };
    const encrypted = encryptServiceAreaEmailPayload(config, userId, eventId, value);
    expect(decryptServiceAreaEmailPayload(config, {
      user_id: userId, event_id: eventId, email_started_at: "2026-10-09T12:00:00Z", ...encrypted
    })).toEqual(value);
    expect(Object.keys(encrypted).sort()).toEqual([
      "payload_auth_tag", "payload_ciphertext", "payload_dek_auth_tag", "payload_dek_nonce",
      "payload_key_version", "payload_nonce", "wrapped_payload_dek"
    ]);
    const stored = JSON.stringify(encrypted);
    for (const privateValue of [kind, value.providerIdempotencyKey, value.emailTo, value.providerMessageId,
      userId, eventId, ...(value.priorOutsideEventId ? [value.priorOutsideEventId] : [])]) {
      expect(stored).not.toContain(privateValue);
    }
  });

  it("keeps all event kinds and recipient/receipt lifecycle stages exactly the same ciphertext length", () => {
    const lengths = [];
    for (const kind of kinds) {
      for (const lifecycle of [
        { emailTo: null, providerMessageId: null },
        { emailTo: "frozen-recipient@example.invalid", providerMessageId: null },
        { emailTo: null, providerMessageId: "synthetic-provider-receipt" },
        { emailTo: "a".repeat(320), providerMessageId: "p".repeat(512) }
      ]) {
        const value = { ...payload(kind), ...lifecycle };
        const encrypted = row(value);
        expect(decryptServiceAreaEmailPayload(config, encrypted)).toEqual(value);
        lengths.push({
          ciphertext: Buffer.from(encrypted.payload_ciphertext, "base64").length,
          nonce: Buffer.from(encrypted.payload_nonce, "base64").length,
          tag: Buffer.from(encrypted.payload_auth_tag, "base64").length,
          wrappedKey: Buffer.from(encrypted.wrapped_payload_dek, "base64").length,
          wrapNonce: Buffer.from(encrypted.payload_dek_nonce, "base64").length,
          wrapTag: Buffer.from(encrypted.payload_dek_auth_tag, "base64").length
        });
      }
    }
    expect(lengths).toHaveLength(12);
    for (const length of lengths) expect(length).toEqual({
      ciphertext: 2048, nonce: 12, tag: 16, wrappedKey: 32, wrapNonce: 12, wrapTag: 16
    });
  });

  it("uses independent random payload keys and nonces even for an identical event and payload", () => {
    const first = row(); const second = row();
    for (const field of ["payload_ciphertext", "payload_nonce", "wrapped_payload_dek", "payload_dek_nonce"] as const) {
      expect(first[field]).not.toBe(second[field]);
    }
    expect(decryptServiceAreaEmailPayload(config, first)).toEqual(decryptServiceAreaEmailPayload(config, second));
  });

  it.each([
    { user_id: otherUserId }, { event_id: otherEventId }, { payload_key_version: "v2" }, { payload_key_version: "" }
  ])("rejects changed authenticated row identity/version: %j", changed => {
    expect(() => decryptServiceAreaEmailPayload(config, { ...row(), ...changed })).toThrow();
  });

  it.each([
    "payload_ciphertext", "payload_nonce", "payload_auth_tag", "wrapped_payload_dek", "payload_dek_nonce", "payload_dek_auth_tag"
  ] as (keyof EncryptedServiceAreaEmailPayload)[])("rejects a bit changed in %s", field => {
    const encrypted = row();
    encrypted[field] = flipBit(encrypted[field]);
    expect(() => decryptServiceAreaEmailPayload(config, encrypted)).toThrow();
  });

  it("rejects a complete ciphertext copied from another member or event", () => {
    for (const [sourceUser, sourceEvent] of [[otherUserId, eventId], [userId, otherEventId]]) {
      const encrypted = encryptServiceAreaEmailPayload(config, sourceUser, sourceEvent, payload());
      expect(() => decryptServiceAreaEmailPayload(config, {
        user_id: userId, event_id: eventId, email_started_at: null, ...encrypted
      })).toThrow();
    }
  });

  it("reads old payloads through the existing previous-key convention without changing runtime configuration", () => {
    const original = row();
    const nextConfig = { ...config, LOCATION_ENCRYPTION_KEY: Buffer.alloc(32, 0x62).toString("base64"),
      LOCATION_ENCRYPTION_KEY_VERSION: "v2", LOCATION_ENCRYPTION_KEY_PREVIOUS: config.LOCATION_ENCRYPTION_KEY };
    expect(decryptServiceAreaEmailPayload(nextConfig, original)).toEqual(payload());
    const recent = row(payload("service_return"), nextConfig);
    expect(recent.payload_key_version).toBe("v2");
    expect(decryptServiceAreaEmailPayload(nextConfig, recent)).toEqual(payload("service_return"));
    expect(() => decryptServiceAreaEmailPayload({ ...nextConfig, LOCATION_ENCRYPTION_KEY_PREVIOUS: undefined }, original)).toThrow();
    expect(() => decryptServiceAreaEmailPayload(config, recent)).toThrow();
  });

  it("rejects a wrong wrapping secret and does not fall back to the session secret", () => {
    expect(() => decryptServiceAreaEmailPayload({ ...config, LOCATION_ENCRYPTION_KEY: "wrong-synthetic-key" }, row())).toThrow();
  });

  it.each([
    { kind: "unknown" }, { kind: "service_return", priorOutsideEventId: null },
    { kind: "first_coc", priorOutsideEventId }, { providerIdempotencyKey: "" },
    { providerIdempotencyKey: "a".repeat(257) }, { emailTo: "" }, { emailTo: "a".repeat(321) },
    { providerMessageId: "a".repeat(513) }
  ])("refuses invalid payload fields before encryption: %j", changed => {
    expect(() => row({ ...payload(), ...changed } as ServiceAreaEmailPayload)).toThrow("Invalid service-area email payload.");
  });

  it("enforces the fixed byte budget for multibyte JSON rather than truncating private metadata", () => {
    expect(() => row({ ...payload(), providerMessageId: "界".repeat(512), emailTo: "界".repeat(320) }))
      .toThrow("Invalid service-area email payload.");
  });
});

describe("opaque service-area outbox dedupe and persistence", () => {
  it("uses a stable keyed 64-hex token separated by user, kind and event identity", () => {
    const token = serviceAreaEmailDedupeToken(config, userId, "outside_entry", eventId);
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(token).toBe(serviceAreaEmailDedupeToken(config, userId, "outside_entry", eventId));
    for (const distinct of [
      serviceAreaEmailDedupeToken(config, otherUserId, "outside_entry", eventId),
      serviceAreaEmailDedupeToken(config, userId, "service_return", eventId),
      serviceAreaEmailDedupeToken(config, userId, "outside_entry", otherEventId),
      serviceAreaEmailDedupeToken({ ...config, LOCATION_ENCRYPTION_KEY: "another-synthetic-key" }, userId, "outside_entry", eventId)
    ]) expect(distinct).not.toBe(token);
  });

  it.each(kinds)("queues %s only into generic encrypted columns and retains the exact legacy provider key inside ciphertext", async kind => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const db = { query, end: async () => {} } as DbClient;
    const value = payload(kind);
    await queueServiceAreaEmail(db, config, { eventId, userId, kind,
      priorOutsideEventId: value.priorOutsideEventId, providerIdempotencyKey: value.providerIdempotencyKey });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain("from service_area_email_outbox where user_id = $1");
    expect(query.mock.calls[0][1]).toEqual([userId]);
    const [sql, params] = query.mock.calls[1] as [string, string[]];
    expect(sql).toContain("insert into service_area_email_outbox");
    expect(sql).toContain("on conflict (dedupe_token) do nothing");
    expect(sql).not.toMatch(/oos_welcome_emails|sinners_welcome_emails|event_kind|idempotency_key|email_to|prior_outside_event_id|provider_message_id/);
    expect(params).toHaveLength(10); expect(params.slice(0, 2)).toEqual([eventId, userId]);
    expect(params[2]).toBe(serviceAreaEmailDedupeToken(config, userId, kind,
      kind === "first_coc" ? userId : kind === "service_return" ? priorOutsideEventId : eventId));
    expect(params).not.toContain(kind); expect(params).not.toContain(value.providerIdempotencyKey);
    if (kind === "service_return") expect(params).not.toContain(priorOutsideEventId);
    expect(decryptServiceAreaEmailPayload(config, {
      event_id: params[0], user_id: params[1], email_started_at: null,
      payload_ciphertext: params[3], payload_nonce: params[4], payload_auth_tag: params[5],
      wrapped_payload_dek: params[6], payload_dek_nonce: params[7], payload_dek_auth_tag: params[8], payload_key_version: params[9]
    })).toEqual(value);
    expect(Buffer.from(params[3], "base64")).toHaveLength(2048);
  });

  it.each(["first_coc", "service_return"] as ServiceAreaEmailKind[])("keeps %s retry dedupe stable across freshly generated row IDs", async kind => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const db = { query, end: async () => {} } as DbClient;
    const value = payload(kind);
    for (const id of [eventId, otherEventId]) await queueServiceAreaEmail(db, config, { eventId: id, userId, kind,
      priorOutsideEventId: value.priorOutsideEventId, providerIdempotencyKey: value.providerIdempotencyKey });
    const inserts = query.mock.calls.filter(([sql]) => sql.startsWith("insert into service_area_email_outbox"));
    expect(query).toHaveBeenCalledTimes(4); expect(inserts).toHaveLength(2);
    expect(inserts[0][1][2]).toBe(inserts[1][1][2]);
    expect(inserts[0][1][3]).not.toBe(inserts[1][1][3]);
  });

  it("gives later genuine outside entries and returns distinct dedupe tokens", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const db = { query, end: async () => {} } as DbClient;
    for (const id of [eventId, otherEventId]) {
      await queueServiceAreaEmail(db, config, { eventId: id, userId, kind: "outside_entry", providerIdempotencyKey: "oos-welcome/" + id });
      await queueServiceAreaEmail(db, config, { eventId: id, userId, kind: "service_return", priorOutsideEventId: id,
        providerIdempotencyKey: "sinners-welcome/return/" + id });
    }
    const inserts = query.mock.calls.filter(([sql]) => sql.startsWith("insert into service_area_email_outbox"));
    expect(query).toHaveBeenCalledTimes(8); expect(inserts).toHaveLength(4);
    expect(new Set(inserts.map(([, params]) => params[2])).size).toBe(4);
  });

  it.each(kinds)("authenticates prior-key %s history before inserting and preserves its frozen provider request", async kind => {
    const value = { ...payload(kind), emailTo: "frozen@example.invalid", providerMessageId: "prior-provider-receipt" };
    const previous = row(value);
    const original = structuredClone(previous);
    const nextConfig = { ...config, LOCATION_ENCRYPTION_KEY: Buffer.alloc(32, 0x62).toString("base64"),
      LOCATION_ENCRYPTION_KEY_VERSION: "v2", LOCATION_ENCRYPTION_KEY_PREVIOUS: config.LOCATION_ENCRYPTION_KEY };
    const query = vi.fn().mockResolvedValue({ rows: [previous] });
    const db = { query, end: async () => {} } as DbClient;
    await queueServiceAreaEmail(db, nextConfig, { userId, eventId: kind === "outside_entry" ? eventId : otherEventId,
      kind, priorOutsideEventId: value.priorOutsideEventId, providerIdempotencyKey: value.providerIdempotencyKey });
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0][0]).toContain("from service_area_email_outbox where user_id = $1");
    expect(query.mock.calls[0][0]).not.toMatch(/insert|update|email_sent_at is null|cancelled_at is null/);
    expect(previous).toEqual(original);
    expect(decryptServiceAreaEmailPayload(nextConfig, previous)).toEqual(value);
  });

  it("fails closed instead of enqueuing a duplicate when historical ciphertext cannot be read", async () => {
    const previous = row(payload("first_coc"));
    previous.payload_auth_tag = flipBit(previous.payload_auth_tag);
    const query = vi.fn().mockResolvedValue({ rows: [previous] });
    const db = { query, end: async () => {} } as DbClient;
    await expect(queueServiceAreaEmail(db, config, { userId, eventId: otherEventId, kind: "first_coc",
      providerIdempotencyKey: payload("first_coc").providerIdempotencyKey })).rejects.toThrow();
    expect(query).toHaveBeenCalledOnce();
  });
});
