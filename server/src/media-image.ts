import sharp from "sharp";
import { ApiError } from "./errors.js";
import { sanitizeProfilePhoto } from "./image-sanitization.js";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 40_000_000;
const MAX_IMAGE_DIMENSION = 12_000;

const supportedFormats = new Set(["jpeg", "png", "webp"]);

const mimeTypes = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp"
} as const;

export type ProcessedImageVariant = {
  type: "thumbnail" | "display";
  bytes: Buffer;
  mimeType: "image/webp";
  width: number;
  height: number;
};

export type ProcessedImage = {
  detectedMimeType: "image/jpeg" | "image/png" | "image/webp";
  canonicalBytes: Buffer;
  width: number;
  height: number;
  variants: ProcessedImageVariant[];
};

function invalidImage(message = "Upload a valid JPEG, PNG, or WebP image.") {
  return new ApiError(400, "VALIDATION_ERROR", message);
}

async function makeVariant(
  bytes: Buffer,
  type: ProcessedImageVariant["type"],
  width: number,
  height: number
): Promise<ProcessedImageVariant> {
  const output = await sharp(bytes, {
    animated: false,
    failOn: "warning",
    limitInputPixels: MAX_IMAGE_PIXELS
  })
    .rotate()
    .resize({ width, height, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82, effort: 4 })
    .toBuffer({ resolveWithObject: true });

  return {
    type,
    bytes: output.data,
    mimeType: "image/webp",
    width: output.info.width,
    height: output.info.height
  };
}

export async function processUploadedImage(bytes: Buffer, declaredMimeType?: string): Promise<ProcessedImage> {
  if (bytes.length === 0) {
    throw invalidImage("Image cannot be empty.");
  }

  if (bytes.length > MAX_IMAGE_BYTES) {
    throw invalidImage("Image must be 5 MB or smaller.");
  }

  try {
    const metadata = await sharp(bytes, {
      animated: false,
      failOn: "warning",
      limitInputPixels: MAX_IMAGE_PIXELS
    }).metadata();
    const format = metadata.format;

    if (!format || !supportedFormats.has(format)) {
      throw invalidImage();
    }

    if ((metadata.pages ?? 1) !== 1) {
      throw invalidImage("Animated images are not supported.");
    }

    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;

    if (
      width <= 0 ||
      height <= 0 ||
      width > MAX_IMAGE_DIMENSION ||
      height > MAX_IMAGE_DIMENSION ||
      width * height > MAX_IMAGE_PIXELS
    ) {
      throw invalidImage("Image dimensions are not supported.");
    }

    const detectedMimeType = mimeTypes[format as keyof typeof mimeTypes];

    if (declaredMimeType && declaredMimeType !== detectedMimeType) {
      throw invalidImage("Image content does not match its declared type.");
    }

    const canonical = await sanitizeProfilePhoto(bytes, detectedMimeType);
    const canonicalMetadata = await sharp(canonical.bytes).metadata();
    const variants = await Promise.all([
      makeVariant(canonical.bytes, "thumbnail", 320, 400),
      makeVariant(canonical.bytes, "display", 960, 1200)
    ]);

    return {
      detectedMimeType,
      canonicalBytes: canonical.bytes,
      width: canonicalMetadata.width ?? width,
      height: canonicalMetadata.height ?? height,
      variants
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw invalidImage();
  }
}
