import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(currentDir, "..");

describe("migration runner", () => {
  it("lists every numbered SQL migration in order", async () => {
    const sqlFiles = (await readdir(path.join(serverRoot, "sql")))
      .filter((file) => /^\d+_.+\.sql$/.test(file))
      .sort();
    const migrateSource = await readFile(path.join(currentDir, "migrate.ts"), "utf8");
    const listedFiles = Array.from(migrateSource.matchAll(/"(\d+_[^"]+\.sql)"/g), (match) => match[1]);

    expect(listedFiles).toEqual(sqlFiles);
  });

  it("keeps cruush+ billing ownership on app users before profile onboarding", async () => {
    const billingSql = await readFile(path.join(serverRoot, "sql", "027_cruush_plus_billing.sql"), "utf8");
    const rewardsSql = await readFile(path.join(serverRoot, "sql", "042_rewards_and_two_factor.sql"), "utf8");

    expect(billingSql).not.toContain("references profiles(id)");
    expect(billingSql).toContain("user_entitlements_user_id_fkey");
    expect(rewardsSql).toContain("daily_activity_credits_one_per_day");
    expect(rewardsSql).toContain("referrals_one_referrer_per_account");
    expect(rewardsSql).toContain("referrals_no_self_check");
    expect(rewardsSql).toContain("reward_grants_referral_uidx");
    expect(rewardsSql).toContain("reward_grants_milestone_uidx");
    expect(rewardsSql).toContain("idempotency_key text not null unique");
    expect(rewardsSql).toContain("reward grant ledger is append-only");
    expect(rewardsSql).toContain("referral association is immutable");
    expect(rewardsSql).toContain("user_two_factor_recovery_codes");
    expect(billingSql).toContain("foreign key (user_id) references app_users(id) on delete cascade");
  });
});
