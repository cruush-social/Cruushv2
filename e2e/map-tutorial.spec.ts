import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const tutorialStorageKey = 'cruush:tutorial-v3-seen';
const firstFeedPostStorageKeyPrefix = 'cruush:first-feed-post-prompt-seen:';
const releaseViewports = [
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
] as const;
const previewDirectory = '/tmp/cruush-v1.2-previews';

async function retryLocalNavigation(action: () => Promise<unknown>) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      const isRetryableLocalNavigation = error instanceof Error
        && (error.message.includes('net::ERR_TOO_MANY_RETRIES')
          || (error.message.includes('is interrupted by another navigation')
            && error.message.includes('chrome-error://chromewebdata')));
      if (!isRetryableLocalNavigation) {
        throw error;
      }
    }
  }
  throw lastError;
}

async function expectTutorialClearOfTargetAndNavigation(page: import('@playwright/test').Page, targetSelector?: string) {
  await expect.poll(async () => {
    const cardBox = await page.getByTestId('map-controls-tutorial-card').boundingBox();
    const navBox = await page.getByTestId('bottom-nav-pill').boundingBox();
    if (!cardBox || !navBox || cardBox.y + cardBox.height > navBox.y) {
      return false;
    }

    if (!targetSelector) {
      return true;
    }

    const targetBox = await page.locator(targetSelector).boundingBox();
    if (!targetBox) {
      return false;
    }
    const overlaps = cardBox.x < targetBox.x + targetBox.width
      && cardBox.x + cardBox.width > targetBox.x
      && cardBox.y < targetBox.y + targetBox.height
      && cardBox.y + cardBox.height > targetBox.y;
    return !overlaps;
  }).toBe(true);
}

async function captureTutorialStateAcrossReleaseViewports(
  page: import('@playwright/test').Page,
  testInfo: import('@playwright/test').TestInfo,
  stepId: string,
  targetSelector?: string,
) {
  for (const viewport of releaseViewports) {
    await page.setViewportSize(viewport);
    await expectTutorialClearOfTargetAndNavigation(page, targetSelector);
    if (testInfo.project.name === 'chromium') {
      await page.screenshot({
        path: `${previewDirectory}/tutorial-${stepId}-${viewport.width}x${viewport.height}.png`,
        animations: 'disabled',
      });
    }
  }
}

test.describe('authenticated map tutorial', () => {
  test.beforeEach(async ({ page }) => {
    let tutorialNoticeDismissed = false;
    let firstFeedPostNoticeDismissed = false;

    await page.addInitScript((feedPromptKeyPrefix) => {
      for (const key of Object.keys(window.localStorage)) {
        if (key.startsWith(feedPromptKeyPrefix)) {
          window.localStorage.removeItem(key);
        }
      }
      window.localStorage.removeItem('cruush:tutorial-v3-seen');
    }, firstFeedPostStorageKeyPrefix);

    await page.route('**/api/users/me/notices/**', async (route) => {
      const request = route.request();
      const url = decodeURIComponent(request.url());
      const isTutorialNotice = url.includes(tutorialStorageKey);
      const isFirstFeedPostNotice = url.includes(firstFeedPostStorageKeyPrefix);

      if (!isTutorialNotice && !isFirstFeedPostNotice) {
        await route.continue();
        return;
      }

      if (request.method() === 'GET') {
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              dismissed: isTutorialNotice ? tutorialNoticeDismissed : firstFeedPostNoticeDismissed,
              dismissedAt: null,
            },
          }),
        });
        return;
      }

      if (request.method() === 'PUT') {
        if (isTutorialNotice) {
          tutorialNoticeDismissed = true;
        } else {
          firstFeedPostNoticeDismissed = true;
        }
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            data: { dismissed: true, dismissedAt: new Date().toISOString() },
          }),
        });
        return;
      }

      await route.continue();
    });

    await page.goto('/map');
    await page.context().clearCookies({ name: 'cruush_tutorial-v3-seen' });
    await page.context().clearCookies({ name: /^cruush_first-feed-post-prompt-seen_/ });
    await page.evaluate((key) => localStorage.removeItem(key), tutorialStorageKey);
    await retryLocalNavigation(() => page.reload());

    await expect(page.getByRole('dialog', { name: 'Map controls tutorial' })).toBeVisible();
  });

  test('walks the real controls, offers an optional first post, persists completion, and replays from settings', async ({ page }, testInfo) => {
    const tutorial = page.getByRole('dialog', { name: 'Map controls tutorial' });

    await expect(tutorial).toContainText('Install cruush');
    if (testInfo.project.name === 'chromium') {
      mkdirSync(previewDirectory, { recursive: true });
    }
    await captureTutorialStateAcrossReleaseViewports(page, testInfo, 'install');
    await tutorial.getByTestId('tutorial-try-step').click();
    const installPrompt = page.getByTestId('mobile-install-prompt');
    await expect(installPrompt).toBeVisible();
    await expect(page.locator('[data-tutorial-target="install"]')).toBeVisible();
    await captureTutorialStateAcrossReleaseViewports(
      page,
      testInfo,
      'install-control',
      '[data-tutorial-target="install"]',
    );
    await installPrompt.getByRole('button', { name: 'Got it' }).click();
    await tutorial.getByRole('button', { name: 'Next' }).click();

    await expect(tutorial).toContainText('Notifications');
    await captureTutorialStateAcrossReleaseViewports(page, testInfo, 'notifications');
    await tutorial.getByTestId('tutorial-skip-step').click();

    await expect(tutorial).toContainText('Seeking');
    await expect(page.getByTestId('tutorial-spotlight')).toBeVisible();
    await expect(page.locator('[data-tutorial-target="seeking"]')).toBeVisible();
    await captureTutorialStateAcrossReleaseViewports(
      page,
      testInfo,
      'seeking',
      '[data-tutorial-target="seeking"]',
    );

    await tutorial.getByTestId('tutorial-try-step').click();
    await expect(page.getByRole('dialog', { name: 'Seeking' })).toBeVisible();
    await page.keyboard.press('Escape');
    await tutorial.getByTestId('tutorial-next').click();

    await expect(tutorial).toContainText('Visibility');
    await expect(page.locator('[data-tutorial-target="visibility"]')).toBeVisible();
    await captureTutorialStateAcrossReleaseViewports(
      page,
      testInfo,
      'visibility',
      '[data-tutorial-target="visibility"]',
    );
    await tutorial.getByTestId('tutorial-try-step').click();
    await expect(page.getByRole('dialog', { name: 'Visibility' })).toBeVisible();
    await page.keyboard.press('Escape');
    await tutorial.getByTestId('tutorial-next').click();

    await expect(tutorial).toContainText('DL Mode');
    await expect(tutorial).toContainText('explicit or NSFW photos with gradients');
    await expect(page.locator('[data-tutorial-target="dl-mode"]')).toBeVisible();
    await captureTutorialStateAcrossReleaseViewports(
      page,
      testInfo,
      'dl-mode',
      '[data-tutorial-target="dl-mode"]',
    );
    const dlModeControl = page.getByRole('button', { name: /Turn DL Mode (?:on|off)/ });
    const initialDlModeLabel = await dlModeControl.getAttribute('aria-label');
    await tutorial.getByTestId('tutorial-try-step').click();
    await expect(dlModeControl).not.toHaveAttribute('aria-label', initialDlModeLabel ?? '');
    await tutorial.getByTestId('tutorial-next').click();

    await expect(tutorial).toContainText('Ping');
    await expect(page.locator('[data-tutorial-target="ping"]')).toBeVisible();
    await captureTutorialStateAcrossReleaseViewports(
      page,
      testInfo,
      'ping',
      '[data-tutorial-target="ping"]',
    );
    await tutorial.getByTestId('tutorial-try-step').click();
    await expect(page.getByRole('dialog', { name: 'Send a Ping' })).toBeVisible();
    await page.keyboard.press('Escape');
    await tutorial.getByTestId('tutorial-next').click();

    await expect(tutorial).toContainText('Zoom');
    await expect(page.locator('[data-tutorial-target="zoom"]')).toBeVisible();
    await captureTutorialStateAcrossReleaseViewports(
      page,
      testInfo,
      'zoom',
      '[data-tutorial-target="zoom"]',
    );
    await expect(page.getByRole('button', { name: 'Zoom in on map' })).toBeEnabled();
    await tutorial.getByTestId('tutorial-try-step').click();
    await tutorial.getByTestId('tutorial-next').click();

    await expect(tutorial).toBeHidden();
    const firstPostPrompt = page.getByTestId('first-feed-post-prompt');
    await expect(firstPostPrompt).toBeVisible();
    await firstPostPrompt.getByRole('button', { name: 'Write a post' }).click();
    await expect(page.getByRole('heading', { name: 'Local Feed' })).toBeVisible();

    await page.getByRole('button', { name: 'Map', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Map controls tutorial' })).toBeHidden();

    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await page.getByRole('button', { name: /Tutorial/ }).click();
    await expect(page.getByRole('heading', { name: 'Interactive map tutorial' })).toBeVisible();
    await page.getByRole('button', { name: 'Replay tutorial' }).click();
    await expect(page.getByRole('dialog', { name: 'Map controls tutorial' })).toBeVisible();
    await page.getByTestId('skip-map-controls-tutorial').click();
    await expect(page.getByRole('button', { name: 'Zoom in on map' })).toBeEnabled();
  });

  test('keeps the zoom controls usable after onboarding', async ({ page }) => {
    await page.getByTestId('skip-map-controls-tutorial').click();
    const firstPostPrompt = page.getByTestId('first-feed-post-prompt');
    await expect(firstPostPrompt).toBeVisible();
    await firstPostPrompt.getByRole('button', { name: 'Skip for now' }).click();

    const zoomIn = page.getByRole('button', { name: 'Zoom in on map' });
    const zoomOut = page.getByRole('button', { name: 'Zoom out on map' });
    await expect(zoomIn).toBeEnabled();
    await expect(zoomOut).toBeEnabled();

    for (let index = 0; index < 12; index += 1) {
      await zoomOut.click();
    }
    await expect(zoomOut).toBeEnabled();

    for (let index = 0; index < 24; index += 1) {
      await zoomIn.click();
    }
    await expect(zoomIn).toBeEnabled();
  });
});
