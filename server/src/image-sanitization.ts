import sharp from "sharp";

const MAX_PROFILE_PHOTO_DIMENSION = 2048;
export const MAX_COMPRESSED_PHOTO_BYTES = 5_000_000;

export type SupportedProfilePhotoMimeType = "image/jpeg" | "image/png" | "image/webp" | "image/heic" | "image/tiff" | "image/gif" | "image/dng" | "image/bmp";

// Anything a browser cannot reliably display leaves as WebP. Keeping the input
// format would hand browsers a picture most of them cannot open, and everything
// downstream is WebP anyway.
const outputByMimeType = {
  "image/jpeg": { extension: "jpg", mimeType: "image/jpeg" },
  "image/png": { extension: "png", mimeType: "image/png" },
  "image/webp": { extension: "webp", mimeType: "image/webp" },
  "image/heic": { extension: "webp", mimeType: "image/webp" },
  "image/tiff": { extension: "webp", mimeType: "image/webp" },
  "image/gif": { extension: "webp", mimeType: "image/webp" },
  "image/dng": { extension: "webp", mimeType: "image/webp" },
  "image/bmp": { extension: "webp", mimeType: "image/webp" }
} as const;

export async function sanitizeProfilePhoto(bytes: Buffer, mimeType: SupportedProfilePhotoMimeType, options: { maxInputPixels?: number } = {}) {
  try {
    const pipeline = sharp(bytes, { failOn: "error", limitInputPixels: options.maxInputPixels ?? 40_000_000 })
      .rotate()
      .resize({
        width: MAX_PROFILE_PHOTO_DIMENSION,
        height: MAX_PROFILE_PHOTO_DIMENSION,
        fit: "inside",
        withoutEnlargement: true
      });
    let sanitized = mimeType === "image/jpeg"
      ? await pipeline.jpeg({ quality: 88, mozjpeg: true }).toBuffer()
      : mimeType === "image/png"
        ? await pipeline.png({ compressionLevel: 9 }).toBuffer()
        : await pipeline.webp({ quality: 88 }).toBuffer();

    let output = outputByMimeType[mimeType];
    if (sanitized.length >= MAX_COMPRESSED_PHOTO_BYTES) {
      sanitized = await sharp(sanitized).webp({ quality: 88, effort: 4 }).toBuffer();
      output = outputByMimeType["image/webp"];
    }
    if (sanitized.length >= MAX_COMPRESSED_PHOTO_BYTES) {
      throw new Error("Compressed photo exceeds the upload limit.");
    }
    return { bytes: sanitized, mimeType: output.mimeType, extension: output.extension };
  } catch {
    throw new Error("Unable to decode the uploaded profile photo.");
  }
}
