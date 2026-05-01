import type { FastifyRequest } from "fastify";
import { ApiError } from "./errors.js";

type TurnstileResponse = {
  success?: boolean;
  "error-codes"?: string[];
};

export async function verifyTurnstileToken(request: FastifyRequest, token: string | undefined) {
  const secret = request.server.config.TURNSTILE_SECRET_KEY;

  if (!secret) {
    return;
  }

  if (!token) {
    throw new ApiError(400, "VALIDATION_ERROR", "Captcha verification is required.");
  }

  const body = new URLSearchParams({
    secret,
    response: token
  });

  const remoteAddress = request.ip;
  if (remoteAddress) {
    body.set("remoteip", remoteAddress);
  }

  let response: Response;

  try {
    response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body
    });
  } catch (error) {
    request.log.error({ err: error }, "turnstile verification request failed");
    throw new ApiError(502, "INTERNAL_ERROR", "Captcha verification failed.");
  }

  if (!response.ok) {
    const responseBody = await response.text();
    request.log.error({ responseBody, statusCode: response.status }, "turnstile verification failed");
    throw new ApiError(502, "INTERNAL_ERROR", "Captcha verification failed.");
  }

  const result = await response.json() as TurnstileResponse;

  if (!result.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Captcha verification failed.", {
      turnstile: result["error-codes"] ?? []
    });
  }
}
