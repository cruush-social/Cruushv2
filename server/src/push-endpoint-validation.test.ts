import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { pushSubscriptionPayloadSchema } from "./routes/notifications.js";

const VALID_KEYS = { p256dh: "BNc-key", auth: "auth-secret" };

function parseEndpoint(endpoint: string) {
  return pushSubscriptionPayloadSchema.safeParse({ endpoint, keys: VALID_KEYS });
}

describe("push subscription endpoint validation", () => {
  it("accepts real push service endpoints", () => {
    const endpoints = [
      "https://fcm.googleapis.com/fcm/send/abc123",
      "https://web.push.apple.com/QRSTUV",
      "https://updates.push.services.mozilla.com/wpush/v2/gAAAA"
    ];

    for (const endpoint of endpoints) {
      expect(parseEndpoint(endpoint).success, endpoint).toBe(true);
    }
  });

  // The server dereferences this URL when delivering a push, so an unrestricted
  // endpoint is a server-side request forgery primitive.
  it("rejects endpoints that would make the server reach internal hosts", () => {
    const endpoints = [
      "https://localhost/steal",
      "https://127.0.0.1/steal",
      "https://169.254.169.254/latest/meta-data/",
      "https://metadata.google.internal/computeMetadata/v1/",
      "https://10.0.0.5/internal",
      "https://192.168.1.1/router",
      "https://172.16.0.1/internal",
      "https://[::1]/loopback",
      "https://coolify.local/dashboard"
    ];

    for (const endpoint of endpoints) {
      expect(parseEndpoint(endpoint).success, endpoint).toBe(false);
    }
  });

  it("rejects non-HTTPS and credential-bearing endpoints", () => {
    const endpoints = [
      "http://push.example.com/send",
      "javascript:alert(1)",
      "file:///etc/passwd",
      "https://user:password@push.example.com/send"
    ];

    for (const endpoint of endpoints) {
      expect(parseEndpoint(endpoint).success, endpoint).toBe(false);
    }
  });

  // Guards against the regression that caused this class of bug: a strict
  // validator being swapped for a permissive one during a merge.
  it("keeps the strict validator wired into the notifications route", () => {
    const source = readFileSync(new URL("./routes/notifications.ts", import.meta.url), "utf8");

    expect(source).toContain("publicHttpsUrlSchema");
    expect(source).not.toMatch(/endpoint:\s*z\.string\(\)\.url\(\)/);
    expect(source).not.toMatch(/endpoint:\s*z\.url\(\)/);
  });
});
