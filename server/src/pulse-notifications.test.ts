import { describe, expect, it, vi } from "vitest";
import {
  PULSE_NOTIFICATION_PER_RECIPIENT_COOLDOWN_MS,
  PULSE_NOTIFICATION_PER_SENDER_COOLDOWN_MS,
  PULSE_NOTIFICATION_RECIPIENT_LIMIT
} from "./pulse-notifications.js";

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
});
