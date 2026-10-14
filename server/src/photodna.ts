import type { AppConfig } from "./config.js";

export type PhotoDnaStatus = "not_configured" | "allowed" | "blocked";

export type PhotoDnaResult = {
  status: PhotoDnaStatus;
  providerRequestId?: string | null;
  rawResult?: Record<string, unknown>;
};

function photoDnaUrl(config: AppConfig) {
  const baseUrl = (config.PHOTODNA_API_URL ?? "").replace(/\/$/, "");
  const path = config.PHOTODNA_OPERATION_PATH ?? "";

  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

function responseIndicatesMatch(body: Record<string, unknown>) {
  return body.isMatch === true ||
    body.IsMatch === true ||
    body.match === true ||
    body.Match === true ||
    body.blocked === true ||
    body.Blocked === true ||
    body.status === "matched" ||
    body.status === "blocked" ||
    body.Status === "matched" ||
    body.Status === "blocked";
}

function providerRequestId(body: Record<string, unknown>) {
  for (const key of ["trackingId", "TrackingId", "requestId", "RequestId", "id", "Id", "matchId", "MatchId"]) {
    const value = body[key];

    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return null;
}

async function responseErrorMessage(response: Response) {
  let body = "";

  try {
    body = await response.text();
  } catch {
    body = "";
  }

  const details = body.trim().replace(/\s+/g, " ").slice(0, 500);
  const statusText = response.statusText ? ` ${response.statusText}` : "";

  return details
    ? `PhotoDNA request failed with status ${response.status}${statusText}: ${details}`
    : `PhotoDNA request failed with status ${response.status}${statusText}`;
}

export async function checkPhotoDna(config: AppConfig, imageBytes: Buffer): Promise<PhotoDnaResult> {
  if (!config.PHOTODNA_ENABLED) {
    return {
      status: "not_configured"
    };
  }
  if (config.PHOTODNA_NO_AI_TRAINING_VERIFIED !== true) {
    throw new Error("PhotoDNA no-AI-training terms have not been verified.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.PHOTODNA_TIMEOUT_MS ?? 5000);

  try {
    const response = await fetch(photoDnaUrl(config), {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "ocp-apim-subscription-key": config.PHOTODNA_SUBSCRIPTION_KEY ?? ""
      },
      body: imageBytes as unknown as BodyInit,
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(await responseErrorMessage(response));
    }

    const body = await response.json() as Record<string, unknown>;

    return {
      status: responseIndicatesMatch(body) ? "blocked" : "allowed",
      providerRequestId: providerRequestId(body),
      rawResult: body
    };
  } finally {
    clearTimeout(timeout);
  }
}
