import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { sanitizeProfilePhoto } from "./image-sanitization.js";

async function imageWithMetadata(format: "jpeg" | "png" | "webp") {
  const image = sharp({
    create: {
      width: 3200,
      height: 1600,
      channels: 3,
      background: { r: 80, g: 40, b: 120 }
    }
  }).withMetadata({
    orientation: 6,
    exif: {
      IFD0: {
        Copyright: "private-test-marker"
      }
    }
  });

  return image.toFormat(format).toBuffer();
}

describe("profile photo sanitization", () => {
  it.each([
    ["jpeg", "image/jpeg"],
    ["png", "image/png"],
    ["webp", "image/webp"]
  ] as const)("decodes, autorotates, strips metadata, caps dimensions, and re-encodes %s", async (format, mimeType) => {
    const input = await imageWithMetadata(format);
    const sanitized = await sanitizeProfilePhoto(input, mimeType);
    const metadata = await sharp(sanitized.bytes).metadata();

    expect(sanitized.mimeType).toBe(mimeType);
    expect(sanitized.extension).toBe(format === "jpeg" ? "jpg" : format);
    expect(Math.max(metadata.width ?? 0, metadata.height ?? 0)).toBeLessThanOrEqual(2048);
    expect(metadata.orientation).toBeUndefined();
    expect(metadata.exif).toBeUndefined();
    expect(sanitized.bytes.includes(Buffer.from("private-test-marker"))).toBe(false);
  });

  it("rejects bytes that only imitate an image signature", async () => {
    await expect(sanitizeProfilePhoto(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      "image/png"
    )).rejects.toThrow(/decode/i);
  });
});
