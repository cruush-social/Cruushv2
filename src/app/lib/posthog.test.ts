import { beforeEach, describe, expect, it, vi } from 'vitest';

const init = vi.fn();
const capture = vi.fn();
const optIn = vi.fn();
const getFeatureFlag = vi.fn();
const onFeatureFlags = vi.fn();

vi.mock('posthog-js', () => ({
  default: { init, capture, opt_in_capturing: optIn, getFeatureFlag, onFeatureFlags },
}));

describe('PostHog analytics', () => {
  beforeEach(() => {
    vi.resetModules();
    init.mockReset();
    capture.mockReset();
    optIn.mockReset();
    getFeatureFlag.mockReset();
    onFeatureFlags.mockReset();
  });

  it('does nothing when the public project key is absent', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', '');
    const { trackBitcoinCheckoutMilestone, trackPostHogPageView } = await import('./posthog');

    expect(trackPostHogPageView('/map')).toBe(false);
    expect(trackBitcoinCheckoutMilestone('bitcoin order created', {
      productType: 'cruush_plus',
      productId: 'plus_annual',
      sendingApp: 'cash_app',
    })).toBe(false);
    expect(init).not.toHaveBeenCalled();
  });

  it('initializes once and captures only a sanitized page path', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test');
    vi.stubEnv('VITE_POSTHOG_HOST', 'https://example.posthog.test');
    init.mockImplementation((_key, options: { loaded?: () => void }) => options.loaded?.());
    const { trackPostHogPageView } = await import('./posthog');

    expect(trackPostHogPageView('/profile/secret-user?mode=preview&token=secret', 'Profile')).toBe(true);
    expect(trackPostHogPageView('/profile/secret-user?mode=preview&token=secret', 'Profile')).toBe(true);

    await vi.waitFor(() => expect(init).toHaveBeenCalledTimes(1));
    expect(init).toHaveBeenCalledWith('phc_test', expect.objectContaining({
      api_host: 'https://example.posthog.test',
      autocapture: false,
      capture_pageview: false,
      disable_session_recording: true,
      persistence: 'memory',
    }));
    expect(capture).toHaveBeenCalledTimes(2);
    expect(capture).toHaveBeenCalledWith('$pageview', {
        $current_url: 'http://localhost:3000/profile/:userId?mode=preview',
        $pathname: '/profile/:userId?mode=preview',
        $title: 'Profile',
      }, { send_instantly: true });
  });

  it('captures Bitcoin checkout milestones with only aggregate allowlisted properties', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test');
    const { trackBitcoinCheckoutMilestone } = await import('./posthog');

    expect(trackBitcoinCheckoutMilestone('bitcoin order created', {
      productType: 'cruush_plus',
      productId: 'founder_annual',
      sendingApp: 'venmo',
    })).toBe(true);

    await vi.waitFor(() => expect(capture).toHaveBeenCalled());
    expect(capture).toHaveBeenCalledWith('bitcoin order created', {
      product_type: 'cruush_plus',
      product_id: 'founder_annual',
      sending_app: 'venmo',
    }, { send_instantly: true });
  });

  it('captures cruush+ conversion events with only aggregate allowlisted properties', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test');
    const { trackCruushPlusConversion } = await import('./posthog');

    expect(trackCruushPlusConversion('cruush_plus_order_created', {
      surface: 'map_filters',
      benefit: 'seeking_visibility',
      productType: 'cruush_plus',
      productId: 'founder_annual',
      sendingApp: 'venmo',
      experimentVariant: 'store',
    })).toBe(true);

    await vi.waitFor(() => expect(capture).toHaveBeenCalled());
    expect(capture).toHaveBeenCalledWith('cruush_plus_order_created', {
      surface: 'map_filters',
      benefit: 'seeking_visibility',
      product_type: 'cruush_plus',
      product_id: 'founder_annual',
      sending_app: 'venmo',
      experiment_variant: 'store',
    }, { send_instantly: true });
  });
  it('queues allowed events during SDK loading and cancels subscriptions before they attach', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test');
    const { trackCruushPlusConversion, onPostHogFeatureFlags } = await import('./posthog');
    const callback = vi.fn();
    const cancel = onPostHogFeatureFlags(callback);
    trackCruushPlusConversion('cruush_plus_paywall_viewed', { surface: 'map_top' });
    trackCruushPlusConversion('cruush_plus_upgrade_clicked', { surface: 'map_top' });
    expect(init).not.toHaveBeenCalled();
    cancel?.();
    await vi.waitFor(() => expect(capture).toHaveBeenCalledTimes(2));
    expect(init).toHaveBeenCalledTimes(1);
    expect(onFeatureFlags).not.toHaveBeenCalled();
    expect(capture.mock.calls.map(call => call[0])).toEqual([
      'cruush_plus_paywall_viewed', 'cruush_plus_upgrade_clicked',
    ]);
  });

});
