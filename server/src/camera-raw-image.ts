import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { ApiError } from "./errors.js";

const runDecoder = promisify(execFile);
export const DNG_MIME_TYPES = new Set(["image/dng", "image/x-adobe-dng"]);

/** Verify the DNG container before using LibRaw to render its camera pixels. */
export async function decodeCameraRaw(
  bytes: Buffer,
  declaredMimeType: string | undefined,
  limits: { maxPixels: number; maxDimension: number }
): Promise<Buffer | null> {
  const declaredDng = DNG_MIME_TYPES.has(declaredMimeType?.trim().toLowerCase() ?? "");
  const signature = bytes.subarray(0, 4).toString("hex");
  const tiffContainer = ["49492a00", "4d4d002a", "49492b00", "4d4d002b"].includes(signature);
  if (!declaredDng && !tiffContainer) return null;

  const directory = await mkdtemp(join(tmpdir(), "cruush-raw-"));
  try {
    const input = join(directory, "input.dng");
    const output = join(directory, "output.tiff");
    await writeFile(input, bytes, { mode: 0o600 });
    const { stdout } = await runDecoder("exiftool", [
      "-j", "-n", "-G1", "-a", "-FileType", "-DNGVersion", "-ImageWidth", "-ImageHeight", input
    ], { timeout: 10_000, killSignal: "SIGKILL", maxBuffer: 64 * 1024 });
    const metadata = (JSON.parse(stdout) as Record<string, unknown>[])[0];
    if (metadata?.["File:FileType"] !== "DNG" || !Object.keys(metadata).some((key) => key.endsWith(":DNGVersion"))) {
      if (declaredDng) throw new ApiError(400, "VALIDATION_ERROR", "Image content does not match its declared type.");
      return null;
    }
    if (declaredMimeType && !declaredDng && !["image/tiff", "image/x-tiff", "image/tif"].includes(declaredMimeType.toLowerCase())) {
      throw new ApiError(400, "VALIDATION_ERROR", "Image content does not match its declared type.");
    }
    const dimension = (name: string) => Math.max(0, ...Object.entries(metadata)
      .filter(([key]) => key.endsWith(`:${name}`)).map(([, value]) => Number(value)));
    const width = dimension("ImageWidth");
    const height = dimension("ImageHeight");
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0
      || width > limits.maxDimension || height > limits.maxDimension || width * height > limits.maxPixels) {
      throw new ApiError(400, "VALIDATION_ERROR", "Image dimensions are not supported.");
    }
    // LibRaw applies the camera white balance and orientation, then writes sRGB
    // pixels. Existing Sharp sanitization handles resizing and metadata removal.
    await runDecoder("dcraw_emu", ["-w", "-o", "1", "-T", "-Z", output, input], {
      timeout: 60_000, killSignal: "SIGKILL", maxBuffer: 64 * 1024
    });
    if ((await stat(output)).size > limits.maxPixels * 4 + 1024 * 1024) {
      throw new ApiError(400, "VALIDATION_ERROR", "Decoded photo is too large.");
    }
    return await readFile(output);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
