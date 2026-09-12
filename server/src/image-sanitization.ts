import sharp from "sharp";

const MAX_PROFILE_PHOTO_DIMENSION = 2048;

export type SupportedProfilePhotoMimeType = "image/jpeg" | "image/png" | "image/webp" | "image/heic" | "image/tiff";

// Anything a browser cannot reliably display leaves as WebP. Keeping the input
// format would hand browsers a picture most of them cannot open, and everything
// downstream is WebP anyway.
const outputByMimeType = {
  "image/jpeg": { extension: "jpg", mimeType: "image/jpeg" },
  "image/png": { extension: "png", mimeType: "image/png" },
  "image/webp": { extension: "webp", mimeType: "image/webp" },
  "image/heic": { extension: "webp", mimeType: "image/webp" },
  "image/tiff": { extension: "webp", mimeType: "image/webp" }
} as const;

export async function sanitizeProfilePhoto(bytes: Buffer, mimeType: SupportedProfilePhotoMimeType) {
  try {
    const pipeline = sharp(bytes, { failOn: "error", limitInputPixels: 40_000_000 })
      .rotate()
      .resize({
        width: MAX_PROFILE_PHOTO_DIMENSION,
        height: MAX_PROFILE_PHOTO_DIMENSION,
        fit: "inside",
        withoutEnlargement: true
      });
    const sanitized = mimeType === "image/jpeg"
      ? await pipeline.jpeg({ quality: 88, mozjpeg: true }).toBuffer()
      : mimeType === "image/png"
        ? await pipeline.png({ compressionLevel: 9 }).toBuffer()
        : await pipeline.webp({ quality: 88 }).toBuffer();

    return {
      bytes: sanitized,
      mimeType: outputByMimeType[mimeType].mimeType,
      extension: outputByMimeType[mimeType].extension
    };
  } catch {
    throw new Error("Unable to decode the uploaded profile photo.");
  }
}
