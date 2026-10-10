import { describe, expect, it, vi } from "vitest";
import { runSiteReminderPass, siteReminderForDate } from "./site-reminders.js";

const userId = "00000000-0000-4000-8000-000000000001";

describe("site reminders", () => {
  it("schedules engagement reminders throughout the week, including affiliate sharing", () => {
    expect(siteReminderForDate(new Date("2026-09-21T12:00:00.000Z"))).toMatchObject({
      kind: "nearby_feed",
      body: "Open Confessional to catch up on posts around you.",
      linkUrl: "/feed"
    });
    expect(siteReminderForDate(new Date("2026-09-22T12:00:00.000Z"))).toMatchObject({
      kind: "pulse",
      body: "Use a Pulse to stand out on the map.",
      linkUrl: "/map"
    });
    expect(siteReminderForDate(new Date("2026-09-23T12:00:00.000Z"))?.kind).toBe("affiliate");
    expect(siteReminderForDate(new Date("2026-09-24T12:00:00.000Z"))).toMatchObject({
      kind: "feed_post",
      body: "Share what you're up for with people nearby.",
      linkUrl: "/feed"
    });
    expect(siteReminderForDate(new Date("2026-09-25T12:00:00.000Z"))?.kind).toBe("weekend");
    expect(siteReminderForDate(new Date("2026-09-26T12:00:00.000Z"))).toBeNull();
  });

  it("only considers active members who allow Site reminders and deduplicates the affiliate reminder", async () => {
    const query = vi.fn(async (sql: string, values?: unknown[]) => {
      if (sql.includes("from profiles profile")) {
        return { rows: [{ user_id: userId }] };
      }
      if (sql.includes("insert into app_notifications")) {
        return {
          rows: [{
            id: "00000000-0000-4000-8000-000000000010",
            user_id: userId,
            type: "site_reminder",
            title: values?.[2],
            body: values?.[3],
            link_url: values?.[4],
            actor_user_id: null,
            conversation_id: null,
            metadata: values?.[8],
            read_at: null,
            created_at: "2026-09-23T12:00:00.000Z"
          }]
        };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const app = {
      config: { WEB_PUSH_ENABLED: false },
      db: { query, end: vi.fn() },
      log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() }
    } as any;

    expect(await runSiteReminderPass(app, new Date("2026-09-23T12:00:00.000Z"))).toBe(1);
    expect(query.mock.calls[0]?.[0]).toContain("coalesce(preferences.site_reminders_enabled, true) = true");
    const insert = query.mock.calls.find(([sql]) => String(sql).includes("insert into app_notifications"));
    expect(insert?.[1]).toEqual(expect.arrayContaining([
      "site_reminder",
      "Share cruush with someone you trust",
      "Your affiliate link is ready in Rewards.",
      "/rewards",
      `site-reminder:affiliate:${userId}:2026-09-23`
    ]));
  });

  it("does no database work on an unscheduled day", async () => {
    const query = vi.fn();
    const app = {
      config: {},
      db: { query, end: vi.fn() },
      log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() }
    } as any;

    expect(await runSiteReminderPass(app, new Date("2026-09-26T12:00:00.000Z"))).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });
});
