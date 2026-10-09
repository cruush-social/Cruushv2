import { describe, expect, it } from "vitest";
import { createReportPayloadSchema, reportReasonSchema } from "./report-schema.js";

describe("location spoofing report reason", () => {
  it("is accepted for every report target type", () => {
    const targets = [
      { targetType: "profile", targetUserId: "00000000-0000-4000-8000-000000000001" },
      { targetType: "post", postId: "00000000-0000-4000-8000-000000000002" },
      { targetType: "conversation", conversationId: "00000000-0000-4000-8000-000000000003" },
      { targetType: "place", placeId: "00000000-0000-4000-8000-000000000004" }
    ] as const;

    expect(reportReasonSchema.parse("location_spoofing")).toBe("location_spoofing");
    for (const target of targets) {
      expect(createReportPayloadSchema.parse({ ...target, reason: "location_spoofing" }).reason)
        .toBe("location_spoofing");
    }
  });
});
