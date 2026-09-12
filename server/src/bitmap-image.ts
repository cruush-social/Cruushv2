import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { ApiError } from "./errors.js";

const runDecoder = promisify(execFile);
const bmpMimeTypes = new Set(["image/bmp", "image/x-bmp", "image/x-ms-bmp"]);

export async function decodeBitmapPhoto(bytes: Buffer, declaredMimeType: string | undefined, maxPixels: number) {
  if (bytes.subarray(0, 2).toString("ascii") !== "BM") return null;
  if (declaredMimeType && !bmpMimeTypes.has(declaredMimeType.trim().toLowerCase())) {
    throw new ApiError(400, "VALIDATION_ERROR", "Image content does not match its declared type.");
  }
  const directory = await mkdtemp(join(tmpdir(), "cruush-bitmap-"));
  try {
    const input = join(directory, "input.bmp");
    const output = join(directory, "output.png");
    await writeFile(input, bytes, { mode: 0o600 });
    const limits = ["-limit", "memory", "256MiB", "-limit", "map", "256MiB", "-limit", "disk", "512MiB", "-limit", "thread", "1"];
    const execution = { timeout: 30_000, killSignal: "SIGKILL" as const, maxBuffer: 64 * 1024 };
    const { stdout } = await runDecoder("magick", ["identify", ...limits, "-ping", "-format", "%w %h %n", `BMP:${input}`], execution);
    const [width, height, frames] = stdout.trim().split(/\s+/).map(Number);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0
      || width > 20_000 || height > 20_000 || width * height > maxPixels || frames !== 1) {
      throw new ApiError(400, "VALIDATION_ERROR", "Image dimensions are not supported.");
    }
    // Explicit BMP input prevents another format or an external delegate being
    // selected from a filename. Only the bounded raster reaches Sharp.
    await runDecoder("magick", [...limits, `BMP:${input}`, "-auto-orient", "-resize", "2048x2048>", "-strip", output], execution);
    return await readFile(output);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
