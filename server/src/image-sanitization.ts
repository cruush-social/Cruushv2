import sharp from "sharp";

const MAX_PROFILE_PHOTO_DIMENSION = 2048;

export type SupportedProfilePhotoMimeType = "image/jpeg" | "image/png" | "image/webp";

const outputByMimeType = {
  "image/jpeg": { extension: "jpg" },
  "image/png": { extension: "png" },
  "image/webp": { extension: "webp" }
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
      mimeType,
      extension: outputByMimeType[mimeType].extension
    };
  } catch {
    throw new Error("Unable to decode the uploaded profile photo.");
  }
}
