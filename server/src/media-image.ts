import sharp from "sharp";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { ApiError } from "./errors.js";
import { sanitizeProfilePhoto } from "./image-sanitization.js";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 40_000_000;
const MAX_IMAGE_DIMENSION = 12_000;

// What a phone camera actually produces. HEIC is the iPhone default and AVIF
// is turning up from Android; libvips reports both as heif, so AVIF passes the
// format check already and only ever failed on its declared type. TIFF comes
// out of the odd camera app. Everything is re-encoded to WebP for delivery, so
// accepting a format costs nothing downstream.
//
// A photo is a still. Animated formats are out: GIF entirely, and an animated
// WebP or APNG is rejected rather than silently frozen to its first frame.
// SVG and raw are deliberately absent even though this build decodes them: SVG
// carries script, and raw is not a photo anyone is uploading from a phone.
// Sharp's bundled libvips reads HEIC metadata but omits HEVC decoding.
// The runtime's libheif tool supplies that decoder after the same validation.
const supportedFormats = new Set(["jpeg", "png", "webp", "heif", "tiff"]);

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
  tiff: "image/tiff"
} as const;

export type ProcessedImageVariant = {
  type: "thumbnail" | "display";
  bytes: Buffer;
  mimeType: "image/webp";
  width: number;
  height: number;
};

export type ProcessedImage = {
  detectedMimeType: "image/jpeg" | "image/png" | "image/webp" | "image/heic" | "image/tiff";
  canonicalBytes: Buffer;
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

function invalidImage(message = "Upload a still photo your phone or camera made: JPEG, PNG, HEIC, AVIF, WebP, or TIFF.") {
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

    // Browsers and phones label the same bytes several ways: image/jpg for a
    // JPEG, image/heif for a HEIC. Comparing against one exact string rejected
    // real photos whose content was perfectly valid, which is what made "tried
    // png and jpg" fail. The check still catches content that is genuinely a
    // different format from what was claimed.
    if (declaredMimeType && !mimeTypeAliases(detectedMimeType).has(declaredMimeType.trim().toLowerCase())) {
      throw invalidImage("Image content does not match its declared type.");
    }

    const decodableBytes = format === "heif" && metadata.compression === "hevc"
      ? await decodeHeic(bytes) : bytes;
    const canonical = await sanitizeProfilePhoto(decodableBytes, detectedMimeType);
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

    throw invalidImage("This photo could not be decoded. It may be damaged or use an unsupported encoding. Export it as JPEG or PNG and try again.");
  }
}
