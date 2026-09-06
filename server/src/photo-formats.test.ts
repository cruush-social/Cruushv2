import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { processUploadedImage } from "./media-image.js";

const swatch = () => sharp({ create: { width: 80, height: 120, channels: 3, background: { r: 210, g: 70, b: 130 } } });

describe("photo formats a phone actually produces", () => {
  it.each([
    ["jpeg", "image/jpeg"],
    ["png", "image/png"],
    ["webp", "image/webp"],
    ["avif", "image/avif"],
    ["gif", "image/gif"],
    ["tiff", "image/tiff"],
  ])("accepts %s declared as %s", async (format, declared) => {
    const bytes = await swatch().toFormat(format as never).toBuffer();
    const processed = await processUploadedImage(bytes, declared);
    expect(processed.width).toBe(80);
    expect(processed.height).toBe(120);
    expect(processed.variants.every((v) => v.mimeType === "image/webp")).toBe(true);
  });

  it("still rejects a JPEG that claims to be a PNG", async () => {
    const bytes = await swatch().toFormat("jpeg").toBuffer();
    await expect(processUploadedImage(bytes, "image/png")).rejects.toThrow(/does not match/i);
  });
});
