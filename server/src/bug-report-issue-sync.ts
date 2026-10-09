import {
  attachBugReportIssue,
  BUG_REPORT_DUPLICATE_COMMENT_THRESHOLDS,
  buildBugReportIssueBody,
  buildBugReportIssueTitle,
  claimPendingBugReports,
  countReportsForDedupeHash,
  findIssueForDedupeHash,
  markBugReportTriageFailed,
  releaseStaleBugReportClaims,
  type BugReportTriageView
} from "./bug-report-triage.js";
import type { AppConfig } from "./config.js";
import type { DbClient } from "./db.js";

const GITHUB_API_BASE_URL = "https://api.github.com";
const GITHUB_REQUEST_TIMEOUT_MS = 15_000;

export type GithubIssueGateway = {
  createIssue(input: { title: string; body: string; labels: string[] }): Promise<{ number: number }>;
  createComment(issueNumber: number, body: string): Promise<void>;
};

export type BugReportIssueSyncResult = {
  released: number;
  claimed: number;
  created: number;
  duplicates: number;
  failed: number;
};

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export function createGithubIssueGateway(
  config: Pick<AppConfig, "GITHUB_BUG_TRIAGE_REPO" | "GITHUB_BUG_TRIAGE_TOKEN">
): GithubIssueGateway {
  const repo = config.GITHUB_BUG_TRIAGE_REPO ?? "";
  const token = config.GITHUB_BUG_TRIAGE_TOKEN ?? "";

  if (!repo || !token) {
    throw new Error("GITHUB_BUG_TRIAGE_REPO and GITHUB_BUG_TRIAGE_TOKEN are required.");
  }

  async function request(path: string, body: unknown) {
    const response = await fetch(`${GITHUB_API_BASE_URL}/repos/${repo}${path}`, {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "user-agent": "cruush-bug-report-sync",
        "x-github-api-version": "2022-11-28"
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS)
    });

    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 300);

      throw new Error(`GitHub request failed (${response.status}): ${detail}`);
    }

    return response.json() as Promise<Record<string, unknown>>;
  }

  return {
    async createIssue(input) {
      const payload = await request("/issues", input);
      const issueNumber = typeof payload.number === "number" ? payload.number : null;

      if (issueNumber === null) {
        throw new Error("GitHub issue response did not include an issue number.");
      }

      return { number: issueNumber };
    },
    async createComment(issueNumber, body) {
      await request(`/issues/${issueNumber}/comments`, { body });
    }
  };
}

function buildDuplicateCommentBody(report: BugReportTriageView, total: number) {
  return [
    `Another report landed in this cluster: **${total} total** now.`,
    "",
    `- support request: \`${report.id}\``,
    `- reported: ${report.createdAt}`,
    `- surface: \`${report.source}\``,
    "",
    "Reporter text is not copied here; pull it from the internal bug-report API when triaging."
  ].join("\n");
}

/**
 * Moves pending bug reports into GitHub issues. Duplicates attach to the issue
 * their cluster already owns instead of opening a second one.
 */
export async function syncBugReportIssues(
  db: DbClient,
  config: Pick<AppConfig, "GITHUB_BUG_TRIAGE_LABEL">,
  gateway: GithubIssueGateway,
  options: { limit: number }
): Promise<BugReportIssueSyncResult> {
  const released = await releaseStaleBugReportClaims(db);
  const claimed = await claimPendingBugReports(db, options.limit);
  const label = config.GITHUB_BUG_TRIAGE_LABEL || "bug-report";
  const result: BugReportIssueSyncResult = {
    released: released.length,
    claimed: claimed.length,
    created: 0,
    duplicates: 0,
    failed: 0
  };

  for (const report of claimed) {
    try {
      const existingIssueNumber = report.dedupeHash
        ? await findIssueForDedupeHash(db, report.dedupeHash, report.id)
        : null;

      if (existingIssueNumber !== null) {
        await attachBugReportIssue(db, report.id, existingIssueNumber);
        result.duplicates += 1;

        const clusterSize = await countReportsForDedupeHash(db, report.dedupeHash ?? "");

        if (BUG_REPORT_DUPLICATE_COMMENT_THRESHOLDS.includes(clusterSize)) {
          await gateway.createComment(
            existingIssueNumber,
            buildDuplicateCommentBody(report, clusterSize)
          );
        }

        continue;
      }

      const issue = await gateway.createIssue({
        title: buildBugReportIssueTitle(report),
        body: buildBugReportIssueBody(report),
        labels: [label]
      });

      await attachBugReportIssue(db, report.id, issue.number);
      result.created += 1;
    } catch (error) {
      await markBugReportTriageFailed(db, report.id, toErrorMessage(error));
      result.failed += 1;
    }
  }

  return result;
}
