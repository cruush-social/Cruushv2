import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');

async function readRepoFile(relativePath: string) {
  try {
    return await readFile(path.join(root, relativePath), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return '';
    }
    throw error;
  }
}

describe('mandatory regression gates', () => {
  it('provides one non-optional command for the complete local regression suite', async () => {
    const packageJson = JSON.parse(await readRepoFile('package.json')) as {
      scripts?: Record<string, string>;
    };
    const runner = await readRepoFile('scripts/run-regression-gates.mjs');

    expect(packageJson.scripts?.['regression:gate']).toBe('node scripts/run-regression-gates.mjs');
    expect(runner).toContain("['pnpm', ['check:cruush-casing']]");
    expect(runner).toContain("['pnpm', ['check:copy']]");
    expect(runner).toContain("['pnpm', ['security:check']]");
    expect(runner).toContain("['pnpm', ['check:layout']]");
    expect(runner).toContain("['pnpm', ['test']]");
    expect(runner).toContain("['pnpm', ['build']]");
    expect(runner).toContain("['npm', ['--prefix', 'server', 'test']]");
    expect(runner).toContain("['npm', ['--prefix', 'server', 'run', 'build']]");
    expect(runner).toContain("['git', ['diff', '--check']]");
    expect(runner).not.toMatch(/skip|continueOnError|continue-on-error/i);
  });

  it('makes both release paths run the complete gate without a skip argument', async () => {
    const ship = await readRepoFile('scripts/ship.mjs');
    const release = await readRepoFile('scripts/release-main-coolify.mjs');

    expect(ship).toContain("run('pnpm', ['regression:gate'], 'complete regression gate');");
    expect(release).toContain("['pnpm', ['regression:gate']]");
    expect(ship).not.toContain('--skip-checks');
    expect(release).not.toContain('--skip-checks');
  });

  it('requires the complete gate and real PostgreSQL integrity proof in GitHub Actions', async () => {
    const workflow = await readRepoFile('.github/workflows/regression-gates.yml');

    expect(workflow).toContain('pull_request:');
    expect(workflow).toMatch(/push:\s*\n\s*branches:\s*\[main\]/);
    expect(workflow).toContain('permissions:\n  contents: read');
    expect(workflow).toContain('pnpm regression:gate');
    expect(workflow).toContain('image: postgres:16');
    expect(workflow).toContain('POSTGRES_DB: cruush_reward_integrity_ci');
    expect(workflow.match(/npm --prefix server run migrate:dev/g)).toHaveLength(4);
    expect(workflow).toContain('CRUUSH_REAL_POSTGRES_URL: postgresql://postgres:postgres@localhost:5432/cruush_reward_integrity_ci');
    expect(workflow).toContain(
      'npm --prefix server test -- src/reward-integrity-real-postgres.test.ts --pool=forks --maxWorkers=1',
    );
    expect(workflow).toContain('createdb -h localhost -U postgres cruush_account_deletion_integrity_ci');
    expect(workflow).toContain(
      'CRUUSH_REAL_POSTGRES_URL: postgresql://postgres:postgres@localhost:5432/cruush_account_deletion_integrity_ci',
    );
    expect(workflow).toContain(
      'npm --prefix server test -- src/account-deletion-integrity.test.ts --pool=forks --maxWorkers=1',
    );
    expect(workflow).not.toMatch(/continue-on-error|--skip-checks/);
  });

  it('requires actual mobile-browser interaction regressions in GitHub Actions', async () => {
    const packageJson = JSON.parse(await readRepoFile('package.json')) as {
      scripts?: Record<string, string>;
    };
    const workflow = await readRepoFile('.github/workflows/regression-gates.yml');
    const config = await readRepoFile('playwright.regression.config.ts');
    const browserTest = await readRepoFile('e2e/regression/session-interactions.spec.ts');

    expect(packageJson.scripts?.['test:regression:browser']).toBe(
      'playwright test --config playwright.regression.config.ts',
    );
    expect(workflow).toContain('pnpm test:regression:browser');
    expect(workflow).toContain('pnpm exec playwright install --with-deps chromium');
    expect(config).toContain("name: 'mobile-chromium'");
    expect(config).toContain("testDir: './e2e/regression'");
    expect(browserTest).toContain('selects Seeking and Visibility menu options with real mobile taps');
    expect(browserTest).toContain('short tap opens the profile and press-and-hold reveals the signal');
    expect(browserTest).toContain('keeps Ghost location styling separate from profile-photo and DL rendering');
  });
});
