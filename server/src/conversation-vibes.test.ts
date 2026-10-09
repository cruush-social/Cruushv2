import { describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { mapConversationRow } from "./routes/messages.js";

/**
 * A message card shows the same vibes a Cruushes card does. The query reads
 * vibes, scenes and archetypes as one set; this covers the mapper carrying
 * them into the payload the card reads.
 */
describe("conversation vibes", () => {
  const app = {
    config: {},
    log: { warn: () => undefined }
  } as unknown as FastifyInstance;

  function row(overrides: Record<string, unknown> = {}) {
    return {
      id: "conversation-1",
      kind: "dm",
      title: null,
      other_user_id: "user-2",
      other_user_name: "Kat",
      other_user_pronouns: ["they/them"],
      other_user_photo: null,
      other_user_photo_explicit: false,
      other_user_side_badges: null,
      other_user_vibes: ["Adventurous", "Stoner", "Direct", "Extra"],
      other_user_travelling: false,
      updated_at: new Date("2026-09-04T12:00:00.000Z"),
      unread_count: 0,
      pinned: false,
      muted: false,
      tags: [],
      member_count: 2,
      ...overrides
    } as never;
  }

  it("carries the first three vibes onto a direct message card", () => {
    const mapped = mapConversationRow(app, row(), {}) as { user: { vibes?: string[] } };

    expect(mapped.user.vibes).toEqual(["Adventurous", "Stoner", "Direct"]);
  });

  it("omits vibes for a group, which has no single member to describe", () => {
    const mapped = mapConversationRow(app, row({ kind: "group", title: "Crew" }), {}) as {
      user: { vibes?: string[] };
    };

    expect(mapped.user.vibes).toBeUndefined();
  });

  it("omits vibes when the member has none rather than sending an empty row", () => {
    const mapped = mapConversationRow(app, row({ other_user_vibes: [] }), {}) as {
      user: { vibes?: string[] };
    };

    expect(mapped.user.vibes).toBeUndefined();
  });
});
