import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { createGroupPulse } from "./map-pings.js";
import { loadLocationEnvelopes, type LocationPayload } from "./location-privacy.js";
import { loadTravelPins, TRAVEL_PIN_LIFETIME_MS, type TravelPin } from "./travel-pins.js";
import { notifyGroupPulseRecipients } from "./pulse-notifications.js";
import { getSideQuestPingBalance } from "./side-quests.js";

vi.mock("./location-privacy.js", async (original) => ({
  ...await original<typeof import("./location-privacy.js")>(), loadLocationEnvelopes: vi.fn()
}));
vi.mock("./travel-pins.js", async (original) => ({
  ...await original<typeof import("./travel-pins.js")>(), loadTravelPins: vi.fn()
}));
vi.mock("./pulse-notifications.js", () => ({ notifyGroupPulseRecipients: vi.fn(), notifyPulseRecipients: vi.fn() }));
vi.mock("./side-quests.js", () => ({ getSideQuestPingBalance: vi.fn() }));

const userId = "11111111-1111-4111-8111-111111111111";
const conversationId = "22222222-2222-4222-8222-222222222222";
const idempotencyKey = "33333333-3333-4333-8333-333333333333";
const now = new Date("2026-10-09T12:00:00Z");
const input = { userId, conversationId, idempotencyKey };
const getEntitlement = vi.fn();

function appForGroup(roleAllowed = true, onAccountLock?: () => void, travelPinSetAt?: string) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("from app_users")) {
      onAccountLock?.();
      return { rows: [{ id: userId }] };
    }
    if (sql.includes("from user_travel_pins")) return { rows: travelPinSetAt ? [{
      user_id: userId, latitude: 40.7128, longitude: -74.006, label: "", set_at: travelPinSetAt
    }] : [] };
    if (sql.includes("select conversation.title")) return { rows: roleAllowed ? [{ title: "Existing group or Club" }] : [] };
    if (sql.includes("insert into group_pulses")) return { rows: [{
      id: "44444444-4444-4444-8444-444444444444", conversation_id: conversationId,
      sender_user_id: userId, created_at: now.toISOString()
    }] };
    return { rows: [] };
  });
  return { config: {}, db: { query }, log: { warn: vi.fn() } } as unknown as FastifyInstance;
}

function setLocation(outside: boolean, mhc = false) {
  vi.mocked(loadLocationEnvelopes).mockResolvedValue(new Map([[userId, {
    latE7: outside ? 423601000 : 407128000, lonE7: outside ? -710589000 : -740060000,
    collectedAtMs: now.getTime(), expiresAtMs: now.getTime() + 60_000
  } as LocationPayload]]));
  vi.mocked(loadTravelPins).mockResolvedValue(mhc ? new Map([[userId, {
    latitude: 40.7128, longitude: -74.006, setAtMs: now.getTime(), expiresAtMs: now.getTime() + 60_000
  } as TravelPin]]) : new Map());
}

beforeEach(() => {
  vi.resetAllMocks();
  getEntitlement.mockResolvedValue({ tier: "basic" });
  vi.mocked(getSideQuestPingBalance).mockResolvedValue(0);
  vi.mocked(notifyGroupPulseRecipients).mockResolvedValue({ notified: 0 });
  vi.mocked(loadLocationEnvelopes).mockResolvedValue(new Map());
  vi.mocked(loadTravelPins).mockResolvedValue(new Map());
});

describe("group and Club Pulse effective-area gate with MHC exception", () => {
  it.each(["outside", "unknown", "unavailable"])("rejects %s before quota, credits or insertion", async (scenario) => {
    if (scenario === "outside") setLocation(true);
    if (scenario === "unavailable") vi.mocked(loadLocationEnvelopes).mockRejectedValue(new Error("Unavailable"));
    const app = appForGroup();
    await expect(createGroupPulse(app, input, { now: () => now, getEntitlement })).rejects.toMatchObject({
      statusCode: 403, code: "FEATURE_RESTRICTED"
    });
    expect(app.db.query).not.toHaveBeenCalled();
    expect(getEntitlement).not.toHaveBeenCalled();
    expect(getSideQuestPingBalance).not.toHaveBeenCalled();
    expect(notifyGroupPulseRecipients).not.toHaveBeenCalled();
  });

  it.each([false, true])("permits an eligible admin with in-area MHC %s", async (mhc) => {
    setLocation(mhc, mhc);
    const app = appForGroup();
    await createGroupPulse(app, input, { now: () => now, getEntitlement });
    expect(vi.mocked(app.db.query).mock.calls.filter(([sql]) => sql.includes("insert into group_pulses"))).toHaveLength(1);
    expect(notifyGroupPulseRecipients).toHaveBeenCalledOnce();
  });

  it("rejects when GPS changes from inside to outside before the account lock", async () => {
    setLocation(false);
    const app = appForGroup(true, () => setLocation(true));

    await expect(createGroupPulse(app, input, { now: () => now, getEntitlement })).rejects.toMatchObject({
      statusCode: 403, code: "FEATURE_RESTRICTED"
    });
    expect(loadLocationEnvelopes).toHaveBeenCalledTimes(2);
    expect(getSideQuestPingBalance).not.toHaveBeenCalled();
    expect(vi.mocked(app.db.query).mock.calls.some(([sql]) => sql.includes("insert into group_pulses"))).toBe(false);
    expect(notifyGroupPulseRecipients).not.toHaveBeenCalled();
  });

  it.each(["expires", "is revoked"])("rejects when an in-area MHC pin %s before the account lock", async () => {
    setLocation(true, true);
    const app = appForGroup(true, () => vi.mocked(loadTravelPins).mockResolvedValue(new Map()));

    await expect(createGroupPulse(app, input, { now: () => now, getEntitlement })).rejects.toMatchObject({
      statusCode: 403, code: "FEATURE_RESTRICTED"
    });
    expect(loadTravelPins).toHaveBeenCalledTimes(2);
    expect(getSideQuestPingBalance).not.toHaveBeenCalled();
    expect(vi.mocked(app.db.query).mock.calls.some(([sql]) => sql.includes("insert into group_pulses"))).toBe(false);
    expect(notifyGroupPulseRecipients).not.toHaveBeenCalled();
  });

  it.each(["while waiting for the account lock", "before the final insert check"])(
    "rejects a genuinely expired MHC pin %s despite a transaction-start SQL timestamp",
    async (timing) => {
      const actualLoadTravelPins = (await vi.importActual<typeof import("./travel-pins.js")>("./travel-pins.js")).loadTravelPins;
      vi.useFakeTimers();
      vi.setSystemTime(now);
      try {
        setLocation(true);
        vi.mocked(loadTravelPins).mockImplementation(actualLoadTravelPins);
        const setAt = new Date(now.getTime() - TRAVEL_PIN_LIFETIME_MS + 1).toISOString();
        const app = appForGroup(true,
          timing === "while waiting for the account lock" ? () => vi.setSystemTime(now.getTime() + 1) : undefined,
          setAt
        );
        if (timing === "before the final insert check") {
          vi.mocked(getSideQuestPingBalance).mockImplementationOnce(async () => {
            vi.setSystemTime(now.getTime() + 1);
            return 0;
          });
        }

        await expect(createGroupPulse(app, input, { now: () => now, getEntitlement })).rejects.toMatchObject({
          statusCode: 403, code: "FEATURE_RESTRICTED"
        });
        expect(vi.mocked(app.db.query).mock.calls.some(([sql]) => sql.includes("insert into group_pulses"))).toBe(false);
        expect(getSideQuestPingBalance).toHaveBeenCalledTimes(timing === "before the final insert check" ? 1 : 0);
        expect(notifyGroupPulseRecipients).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    }
  );

  it("preserves group-admin authorization for eligible members", async () => {
    setLocation(false);
    const app = appForGroup(false);
    await expect(createGroupPulse(app, input, { now: () => now, getEntitlement })).rejects.toMatchObject({
      statusCode: 403, code: "FORBIDDEN"
    });
    expect(getSideQuestPingBalance).not.toHaveBeenCalled();
    expect(notifyGroupPulseRecipients).not.toHaveBeenCalled();
  });
});
