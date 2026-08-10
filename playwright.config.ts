import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const useLocalStack = process.env.CRUUSH_E2E_START_LOCAL === '1';

if (useLocalStack) {
  try {
    process.loadEnvFile(path.resolve('server/.env.local'));
  } catch {
    // dev:local reports a targeted configuration error if this ignored file is missing.
  }

  process.env.CRUUSH_E2E_EMAIL ??= 'admin@cruush.local';
  process.env.CRUUSH_E2E_PASSWORD ??= process.env.DEVELOPMENT_ADMIN_PASSWORD;
}

const baseURL = process.env.CRUUSH_E2E_BASE_URL ?? (useLocalStack ? 'https://localhost:5173' : 'https://cruush.app');
const storageState = path.resolve(process.env.CRUUSH_E2E_STORAGE_STATE ?? '.playwright/auth/user.json');

export default defineConfig({
  testDir: './e2e',
  outputDir: 'test-results',
  timeout: 45_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    ignoreHTTPSErrors: useLocalStack,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testMatch: '**/auth.setup.ts',
      use: {
        ...devices['Desktop Chrome'],
        storageState: fs.existsSync(storageState) ? storageState : { cookies: [], origins: [] },
      },
    },
    {
      name: 'chromium',
      dependencies: ['setup'],
      testIgnore: '**/auth.setup.ts',
      use: {
        ...devices['Desktop Chrome'],
        storageState,
      },
    },
    {
      name: 'mobile-chromium',
      dependencies: ['setup'],
      testIgnore: '**/auth.setup.ts',
      use: {
        ...devices['Pixel 7'],
        storageState,
      },
    },
  ],
  webServer: useLocalStack
    ? {
        command: 'pnpm dev:local:seeded',
        url: `${baseURL}/api/meta`,
        ignoreHTTPSErrors: true,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      }
    : undefined,
});
