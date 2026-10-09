import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { toApiError } from "./errors.js";
import { z } from "zod";

describe("validation failures are diagnosable", () => {
  it("carries the failing field names so the handler can log them", () => {
    const schema = z.object({ distance: z.number().int() }).strict();
    let caught: unknown;

    try {
      schema.parse({ distance: "far", surprise: 1 });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ZodError);

    const apiError = toApiError(caught);
    expect(apiError.code).toBe("VALIDATION_ERROR");

    // What the error handler logs. A key a strict schema rejected outright
    // carries no path, so without reading it off the issue the one failure a
    // strict schema is most likely to produce would be logged nameless.
    const logged = (caught as ZodError).issues.map((issue) => ({
      code: issue.code,
      path: issue.path.join("."),
      keys: "keys" in issue ? issue.keys : undefined
    }));

    expect(logged).toContainEqual(expect.objectContaining({ path: "distance" }));
    expect(logged).toContainEqual(expect.objectContaining({ keys: ["surprise"] }));
    // Names only. A member's search text or location must never reach the log.
    expect(JSON.stringify(logged)).not.toContain("far");
  });
});
