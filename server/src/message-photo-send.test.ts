import { describe, expect, it, vi } from "vitest";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { ApiError } from "./errors.js";
import { sendApprovedPhotoMessage, type PhotoMessageInput } from "./message-photo-send.js";

const input: PhotoMessageInput = {
  conversationId: "6fe2f8b4-c19b-477e-babb-3887f76cb741",
  senderUserId: "11111111-1111-4111-8111-111111111111",
  mediaObjectId: "22222222-2222-4222-8222-222222222222",
  displayUrl: "/api/media/assets/x/display",
  content: { ciphertext: "c", nonce: "n", authTag: "a", keyVersion: "v1" },
  moderation: {
    provider: "mock+aws_rekognition",
    providerVersion: "test",
    providerRequestId: "req-1",
    labels: [],
    decision: { decision: "allow" },
    rawResult: {},
    photoDnaStatus: "not_configured",
    photoDnaProviderRequestId: null
  },
  isAdultExplicit: false,
  viewOnce: false,
  disappearingTimer: "off",
  restrictedFeature: "direct_messages",
  moderationSurface: "direct_message",
  ownerFullAccess: false
};

type Rows = Record<string, unknown[]>;

function buildApp(overrides: Partial<Rows> = {}) {
  const seen: string[] = [];
  const query = vi.fn(async (sql: string) => {
    seen.push(sql.replace(/\s+/g, " ").trim().slice(0, 60));

    if (sql.includes("closed_at is not null")) {
      return { rows: overrides.conversation ?? [{ closed: false }], rowCount: 1 };
    }
    if (sql.includes("coalesce(t.trust_score, 50) as trust_score")) {
      return {
        rows: overrides.sender ?? [{ account_status: "active", suspended: false, trust_score: 100, suspensions: 0, restrictions: 0 }],
        rowCount: 1
      };
    }
    if (sql.includes("update media_objects") && sql.includes("moderation_status = 'approved'")) {
      return { rows: overrides.approved ?? [{ id: input.mediaObjectId }], rowCount: 1 };
    }
    if (sql.includes("insert into messages")) {
      return { rows: overrides.message ?? [{ id: "msg-1", user_id: input.senderUserId, content: "", created_at: new Date(), expires_at: new Date() }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });

  const db = { query, end: vi.fn(), transaction: async (fn: (c: unknown) => unknown) => fn({ query }) };
  const app = { db } as unknown as FastifyInstance;
  const request = { log: { info: vi.fn(), error: vi.fn() } } as unknown as FastifyRequest;
  return { app, request, query, seen };
}

describe("sending a photo message the classifier approved", () => {
  it("posts it", async () => {
    const { app, request, seen } = buildApp();

    const created = await sendApprovedPhotoMessage(app, request, input);

    expect(created.id).toBe("msg-1");
    expect(seen.some((s) => s.includes("insert into messages"))).toBe(true);
    expect(seen.some((s) => s.includes("insert into message_media_attachments"))).toBe(true);
  });

  it("still posts for an explicit photo, since profiles allow adult nudity", async () => {
    const { app, request } = buildApp();

    const created = await sendApprovedPhotoMessage(app, request, { ...input, isAdultExplicit: true });

    expect(created.id).toBe("msg-1");
  });

  it("blocks a low trust score and says so", async () => {
    const { app, request } = buildApp({
      sender: [{ account_status: "active", suspended: false, trust_score: 5, suspensions: 0, restrictions: 0 }]
    });

    await expect(sendApprovedPhotoMessage(app, request, input)).rejects.toMatchObject({
      statusCode: 403,
      message: expect.stringContaining("trust score")
    });
  });

  it("blocks a suspended account and says so", async () => {
    const { app, request } = buildApp({
      sender: [{ account_status: "active", suspended: true, trust_score: 100, suspensions: 1, restrictions: 0 }]
    });

    await expect(sendApprovedPhotoMessage(app, request, input)).rejects.toMatchObject({
      message: expect.stringContaining("suspended")
    });
  });

  it("blocks a closed conversation and says so, not blaming the account", async () => {
    const { app, request } = buildApp({ conversation: [{ closed: true }] });

    await expect(sendApprovedPhotoMessage(app, request, input)).rejects.toMatchObject({
      message: expect.stringContaining("closed")
    });
  });

  it("says you are not a member rather than 'unavailable for this account'", async () => {
    const { app, request } = buildApp({ conversation: [] });

    const error = await sendApprovedPhotoMessage(app, request, input).catch((e) => e as ApiError);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).not.toContain("unavailable for this account");
    expect((error as ApiError).message).toContain("not a member");
  });

  it("never reports a healthy account as unavailable", async () => {
    // The whole point: an active, trusted sender in an open conversation with an
    // approved photo must not be told their account is the problem.
    const { app, request } = buildApp();

    await expect(sendApprovedPhotoMessage(app, request, input)).resolves.toBeTruthy();
  });
});
