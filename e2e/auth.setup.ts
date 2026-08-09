import fs from 'node:fs';
import path from 'node:path';
import { expect, test as setup } from '@playwright/test';

// Keep the saved login outside Playwright's disposable outputDir so a successful
// setup login is reused by future local regression runs.
const storageStatePath = path.resolve(process.env.CRUUSH_E2E_STORAGE_STATE ?? '.playwright/auth/user.json');

function hasStoredAuth() {
  if (!fs.existsSync(storageStatePath)) {
    return false;
  }

  const state = JSON.parse(fs.readFileSync(storageStatePath, 'utf8')) as {
    cookies?: unknown[];
    origins?: Array<{ localStorage?: unknown[] }>;
  };

  return Boolean(
    (state.cookies?.length ?? 0) > 0
    || state.origins?.some((origin) => (origin.localStorage?.length ?? 0) > 0),
  );
}

setup('authenticate once and save browser state', async ({ page }) => {
  const storedAuth = hasStoredAuth();
  if (storedAuth) {
    await page.goto('/map');

    const storedSessionReachedMap = await page.getByRole('button', { name: 'Zoom in on map' })
      .isVisible({ timeout: 5_000 })
      .catch(() => false);
    if (storedSessionReachedMap) {
      return;
    }
  } else {
    await page.goto('/');
  }

  const email = process.env.CRUUSH_E2E_EMAIL?.trim();
  const password = process.env.CRUUSH_E2E_PASSWORD;

  if (!email || !password) {
    throw new Error(
      `No authenticated state at ${storageStatePath}. Set CRUUSH_E2E_STORAGE_STATE to an existing Playwright state file, or provide CRUUSH_E2E_EMAIL and CRUUSH_E2E_PASSWORD once to create it.`,
    );
  }

  const emailField = page.getByLabel('Email');
  if (await emailField.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await emailField.fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign In' }).click();

    const twoFactorField = page.getByLabel('Authenticator or recovery code');
    if (await twoFactorField.isVisible({ timeout: 2_000 }).catch(() => false)) {
      const twoFactorCode = process.env.CRUUSH_E2E_2FA_CODE?.trim();
      if (!twoFactorCode) {
        throw new Error('This account requires two-factor authentication. Set CRUUSH_E2E_2FA_CODE for the one-time setup run.');
      }

      await twoFactorField.fill(twoFactorCode);
      await page.getByRole('button', { name: 'Sign In' }).click();
    }
  }

  const conductCheckbox = page.getByRole('checkbox', {
    name: /I have read and agree to the cruush code of conduct/i,
  });
  const zoomIn = page.getByRole('button', { name: 'Zoom in on map' });
  await expect(conductCheckbox.or(zoomIn)).toBeVisible({ timeout: 30_000 });
  if (await conductCheckbox.isVisible()) {
    await conductCheckbox.check();
    await page.getByRole('button', { name: 'I agree and enter' }).click();
  }

  await expect(zoomIn).toBeEnabled({ timeout: 30_000 });
  fs.mkdirSync(path.dirname(storageStatePath), { recursive: true });
  await page.context().storageState({ path: storageStatePath });
});
