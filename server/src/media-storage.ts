import path from "node:path";
import { tmpdir } from "node:os";
import { createHash, createHmac } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import type { AppConfig } from "./config.js";

export const MEDIA_ROUTE_PREFIX = "/media";
export const PROFILE_PHOTO_MEDIA_PREFIX = `${MEDIA_ROUTE_PREFIX}/profile-photos`;
export const ENCRYPTED_PROFILE_PHOTO_MEDIA_PREFIX = "/api/media/profile-photos";

type MediaObjectStorageConfig = Pick<
  AppConfig,
  | "MEDIA_STORAGE_DIR"
  | "MEDIA_OBJECT_STORAGE_DRIVER"
  | "MEDIA_S3_BUCKET"
  | "MEDIA_S3_ENDPOINT"
  | "MEDIA_S3_REGION"
  | "MEDIA_S3_ACCESS_KEY_ID"
  | "MEDIA_S3_SECRET_ACCESS_KEY"
  | "NODE_ENV"
>;

type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>;

export type EncryptedMediaObjectStorage = {
  write(objectKey: string, bytes: Buffer): Promise<void>;
  read(objectKey: string): Promise<Buffer>;
  delete(objectKey: string): Promise<void>;
};

export type EncryptedMediaObjectStorageOptions = {
  fetch?: FetchImpl;
  now?: () => Date;
};

export function resolveMediaStorageDir(config: Pick<AppConfig, "MEDIA_STORAGE_DIR" | "NODE_ENV">) {
  return path.resolve(config.MEDIA_STORAGE_DIR ?? (config.NODE_ENV === "test" ? path.join(tmpdir(), "cruush-test-media") : "media"));
}

export function getProfilePhotoStorageDir(config: Pick<AppConfig, "MEDIA_STORAGE_DIR" | "NODE_ENV">) {
  return path.join(resolveMediaStorageDir(config), "profile-photos");
}

export function getEncryptedMediaObjectStorageDir(config: Pick<AppConfig, "MEDIA_STORAGE_DIR" | "NODE_ENV">) {
  return path.join(resolveMediaStorageDir(config), "objects");
}

function createLocalEncryptedMediaObjectStorage(config: Pick<AppConfig, "MEDIA_STORAGE_DIR" | "NODE_ENV">): EncryptedMediaObjectStorage {
  return {
    async write(objectKey, bytes) {
      const objectPath = path.join(getEncryptedMediaObjectStorageDir(config), objectKey);
      await mkdir(path.dirname(objectPath), { recursive: true });
      await writeFile(objectPath, bytes, { flag: "wx" });
    },
    async read(objectKey) {
      return readFile(path.join(getEncryptedMediaObjectStorageDir(config), objectKey));
    },
    async delete(objectKey) {
      await rm(path.join(getEncryptedMediaObjectStorageDir(config), objectKey), { force: true });
    }
  };
}

function sha256Hex(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function hmacHex(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest("hex");
}

function toAmzDate(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function encodeS3Path(value: string) {
  return value
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function requireS3Config(config: MediaObjectStorageConfig) {
  const missing = [
    ["MEDIA_S3_BUCKET", config.MEDIA_S3_BUCKET],
    ["MEDIA_S3_ENDPOINT", config.MEDIA_S3_ENDPOINT],
    ["MEDIA_S3_ACCESS_KEY_ID", config.MEDIA_S3_ACCESS_KEY_ID],
    ["MEDIA_S3_SECRET_ACCESS_KEY", config.MEDIA_S3_SECRET_ACCESS_KEY]
  ].filter(([, value]) => !value);

  if (missing.length > 0) {
    throw new Error(`Missing S3 media object storage config: ${missing.map(([name]) => name).join(", ")}.`);
  }

  return {
    bucket: config.MEDIA_S3_BUCKET as string,
    endpoint: (config.MEDIA_S3_ENDPOINT as string).replace(/\/+$/, ""),
    region: config.MEDIA_S3_REGION || "auto",
    accessKeyId: config.MEDIA_S3_ACCESS_KEY_ID as string,
    secretAccessKey: config.MEDIA_S3_SECRET_ACCESS_KEY as string
  };
}

function createS3EncryptedMediaObjectStorage(
  config: MediaObjectStorageConfig,
  options: EncryptedMediaObjectStorageOptions = {}
): EncryptedMediaObjectStorage {
  const s3 = requireS3Config(config);
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? (() => new Date());

  async function request(method: "GET" | "PUT" | "DELETE", objectKey: string, body?: Buffer) {
    const date = now();
    const amzDate = toAmzDate(date);
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = sha256Hex(body ?? "");
    const canonicalUri = `/${encodeURIComponent(s3.bucket)}/${encodeS3Path(objectKey)}`;
    const url = new URL(`${s3.endpoint}${canonicalUri}`);
    const credentialScope = `${dateStamp}/${s3.region}/s3/aws4_request`;
    const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
    const canonicalHeaders = [
      `host:${url.host}`,
      `x-amz-content-sha256:${payloadHash}`,
      `x-amz-date:${amzDate}`
    ].join("\n");
    const canonicalRequest = [
      method,
      canonicalUri,
      "",
      `${canonicalHeaders}\n`,
      signedHeaders,
      payloadHash
    ].join("\n");
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      sha256Hex(canonicalRequest)
    ].join("\n");
    const signingKey = hmac(
      hmac(
        hmac(
          hmac(`AWS4${s3.secretAccessKey}`, dateStamp),
          s3.region
        ),
        "s3"
      ),
      "aws4_request"
    );
    const signature = hmacHex(signingKey, stringToSign);
    const headers = {
      authorization: `AWS4-HMAC-SHA256 Credential=${s3.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate
    };
    const init: RequestInit = {
      method,
      headers,
      ...(body ? { body: body as unknown as BodyInit } : {})
    };
    const response = await fetchImpl(url.toString(), init);

    if (!response.ok) {
      throw new Error(`Encrypted media object storage ${method} failed with status ${response.status}.`);
    }

    return response;
  }

  return {
    async write(objectKey, bytes) {
      await request("PUT", objectKey, bytes);
    },
    async read(objectKey) {
      const response = await request("GET", objectKey);
      return Buffer.from(await response.arrayBuffer());
    },
    async delete(objectKey) {
      await request("DELETE", objectKey);
    }
  };
}

export function createEncryptedMediaObjectStorage(
  config: MediaObjectStorageConfig,
  options: EncryptedMediaObjectStorageOptions = {}
): EncryptedMediaObjectStorage {
  if (config.MEDIA_OBJECT_STORAGE_DRIVER === "s3") {
    return createS3EncryptedMediaObjectStorage(config, options);
  }

  return createLocalEncryptedMediaObjectStorage(config);
}

export async function writeEncryptedMediaObject(
  config: MediaObjectStorageConfig,
  objectKey: string,
  bytes: Buffer
) {
  await createEncryptedMediaObjectStorage(config).write(objectKey, bytes);
}

export async function readEncryptedMediaObject(
  config: MediaObjectStorageConfig,
  objectKey: string
) {
  return createEncryptedMediaObjectStorage(config).read(objectKey);
}

export async function deleteEncryptedMediaObject(
  config: MediaObjectStorageConfig,
  objectKey: string
) {
  await createEncryptedMediaObjectStorage(config).delete(objectKey);
}
