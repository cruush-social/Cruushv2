import { expect, test } from '@playwright/test';

test.describe('install flow', () => {
  test('opens the browser install prompt from notification settings', async ({ page }) => {
    await page.addInitScript(() => {
      // Keep the browser's automatic availability event from opening the prompt
      // before this test exercises the explicit Settings action.
      window.localStorage.setItem('cruush-install-prompt-dismissed', 'true');
    });

    await page.goto('/settings/notifications');
    await expect(page.getByRole('heading', { name: 'Notification settings' })).toBeVisible();

    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
        prompt: () => Promise<void>;
        userChoice: Promise<{ outcome: 'accepted' }>;
      };
      Object.defineProperties(event, {
        prompt: {
          value: () => {
            window.localStorage.setItem('cruush-e2e-install-prompt-called', 'true');
            return Promise.resolve();
          },
        },
        userChoice: {
          value: Promise.resolve({ outcome: 'accepted' as const }),
        },
      });
      window.dispatchEvent(event);
    });

    const installSection = page.locator('section').filter({
      has: page.getByRole('heading', { name: 'Home Screen app' }),
    });
    await installSection.getByRole('button', { name: 'Install cruush' }).click();

    const prompt = page.getByTestId('mobile-install-prompt');
    await expect(prompt).toBeVisible();
    await prompt.getByRole('button', { name: 'Install cruush' }).click();
    await expect.poll(() => page.evaluate(() => (
      window.localStorage.getItem('cruush-e2e-install-prompt-called')
    ))).toBe('true');
    await expect(prompt).not.toBeVisible();
  });
});
