import { expect, test, type Page } from '@playwright/test';

// The sign-up landing page must scroll on a short phone. This broke in the
// field: the auth shell had height: auto, so it grew with its content instead
// of scrolling it. The overflow landed in #root, and the shell — a scroll
// container with nothing to scroll, carrying overscroll-behavior-y: contain —
// swallowed touch pans, leaving everything below the fold unreachable on
// phones. Desktop mouse wheels happened to chain to #root, which is why the
// bug only surfaced on real devices.
//
// A short viewport forces the sign-up form to overflow the way small phones
// (and phones with the keyboard up) do.
const SHORT_VIEWPORT = { width: 375, height: 550 };

async function openSignUp(page: Page) {
  await page.setViewportSize(SHORT_VIEWPORT);
  await page.goto('/');
  await expect(page.getByTestId('launch-login-auth-panel')).toBeVisible();
  await page.getByRole('button', { name: "Don't have an account? Sign up" }).click();
  await expect(page.getByRole('button', { name: 'Create Account' })).toBeVisible();
}

test('the sign-up landing page owns its overflow in the touch-scrollable shell', async ({ page }) => {
  await openSignUp(page);

  const metrics = await page.evaluate(() => {
    const shell = document.querySelector('.launch-login-auth-shell') as HTMLElement;
    const root = document.getElementById('root') as HTMLElement;
    return {
      shellScrollHeight: shell.scrollHeight,
      shellClientHeight: shell.clientHeight,
      rootScrollHeight: root.scrollHeight,
      rootClientHeight: root.clientHeight,
      viewport: window.innerHeight,
    };
  });

  // Precondition: this viewport really does force an overflow.
  expect(metrics.shellScrollHeight).toBeGreaterThan(metrics.viewport + 50);

  // The shell is pinned to the viewport and owns the overflow. Touch pans
  // latch onto the first scrollable container, so if the shell cannot scroll
  // its own content the page is dead to touch input.
  expect(metrics.shellClientHeight).toBeLessThanOrEqual(metrics.viewport + 1);
  expect(metrics.shellScrollHeight).toBeGreaterThan(metrics.shellClientHeight + 50);

  // And #root must not be the accidental scroller the shell traps gestures from.
  expect(metrics.rootScrollHeight).toBeLessThanOrEqual(metrics.rootClientHeight + 1);
});

test('scrolls the sign-up landing page to reach every control, top and bottom', async ({ page }) => {
  await openSignUp(page);

  const logo = page.getByTestId('launch-login-auth-logo');
  const footerLinks = page.getByLabel('Legal and safety links');

  // Scroll down with a real gesture stream: the bottom of the page — the
  // policy links under the form — must become reachable.
  for (let step = 0; step < 8; step += 1) {
    await page.mouse.wheel(0, 300);
  }
  await expect(footerLinks).toBeInViewport();
  await expect(page.getByRole('link', { name: 'Takedown policy' })).toBeInViewport();

  // Scroll back up: the logo must be fully reachable too. Centred flex
  // containers clip overflowing content above the scroll origin, which
  // strands the top of the page — guard against that regressing.
  for (let step = 0; step < 8; step += 1) {
    await page.mouse.wheel(0, -300);
  }
  await expect(logo).toBeInViewport();
  const logoBox = await logo.boundingBox();
  expect(logoBox).not.toBeNull();
  expect(logoBox!.y).toBeGreaterThanOrEqual(0);
});
