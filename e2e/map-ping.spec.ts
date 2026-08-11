import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const releaseViewports = [
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
] as const;
const previewDirectory = '/tmp/cruush-v1.2-previews';

function badgeCenterOffsetRatio(a: NonNullable<Awaited<ReturnType<import('@playwright/test').Locator['boundingBox']>>>, b: NonNullable<Awaited<ReturnType<import('@playwright/test').Locator['boundingBox']>>>) {
  const aCenter = a.x + a.width / 2;
  const bCenter = b.x + b.width / 2;
  return Math.abs(aCenter - bCenter) / a.width;
}

async function captureMarkerPreview(
  page: import('@playwright/test').Page,
  locators: import('@playwright/test').Locator[],
  path: string,
) {
  const boxes = (await Promise.all(locators.map((locator) => locator.boundingBox())))
    .filter((box): box is NonNullable<typeof box> => box !== null);
  expect(boxes).toHaveLength(locators.length);
  const padding = 12;
  const x = Math.max(0, Math.min(...boxes.map((box) => box.x)) - padding);
  const y = Math.max(0, Math.min(...boxes.map((box) => box.y)) - padding);
  const right = Math.min(page.viewportSize()!.width, Math.max(...boxes.map((box) => box.x + box.width)) + padding);
  const bottom = Math.min(page.viewportSize()!.height, Math.max(...boxes.map((box) => box.y + box.height)) + padding);
  await page.screenshot({ path, clip: { x, y, width: right - x, height: bottom - y } });
}

test.describe('authenticated map Ping', () => {
  test.beforeEach(async ({ page }) => {
    let activePing = false;
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();

    await page.context().grantPermissions(['geolocation']);
    await page.context().setGeolocation({ latitude: 40.701, longitude: -73.901 });

    await page.addInitScript(() => {
      window.localStorage.setItem('cruush:tutorial-v4-seen', 'true');
    });

    await page.route('**/api/users/me/notices/**', async (route) => {
      if (decodeURIComponent(route.request().url()).includes('cruush:tutorial-v4-seen')) {
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              dismissed: true,
              dismissedAt: new Date().toISOString(),
            },
          }),
        });
        return;
      }

      await route.continue();
    });

    await page.route('**/api/profiles/me', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }

      const response = await route.fetch();
      const payload = await response.json();
      payload.data.signal = 'Come say hi';
      await route.fulfill({ response, json: payload });
    });

    await page.route((url) => url.pathname === '/api/users', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
    });

    await page.route('**/api/map-pings/status', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            allowance: {
              limit: 3,
              used: activePing ? 1 : 0,
              remaining: activePing ? 2 : 3,
              nextEligibleAt: null,
            },
            activePing: activePing ? { id: 'ping-own', expiresAt } : null,
            receivedPings: [],
          },
        }),
      });
    });

    await page.route('**/api/map-pings', async (route) => {
      const payload = route.request().postDataJSON();
      expect(Object.keys(payload).sort()).toEqual(['idempotencyKey', 'radiusMiles']);
      expect(payload.radiusMiles).toBe(15);
      expect(payload.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/i);
      activePing = true;

      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            allowance: {
              limit: 3,
              used: 1,
              remaining: 2,
              nextEligibleAt: null,
            },
            activePing: { id: 'ping-own', expiresAt },
            receivedPings: [],
          },
        }),
      });
    });
  });

  test('sends a selected radius and keeps the active marker geometry clear', async ({ page }, testInfo) => {
    await page.goto('/map');

    const pingControl = page.getByRole('button', { name: 'Send a Ping' });
    await expect(pingControl).toHaveAttribute('data-tutorial-target', 'ping');
    await pingControl.evaluate((button: HTMLButtonElement) => button.click());

    const sheet = page.getByRole('dialog', { name: 'Send a Ping' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText('Come say hi')).toBeVisible();
    await expect(sheet.getByRole('radio')).toHaveCount(5);
    await sheet.getByRole('radio', { name: '15 miles' }).click();
    await sheet.getByRole('button', { name: 'Send Ping' }).click();
    await expect(sheet.getByRole('button', { name: 'Ping active' })).toBeDisabled();
    await page.keyboard.press('Escape');

    const heart = page.getByTestId('marker-heart-me');
    const badge = page.getByTestId('marker-badge-me');
    const signal = page.getByTestId('marker-signal-stack-me');
    const signalBadge = page.getByTestId('marker-signal-badge-me');
    const heartUnit = page.getByTestId('marker-heart-layer-me');
    await expect(heart).toBeVisible();
    await expect(signal).toBeVisible();
    await expect(signal).toHaveAttribute('data-signal-position', 'v2-frame-top');
    await expect(signal).toHaveClass(/left-1\/2.*top-0.*-translate-x-1\/2.*-translate-y-full/);
    await expect(heartUnit.getByTestId('marker-signal-stack-me')).toHaveCount(1);
    await expect(page.getByTestId('marker-ping-rings-me')).toHaveCount(0);
    await expect(heart.locator('path[fill="#C8FF31"]')).toHaveCount(0);

    const heartBox = await heart.boundingBox();
    const badgeBox = await badge.boundingBox();
    const signalBox = await signalBadge.boundingBox();
    expect(heartBox).not.toBeNull();
    expect(badgeBox).not.toBeNull();
    expect(signalBox).not.toBeNull();
    await expect(badge).toHaveCSS('width', '25px');
    expect(badgeCenterOffsetRatio(heartBox!, badgeBox!)).toBeCloseTo(0.5375, 2);
    expect(signalBox!.y + signalBox!.height).toBeLessThanOrEqual(heartBox!.y + 0.5);

    if (testInfo.project.name === 'chromium') {
      mkdirSync(previewDirectory, { recursive: true });
      for (const viewport of releaseViewports) {
        await page.setViewportSize(viewport);
        await expect(heart).toBeVisible();
        await expect(badge).toHaveCSS('width', '25px');
        await expect.poll(async () => {
          const viewportHeartBox = await heart.boundingBox();
          const viewportBadgeBox = await badge.boundingBox();
          if (!viewportHeartBox || !viewportBadgeBox) {
            return false;
          }
          return Math.abs(badgeCenterOffsetRatio(viewportHeartBox, viewportBadgeBox) - 0.5375) <= 0.01;
        }).toBe(true);
        await page.screenshot({
          path: `${previewDirectory}/ping-${viewport.width}x${viewport.height}.png`,
          animations: 'disabled',
        });
        if (viewport.width === 390) {
          await captureMarkerPreview(
            page,
            [heart, badge, signalBadge],
            `${previewDirectory}/ping-marker-390x844.png`,
          );
        }
      }
    }
  });

  test('renders a static Ghost profile photo marker without recoloring its mutual heart', async ({ page }, testInfo) => {
    await page.route((url) => url.pathname === '/api/users', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ data: [
          {
            id: 'ghost-preview',
            name: 'Ghost preview',
            display_name: 'Ghost preview',
            signal: 'Around tonight',
            age: 30,
            pronouns: 'they/them',
            lat: 40.704,
            lng: -73.904,
            lastActive: 'Now',
            distance: '2 mi',
            lookingFor: [],
            vibes: [],
            position: ['top'],
            role: [],
            hostingTravel: [],
            photo: '/uploads/ghost-preview.jpg',
            displayMode: 'GHOST',
            privacyRadiusMeters: 1609,
            relationship: {
              mutualCruush: true,
              canMessage: true,
              precision: 'fuzzy',
            },
          },
        ] }),
      });
    });

    await page.goto('/map');
    const markerButton = page.getByRole('button', { name: 'Open Ghost preview on map' });
    const heartLayer = page.getByTestId('marker-heart-layer-ghost-preview');
    const heart = page.getByTestId('marker-heart-ghost-preview');
    const positionBadge = page.getByTestId('marker-badge-ghost-preview');
    const relationshipBadge = page.getByTestId('marker-relationship-ghost-preview');
    const signalStack = page.getByTestId('marker-signal-stack-ghost-preview');
    const signalBadge = page.getByTestId('marker-signal-badge-ghost-preview');
    await expect(heartLayer).toBeVisible();
    await expect(heartLayer.getByTestId('marker-signal-stack-ghost-preview')).toHaveCount(1);
    await expect(markerButton).not.toHaveAttribute('data-animation-hint');
    await expect(markerButton).not.toHaveAttribute('data-ghost-rotation-expires-at');
    await expect(heartLayer).toHaveCSS('animation-name', 'none');
    await expect(page.getByTestId('marker-ghost-pulse-ghost-preview')).toHaveCount(0);
    await expect(page.getByTestId('marker-ghost-fly-icon-ghost-preview')).toHaveCount(0);
    await expect(page.getByTestId('marker-ghost-puff-ghost-preview')).toHaveCount(0);
    await expect(heart).toHaveAttribute('data-has-photo', 'true');
    await expect(page.getByTestId('marker-photo-fill-ghost-preview')).toHaveCount(1);
    await expect(heart.locator('path[fill="none"][stroke="#6f00ff"]')).toHaveCount(1);
    await expect(positionBadge).toHaveClass(/border-\[\#6f00ff\]\/80/);
    await expect(relationshipBadge).toHaveClass(/border-\[\#6f00ff\]\/80/);
    await expect(signalBadge).toHaveClass(/border-white\/12/);

    const assertGeometry = async () => {
      await expect(positionBadge).toHaveCSS('width', '25px');
      await expect(relationshipBadge).toHaveCSS('width', '25px');
      await expect(signalStack).toHaveAttribute('data-signal-position', 'v2-frame-top');
      await expect(signalStack).toHaveClass(/left-1\/2.*top-0.*-translate-x-1\/2.*-translate-y-full/);
      await expect.poll(async () => {
        const heartBox = await heart.boundingBox();
        const positionBadgeBox = await positionBadge.boundingBox();
        const relationshipBadgeBox = await relationshipBadge.boundingBox();
        if (!heartBox || !positionBadgeBox || !relationshipBadgeBox) {
          return false;
        }
        return Math.abs(badgeCenterOffsetRatio(heartBox, positionBadgeBox) - 0.5375) <= 0.01
          && Math.abs(badgeCenterOffsetRatio(heartBox, relationshipBadgeBox) - 0.5375) <= 0.01;
      }).toBe(true);
    };

    await expect(signalStack).toHaveCSS('opacity', '0');
    if (testInfo.project.name === 'mobile-chromium') {
      await markerButton.focus();
    } else {
      await markerButton.hover();
    }
    await expect(signalStack).toHaveCSS('opacity', '1');
    await assertGeometry();
    if (testInfo.project.name === 'chromium') {
      mkdirSync(previewDirectory, { recursive: true });
      for (const viewport of releaseViewports) {
        await page.setViewportSize(viewport);
        await expect(heartLayer).toBeVisible();
        await assertGeometry();
        await page.screenshot({
          path: `${previewDirectory}/ghost-${viewport.width}x${viewport.height}.png`,
        });
        if (viewport.width === 390) {
          await captureMarkerPreview(
            page,
            [heart, positionBadge, relationshipBadge],
            `${previewDirectory}/ghost-marker-390x844.png`,
          );
        }
      }
    }

  });

});
