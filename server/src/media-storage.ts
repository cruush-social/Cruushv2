import path from "node:path";
import { tmpdir } from "node:os";
import type { AppConfig } from "./config.js";

export const MEDIA_ROUTE_PREFIX = "/media";
export const PROFILE_PHOTO_MEDIA_PREFIX = `${MEDIA_ROUTE_PREFIX}/profile-photos`;

export function resolveMediaStorageDir(config: Pick<AppConfig, "MEDIA_STORAGE_DIR" | "NODE_ENV">) {
  return path.resolve(config.MEDIA_STORAGE_DIR ?? (config.NODE_ENV === "test" ? path.join(tmpdir(), "cruush-test-media") : "media"));
}

export function getProfilePhotoStorageDir(config: Pick<AppConfig, "MEDIA_STORAGE_DIR" | "NODE_ENV">) {
  return path.join(resolveMediaStorageDir(config), "profile-photos");
}
