#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";

const DEFAULT_API_BASE = "https://api-staging.cruush.app";
const DEFAULT_ORIGIN = "https://staging.cruush.app";
const REQUIRED_PROVIDER_PATH = "Stream image moderation + Amazon Rekognition profile-photo safety";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function optionalEnv(name, fallback = "") {
  return process.env[name]?.trim() || fallback;
}

function apiUrl(baseUrl, path) {
  return new URL(path, `${baseUrl.replace(/\/$/, "")}/`).toString();
}

function imageMimeType(path) {
  switch (extname(path).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    default:
      throw new Error("PROFILE_PHOTO_SMOKE_IMAGE must be a JPG, PNG, or WebP file.");
  }
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function setCookieHeaders(headers) {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }

  const value = headers.get("set-cookie");
  return value ? [value] : [];
}

function cookieHeaderFromSetCookie(headers) {
  return setCookieHeaders(headers)
    .map((cookie) => cookie.split(";")[0]?.trim())
    .filter(Boolean)
    .join("; ");
}

async function loginForCookie({ apiBase, origin }) {
  const email = optionalEnv("PROFILE_PHOTO_SMOKE_EMAIL");
  const password = optionalEnv("PROFILE_PHOTO_SMOKE_PASSWORD");

  if (!email || !password) {
    return "";
  }

  const now = Date.now();
  const payload = {
    email,
    password,
    captchaToken: optionalEnv("PROFILE_PHOTO_SMOKE_TURNSTILE_TOKEN") || undefined,
    clientCheck: {
      startedAt: now - 250,
      submittedAt: now,
      trap: ""
    }
  };
  const response = await fetch(apiUrl(apiBase, "/api/auth/login"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin
    },
    body: JSON.stringify(payload)
  });
  const body = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(`Login failed: HTTP ${response.status} ${JSON.stringify(body)}`);
  }

  const cookie = cookieHeaderFromSetCookie(response.headers);
  if (!cookie.includes("cruush_session=")) {
    throw new Error("Login succeeded but no cruush_session cookie was returned.");
  }

  return cookie;
}

async function resolveCookie({ apiBase, origin }) {
  const cookie = optionalEnv("PROFILE_PHOTO_SMOKE_COOKIE");
  if (cookie) {
    return cookie;
  }

  const session = optionalEnv("PROFILE_PHOTO_SMOKE_SESSION");
  if (session) {
    return `cruush_session=${encodeURIComponent(session)}`;
  }

  const loginCookie = await loginForCookie({ apiBase, origin });
  if (loginCookie) {
    return loginCookie;
  }

  throw new Error(
    "Provide PROFILE_PHOTO_SMOKE_COOKIE, PROFILE_PHOTO_SMOKE_SESSION, or PROFILE_PHOTO_SMOKE_EMAIL/PROFILE_PHOTO_SMOKE_PASSWORD."
  );
}

async function assertProfileUploadsOpen({ apiBase }) {
  const response = await fetch(apiUrl(apiBase, "/api/meta"));
  const body = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(`/api/meta failed: HTTP ${response.status} ${JSON.stringify(body)}`);
  }

  if (body?.photoUploads?.profilePhotos !== true) {
    throw new Error(
      [
        `Profile photo uploads are closed on ${apiBase}: ${JSON.stringify(body?.photoUploads ?? null)}`,
        "This is the deployed pre-upload gate. When it is closed, the photo is rejected before the file body, Stream, or Rekognition can run.",
        "Open the staging API gate by enabling the real provider path and redeploying: STREAM_MODERATION_ENABLED, STREAM_IMAGE_BRIDGE_ENABLED, PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED, PROFILE_PHOTO_REKOGNITION_ENABLED, and either PhotoDNA or the approved staging alpha profile-photo exception."
      ].join("\n")
    );
  }

  return body;
}

async function uploadProfilePhoto({ apiBase, origin, cookie, imagePath }) {
  const bytes = await readFile(imagePath);
  const fileStat = await stat(imagePath);
  const mimeType = imageMimeType(imagePath);
  const body = new FormData();

  body.set("photo", new Blob([bytes], { type: mimeType }), basename(imagePath));

  const response = await fetch(apiUrl(apiBase, "/api/profile-photos"), {
    method: "POST",
    headers: {
      cookie,
      origin,
      "user-agent": "cruush-profile-photo-api-smoke/1.0",
      "x-cruush-smoke-test": "profile-photo-api"
    },
    body
  });
  const responseBody = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(`Upload failed: HTTP ${response.status} ${JSON.stringify(responseBody)}`);
  }

  if (response.status === 202 && responseBody?.data?.status === "pending_review") {
    if (typeof responseBody.data.assetId !== "string") {
      throw new Error(`Pending upload did not return an asset id: ${JSON.stringify(responseBody)}`);
    }

    return {
      pending: true,
      assetId: responseBody.data.assetId,
      inputBytes: fileStat.size,
      responseBody
    };
  }

  const url = responseBody?.data?.url;
  if (typeof url !== "string" || !url.startsWith("/api/media/assets/")) {
    throw new Error(`Upload did not return a cruush media asset URL: ${JSON.stringify(responseBody)}`);
  }

  return {
    url,
    inputBytes: fileStat.size,
    responseBody
  };
}

async function assertUploadedImageServes({ apiBase, cookie, uploadedUrl }) {
  const response = await fetch(apiUrl(apiBase, uploadedUrl), {
    headers: {
      cookie
    }
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") ?? "";

  if (!response.ok || !contentType.startsWith("image/") || bytes.length === 0) {
    throw new Error(`Uploaded image did not serve: HTTP ${response.status} ${contentType} ${bytes.length} bytes`);
  }

  return {
    status: response.status,
    contentType,
    bytes: bytes.length
  };
}

async function main() {
  const apiBase = optionalEnv("PROFILE_PHOTO_SMOKE_API_BASE", DEFAULT_API_BASE);
  const origin = optionalEnv("PROFILE_PHOTO_SMOKE_ORIGIN", DEFAULT_ORIGIN);
  const imagePath = requiredEnv("PROFILE_PHOTO_SMOKE_IMAGE");
  const meta = await assertProfileUploadsOpen({ apiBase });
  const cookie = await resolveCookie({ apiBase, origin });
  const upload = await uploadProfilePhoto({ apiBase, origin, cookie, imagePath });
  const display = upload.pending
    ? { pending: true }
    : await assertUploadedImageServes({
        apiBase,
        cookie,
        uploadedUrl: upload.url
      });

  console.log(JSON.stringify({
    ok: true,
    apiBase,
    providerPathRequired: REQUIRED_PROVIDER_PATH,
    providerPathProof: upload.pending
      ? "The deployed /api/profile-photos route retained the encrypted upload as pending_review for automatic moderation retry."
      : "The deployed /api/profile-photos route accepted and served the upload after Stream image moderation and Amazon Rekognition.",
    profileUploadsOpen: meta.photoUploads.profilePhotos,
    messageUploadsOpen: meta.photoUploads.messagePhotos,
    ...(upload.pending ? { pendingAssetId: upload.assetId } : { uploadedUrl: upload.url }),
    inputBytes: upload.inputBytes,
    display
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
