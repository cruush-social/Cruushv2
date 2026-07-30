import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "./app.js";
import type { AppConfig } from "./config.js";
import { createMemoryRateLimiter } from "./rate-limit.js";

const userId = "11111111-1111-4111-8111-111111111111";
const eventId = "4c18a3ac-5dbd-48b6-b24f-703fd6fbb11e";
const conversationId = "33333333-3333-4333-8333-333333333333";

const query = vi.fn();
const end = vi.fn().mockResolvedValue(undefined);
const app = buildServer({
  NODE_ENV: "test",
  PORT: 3001,
  HOST: "127.0.0.1",
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/cruush",
  CORS_ORIGIN: "http://localhost:5173",
  SESSION_SECRET: "test-secret",
  APP_URL: "https://cruush.test",
  RESEND_API_KEY: "",
  MAIL_FROM: "",
  EMAIL_PREVIEW_ENABLED: true,
  DEVELOPMENT_ADMIN_ENABLED: false,
  DEVELOPMENT_ADMIN_PASSWORD: "",
  TURNSTILE_SECRET_KEY: "",
  PROFILE_ENCRYPTION_KEY: "",
  PROFILE_TOKEN_KEY: "",
  RELATIONSHIP_ENCRYPTION_KEY: "",
  RELATIONSHIP_INDEX_KEY: "",
  MATCH_TOKEN_ENCRYPTION_KEY: "",
  MATCH_TOKEN_SIGNING_KEY: "",
  HUMAN_MODERATION_ENABLED: true
} as AppConfig, {
  db: {
    query,
    end
  },
  rateLimiter: createMemoryRateLimiter()
});

const eventRow = {
  id: eventId,
  slug: "the-chocolate-factory-launch",
  title: "cruush beta launch",
  venue_name: "The Chocolate Factory",
  address: "70 Scott Ave, Brooklyn, NY 11237",
  latitude: "40.70982",
  longitude: "-73.92256",
  radius_miles: "1",
  starts_at: "2026-07-31T04:00:00.000Z",
  ends_at: "2026-08-01T09:00:00.000Z",
  pin_disappears_at: "2026-08-01T09:00:00.000Z",
  chat_expires_at: "2026-08-08T09:00:00.000Z",
  ra_url: "https://ra.co/events/2483120",
  icon_asset: "party-hat",
  attendee_count: 12,
  joined: false,
  pass_icon_name: null,
  conversation_id: null
};

describe("event routes", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-07-31T22:00:00-04:00"));
    query.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the active Chocolate Factory launch event with map metadata", async () => {
    query
      .mockResolvedValueOnce({ rows: [{ user_id: userId }] })
      .mockResolvedValueOnce({ rows: [eventRow] });

    const response = await app.inject({
      method: "GET",
      url: "/api/events/active",
      cookies: {
        cruush_session: "test-session-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls[1]?.[0]).toContain("from launch_events event");
    expect(response.json()).toEqual({
      data: [{
        id: eventId,
        slug: "the-chocolate-factory-launch",
        title: "cruush beta launch",
        venueName: "The Chocolate Factory",
        address: "70 Scott Ave, Brooklyn, NY 11237",
        coordinates: {
          latitude: 40.70982,
          longitude: -73.92256
        },
        radiusMiles: 1,
        startsAt: "2026-07-31T04:00:00.000Z",
        endsAt: "2026-08-01T09:00:00.000Z",
        pinDisappearsAt: "2026-08-01T09:00:00.000Z",
        chatExpiresAt: "2026-08-08T09:00:00.000Z",
        raUrl: "https://ra.co/events/2483120",
        iconAsset: "party-hat",
        attendeeCount: 12,
        joined: false,
        passIconName: null,
        conversationId: null
      }]
    });
  });

  it("keeps the door pass hidden outside one mile and reveals a stable icon inside one mile", async () => {
    query
      .mockResolvedValueOnce({ rows: [{ user_id: userId }] })
      .mockResolvedValueOnce({ rows: [eventRow] });

    const outside = await app.inject({
      method: "POST",
      url: "/api/events/the-chocolate-factory-launch/reveal-pass",
      cookies: {
        cruush_session: "test-session-token"
      },
      payload: {
        latitude: 40.758,
        longitude: -73.9855
      }
    });

    expect(outside.statusCode).toBe(403);
    expect(outside.json()).toMatchObject({
      error: {
        code: "EVENT_RADIUS_REQUIRED",
        message: "The door password will be revealed when you are within 1 mile of The Chocolate Factory."
      }
    });

    query.mockReset();
    query
      .mockResolvedValueOnce({ rows: [{ user_id: userId }] })
      .mockResolvedValueOnce({ rows: [eventRow] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ icon_name: "map" }] });

    const inside = await app.inject({
      method: "POST",
      url: "/api/events/the-chocolate-factory-launch/reveal-pass",
      cookies: {
        cruush_session: "test-session-token"
      },
      payload: {
        latitude: 40.7099,
        longitude: -73.9226
      }
    });

    expect(inside.statusCode).toBe(200);
    expect(query.mock.calls[3]?.[0]).toContain("insert into event_pass_icons");
    expect(inside.json()).toMatchObject({
      data: {
        iconName: "map",
        withinRadius: true,
        emailAvailable: true
      }
    });
  });

  it("joins the launch party chat as a member without making the attendee an admin", async () => {
    query
      .mockResolvedValueOnce({ rows: [{ user_id: userId }] })
      .mockResolvedValueOnce({ rows: [eventRow] })
      .mockResolvedValueOnce({ rows: [{ conversation_id: conversationId }] })
      .mockResolvedValueOnce({ rows: [eventRow] });

    const response = await app.inject({
      method: "POST",
      url: "/api/events/the-chocolate-factory-launch/join-chat",
      cookies: {
        cruush_session: "test-session-token"
      }
    });

    expect(response.statusCode).toBe(200);
    const joinedSql = query.mock.calls.map(([sql]) => String(sql)).join("\n");
    expect(joinedSql).toContain("insert into event_memberships");
    expect(joinedSql).toContain("insert into conversation_members");
    expect(joinedSql).toContain("'member'");
    expect(joinedSql).not.toContain("'owner' as attendee_role");
    expect(response.json()).toMatchObject({
      data: {
        conversationId,
        joined: true,
        currentUserRole: "member"
      }
    });
  });
});
