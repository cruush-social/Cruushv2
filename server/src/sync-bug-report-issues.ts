import { createGithubIssueGateway, syncBugReportIssues } from "./bug-report-issue-sync.js";
import { loadConfig } from "./config.js";
import { createPool } from "./db.js";

const DEFAULT_BATCH_LIMIT = 20;

const config = loadConfig();

if (config.GITHUB_BUG_TRIAGE_ENABLED !== true) {
  console.log("GITHUB_BUG_TRIAGE_ENABLED is not set. Nothing to sync.");
  process.exit(0);
}

const limitArgument = Number(process.env.BUG_TRIAGE_BATCH_LIMIT ?? DEFAULT_BATCH_LIMIT);
const limit = Number.isInteger(limitArgument) && limitArgument > 0 && limitArgument <= 100
  ? limitArgument
  : DEFAULT_BATCH_LIMIT;

const db = createPool(config);

try {
  const gateway = createGithubIssueGateway(config);
  const result = await syncBugReportIssues(db, config, gateway, { limit });

  console.log(
    `Bug report sync: released ${result.released} stale claim(s), claimed ${result.claimed}, ` +
    `opened ${result.created} issue(s), attached ${result.duplicates} duplicate(s), ${result.failed} failed.`
  );

  if (result.failed > 0) {
    process.exitCode = 1;
  }
} finally {
  await db.end();
}
