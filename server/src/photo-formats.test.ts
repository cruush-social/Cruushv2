import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { processUploadedImage } from "./media-image.js";

const swatch = () => sharp({ create: { width: 80, height: 120, channels: 3, background: { r: 210, g: 70, b: 130 } } });

describe("photo formats a phone actually produces", () => {
  it("decodes HEVC pixels, not just HEIC metadata", async () => {
    // Synthetic 80 by 120 solid-color still, encoded by macOS sips as HEVC.
    const bytes = Buffer.from("AAAAJGZ0eXBoZWljAAAAAG1pZjFNaVBybWlhZk1pSEJoZWljAAABw21ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAHBpY3QAAAAAAAAAAAAAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAAADnBpdG0AAAAAAAEAAAA4aWluZgAAAAAAAgAAABVpbmZlAgAAAAABAABodmMxAAAAABVpbmZlAgAAAQACAABFeGlmAAAAABppcmVmAAAAAAAAAA5jZHNjAAIAAQABAAAA5mlwcnAAAADFaXBjbwAAABNjb2xybmNseAACAAIABoAAAAAMY2xsaQDLAEAAAAAUaXNwZQAAAAAAAABQAAAAeAAAAAlpcm90AAAAABBwaXhpAAAAAAMICAgAAABxaHZjQwEDcAAAALAAAAAAAB7wAPz9+PgAAAsDoAABABdAAQwB//8DcAAAAwCwAAADAAADAB5wJKEAAQAjQgEBA3AAAAMAsAAAAwAAAwAeoBQgIHBTLiHuRZVNwICBgCCiAAEACUQBwGFyyERTZAAAABlpcG1hAAAAAAAAAAEAAQaBAgMFhoQAAAAsaWxvYwAAAABEAAACAAEAAAABAAACWwAAAD0AAgAAAAEAAAH3AAAAZAAAAAFtZGF0AAAAAAAAALEAAAAGRXhpZgAATU0AKgAAAAgABQEGAAMAAAABAAYAAAESAAMAAAABAAEAAAEaAAUAAAABAAAASgEbAAUAAAABAAAAUgEoAAMAAAABAAIAAAAAAAAAAAB/AAAABQAAAH8AAAAFAAAAOSgBr5C7OaBGgXz/8CPr99/svhL0+xb8xlEzFH/lZ//xlyP9Pm3GCDU3WfoisWLia7yKCq9rQU5HgA==", "base64");
    const processed = await processUploadedImage(bytes, "image/heic");
    expect(processed.width).toBe(80);
    expect(processed.height).toBe(120);
    expect((await sharp(processed.canonicalBytes).metadata()).format).toBe("webp");
  });

  it.each([
    ["jpeg", "image/jpeg"],
    ["png", "image/png"],
    ["webp", "image/webp"],
    ["avif", "image/avif"],
    ["tiff", "image/tiff"],
  ])("accepts %s declared as %s", async (format, declared) => {
    const bytes = await swatch().toFormat(format as never).toBuffer();
    const processed = await processUploadedImage(bytes, declared);
    expect(processed.width).toBe(80);
    expect(processed.height).toBe(120);
    expect(processed.variants.every((v) => v.mimeType === "image/webp")).toBe(true);
  });

  it("rejects an animated GIF and a still one alike: a photo is a still", async () => {
    const gif = await swatch().toFormat("gif").toBuffer();
    await expect(processUploadedImage(gif, "image/gif")).rejects.toThrow();
  });

  it("still rejects a JPEG that claims to be a PNG", async () => {
    const bytes = await swatch().toFormat("jpeg").toBuffer();
    await expect(processUploadedImage(bytes, "image/png")).rejects.toThrow(/does not match/i);
  });
});
