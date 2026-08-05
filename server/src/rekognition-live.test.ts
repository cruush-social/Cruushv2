import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DetectFacesCommand,
  DetectLabelsCommand,
  DetectModerationLabelsCommand,
  RekognitionClient
} from "@aws-sdk/client-rekognition";

// Proves the real AWS credentials and IAM policy actually work, so nobody has
// to upload a photo by hand to find out. Mocked tests cannot catch a missing
// IAM action - that failure only exists against live AWS.
//
// Skips unless credentials are present, so CI and local runs stay green:
//
//   1. put the secret in server/.env (gitignored)
//   2. cd server && npx vitest run src/rekognition-live.test.ts
//
// Or from inside the deployed container, where the env is already set.

// Credentials come from server/.env, which is gitignored. Parsed inline rather
// than adding a dotenv dependency for one test. Real env vars win, so the same
// test runs unchanged inside the deployed container.
function loadLocalEnv() {
  const envPath = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../.env");

  if (!existsSync(envPath)) {
    return;
  }

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);

    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    const value = rawValue.trim().replace(/^["']|["']$/g, "");

    if (value && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadLocalEnv();

const hasCredentials = Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
const region = process.env.PROFILE_PHOTO_REKOGNITION_REGION ?? "us-east-1";

// 1x1 PNG. Rekognition returns no labels for it, which is fine - we are
// checking authorization, not detection quality. An IAM denial throws before
// any result comes back.
const tinyPng = () => Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

function isAuthorizationFailure(error: unknown) {
  const name = (error as { name?: string })?.name ?? "";
  const message = (error as { message?: string })?.message ?? "";
  return /AccessDenied|UnrecognizedClient|InvalidSignature|AuthFailure|ExpiredToken/i.test(`${name} ${message}`);
}

describe.skipIf(!hasCredentials)("live Rekognition authorization", () => {
  const client = new RekognitionClient({ region });
  const Image = { Bytes: tinyPng() };

  it("is authorized for DetectModerationLabels", async () => {
    // The one that classifies nudity. Its absence from the IAM policy is what
    // left DL Mode with nothing to mask.
    try {
      const result = await client.send(new DetectModerationLabelsCommand({ Image, MinConfidence: 50 }));
      expect(result.$metadata.httpStatusCode).toBe(200);
    } catch (error) {
      if (isAuthorizationFailure(error)) {
        throw new Error(
          `Rekognition rejected DetectModerationLabels: ${(error as Error).message}\n` +
          "Add rekognition:DetectModerationLabels to the IAM policy attached to this key."
        );
      }

      throw error;
    }
  });

  it("is authorized for DetectLabels", async () => {
    const result = await client.send(new DetectLabelsCommand({ Image, MinConfidence: 70 }));
    expect(result.$metadata.httpStatusCode).toBe(200);
  });

  it("is authorized for DetectFaces", async () => {
    const result = await client.send(new DetectFacesCommand({ Image, Attributes: ["ALL"] }));
    expect(result.$metadata.httpStatusCode).toBe(200);
  });
});

describe.skipIf(hasCredentials)("live Rekognition authorization (skipped)", () => {
  it("reports why it did not run", () => {
    expect(hasCredentials).toBe(false);
    console.log(
      "Skipped: set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY to verify the live IAM policy."
    );
  });
});
