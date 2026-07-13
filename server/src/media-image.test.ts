import sharp from "sharp";
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
      expect(metadata.width).toBeLessThanOrEqual(variant.type === "thumbnail" ? 320 : 960);
      expect(metadata.height).toBeLessThanOrEqual(variant.type === "thumbnail" ? 400 : 1200);
    }
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
    const display = processed.variants.find((variant) => variant.type === "display");
    const metadata = await sharp(display?.bytes).metadata();

    expect(metadata.orientation).toBeUndefined();
    expect(metadata.exif).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
    expect(metadata.width).toBe(80);
    expect(metadata.height).toBe(120);
  });

  it("rejects malformed, unsupported, and MIME-mismatched files", async () => {
    await expect(processUploadedImage(Buffer.from("not an image"), "image/png")).rejects.toMatchObject({
      code: "VALIDATION_ERROR"
    });
    await expect(processUploadedImage(await image("png"), "image/jpeg")).rejects.toMatchObject({
      code: "VALIDATION_ERROR"
    });

    const gif = await sharp({
      create: {
        width: 10,
        height: 10,
        channels: 3,
        background: { r: 1, g: 2, b: 3 }
      }
    }).gif().toBuffer();
    await expect(processUploadedImage(gif, "image/gif")).rejects.toMatchObject({
      code: "VALIDATION_ERROR"
    });
  });
});
