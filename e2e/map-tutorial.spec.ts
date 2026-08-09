import { expect, test } from '@playwright/test';

const tutorialStorageKey = 'cruush:tutorial-v2-seen';
const firstFeedPostStorageKeyPrefix = 'cruush:first-feed-post-prompt-seen:';

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
      window.localStorage.removeItem('cruush:tutorial-v2-seen');
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
    await page.context().clearCookies({ name: 'cruush_tutorial-v2-seen' });
    await page.context().clearCookies({ name: /^cruush_first-feed-post-prompt-seen_/ });
    await page.evaluate((key) => localStorage.removeItem(key), tutorialStorageKey);
    await page.reload();

    await expect(page.getByRole('dialog', { name: 'Map controls tutorial' })).toBeVisible();
  });

  test('walks the real controls, offers an optional first post, persists completion, and replays from settings', async ({ page }) => {
    const tutorial = page.getByRole('dialog', { name: 'Map controls tutorial' });

    await expect(tutorial).toContainText('Seeking');
    await expect(page.getByTestId('tutorial-spotlight')).toBeVisible();
    await expect(page.locator('[data-tutorial-target="seeking"]')).toBeVisible();

    await tutorial.getByTestId('tutorial-try-step').click();
    await expect(page.getByRole('dialog', { name: 'Seeking' })).toBeVisible();
    await page.keyboard.press('Escape');
    await tutorial.getByTestId('tutorial-next').click();

    await expect(tutorial).toContainText('Visibility');
    await expect(page.locator('[data-tutorial-target="visibility"]')).toBeVisible();
    await tutorial.getByTestId('tutorial-try-step').click();
    await expect(page.getByRole('dialog', { name: 'Visibility' })).toBeVisible();
    await page.keyboard.press('Escape');
    await tutorial.getByTestId('tutorial-next').click();

    await expect(tutorial).toContainText('DL Mode');
    await expect(tutorial).toContainText('explicit or NSFW photos with gradients');
    await expect(page.locator('[data-tutorial-target="dl-mode"]')).toBeVisible();
    const dlModeControl = page.getByRole('button', { name: /Turn DL Mode (?:on|off)/ });
    const initialDlModeLabel = await dlModeControl.getAttribute('aria-label');
    await tutorial.getByTestId('tutorial-try-step').click();
    await expect(dlModeControl).not.toHaveAttribute('aria-label', initialDlModeLabel ?? '');
    await tutorial.getByTestId('tutorial-next').click();

    await expect(tutorial).toContainText('Zoom');
    await expect(page.locator('[data-tutorial-target="zoom"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Zoom in on map' })).toBeEnabled();
    await tutorial.getByTestId('tutorial-try-step').click();
    await tutorial.getByTestId('tutorial-next').click();

    await expect(tutorial).toBeHidden();
    const firstPostPrompt = page.getByTestId('first-feed-post-prompt');
    await expect(firstPostPrompt).toBeVisible();
    await firstPostPrompt.getByRole('button', { name: 'Write a post' }).click();
    await expect(page.getByRole('heading', { name: 'Local Feed' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('dialog', { name: 'Map controls tutorial' })).toBeHidden();

    await page.goto('/settings/tutorial');
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
