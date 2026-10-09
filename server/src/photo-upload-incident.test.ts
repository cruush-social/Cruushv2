import { describe, expect, it, vi } from "vitest";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { ApiError } from "./errors.js";
import {
  PHOTO_UPLOAD_REPORT_EMAIL,
  isUserActionableUploadError,
  toReportablePhotoUploadError
} from "./photo-upload-incident.js";

function fakeRequest() {
  return { log: { error: vi.fn() } } as unknown as FastifyRequest;
}

const app = {} as FastifyInstance;
const context = { surface: "message_photo" as const, userId: "user-1" };

describe("photo upload incident codes", () => {
  it("passes moderation rejections through untouched", () => {
    // The person broke a rule and already knows what to do. Handing them an
    // incident code here would send noise to the reports inbox.
    const rejection = new ApiError(400, "CONTENT_REJECTED", "Profile photo must be of you.");

    const result = toReportablePhotoUploadError(app, fakeRequest(), rejection, context);

    expect(result).toBe(rejection);
  });

  it("passes account restrictions through untouched", () => {
    const restricted = new ApiError(403, "FEATURE_RESTRICTED", "Photo uploads are unavailable for this account.");

    expect(toReportablePhotoUploadError(app, fakeRequest(), restricted, context)).toBe(restricted);
  });

  it("passes size and validation failures through untouched", () => {
    const tooBig = new ApiError(400, "VALIDATION_ERROR", "Message photo must be 5 MB or smaller.");

    expect(toReportablePhotoUploadError(app, fakeRequest(), tooBig, context)).toBe(tooBig);
  });

  it("gives an unexpected failure a reportable code and the reports address", () => {
    const request = fakeRequest();
    const boom = new Error("connect ECONNREFUSED 10.0.0.5:5432");

    const result = toReportablePhotoUploadError(app, request, boom, context) as ApiError;

    expect(result).toBeInstanceOf(ApiError);
    expect(result.statusCode).toBe(500);
    expect(result.message).toContain(PHOTO_UPLOAD_REPORT_EMAIL);
    expect(result.message).toMatch(/PU-[0-9A-F]{6}/);

    // The same code has to reach the logs, otherwise the person reports a code
    // nobody can look up.
    const [logged] = (request.log.error as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(logged.incidentCode).toMatch(/PU-[0-9A-F]{6}/);
    expect(result.message).toContain(logged.incidentCode);
    expect(logged.surface).toBe("message_photo");
    expect(logged.userId).toBe("user-1");
  });

  it("issues a distinct code per failure", () => {
    const a = toReportablePhotoUploadError(app, fakeRequest(), new Error("a"), context) as ApiError;
    const b = toReportablePhotoUploadError(app, fakeRequest(), new Error("b"), context) as ApiError;

    expect(a.message).not.toBe(b.message);
  });

  it("treats an internal error as reportable, not as the account's fault", () => {
    // This is the case that misled us: a failed insert was reported as
    // "unavailable for this account" on an account with no restrictions at all.
    const internal = new ApiError(500, "INTERNAL_ERROR", "Favorite image could not be saved.");

    const result = toReportablePhotoUploadError(app, fakeRequest(), internal, context) as ApiError;

    expect(isUserActionableUploadError(internal)).toBe(false);
    expect(result.message).toContain(PHOTO_UPLOAD_REPORT_EMAIL);
  });
});
