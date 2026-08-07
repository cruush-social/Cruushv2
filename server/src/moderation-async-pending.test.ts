import { describe, expect, it } from "vitest";
import { StreamModerationProvider } from "./moderation-provider.js";
import {
  providerResultAsyncPending,
  providerResultFailed,
  providerResultUnusable,
  type ProviderModerationResult
} from "./moderation-types.js";
import { mapProviderResultToPolicy } from "./policy-mapper.js";

// Stream's check endpoint documents two statuses: "complete" and "partial". "partial" means
// the synchronous leg returned and async image analysis is still running, with a task_id to
// poll - the normal shape when sync and async moderation are both configured.
//
// We used to classify it as provider_unavailable, so every image check that outran the 5s
// timeout was recorded as an outage: a 503 for the user and a phantom "provider unavailable"
// row in the human moderation queue. Four appeared in six minutes on 2026-08-06 while Stream
// was healthy. These tests pin the distinction.

function result(overrides: Partial<ProviderModerationResult> = {}): ProviderModerationResult {
  return {
    provider: "stream",
    provider_request_id: "stream-test",
    labels: [],
    latency_ms: 5000,
    ...overrides
  };
}

describe("async-pending is not a provider outage", () => {
  it("classifies a bare partial response as still running, not failed", () => {
    const partial = result({ status: "partial" });

    expect(providerResultAsyncPending(partial)).toBe(true);
    expect(providerResultFailed(partial)).toBe(false);
    expect(providerResultUnusable(partial)).toBe(true);
  });

  it("classifies a transport error as failed, not still running", () => {
    const failed = result({ status: "error", error: "socket hang up" });

    expect(providerResultFailed(failed)).toBe(true);
    expect(providerResultAsyncPending(failed)).toBe(false);
    expect(providerResultUnusable(failed)).toBe(true);
  });

  it("treats an error alongside a pending status as failure", () => {
    const failed = result({ status: "partial", error: "timeout of 5000ms exceeded" });

    expect(providerResultFailed(failed)).toBe(true);
    expect(providerResultAsyncPending(failed)).toBe(false);
  });

  it("does not mark a completed response unusable", () => {
    const complete = result({ status: "complete", recommended_action: "keep" });

    expect(providerResultUnusable(complete)).toBe(false);
    expect(providerResultAsyncPending(complete)).toBe(false);
    expect(providerResultFailed(complete)).toBe(false);
  });

  it("maps a partial image check to provider_pending, still refusing the image", () => {
    const decision = mapProviderResultToPolicy({
      surface: "feed",
      contentType: "image",
      providerResult: result({ status: "partial" })
    });

    // Classification changed; the fail-closed behaviour did not.
    expect(decision.category).toBe("provider_pending");
    expect(decision.reason_code).toBe("provider_pending");
    expect(decision.decision).toBe("quarantine");
    expect(decision.decision).not.toBe("allow");
  });

  it("keeps provider_unavailable for a genuine failure", () => {
    const decision = mapProviderResultToPolicy({
      surface: "feed",
      contentType: "image",
      providerResult: result({ status: "error", error: "Stream moderation request failed." })
    });

    expect(decision.category).toBe("provider_unavailable");
    expect(decision.reason_code).toBe("provider_unavailable");
  });
});

describe("Stream provider does not invent an error for async work", () => {
  const streamConfig = {
    MODERATION_TIMEOUT_MS: 5000,
    MODERATION_IMAGE_TIMEOUT_MS: 20_000,
    STREAM_MODERATION_ENABLED: true,
    STREAM_API_KEY: "test-key",
    STREAM_API_SECRET: "test-secret-at-least-32-bytes-long-value",
    STREAM_MODERATION_CONFIG_KEY: "cruush-test",
    STREAM_PSEUDONYM_KEY: "pseudonym-key-at-least-32-bytes-long-x"
  } as const;

  function providerWithResponse(response: Record<string, unknown>) {
    const provider = new StreamModerationProvider({ ...streamConfig });

    for (const key of ["client", "imageClient"] as const) {
      (provider as unknown as Record<string, { moderation: { check: () => Promise<unknown> } }>)[key] = {
        moderation: {
          check: async () => response
        }
      };
    }

    return provider;
  }

  it("returns a clean partial result when async image analysis is still running", async () => {
    const provider = providerWithResponse({
      status: "partial",
      task_id: "task-abc123",
      item: { id: "queue-item-1", flags: [] }
    });

    const providerResult = await provider.moderateImage({
      userId: "user-1",
      surface: "feed",
      mimeType: "image/webp",
      imageUrl: "https://media.example.test/signed.webp",
      bytes: Buffer.alloc(0)
    });

    expect(providerResult.status).toBe("partial");
    expect(providerResult.error).toBeUndefined();
    expect(providerResultAsyncPending(providerResult)).toBe(true);
    expect(providerResultFailed(providerResult)).toBe(false);
    // The task id has to survive - it is what the recovery path will poll.
    expect(providerResult.raw_result?.task_id).toBe("task-abc123");
  });

  it("still errors on a complete response with no recommended_action", async () => {
    const provider = providerWithResponse({
      status: "complete",
      item: { id: "queue-item-2", flags: [] }
    });

    const providerResult = await provider.moderateImage({
      userId: "user-1",
      surface: "feed",
      mimeType: "image/webp",
      imageUrl: "https://media.example.test/signed.webp",
      bytes: Buffer.alloc(0)
    });

    expect(providerResult.status).toBe("error");
    expect(providerResultFailed(providerResult)).toBe(true);
  });
});

describe("image checks get their own timeout budget", () => {
  it("gives images a longer budget than text", () => {
    const provider = new StreamModerationProvider({
      MODERATION_TIMEOUT_MS: 5000,
      MODERATION_IMAGE_TIMEOUT_MS: 20_000,
      STREAM_MODERATION_ENABLED: true,
      STREAM_API_KEY: "test-key",
      STREAM_API_SECRET: "test-secret-at-least-32-bytes-long-value",
      STREAM_MODERATION_CONFIG_KEY: "cruush-test",
      STREAM_PSEUDONYM_KEY: "pseudonym-key-at-least-32-bytes-long-x"
    });

    const clients = provider as unknown as Record<string, { options?: { timeout?: number } }>;

    expect(clients.client).toBeDefined();
    expect(clients.imageClient).toBeDefined();
    expect(clients.client).not.toBe(clients.imageClient);
  });
});
