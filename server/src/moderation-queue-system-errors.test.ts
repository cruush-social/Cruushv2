import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

// Every failed provider check wrote its own row into the human moderation queue, titled
// "Provider unavailable" and nothing else - four within six minutes on 2026-08-06. These
// are infrastructure events, not moderation decisions, and at any volume they bury real
// reports. The route now routes them to their own source and gives them a useful title.
//
// The queue query is one large SQL string built inline, and exercising it needs a database
// this suite does not have, so these assert on the statement itself. That is weaker than a
// round trip but it does catch the filter being dropped or inverted.

async function adminModerationSource() {
  return readFile(new URL("./routes/admin-moderation.ts", import.meta.url), "utf8");
}

describe("provider errors are kept out of the human queue", () => {
  it("accepts a system source on the queue endpoint", async () => {
    const source = await adminModerationSource();

    expect(source).toContain(`z.enum(["all", "reports", "automod", "system"])`);
  });

  it("partitions infrastructure rows so they appear under system and nowhere else", async () => {
    const source = await adminModerationSource();

    // The predicate is an equality between "did you ask for system" and "is this an
    // infrastructure row", which is what makes the two sets disjoint and exhaustive.
    expect(source).toContain(`where ($1::text = 'system') = (`);
    expect(source).toContain(`in ('provider_unavailable', 'provider_pending')`);
  });

  it("covers both infrastructure categories, not just the outage one", async () => {
    const source = await adminModerationSource();
    const partition = source.slice(source.indexOf("where ($1::text = 'system') = ("));

    expect(partition).toContain("provider_unavailable");
    expect(partition).toContain("provider_pending");
  });

  it("gives infrastructure rows a title carrying provider, status and content id", async () => {
    const source = await adminModerationSource();

    expect(source).toContain("coalesce(review.moderation_provider, review.provider, 'unknown provider')");
    expect(source).toContain("provider_error");
    expect(source).toContain("concat('content '");
  });

  it("still excludes CSAM rows from every view", async () => {
    const source = await adminModerationSource();

    expect(source).toContain(`coalesce(review.flagged_reason, '') <> 'photodna_csam_match'`);
    expect(source).toContain(`coalesce(review.policy_decision ->> 'category', '') <> 'csam'`);
  });
});

describe("user reports are not labelled as provider failures", () => {
  it("leaves the category off a user report decision", async () => {
    const service = await readFile(new URL("./moderation-service.ts", import.meta.url), "utf8");
    const createUserReport = service.slice(service.indexOf("export async function createUserReport"));

    // The copy-paste this replaces stamped provider_unavailable onto every report, which
    // poisoned the same policy_decision->>'category' column the CSAM exclusion and the new
    // system-error partition both read.
    expect(createUserReport).not.toContain(`category: "provider_unavailable"`);
    expect(createUserReport).toContain("provider: \"user_report\"");
  });
});
