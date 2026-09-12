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
    ["gif", "image/gif"],
  ])("accepts %s declared as %s", async (format, declared) => {
    const bytes = await swatch().toFormat(format as never).toBuffer();
    const processed = await processUploadedImage(bytes, declared);
    expect(processed.width).toBe(80);
    expect(processed.height).toBe(120);
    expect(processed.variants.every((v) => v.mimeType === "image/webp")).toBe(true);
  });

  it("rejects an animated GIF instead of silently choosing a frame", async () => {
    const pixels = Buffer.alloc(80 * 240 * 3);
    pixels.fill(255, 80 * 120 * 3);
    const gif = await sharp(pixels, { raw: { width: 80, height: 240, channels: 3, pageHeight: 120 } }).gif().toBuffer();
    expect((await sharp(gif).metadata()).pages).toBe(2);
    await expect(processUploadedImage(gif, "image/gif")).rejects.toThrow(/Animated images/);
  });

  it("decodes a BMP raster and sends only compressed WebP onward", async () => {
    const bytes = Buffer.from("Qk1OAAAAAAAAADYAAAAoAAAAAgAAAAMAAAABABgAAAAAABgAAAAAAAAAAAAAAAAAAAAAAAAAcCCgcCCgAABwIKBwIKAAAHAgoHAgoAAA", "base64");
    const processed = await processUploadedImage(bytes, "image/bmp");
    expect(processed.detectedMimeType).toBe("image/bmp");
    expect(processed.canonicalMimeType).toBe("image/webp");
    expect(processed.width).toBe(2);
    expect(processed.height).toBe(3);
  });

  it("does not mistake an ordinary TIFF for DNG from its declared label", async () => {
    const bytes = await swatch().tiff().toBuffer();
    await expect(processUploadedImage(bytes, "image/dng")).rejects.toThrow(/declared type/);
  });

  it("still rejects a JPEG that claims to be a PNG", async () => {
    const bytes = await swatch().toFormat("jpeg").toBuffer();
    await expect(processUploadedImage(bytes, "image/png")).rejects.toThrow(/does not match/i);
  });
});
