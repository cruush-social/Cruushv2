import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/regression',
  outputDir: 'test-results/regression',
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    serviceWorkers: 'block',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Pixel 7'],
        geolocation: { latitude: 40.7128, longitude: -74.006 },
        permissions: ['geolocation'],
      },
    },
  ],
  webServer: {
    command: 'pnpm exec vite --host 127.0.0.1 --port 4173',
    env: {
      VITE_DEV_HTTPS: '0',
      VITE_MAP_USE_RASTER_TILES: '1',
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: 'http://127.0.0.1:4173/map',
  },
});
