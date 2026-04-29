import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "./app.js";

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
  MAIL_FROM: ""
}, {
  db: {
    query,
    end
  }
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  query.mockReset();
  end.mockClear();
});

describe("server", () => {
  const userId = "d271f6da-c51d-4d73-a322-d9c56f45d4fa";

  it("returns metadata from /api/meta", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/meta"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      service: "cruush-server",
      auth: "session-cookie-with-dev-x-user-id-fallback",
      storage: "postgres",
      migratedFromSupabase: true
    });
  });

  it("creates a session cookie on POST /api/auth/signup", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          id: userId,
          email: "river@example.com",
          display_name: "River",
          email_verified_at: null,
          created_at: "2026-04-28T12:00:00.000Z"
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: "session-1",
          user_id: userId,
          expires_at: "2026-05-28T12:00:00.000Z",
          created_at: "2026-04-28T12:00:00.000Z"
        }]
      });

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/signup",
      payload: {
        email: "river@example.com",
        password: "password-123",
        displayName: "River"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(query.mock.calls[0]?.[0]).toContain("insert into app_users");
    expect(query.mock.calls[1]?.[0]).toContain("insert into app_sessions");
    expect(response.headers["set-cookie"]).toContain("cruush_session=");
    expect(response.headers["set-cookie"]).toContain("HttpOnly");
    expect(response.headers["set-cookie"]).toContain("SameSite=Lax");
    expect(response.json()).toEqual({
      data: {
        user: {
          id: userId,
          email: "river@example.com",
          displayName: "River",
          emailVerifiedAt: null,
          createdAt: "2026-04-28T12:00:00.000Z"
        },
        profile: null,
        needsOnboarding: true
      }
    });
  });

  it("returns the current session from GET /api/auth/me", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          user_id: userId
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: userId,
          email: "river@example.com",
          app_display_name: "River",
          email_verified_at: null,
          created_at: "2026-04-28T12:00:00.000Z",
          profile_display_name: "River",
          year_of_birth: 1998
        }]
      });

    const response = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      cookies: {
        cruush_session: "test-session-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls[0]?.[0]).toContain("from app_sessions s");
    expect(response.json()).toEqual({
      data: {
        user: {
          id: userId,
          email: "river@example.com",
          displayName: "River",
          emailVerifiedAt: null,
          createdAt: "2026-04-28T12:00:00.000Z"
        },
        profile: {
          displayName: "River",
          yearOfBirth: 1998
        },
        needsOnboarding: false
      }
    });
  });

  it("creates a verification token on POST /api/auth/verification/send", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          user_id: userId
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: userId,
          email: "river@example.com",
          display_name: "River",
          email_verified_at: null
        }]
      })
      .mockResolvedValueOnce({
        rows: []
      })
      .mockResolvedValueOnce({
        rows: [{
          expires_at: "2026-04-30T12:00:00.000Z"
        }]
      });

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/verification/send",
      cookies: {
        cruush_session: "test-session-token"
      }
    });

    expect(response.statusCode).toBe(202);
    expect(query.mock.calls[2]?.[0]).toContain("delete from email_verification_tokens");
    expect(query.mock.calls[3]?.[0]).toContain("insert into email_verification_tokens");
    expect(response.json()).toEqual({
      data: {
        alreadyVerified: false,
        expiresAt: "2026-04-30T12:00:00.000Z",
        previewUrl: expect.stringContaining("https://cruush.test/verify-email?token=")
      }
    });
  });

  it("verifies an email token on POST /api/auth/verification/verify", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          user_id: userId
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: userId,
          email: "river@example.com",
          display_name: "River",
          email_verified_at: "2026-04-29T12:05:00.000Z",
          created_at: "2026-04-28T12:00:00.000Z"
        }]
      })
      .mockResolvedValueOnce({
        rows: []
      })
      .mockResolvedValueOnce({
        rows: [{
          id: userId,
          email: "river@example.com",
          app_display_name: "River",
          email_verified_at: "2026-04-29T12:05:00.000Z",
          created_at: "2026-04-28T12:00:00.000Z",
          profile_display_name: "River",
          year_of_birth: 1998
        }]
      });

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/verification/verify",
      payload: {
        token: "verification-token-1234567890"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls[0]?.[0]).toContain("from email_verification_tokens");
    expect(query.mock.calls[1]?.[0]).toContain("update app_users");
    expect(query.mock.calls[2]?.[0]).toContain("delete from email_verification_tokens");
    expect(response.json()).toEqual({
      data: {
        user: {
          id: userId,
          email: "river@example.com",
          displayName: "River",
          emailVerifiedAt: "2026-04-29T12:05:00.000Z",
          createdAt: "2026-04-28T12:00:00.000Z"
        },
        profile: {
          displayName: "River",
          yearOfBirth: 1998
        },
        needsOnboarding: false,
        verified: true
      }
    });
  });

  it("returns conversations from GET /api/conversations", async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: "conv-1",
        kind: "dm",
        title: null,
        tags: ["Hosting", "Now"],
        updated_at: "2026-04-29T12:00:00.000Z",
        last_message: "hosting for another hour",
        unread_count: 2,
        pinned: true,
        muted: false,
        other_user_id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
        other_user_name: "Alex",
        other_user_pronouns: ["they/them"],
        other_user_photo: "https://example.com/alex.jpg",
        member_count: 2
      }]
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/conversations",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls[0]?.[0]).toContain("from conversation_members cm");
    expect(response.json()).toEqual({
      data: [{
        id: "conv-1",
        kind: "dm",
        user: {
          id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
          name: "Alex",
          pronouns: "they/them",
          photo: "https://example.com/alex.jpg"
        },
        distance: "Nearby",
        updatedAt: "2026-04-29T12:00:00.000Z",
        lastMessage: "hosting for another hour",
        unreadCount: 2,
        pinned: true,
        muted: false,
        mutual: false,
        membersLabel: undefined,
        tags: ["Hosting", "Now"]
      }]
    });
  });

  it("opens or creates a dm conversation on POST /api/conversations/dm", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97"
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: "conv-1"
        }]
      })
      .mockResolvedValueOnce({
        rows: []
      })
      .mockResolvedValueOnce({
        rows: [{
          id: "conv-1",
          kind: "dm",
          title: null,
          tags: [],
          updated_at: "2026-04-29T12:00:00.000Z",
          last_message: "",
          unread_count: 0,
          pinned: false,
          muted: false,
          other_user_id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
          other_user_name: "Alex",
          other_user_pronouns: ["they/them"],
          other_user_photo: "https://example.com/alex.jpg",
          member_count: 2
        }]
      });

    const response = await app.inject({
      method: "POST",
      url: "/api/conversations/dm",
      headers: {
        "x-user-id": userId
      },
      payload: {
        otherUserId: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(query.mock.calls[1]?.[0]).toContain("insert into conversations");
    expect(query.mock.calls[2]?.[0]).toContain("insert into conversation_members");
    expect(response.json()).toEqual({
      data: {
        id: "conv-1",
        kind: "dm",
        user: {
          id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
          name: "Alex",
          pronouns: "they/them",
          photo: "https://example.com/alex.jpg"
        },
        distance: "Nearby",
        updatedAt: "2026-04-29T12:00:00.000Z",
        lastMessage: "",
        unreadCount: 0,
        pinned: false,
        muted: false,
        mutual: false,
        membersLabel: undefined,
        tags: []
      }
    });
  });

  it("returns a conversation and its messages from GET /api/messages/:conversationId", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          id: "conv-1",
          kind: "dm",
          title: null,
          tags: ["Hosting"],
          updated_at: "2026-04-29T12:00:00.000Z",
          pinned: false,
          muted: false,
          other_user_id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
          other_user_name: "Alex",
          other_user_pronouns: ["they/them"],
          other_user_photo: "https://example.com/alex.jpg",
          member_count: 2
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: "msg-1",
          user_id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
          content: "you around now?",
          created_at: "2026-04-29T12:05:00.000Z"
        }, {
          id: "msg-2",
          user_id: userId,
          content: "yeah nearby",
          created_at: "2026-04-29T12:06:00.000Z"
        }]
      });

    const response = await app.inject({
      method: "GET",
      url: "/api/messages/conv-1",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls[0]?.[0]).toContain("join conversations c");
    expect(query.mock.calls[1]?.[0]).toContain("from messages m");
    expect(response.json()).toEqual({
      data: {
        conversation: {
          id: "conv-1",
          kind: "dm",
          user: {
            id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
            name: "Alex",
            pronouns: "they/them",
            photo: "https://example.com/alex.jpg"
          },
          distance: "Nearby",
          updatedAt: "2026-04-29T12:00:00.000Z",
          lastMessage: "",
          unreadCount: 0,
          pinned: false,
          muted: false,
          mutual: false,
          membersLabel: undefined,
          tags: ["Hosting"]
        },
        messages: [{
          id: "msg-1",
          userId: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
          content: "you around now?",
          timestamp: "2026-04-29T12:05:00.000Z"
        }, {
          id: "msg-2",
          userId: userId,
          content: "yeah nearby",
          timestamp: "2026-04-29T12:06:00.000Z"
        }]
      }
    });
  });

  it("creates a message on POST /api/messages", async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: "msg-3",
        user_id: userId,
        content: "on my way",
        created_at: "2026-04-29T12:10:00.000Z"
      }]
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/messages",
      headers: {
        "x-user-id": userId
      },
      payload: {
        conversationId: "conv-1",
        content: "on my way"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(query.mock.calls[0]?.[0]).toContain("insert into messages");
    expect(response.json()).toEqual({
      data: {
        id: "msg-3",
        userId: userId,
        content: "on my way",
        timestamp: "2026-04-29T12:10:00.000Z"
      }
    });
  });

  it("returns nearby users from GET /api/users", async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
        display_name: "Alex",
        year_of_birth: 1998,
        pronouns: ["they/them"],
        looking_for: ["Fun"],
        vibes: ["Chill"],
        photos: ["https://example.com/alex.jpg"],
        updated_at: "2026-04-28T12:00:00.000Z"
      }]
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/users?lat=40.7128&lng=-74.006",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain("from profiles");
    expect(query.mock.calls[0]?.[1]).toBeUndefined();

    const body = response.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data[0]).toMatchObject({
      id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
      name: "Alex",
      display_name: "Alex",
      pronouns: "they/them",
      lookingFor: ["Fun"],
      vibes: ["Chill"],
      photo: "https://example.com/alex.jpg"
    });
    expect(body.data[0].distance).toMatch(/ mi$/);
    expect(body.data[0].lastActive).toMatch(/ago$/);
  });

  it("falls back to the legacy profile schema on GET /api/users", async () => {
    query
      .mockRejectedValueOnce({
        code: "42703",
        message: 'column "year_of_birth" does not exist'
      })
      .mockResolvedValueOnce({
        rows: [{
          id: "27",
          display_name: "Jordan",
          age: 29,
          pronouns: "they/them",
          looking_for: ["Fun", "Dates"],
          legacy_vibe_tags: ["Goth"],
          primary_photo_url: "https://example.com/jordan.jpg",
          last_active: "2026-04-28T12:00:00.000Z",
          lat: 40.71,
          lng: -74.0,
          fuzzy_lat: 40.7105,
          fuzzy_lng: -74.0005
        }]
      });

    const response = await app.inject({
      method: "GET",
      url: "/api/users?lat=40.7128&lng=-74.006",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1]?.[0]).toContain("tribes as legacy_vibe_tags");

    expect(response.json()).toEqual({
      data: expect.arrayContaining([
        expect.objectContaining({
          id: "27",
          name: "Jordan",
          display_name: "Jordan",
          age: 29,
          pronouns: "they/them",
          lookingFor: ["Fun", "Dates"],
          vibes: ["Goth"],
          photo: "https://example.com/jordan.jpg"
        })
      ])
    });
  });

  it("requires the temporary x-user-id header on GET /api/posts", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/posts"
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: {
        code: "AUTH_REQUIRED",
        message: "Authentication required.",
        details: expect.any(Object)
      }
    });
  });

  it("returns the local feed from GET /api/posts", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          user_id: userId
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: "post-1",
          user_id: userId,
          content: "Looking now",
          expires_in: "6h",
          expires_at: "2026-04-28T18:00:00.000Z",
          created_at: "2026-04-28T12:00:00.000Z",
          display_name: "Cruusher",
          pronouns: ["they/them"],
          photos: ["https://example.com/photo.jpg"]
        }]
      });

    const response = await app.inject({
      method: "GET",
      url: "/api/posts",
      cookies: {
        cruush_session: "test-session-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls[0]?.[0]).toContain("from app_sessions s");
    expect(query.mock.calls[1]?.[0]).toContain("from posts p");
    expect(response.json()).toEqual({
      data: [{
        id: "post-1",
        content: "Looking now",
        expiresIn: "6h",
        expiresAt: "2026-04-28T18:00:00.000Z",
        createdAt: "2026-04-28T12:00:00.000Z",
        distance: "Nearby",
        user: {
          id: userId,
          name: "Cruusher",
          pronouns: "they/them",
          photo: "https://example.com/photo.jpg"
        }
      }]
    });
  });

  it("validates the payload on POST /api/posts", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/posts",
      headers: {
        "x-user-id": userId
      },
      payload: {
        content: "",
        expiresIn: "2h"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: expect.any(Object)
      }
    });
  });

  it("creates a post on POST /api/posts", async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: "post-2",
        user_id: userId,
        content: "Hosting tonight",
        expires_in: "1h",
        expires_at: "2026-04-28T13:00:00.000Z",
        created_at: "2026-04-28T12:10:00.000Z",
        display_name: "Cruusher",
        pronouns: ["they/them"],
        photos: []
      }]
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/posts",
      headers: {
        "x-user-id": userId
      },
      payload: {
        content: "Hosting tonight",
        expiresIn: "1h"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain("insert into posts");
    expect(query.mock.calls[0]?.[1]).toEqual([userId, "Hosting tonight", "1h"]);
    expect(response.json()).toEqual({
      data: {
        id: "post-2",
        content: "Hosting tonight",
        expiresIn: "1h",
        expiresAt: "2026-04-28T13:00:00.000Z",
        createdAt: "2026-04-28T12:10:00.000Z",
        distance: "Nearby",
        user: {
          id: userId,
          name: "Cruusher",
          pronouns: "they/them",
          photo: null
        }
      }
    });
  });

  it("forbids reading another user's cruush activity", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/cruush/53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: {
        code: "FORBIDDEN",
        message: "You can only access your own cruush activity.",
        details: null
      }
    });
  });

  it("returns cruush activity from GET /api/cruush/:userId", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          id: "cruush-1",
          from_user_id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
          to_user_id: userId,
          created_at: "2026-04-28T12:00:00.000Z",
          mutual: true,
          display_name: "Alex",
          pronouns: ["they/them"],
          photos: ["https://example.com/alex.jpg"]
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: "cruush-2",
          from_user_id: userId,
          to_user_id: "user1",
          created_at: "2026-04-28T12:05:00.000Z",
          mutual: false,
          profile_user_id: null,
          display_name: null,
          pronouns: null,
          photos: null,
          to_user_name: "Jordan",
          to_user_pronouns: "they/them",
          to_user_photo: null
        }]
      });

    const response = await app.inject({
      method: "GET",
      url: `/api/cruush/${userId}`,
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]?.[0]).toContain("from cruushes c");
    expect(query.mock.calls[1]?.[0]).toContain("left join profiles target");
    expect(response.json()).toEqual({
      data: {
        received: [{
          id: "cruush-1",
          fromUserId: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
          toUserId: userId,
          createdAt: "2026-04-28T12:00:00.000Z",
          mutual: true,
          user: {
            id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
            name: "Alex",
            pronouns: "they/them",
            photo: "https://example.com/alex.jpg"
          }
        }],
        sent: [{
          id: "cruush-2",
          fromUserId: userId,
          toUserId: "user1",
          createdAt: "2026-04-28T12:05:00.000Z",
          mutual: false,
          user: {
            id: "user1",
            name: "Jordan",
            pronouns: "they/them",
            photo: null
          }
        }]
      }
    });
  });

  it("creates or updates a cruush on POST /api/cruush", async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: "cruush-3",
        from_user_id: userId,
        to_user_id: "user1",
        created_at: "2026-04-28T12:10:00.000Z",
        mutual: false
      }]
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/cruush",
      headers: {
        "x-user-id": userId
      },
      payload: {
        toUserId: "user1",
        targetUser: {
          name: "Jordan",
          pronouns: "they/them",
          photo: null
        }
      }
    });

    expect(response.statusCode).toBe(201);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain("insert into cruushes");
    expect(query.mock.calls[0]?.[1]).toEqual([userId, "user1", "Jordan", "they/them", null]);
    expect(response.json()).toEqual({
      data: {
        id: "cruush-3",
        fromUserId: userId,
        toUserId: "user1",
        createdAt: "2026-04-28T12:10:00.000Z",
        mutual: false
      }
    });
  });

  it("requires the temporary x-user-id header on GET /api/profiles/me", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/profiles/me"
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: {
        code: "AUTH_REQUIRED",
        message: "Authentication required.",
        details: expect.any(Object)
      }
    });
  });

  it("rejects invalid auth headers on GET /api/profiles/me", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/profiles/me",
      headers: {
        "x-user-id": "not-a-uuid"
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: {
        code: "AUTH_REQUIRED",
        message: "Authentication required.",
        details: expect.any(Object)
      }
    });
  });

  it("returns the authenticated profile on GET /api/profiles/me", async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: userId,
        display_name: "Cruusher",
        photos: [],
        bio: "Hello",
        pronouns: ["they/them"],
        custom_pronouns: "",
        year_of_birth: 1994,
        ethnicity: ["Latinx"],
        identities: ["Non-binary"],
        presentation: ["Femme"],
        sexuality: ["Queer"],
        body_type: ["Athletic"],
        height: "5'8\"",
        weight: "155 lbs",
        position: ["Vers"],
        availability: ["Tonight"],
        hosting_travel: ["Hosting"],
        kinks: ["Leather"],
        vibes: ["Playful"],
        hobbies: ["Hiking"],
        custom_hobby: "",
        looking_for: ["Dates"],
        hiv_status: ["Negative"],
        custom_hiv_status: "",
        condoms: ["Always"],
        custom_condoms: "",
        prep: ["Daily"],
        custom_prep: "",
        doxypep: ["Sometimes"],
        custom_doxypep: "",
        covid_vaccine: ["Boosted"],
        custom_covid_vaccine: "",
        mpox_vaccine: ["Vaccinated"],
        custom_mpox_vaccine: "",
        smoking: ["Never"],
        custom_smoking: "",
        drinking: ["Socially"],
        custom_drinking: "",
        drugs: ["No"],
        custom_drugs: "",
        weed: ["Occasionally"],
        custom_weed: "",
        updated_at: "2026-04-28T12:00:00.000Z"
      }]
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/profiles/me",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("from profiles"), [userId]);
    expect(response.json()).toEqual({
      data: {
        id: userId,
        display_name: "Cruusher",
        photos: [],
        bio: "Hello",
        pronouns: ["they/them"],
        custom_pronouns: "",
        year_of_birth: 1994,
        ethnicity: "Latinx",
        identities: ["Non-binary"],
        presentation: ["Femme"],
        sexuality: ["Queer"],
        body_type: ["Athletic"],
        height: "5'8\"",
        weight: "155 lbs",
        position: ["Vers"],
        availability: ["Tonight"],
        hosting_travel: ["Hosting"],
        kinks: ["Leather"],
        vibes: ["Playful"],
        hobbies: ["Hiking"],
        custom_hobby: "",
        looking_for: ["Dates"],
        hiv_status: ["Negative"],
        custom_hiv_status: "",
        condoms: ["Always"],
        custom_condoms: "",
        prep: ["Daily"],
        custom_prep: "",
        doxypep: ["Sometimes"],
        custom_doxypep: "",
        covid_vaccine: ["Boosted"],
        custom_covid_vaccine: "",
        mpox_vaccine: ["Vaccinated"],
        custom_mpox_vaccine: "",
        smoking: ["Never"],
        custom_smoking: "",
        drinking: ["Socially"],
        custom_drinking: "",
        drugs: ["No"],
        custom_drugs: "",
        weed: ["Occasionally"],
        custom_weed: "",
        updated_at: "2026-04-28T12:00:00.000Z"
      }
    });
  });

  it("returns 404 when the profile does not exist", async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const response = await app.inject({
      method: "GET",
      url: "/api/profiles/me",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Profile not found",
        details: null
      }
    });
  });

  it("validates the payload on PUT /api/profiles/me", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/api/profiles/me",
      headers: {
        "x-user-id": userId
      },
      payload: {
        display_name: "A"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: expect.any(Object)
      }
    });
  });

  it("rejects invalid auth headers on PUT /api/profiles/me", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/api/profiles/me",
      headers: {
        "x-user-id": "not-a-uuid"
      },
      payload: {
        display_name: "Cruusher"
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: {
        code: "AUTH_REQUIRED",
        message: "Authentication required.",
        details: expect.any(Object)
      }
    });
  });

  it("rejects unexpected fields on PUT /api/profiles/me", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/api/profiles/me",
      headers: {
        "x-user-id": userId
      },
      payload: {
        display_name: "Cruusher",
        unexpected: "nope"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: expect.any(Object)
      }
    });
  });

  it("upserts the authenticated profile on PUT /api/profiles/me", async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: userId,
        display_name: "Cruusher",
        photos: [],
        bio: "Updated bio",
        pronouns: ["they/them"],
        custom_pronouns: "",
        year_of_birth: 1994,
        ethnicity: ["Latinx"],
        identities: ["Non-binary"],
        presentation: [],
        sexuality: [],
        body_type: [],
        height: "",
        weight: "",
        position: [],
        availability: [],
        hosting_travel: [],
        kinks: [],
        vibes: ["Playful"],
        hobbies: [],
        custom_hobby: "",
        looking_for: ["Dates"],
        hiv_status: [],
        custom_hiv_status: "",
        condoms: [],
        custom_condoms: "",
        prep: [],
        custom_prep: "",
        doxypep: [],
        custom_doxypep: "",
        covid_vaccine: [],
        custom_covid_vaccine: "",
        mpox_vaccine: [],
        custom_mpox_vaccine: "",
        smoking: [],
        custom_smoking: "",
        drinking: [],
        custom_drinking: "",
        drugs: [],
        custom_drugs: "",
        weed: [],
        custom_weed: "",
        updated_at: "2026-04-28T12:05:00.000Z"
      }]
    });

    const payload = {
      display_name: "Cruusher",
      photos: [],
      bio: "Updated bio",
      pronouns: ["they/them"],
      custom_pronouns: "",
      year_of_birth: 1994,
      ethnicity: "Latinx",
      identities: ["Non-binary"],
      presentation: [],
      sexuality: [],
      body_type: [],
      height: "",
      weight: "",
      position: [],
      availability: [],
      hosting_travel: [],
      kinks: [],
      vibes: ["Playful"],
      hobbies: [],
      custom_hobby: "",
      looking_for: ["Dates"],
      hiv_status: [],
      custom_hiv_status: "",
      condoms: [],
      custom_condoms: "",
      prep: [],
      custom_prep: "",
      doxypep: [],
      custom_doxypep: "",
      covid_vaccine: [],
      custom_covid_vaccine: "",
      mpox_vaccine: [],
      custom_mpox_vaccine: "",
      smoking: [],
      custom_smoking: "",
      drinking: [],
      custom_drinking: "",
      drugs: [],
      custom_drugs: "",
      weed: [],
      custom_weed: ""
    };

    const response = await app.inject({
      method: "PUT",
      url: "/api/profiles/me",
      headers: {
        "x-user-id": userId
      },
      payload
    });

    expect(response.statusCode).toBe(200);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain("insert into profiles");
    expect(query.mock.calls[0]?.[1]?.[0]).toBe(userId);
    expect(query.mock.calls[0]?.[1]?.[7]).toEqual(["Latinx"]);
    expect(query.mock.calls[0]?.[0]).not.toContain("updated_at)");
    expect(response.json()).toEqual({
      data: {
        id: userId,
        ...payload,
        updated_at: "2026-04-28T12:05:00.000Z"
      }
    });
  });

  it("returns a consistent 500 payload for unexpected errors", async () => {
    query.mockRejectedValueOnce(new Error("db unavailable"));

    const response = await app.inject({
      method: "GET",
      url: "/api/profiles/me",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal server error",
        details: null
      }
    });
  });
});
