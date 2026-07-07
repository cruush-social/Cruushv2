import path from "node:path";
import { tmpdir } from "node:os";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { AppConfig } from "./config.js";

export const MEDIA_ROUTE_PREFIX = "/media";
export const PROFILE_PHOTO_MEDIA_PREFIX = `${MEDIA_ROUTE_PREFIX}/profile-photos`;
export const ENCRYPTED_PROFILE_PHOTO_MEDIA_PREFIX = "/api/media/profile-photos";

export function resolveMediaStorageDir(config: Pick<AppConfig, "MEDIA_STORAGE_DIR" | "NODE_ENV">) {
  return path.resolve(config.MEDIA_STORAGE_DIR ?? (config.NODE_ENV === "test" ? path.join(tmpdir(), "cruush-test-media") : "media"));
}

export function getProfilePhotoStorageDir(config: Pick<AppConfig, "MEDIA_STORAGE_DIR" | "NODE_ENV">) {
  return path.join(resolveMediaStorageDir(config), "profile-photos");
}

export function getEncryptedMediaObjectStorageDir(config: Pick<AppConfig, "MEDIA_STORAGE_DIR" | "NODE_ENV">) {
  return path.join(resolveMediaStorageDir(config), "objects");
}

export async function writeEncryptedMediaObject(
  config: Pick<AppConfig, "MEDIA_STORAGE_DIR" | "NODE_ENV">,
  objectKey: string,
  bytes: Buffer
) {
  const objectPath = path.join(getEncryptedMediaObjectStorageDir(config), objectKey);
  await mkdir(path.dirname(objectPath), { recursive: true });
  await writeFile(objectPath, bytes, { flag: "wx" });
}

export async function readEncryptedMediaObject(
  config: Pick<AppConfig, "MEDIA_STORAGE_DIR" | "NODE_ENV">,
  objectKey: string
) {
  return readFile(path.join(getEncryptedMediaObjectStorageDir(config), objectKey));
}
