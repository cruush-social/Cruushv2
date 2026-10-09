import sharp from "sharp";
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { processUploadedImage } from "./media-image.js";

async function image(format: "jpeg" | "png" | "webp") {
  const pipeline = sharp({
    create: {
      width: 640,
      height: 800,
      channels: 3,
      background: { r: 180, g: 32, b: 100 }
    }
  });

  return pipeline[format]().toBuffer();
}

describe("media image processing", () => {
  it.each([
    ["jpeg", "image/jpeg"],
    ["png", "image/png"],
    ["webp", "image/webp"]
  ] as const)("decodes %s and produces bounded WebP variants", async (format, mimeType) => {
    const processed = await processUploadedImage(await image(format), mimeType);

    expect(processed.detectedMimeType).toBe(mimeType);
    expect(processed.variants.map((variant) => variant.type)).toEqual(["thumbnail", "display"]);

    for (const variant of processed.variants) {
      const metadata = await sharp(variant.bytes).metadata();
      expect(metadata.format).toBe("webp");
      expect(metadata.width).toBeLessThanOrEqual(variant.type === "thumbnail" ? 320 : 1600);
      expect(metadata.height).toBeLessThanOrEqual(variant.type === "thumbnail" ? 400 : 2000);
    }
  });

  it("compresses a camera original above 5 MB before moderation without accepting it as a final upload", async () => {
    const original = await sharp(randomBytes(2048 * 2048 * 3), {
      raw: { width: 2048, height: 2048, channels: 3 }
    }).png().toBuffer();
    expect(original.length).toBeGreaterThan(5_000_000);
    await expect(processUploadedImage(original, "image/png")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const processed = await processUploadedImage(original, "image/png", { cameraOriginal: true });
    expect(processed.canonicalBytes.length).toBeLessThan(5_000_000);
    expect(processed.canonicalMimeType).toBe("image/webp");
    expect((await sharp(processed.canonicalBytes).metadata()).width).toBe(2048);
    expect(processed.variants.every((variant) => variant.bytes.length < 5_000_000)).toBe(true);
  });

  it("normalizes orientation and strips embedded metadata", async () => {
    const source = await sharp({
      create: {
        width: 120,
        height: 80,
        channels: 3,
        background: { r: 1, g: 2, b: 3 }
      }
    }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const processed = await processUploadedImage(source, "image/jpeg");
    expect(processed).toHaveProperty("canonicalBytes");
    const canonicalMetadata = await sharp(processed.canonicalBytes).metadata();
    const display = processed.variants.find((variant) => variant.type === "display");
    const metadata = await sharp(display?.bytes).metadata();

    expect(metadata.orientation).toBeUndefined();
    expect(metadata.exif).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
    expect(metadata.width).toBe(80);
    expect(metadata.height).toBe(120);
    expect(canonicalMetadata.orientation).toBeUndefined();
    expect(canonicalMetadata.exif).toBeUndefined();
    expect(canonicalMetadata.xmp).toBeUndefined();
    expect(Math.max(canonicalMetadata.width ?? 0, canonicalMetadata.height ?? 0)).toBeLessThanOrEqual(2048);
  });

  it("rejects malformed, unsupported, and MIME-mismatched files", async () => {
    await expect(processUploadedImage(Buffer.from("not an image"), "image/png")).rejects.toMatchObject({
      code: "VALIDATION_ERROR"
    });
    await expect(processUploadedImage(await image("png"), "image/jpeg")).rejects.toMatchObject({
      code: "VALIDATION_ERROR"
    });

    // SVG is decodable by this build and stays out on purpose: it carries
    // script, and nobody uploads one from a phone camera.
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
    await expect(processUploadedImage(svg, "image/svg+xml")).rejects.toMatchObject({
      code: "VALIDATION_ERROR"
    });
  });

  it("accepts the labels browsers really put on a JPEG or a PNG", async () => {
    // Photos were rejected as invalid formats because the declared type had to
    // match one exact string. A phone or a browser may say image/jpg for a
    // JPEG, and the bytes are still a perfectly good JPEG.
    const jpeg = await sharp({ create: { width: 40, height: 40, channels: 3, background: "#123456" } })
      .jpeg()
      .toBuffer();

    for (const declared of ["image/jpeg", "image/jpg", "image/pjpeg"]) {
      const processed = await processUploadedImage(jpeg, declared);
      expect(processed.detectedMimeType).toBe("image/jpeg");
    }

    const png = await sharp({ create: { width: 40, height: 40, channels: 3, background: "#123456" } })
      .png()
      .toBuffer();

    for (const declared of ["image/png", "image/x-png"]) {
      const processed = await processUploadedImage(png, declared);
      expect(processed.detectedMimeType).toBe("image/png");
    }
  });

  it("still rejects bytes that are genuinely a different format", async () => {
    const jpeg = await sharp({ create: { width: 40, height: 40, channels: 3, background: "#123456" } })
      .jpeg()
      .toBuffer();

    await expect(processUploadedImage(jpeg, "image/png")).rejects.toThrow(/declared type/);
  });
});
