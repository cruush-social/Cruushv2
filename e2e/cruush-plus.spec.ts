import { expect, test } from '@playwright/test';

type RewardSummaryResponse = {
  data: {
    promotionalAccess: unknown;
    recentGrants: unknown;
  };
};

test.describe('authenticated cruush+ regression', () => {
  test('billing reads do not grant cruush+ and the retired launch offer stays gone', async ({ page }) => {
    const retiredOfferRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/rewards/beta-launch/')) {
        retiredOfferRequests.push(request.url());
      }
    });

    const beforeResponse = await page.request.get('/api/rewards/summary');
    expect(beforeResponse.ok()).toBe(true);
    const before = (await beforeResponse.json()) as RewardSummaryResponse;

    await page.goto('/map');
    await expect(page.getByRole('button', { name: 'Zoom in on map' })).toBeEnabled();
    await expect(page.getByText('7-day cruush+ trial', { exact: true })).toHaveCount(0);
    expect(retiredOfferRequests).toEqual([]);

    const firstBillingRead = await page.request.get('/api/billing/me');
    const secondBillingRead = await page.request.get('/api/billing/me');
    expect(firstBillingRead.ok()).toBe(true);
    expect(secondBillingRead.ok()).toBe(true);

    const afterResponse = await page.request.get('/api/rewards/summary');
    expect(afterResponse.ok()).toBe(true);
    const after = (await afterResponse.json()) as RewardSummaryResponse;

    expect(after.data.promotionalAccess).toEqual(before.data.promotionalAccess);
    expect(after.data.recentGrants).toEqual(before.data.recentGrants);
  });
});
