import sharp from "sharp";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { ApiError } from "./errors.js";
import { decodeBitmapPhoto } from "./bitmap-image.js";
import { decodeCameraRaw } from "./camera-raw-image.js";
import { MAX_COMPRESSED_PHOTO_BYTES, sanitizeProfilePhoto } from "./image-sanitization.js";

export const MAX_IMAGE_BYTES = MAX_COMPRESSED_PHOTO_BYTES;
export const MAX_IMAGE_PIXELS = 40_000_000;
export const MAX_PHOTO_SOURCE_BYTES = 128 * 1024 * 1024;
export const MAX_PHOTO_SOURCE_PIXELS = 260_000_000;
const MAX_IMAGE_DIMENSION = 12_000;

// Static uploads are decoded and re-encoded before moderation and delivery.
// HEVC uses libheif; phone DNG uses LibRaw. Animated uploads remain rejected.
const supportedFormats = new Set(["jpeg", "png", "webp", "heif", "tiff", "gif"]);

const runImageDecoder = promisify(execFile);

async function decodeHeic(bytes: Buffer) {
  const directory = await mkdtemp(join(tmpdir(), "cruush-heic-"));
  try {
    const input = join(directory, "input.heic");
    const output = join(directory, "output.png");
    await writeFile(input, bytes, { mode: 0o600 });
    await runImageDecoder("heif-convert", [input, output], {
      timeout: 15_000,
      killSignal: "SIGKILL",
      maxBuffer: 64 * 1024,
    });
    return await readFile(output);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const mimeTypes = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heif: "image/heic",
  tiff: "image/tiff",
  gif: "image/gif"
} as const;

export type ProcessedImageVariant = {
  type: "thumbnail" | "display";
  bytes: Buffer;
  mimeType: "image/webp";
  width: number;
  height: number;
};

export type ProcessedImage = {
  detectedMimeType: "image/jpeg" | "image/png" | "image/webp" | "image/heic" | "image/tiff" | "image/gif" | "image/dng" | "image/bmp";
  canonicalBytes: Buffer;
  canonicalMimeType?: "image/jpeg" | "image/png" | "image/webp";
  width: number;
  height: number;
  variants: ProcessedImageVariant[];
};

/** Every label a browser might legitimately put on this format's bytes. */
function mimeTypeAliases(detectedMimeType: string) {
  switch (detectedMimeType) {
    case "image/jpeg":
      return new Set(["image/jpeg", "image/jpg", "image/pjpeg"]);
    case "image/heic":
      // libvips reports AVIF as heif too, and a Live Photo or burst arrives as
      // a sequence, so every label in the family belongs to the same bytes.
      return new Set([
        "image/heic",
        "image/heif",
        "image/heic-sequence",
        "image/heif-sequence",
        "image/avif",
        "image/avif-sequence",
      ]);
    case "image/png":
      return new Set(["image/png", "image/x-png", "image/apng"]);
    case "image/tiff":
      return new Set(["image/tiff", "image/x-tiff", "image/tif"]);
    default:
      return new Set([detectedMimeType]);
  }
}

function invalidImage(message = "Upload a still photo your phone or camera made: JPEG, PNG, HEIC/HEIF, AVIF, WebP, TIFF, DNG, BMP or still GIF.") {
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

  if (output.data.length >= MAX_COMPRESSED_PHOTO_BYTES) {
    throw invalidImage("Compressed photo exceeds 5 MB.");
  }
  return {
    type,
    bytes: output.data,
    mimeType: "image/webp",
    width: output.info.width,
    height: output.info.height
  };
}

export async function processUploadedImage(bytes: Buffer, declaredMimeType?: string, options: { cameraOriginal?: boolean } = {}): Promise<ProcessedImage> {
  const maxBytes = options.cameraOriginal ? MAX_PHOTO_SOURCE_BYTES : MAX_IMAGE_BYTES;
  const maxPixels = options.cameraOriginal ? MAX_PHOTO_SOURCE_PIXELS : MAX_IMAGE_PIXELS;
  const maxDimension = options.cameraOriginal ? 20_000 : MAX_IMAGE_DIMENSION;
  if (bytes.length === 0) {
    throw invalidImage("Image cannot be empty.");
  }

  if (bytes.length > maxBytes) {
    throw invalidImage(options.cameraOriginal ? "Camera original must be 128 MB or smaller." : "Image must be 5 MB or smaller.");
  }

  try {
    const rawPixels = await decodeCameraRaw(bytes, declaredMimeType, { maxPixels, maxDimension });
    const bitmapPixels = rawPixels ? null : await decodeBitmapPhoto(bytes, declaredMimeType, maxPixels);
    const imageBytes = rawPixels ?? bitmapPixels ?? bytes;
    const metadata = await sharp(imageBytes, {
      animated: false,
      failOn: "warning",
      limitInputPixels: maxPixels
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
      width > maxDimension ||
      height > maxDimension ||
      width * height > maxPixels
    ) {
      throw invalidImage("Image dimensions are not supported.");
    }

    const detectedMimeType = rawPixels ? "image/dng" : bitmapPixels ? "image/bmp" : mimeTypes[format as keyof typeof mimeTypes];

    // Browsers and phones label the same bytes several ways: image/jpg for a
    // JPEG, image/heif for a HEIC. Comparing against one exact string rejected
    // real photos whose content was perfectly valid, which is what made "tried
    // png and jpg" fail. The check still catches content that is genuinely a
    // different format from what was claimed.
    if (!rawPixels && !bitmapPixels && declaredMimeType && !mimeTypeAliases(detectedMimeType).has(declaredMimeType.trim().toLowerCase())) {
      throw invalidImage("Image content does not match its declared type.");
    }

    const decodableBytes = format === "heif" && metadata.compression === "hevc"
      ? await decodeHeic(imageBytes) : imageBytes;
    const canonical = await sanitizeProfilePhoto(decodableBytes, detectedMimeType, { maxInputPixels: maxPixels });
    const canonicalMetadata = await sharp(canonical.bytes).metadata();
    const variants = await Promise.all([
      makeVariant(canonical.bytes, "thumbnail", 320, 400),
      makeVariant(canonical.bytes, "display", 1600, 2000)
    ]);

    return {
      detectedMimeType,
      canonicalBytes: canonical.bytes,
      canonicalMimeType: canonical.mimeType,
      width: canonicalMetadata.width ?? width,
      height: canonicalMetadata.height ?? height,
      variants
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw invalidImage("This photo could not be decoded. It may be damaged or use an unsupported encoding. Supported photos: JPEG, PNG, HEIC/HEIF, AVIF, WebP, TIFF, DNG, BMP or still GIF.");
  }
}
