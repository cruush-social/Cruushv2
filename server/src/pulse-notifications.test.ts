import { listEncryptedRelationshipRecordsByParticipant } from "./encrypted-relationships.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  notifyGroupPulseRecipients,
  notifyPulseRecipients,
  PULSE_NOTIFICATION_PER_RECIPIENT_COOLDOWN_MS,
  PULSE_NOTIFICATION_PER_SENDER_COOLDOWN_MS,
  PULSE_NOTIFICATION_RECIPIENT_LIMIT
} from "./pulse-notifications.js";
import { createAppNotification } from "./notification-service.js";
import { getEffectiveVisibilityPolicy, getRelationshipPermissions } from "./match-relationships.js";
import { buildDefaultVisibilityPolicy, loadLocationEnvelopes, resolveViewerGhostCoordinate, type LocationPayload } from "./location-privacy.js";
import { emptyProfile } from "./profile-schema.js";
import { encryptProfileVisibility } from "./profile-sensitive.js";
import { getNotificationPreferences, sendPushForNotification } from "./push-service.js";
import { loadTravelPins, type TravelPin } from "./travel-pins.js";
import { filterOosHiddenNotifications } from "./oos-notification-visibility.js";

vi.mock("./encrypted-relationships.js", async original => ({
  ...await original<typeof import("./encrypted-relationships.js")>(),
  listEncryptedRelationshipRecordsByParticipant: vi.fn()
}));
vi.mock("./notification-service.js", () => ({ createAppNotification: vi.fn() }));
vi.mock("./oos-notification-visibility.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("./oos-notification-visibility.js")>(),
  filterOosHiddenNotifications: vi.fn()
}));
vi.mock("./match-relationships.js", () => ({ getRelationshipPermissions: vi.fn(), getEffectiveVisibilityPolicy: vi.fn() }));
vi.mock("./push-service.js", () => ({
  getNotificationPreferences: vi.fn(),
  isWithinQuietHours: vi.fn().mockReturnValue(false),
  sendPushForNotification: vi.fn()
}));
vi.mock("./location-privacy.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("./location-privacy.js")>(),
  loadLocationEnvelopes: vi.fn(), resolveViewerGhostCoordinate: vi.fn()
}));
vi.mock("./travel-pins.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("./travel-pins.js")>(),
  loadTravelPins: vi.fn()
}));

const senderId = "00000000-0000-4000-8000-000000000001";
const recipientId = "00000000-0000-4000-8000-000000000002";
const config = {
  SESSION_SECRET: "test-only-pulse-oos",
  PROFILE_ENCRYPTION_KEY: "test-only-pulse-profile-key"
} as FastifyInstance["config"];

function oosLocation(outside: boolean): LocationPayload {
  return {
    latE7: outside ? 423601000 : 407128000,
    lonE7: outside ? -710589000 : -740060000
  } as LocationPayload;
}

function pulseApp(senderHides = true, recipientHides = false, unreadableSender = false) {
  const profile = (hide: boolean) => ({
    latitude: 40.7128,
    longitude: -74.006,
    ...encryptProfileVisibility(config, {
      ...emptyProfile.visibility_rules,
      outside_service_area_members: hide
    })
  });
  const senderProfile = profile(senderHides);
  if (unreadableSender) senderProfile.profile_visibility_auth_tag = Buffer.alloc(16).toString("base64");
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("select display_name")) return { rows: [{ display_name: "Test member", ...senderProfile }] };
    if (sql.includes("select profiles.id")) return { rows: [{ user_id: recipientId, ...profile(recipientHides) }] };
    if (sql.includes("from conversation_members")) return { rows: [{ user_id: recipientId, muted: false }] };
    if (sql.includes("insert into map_ping_notifications")) return { rows: [{ id: "claim-1" }] };
    if (sql.includes("from map_ping_notifications")) return { rows: [] };
    throw new Error("Unexpected Pulse test query");
  });
  return { config, db: { query }, log: { warn: vi.fn() } } as unknown as FastifyInstance;
}

beforeEach(() => {
  vi.mocked(listEncryptedRelationshipRecordsByParticipant).mockReset().mockResolvedValue([
    { payload: { actorUserId: senderId, targetUserId: recipientId } }
  ] as never);
  vi.mocked(getEffectiveVisibilityPolicy).mockReset().mockResolvedValue({ baseMode: "PUBLIC_PRECISE" } as never);
  vi.mocked(resolveViewerGhostCoordinate).mockReset().mockResolvedValue({ coordinate: { lat: 40.7128, lng: -74.006 } } as never);
  vi.mocked(createAppNotification).mockReset().mockResolvedValue({ id: "notification-1" } as never);
  vi.mocked(getRelationshipPermissions).mockReset().mockResolvedValue({ isMutualCruush: true } as never);
  vi.mocked(getNotificationPreferences).mockReset().mockResolvedValue(null as never);
  vi.mocked(sendPushForNotification).mockReset().mockResolvedValue(undefined as never);
  vi.mocked(filterOosHiddenNotifications).mockReset().mockImplementation(async (_app, _viewer, rows) => rows);
  vi.mocked(loadLocationEnvelopes).mockReset().mockResolvedValue(new Map([
    [senderId, oosLocation(false)], [recipientId, oosLocation(false)]
  ]));
  vi.mocked(loadTravelPins).mockReset().mockResolvedValue(new Map());
});

/**
 * A Pulse notification interrupts somebody, so the caps around it are the
 * product, not an implementation detail. These pin the numbers that were
 * agreed, because a silent change to any of them turns a cruising app into a
 * broadcast.
 */
describe("pulse notification caps", () => {
  it("reaches at most ten people per Pulse", () => {
    expect(PULSE_NOTIFICATION_RECIPIENT_LIMIT).toBe(10);
  });

  it("never reaches the same person twice from one sender in a day", () => {
    expect(PULSE_NOTIFICATION_PER_SENDER_COOLDOWN_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("never interrupts one person more often than every four hours", () => {
    expect(PULSE_NOTIFICATION_PER_RECIPIENT_COOLDOWN_MS).toBe(4 * 60 * 60 * 1000);
  });

  it("keeps the per-sender window longer than the per-recipient one", () => {
    // If these ever crossed, the daily rule would be the weaker of the two and
    // one person could reach the same phone repeatedly inside a day.
    expect(PULSE_NOTIFICATION_PER_SENDER_COOLDOWN_MS)
      .toBeGreaterThan(PULSE_NOTIFICATION_PER_RECIPIENT_COOLDOWN_MS);
  });
});

describe("pulse notification eligibility", () => {
  it("bases Ghost Pulse delivery on the decoy, not the sender's real position", async () => {
    vi.mocked(getEffectiveVisibilityPolicy).mockResolvedValue(buildDefaultVisibilityPolicy(config, senderId));
    vi.mocked(resolveViewerGhostCoordinate).mockResolvedValue({ coordinate: { lat: 40.9, lng: -74.006 } } as never);
    const app = pulseApp(false, false);
    const result = await notifyPulseRecipients(app, { pingId: "ghost-pulse", senderUserId: senderId, radiusMiles: 1 });
    expect(result.notified).toBe(0);
    expect(resolveViewerGhostCoordinate).toHaveBeenCalled();
    expect(createAppNotification).not.toHaveBeenCalled();
  });

  it("queries only mutual candidates before resolving privacy coordinates", async () => {
    const app = pulseApp(false, false);
    await notifyPulseRecipients(app, { pingId: "mutual-only", senderUserId: senderId, radiusMiles: 5 });
    const query = vi.mocked(app.db.query).mock.calls.find(([sql]) => sql.includes("select profiles.id"));
    expect(query?.[0]).toContain("profiles.id = any($2::uuid[])");
    expect(query?.[1]).toEqual([senderId, [recipientId]]);
  });

  it("keeps an older nearby mutual eligible after the first 500 mutual records", async () => {
    const nearbyId = "00000000-0000-4000-8000-999999999999";
    const records = Array.from({ length: 501 }, (_, index) => ({ payload: {
      actorUserId: senderId,
      targetUserId: index === 500 ? nearbyId : `00000000-0000-4000-8000-${String(index + 100).padStart(12, "0")}`
    } }));
    vi.mocked(listEncryptedRelationshipRecordsByParticipant).mockImplementation(async (_app, input) =>
      records.slice(0, input.limit === null ? undefined : input.limit ?? 500) as never);
    const app = pulseApp(false, false);
    const previous = vi.mocked(app.db.query).getMockImplementation()!;
    vi.mocked(app.db.query).mockImplementation(async (sql, params) => {
      if (sql.includes("select profiles.id")) {
        return { rows: (params?.[1] as string[]).includes(nearbyId)
          ? [{ user_id: nearbyId, latitude: 40.7128, longitude: -74.006 }] : [] } as never;
      }
      return previous(sql, params);
    });
    expect((await notifyPulseRecipients(app, { pingId: "older-mutual", senderUserId: senderId, radiusMiles: 1 })).notified).toBe(1);
  });

  it("stops at the sender when the sender has no position to measure from", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const app = { db: { query }, log: { warn: vi.fn() } } as never;
    const { notifyPulseRecipients } = await import("./pulse-notifications.js");

    const result = await notifyPulseRecipients(app, {
      pingId: "ping-1",
      senderUserId: "11111111-1111-4111-8111-111111111111",
      radiusMiles: 5
    });

    expect(result).toEqual({ notified: 0 });
    // One lookup for the sender, and nothing else: no candidate scan, no
    // relationship checks, no writes.
    expect(query).toHaveBeenCalledTimes(1);
  });

  it.each([
    { scenario: "OOS mutual despite nearby legacy coordinates", location: "outside", pin: false, hide: true, notified: 0 },
    { scenario: "unknown encrypted location", location: "missing", pin: false, hide: true, notified: 0 },
    { scenario: "in-area mutual", location: "inside", pin: false, hide: true, notified: 1 },
    { scenario: "active in-area MHC mutual", location: "outside", pin: true, hide: true, notified: 1 },
    { scenario: "opt-out with unknown location", location: "missing", pin: false, hide: false, notified: 1 }
  ])("checks sender OOS visibility before creating or pushing a Pulse for $scenario", async (testCase) => {
    const locations = new Map([[senderId, oosLocation(false)]]);
    if (testCase.location !== "missing") locations.set(recipientId, oosLocation(testCase.location === "outside"));
    vi.mocked(loadLocationEnvelopes).mockResolvedValue(locations);
    if (testCase.pin) {
      vi.mocked(loadTravelPins).mockResolvedValue(new Map([[recipientId, {
        latitude: 40.7128, longitude: -74.006, setAtMs: 1, expiresAtMs: 2
      } as TravelPin]]));
    }
    const app = pulseApp(testCase.hide);

    expect(await notifyPulseRecipients(app, { pingId: "ping-1", senderUserId: senderId, radiusMiles: 5 }))
      .toEqual({ notified: testCase.notified });
    expect(createAppNotification).toHaveBeenCalledTimes(testCase.notified);
    expect(sendPushForNotification).toHaveBeenCalledTimes(testCase.notified);
    const claims = vi.mocked(app.db.query).mock.calls.filter(([sql]) => sql.includes("insert into map_ping_notifications"));
    expect(claims).toHaveLength(testCase.notified);
  });

  it.each([false, true])("keeps reciprocal OOS matcher behavior with sender MHC exemption %s", async (mileHighClub) => {
    vi.mocked(loadLocationEnvelopes).mockResolvedValue(new Map([
      [senderId, oosLocation(true)], [recipientId, oosLocation(false)]
    ]));
    if (mileHighClub) {
      vi.mocked(loadTravelPins).mockResolvedValue(new Map([[senderId, {
        latitude: 40.7128, longitude: -74.006, setAtMs: 1, expiresAtMs: 2
      } as TravelPin]]));
    }

    expect(await notifyPulseRecipients(pulseApp(false, true), {
      pingId: "ping-1", senderUserId: senderId, radiusMiles: 5
    })).toEqual({ notified: mileHighClub ? 1 : 0 });
    expect(sendPushForNotification).toHaveBeenCalledTimes(mileHighClub ? 1 : 0);
  });

  it.each([
    { scenario: "OOS", location: "outside", pin: false, notified: 0 },
    { scenario: "unknown", location: "missing", pin: false, notified: 0 },
    { scenario: "in-area", location: "inside", pin: false, notified: 1 },
    { scenario: "active in-area MHC", location: "outside", pin: true, notified: 1 }
  ])("checks group Pulse recipient eligibility before claims and delivery: $scenario", async ({ location, pin, notified }) => {
    vi.mocked(loadLocationEnvelopes).mockResolvedValue(location === "missing"
      ? new Map() : new Map([[recipientId, oosLocation(location === "outside")]]));
    if (pin) vi.mocked(loadTravelPins).mockResolvedValue(new Map([[recipientId, {
      latitude: 40.7128, longitude: -74.006, setAtMs: 1, expiresAtMs: 2
    } as TravelPin]]));
    const app = pulseApp();

    expect(await notifyGroupPulseRecipients(app, {
      groupPulseId: "group-pulse-1",
      conversationId: "conversation-1",
      senderUserId: senderId,
      groupTitle: "Existing group"
    })).toEqual({ notified });
    expect(createAppNotification).toHaveBeenCalledTimes(notified);
    expect(sendPushForNotification).toHaveBeenCalledTimes(notified);
    expect(vi.mocked(app.db.query).mock.calls.filter(([sql]) => sql.includes("insert into map_ping_notifications")))
      .toHaveLength(notified);
    // Eligible chat activity stays exempt from the sender's profile-discovery VC.
    expect(filterOosHiddenNotifications).not.toHaveBeenCalled();
    expect(loadLocationEnvelopes).toHaveBeenCalledTimes(notified ? 2 : 1);
  });

  it("rechecks group eligibility after notification creation and before push", async () => {
    vi.mocked(createAppNotification).mockImplementationOnce(async () => {
      vi.mocked(loadLocationEnvelopes).mockResolvedValue(new Map());
      return { id: "notification-1" } as never;
    });
    expect(await notifyGroupPulseRecipients(pulseApp(), {
      groupPulseId: "group-pulse-1", conversationId: "conversation-1", senderUserId: senderId, groupTitle: "Existing group"
    })).toEqual({ notified: 1 });
    expect(createAppNotification).toHaveBeenCalledOnce();
    expect(sendPushForNotification).not.toHaveBeenCalled();
    expect(loadLocationEnvelopes).toHaveBeenCalledTimes(2);
  });

  it("does not claim or deliver group Pulses when encrypted eligibility is unavailable", async () => {
    vi.mocked(loadLocationEnvelopes).mockRejectedValue(new Error("Unavailable"));
    const app = pulseApp();
    expect(await notifyGroupPulseRecipients(app, {
      groupPulseId: "group-pulse-1", conversationId: "conversation-1", senderUserId: senderId, groupTitle: "Existing group"
    })).toEqual({ notified: 0 });
    expect(vi.mocked(app.db.query).mock.calls.some(([sql]) => sql.includes("insert into map_ping_notifications"))).toBe(false);
    expect(createAppNotification).not.toHaveBeenCalled();
    expect(sendPushForNotification).not.toHaveBeenCalled();
  });

  it("rechecks map Pulse visibility immediately before asynchronous push", async () => {
    vi.mocked(filterOosHiddenNotifications).mockResolvedValueOnce([]);

    expect(await notifyPulseRecipients(pulseApp(false), {
      pingId: "ping-1", senderUserId: senderId, radiusMiles: 5
    })).toEqual({ notified: 1 });
    expect(createAppNotification).toHaveBeenCalledOnce();
    expect(filterOosHiddenNotifications).toHaveBeenCalledWith(expect.anything(), recipientId, [{
      type: "pulse", actor_user_id: senderId, conversation_id: null, metadata: { pingId: "ping-1" }
    }]);
    expect(sendPushForNotification).not.toHaveBeenCalled();
  });

  it("does not disclose a Pulse when the encrypted sender visibility policy is unreadable", async () => {
    expect(await notifyPulseRecipients(pulseApp(true, false, true), {
      pingId: "ping-1", senderUserId: senderId, radiusMiles: 5
    })).toEqual({ notified: 0 });
    expect(createAppNotification).not.toHaveBeenCalled();
    expect(sendPushForNotification).not.toHaveBeenCalled();
  });
});
