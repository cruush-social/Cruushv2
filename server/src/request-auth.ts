import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { ApiError } from "./errors.js";

const userIdHeaderSchema = z.object({
  "x-user-id": z.uuid()
});

export function getAuthenticatedUserId(request: FastifyRequest) {
  const parsedHeaders = userIdHeaderSchema.safeParse(request.headers);

  if (!parsedHeaders.success) {
    throw new ApiError(
      401,
      "AUTH_REQUIRED",
      "Authentication required. Temporary x-user-id header is mandatory for this migration slice.",
      parsedHeaders.error.flatten()
    );
  }

  return parsedHeaders.data["x-user-id"];
}
