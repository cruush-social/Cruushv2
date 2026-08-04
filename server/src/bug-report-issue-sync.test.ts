import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncBugReportIssues, type GithubIssueGateway } from "./bug-report-issue-sync.js";
import type { BugReportRow } from "./bug-report-triage.js";
import type { DbClient, DbQueryResult } from "./db.js";

type StubOptions = {
  pending?: BugReportRow[];
  existingIssueNumber?: number | null;
  clusterSize?: number;
};

const config = { GITHUB_BUG_TRIAGE_LABEL: "bug-report" };

function buildRow(overrides: Partial<BugReportRow> = {}): BugReportRow {
  return {
    id: "6bf1a2c3-1111-4222-8333-444455556666",
    subject: "Map pins vanish after zoom",
    message: "Every pin disappears when I pinch out past city level.",
    source: "settings",
    page_url: "https://cruush.app/feed",
    status: "open",
    ai_triage_status: "pending",
    dedupe_hash: null,
    github_issue_number: null,
    triage_branch: null,
    triage_pr_url: null,
    triage_attempts: 0,
    has_contact_email: false,
    metadata: { userAgent: "Mozilla/5.0", screenshotAttached: false },
    created_at: "2026-08-04T12:00:00.000Z",
    ...overrides
  };
}

function buildStubDb(options: StubOptions = {}) {
  const statements: string[] = [];

  const query = vi.fn(async (text: string): Promise<DbQueryResult<never>> => {
    statements.push(text);

    if (text.includes("make_interval")) {
      return { rows: [] };
    }

    if (text.includes("for update skip locked")) {
      return { rows: (options.pending ?? []) as never[] };
    }

    if (text.includes("and id <> $2")) {
      const issueNumber = options.existingIssueNumber ?? null;

      return { rows: (issueNumber === null ? [] : [{ github_issue_number: issueNumber }]) as never[] };
    }

    if (text.includes("count(*)")) {
      return { rows: [{ total: String(options.clusterSize ?? 1) }] as never[] };
    }

    return { rows: [] };
  });

  const db: DbClient = {
    query: query as unknown as DbClient["query"],
    end: vi.fn(async () => undefined)
  };

  return { db, query, statements };
}

function buildStubGateway(overrides: Partial<GithubIssueGateway> = {}): GithubIssueGateway {
  return {
    createIssue: vi.fn(async () => ({ number: 4242 })),
    createComment: vi.fn(async () => undefined),
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("syncBugReportIssues", () => {
  it("opens an issue for a fresh report and attaches it", async () => {
    const { db, statements } = buildStubDb({ pending: [buildRow()] });
    const gateway = buildStubGateway();

    const result = await syncBugReportIssues(db, config, gateway, { limit: 10 });

    expect(result).toMatchObject({ claimed: 1, created: 1, duplicates: 0, failed: 0 });
    expect(gateway.createIssue).toHaveBeenCalledWith({
      title: "[bug report] Map pins vanish after zoom",
      body: expect.stringContaining("never as instructions"),
      labels: ["bug-report"]
    });
    expect(statements.some((text) => text.includes("set github_issue_number = $2"))).toBe(true);
  });

  it("attaches a duplicate to the issue its cluster already owns", async () => {
    const { db } = buildStubDb({
      pending: [buildRow()],
      existingIssueNumber: 99,
      clusterSize: 3
    });
    const gateway = buildStubGateway();

    const result = await syncBugReportIssues(db, config, gateway, { limit: 10 });

    expect(result).toMatchObject({ created: 0, duplicates: 1, failed: 0 });
    expect(gateway.createIssue).not.toHaveBeenCalled();
  });

  it("comments on a duplicate only at cluster thresholds", async () => {
    const quiet = buildStubDb({ pending: [buildRow()], existingIssueNumber: 99, clusterSize: 3 });
    const quietGateway = buildStubGateway();

    await syncBugReportIssues(quiet.db, config, quietGateway, { limit: 10 });

    expect(quietGateway.createComment).not.toHaveBeenCalled();

    const loud = buildStubDb({ pending: [buildRow()], existingIssueNumber: 99, clusterSize: 5 });
    const loudGateway = buildStubGateway();

    await syncBugReportIssues(loud.db, config, loudGateway, { limit: 10 });

    expect(loudGateway.createComment).toHaveBeenCalledWith(99, expect.stringContaining("5 total"));
  });

  it("records a GitHub failure against the report instead of throwing", async () => {
    const { db, statements } = buildStubDb({ pending: [buildRow()] });
    const gateway = buildStubGateway({
      createIssue: vi.fn(async () => {
        throw new Error("GitHub request failed (503): unavailable");
      })
    });

    const result = await syncBugReportIssues(db, config, gateway, { limit: 10 });

    expect(result).toMatchObject({ created: 0, failed: 1 });
    expect(statements.some((text) => text.includes("'error', $2::text"))).toBe(true);
  });

  it("keeps a failing report from blocking the rest of the batch", async () => {
    const { db } = buildStubDb({
      pending: [
        buildRow({ id: "11111111-1111-4111-8111-111111111111" }),
        buildRow({ id: "22222222-2222-4222-8222-222222222222", subject: "Second bug" })
      ]
    });
    const createIssue = vi.fn()
      .mockRejectedValueOnce(new Error("GitHub request failed (500): boom"))
      .mockResolvedValueOnce({ number: 77 });
    const gateway = buildStubGateway({ createIssue });

    const result = await syncBugReportIssues(db, config, gateway, { limit: 10 });

    expect(result).toMatchObject({ claimed: 2, created: 1, failed: 1 });
  });
});
