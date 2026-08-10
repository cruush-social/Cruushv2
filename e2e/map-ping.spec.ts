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
      window.localStorage.setItem('cruush:tutorial-v3-seen', 'true');
    });

    await page.route('**/api/users/me/notices/**', async (route) => {
      if (decodeURIComponent(route.request().url()).includes('cruush:tutorial-v3-seen')) {
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

  test('renders the escalating flat-blue Ghost marker without badge overlap', async ({ page }, testInfo) => {
    const ghostExpiresAt = Date.now() + 30_000;
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
            animationHint: 'FADE_LAST_MINUTE',
            ghostRotationExpiresAtMs: ghostExpiresAt,
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
    const pulse = page.getByTestId('marker-ghost-pulse-ghost-preview');
    const heart = page.getByTestId('marker-heart-ghost-preview');
    const positionBadge = page.getByTestId('marker-badge-ghost-preview');
    const relationshipBadge = page.getByTestId('marker-relationship-ghost-preview');
    const signalStack = page.getByTestId('marker-signal-stack-ghost-preview');
    await expect(pulse).toBeVisible();
    await expect(pulse.getByTestId('marker-signal-stack-ghost-preview')).toHaveCount(1);
    await expect(heart).toHaveAttribute('data-has-photo', 'true');
    await expect(page.getByTestId('marker-photo-fill-ghost-preview')).toHaveCount(0);
    await expect(heart.locator('path[fill="#0BA8FF"][stroke="#0BA8FF"]')).toHaveCount(1);

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

    await assertGeometry();
    if (testInfo.project.name === 'chromium') {
      mkdirSync(previewDirectory, { recursive: true });
      for (const viewport of releaseViewports) {
        await page.setViewportSize(viewport);
        await expect(pulse).toBeVisible();
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

  test('plays the recovered Ghost terminal once with an 80px straight-rise Ghost', async ({ page }, testInfo) => {
    const ghostExpiresAt = Date.now() + 4_000;
    await page.route((url) => url.pathname === '/api/users', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ data: [
          {
            id: 'ghost-terminal-preview',
            name: 'Ghost terminal preview',
            display_name: 'Ghost terminal preview',
            signal: 'Leaving now',
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
            photo: '/uploads/ghost-terminal-preview.jpg',
            displayMode: 'GHOST',
            animationHint: 'FADE_LAST_MINUTE',
            ghostRotationExpiresAtMs: ghostExpiresAt,
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

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/map');

    const heart = page.getByTestId('marker-heart-ghost-terminal-preview');
    const heartLayer = page.getByTestId('marker-heart-layer-ghost-terminal-preview');
    const heartUnit = heartLayer.locator('..');
    const flyGhost = page.getByTestId('marker-ghost-fly-icon-ghost-terminal-preview');
    const puff = page.getByTestId('marker-ghost-puff-ghost-terminal-preview');

    await expect(heart).toBeVisible();
    await expect(heartUnit).toHaveAttribute('data-ghost-rotation-exit', 'false');
    await expect.poll(
      () => heartUnit.getAttribute('data-ghost-rotation-exit'),
      { intervals: [25], timeout: 10_000 },
    ).toBe('active');
    await expect(flyGhost).toHaveCount(1);
    await expect(puff).toHaveCount(1);
    await expect.poll(
      async () => Number.parseFloat(await flyGhost.evaluate((node) => getComputedStyle(node).opacity)),
      { intervals: [25], timeout: 1_000 },
    ).toBeGreaterThan(0.5);
    if (testInfo.project.name === 'chromium') {
      mkdirSync(previewDirectory, { recursive: true });
      await page.screenshot({ path: `${previewDirectory}/ghost-terminal-390x844.png` });
    }

    const animationProof = await flyGhost.evaluate((node) => {
      const animation = node.getAnimations()[0];
      const effect = animation?.effect as KeyframeEffect | null;
      const timing = effect?.getComputedTiming();
      const keyframes = effect?.getKeyframes().map((keyframe) => ({
        computedOffset: keyframe.computedOffset,
        opacity: String(keyframe.opacity),
        transform: String(keyframe.transform),
      })) ?? [];
      const heartNode = document.querySelector<HTMLElement>('[data-testid="marker-heart-ghost-terminal-preview"]');
      const style = getComputedStyle(node);
      const puffNode = document.querySelector<HTMLElement>('[data-testid="marker-ghost-puff-ghost-terminal-preview"]');
      const puffStyle = puffNode ? getComputedStyle(puffNode) : null;

      return {
        color: style.color,
        duration: Number(timing?.duration),
        flyFilter: style.filter,
        flyWidth: Number.parseFloat(style.width),
        heartWidth: heartNode ? Number.parseFloat(getComputedStyle(heartNode).width) : null,
        iterations: timing?.iterations,
        keyframes,
        puffBackgroundImage: puffStyle?.backgroundImage,
        puffFilter: puffStyle?.filter,
      };
    });

    expect(animationProof.flyWidth).toBe(80);
    expect(animationProof.heartWidth).toBe(80);
    expect(animationProof.duration).toBe(1_250);
    expect(animationProof.iterations).toBe(1);
    expect(animationProof.color).toBe('rgb(11, 168, 255)');
    expect(animationProof.flyFilter).toBe('none');
    expect(animationProof.puffFilter).toBe('none');
    expect(animationProof.puffBackgroundImage).toBe('none');
    expect(animationProof.keyframes.map(({ computedOffset }) => computedOffset)).toEqual([0, 0.42, 0.58, 1]);
    expect(animationProof.keyframes.every(({ transform }) => !/scale|rotate|translateX/.test(transform))).toBe(true);
    const horizontalAnchors = animationProof.keyframes.map(({ transform }) => transform.replace(/\s*translateY\([^)]*\)\s*$/, ''));
    expect(new Set(horizontalAnchors).size).toBe(1);
    expect(animationProof.keyframes.at(-1)?.transform).toMatch(/translateY\(-(30px|1\.875rem)\)/);

    await expect(heartUnit).toHaveAttribute('data-ghost-rotation-exit', 'complete', { timeout: 3_000 });
    await expect(flyGhost).toHaveCount(0);
    await expect(puff).toHaveCount(0);
    await expect(heartLayer).toHaveCSS('opacity', '0');

    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForTimeout(1_400);
    await expect(heartUnit).toHaveAttribute('data-ghost-rotation-exit', 'complete');
    await expect(flyGhost).toHaveCount(0);
    await expect(puff).toHaveCount(0);
  });

  test('skips the Ghost terminal motion when reduced motion is requested', async ({ page }) => {
    const ghostExpiresAt = Date.now() + 3_000;
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route((url) => url.pathname === '/api/users', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ data: [
          {
            id: 'ghost-terminal-reduced-motion',
            name: 'Ghost reduced motion preview',
            display_name: 'Ghost reduced motion preview',
            signal: 'Leaving now',
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
            photo: '/uploads/ghost-terminal-reduced-motion.jpg',
            displayMode: 'GHOST',
            animationHint: 'FADE_LAST_MINUTE',
            ghostRotationExpiresAtMs: ghostExpiresAt,
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

    const heart = page.getByTestId('marker-heart-ghost-terminal-reduced-motion');
    const heartLayer = page.getByTestId('marker-heart-layer-ghost-terminal-reduced-motion');
    const heartUnit = heartLayer.locator('..');
    const flyGhost = page.getByTestId('marker-ghost-fly-icon-ghost-terminal-reduced-motion');
    const puff = page.getByTestId('marker-ghost-puff-ghost-terminal-reduced-motion');

    await expect(heart).toBeVisible();
    await expect(heartUnit).toHaveAttribute('data-ghost-rotation-exit', 'false');
    await expect(heartUnit).toHaveAttribute('data-ghost-rotation-exit', 'complete', { timeout: 10_000 });
    await expect(flyGhost).toHaveCount(0);
    await expect(puff).toHaveCount(0);
    await expect(heartLayer).toHaveCSS('opacity', '0');

    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForTimeout(1_400);
    await expect(heartUnit).toHaveAttribute('data-ghost-rotation-exit', 'complete');
    await expect(flyGhost).toHaveCount(0);
    await expect(puff).toHaveCount(0);
  });
});
