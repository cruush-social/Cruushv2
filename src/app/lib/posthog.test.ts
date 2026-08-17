import { beforeEach, describe, expect, it, vi } from 'vitest';

const init = vi.fn();
const capture = vi.fn();
const optIn = vi.fn();

vi.mock('posthog-js', () => ({
  default: { init, capture, opt_in_capturing: optIn },
}));

describe('PostHog analytics', () => {
  beforeEach(() => {
    vi.resetModules();
    init.mockReset();
    capture.mockReset();
    optIn.mockReset();
  });

  it('does nothing when the public project key is absent', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', '');
    const { trackPostHogPageView } = await import('./posthog');

    expect(trackPostHogPageView('/map')).toBe(false);
    expect(init).not.toHaveBeenCalled();
  });

  it('initializes once and captures only a sanitized page path', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test');
    vi.stubEnv('VITE_POSTHOG_HOST', 'https://example.posthog.test');
    init.mockImplementation((_key, options: { loaded?: () => void }) => options.loaded?.());
    const { trackPostHogPageView } = await import('./posthog');

    expect(trackPostHogPageView('/profile/secret-user?mode=preview&token=secret', 'Profile')).toBe(true);
    expect(trackPostHogPageView('/profile/secret-user?mode=preview&token=secret', 'Profile')).toBe(true);

    expect(init).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledWith('phc_test', expect.objectContaining({
      api_host: 'https://example.posthog.test',
      autocapture: false,
      capture_pageview: false,
      disable_session_recording: true,
      persistence: 'memory',
    }));
    expect(capture).toHaveBeenCalledWith('$pageview', {
        $current_url: 'http://localhost:3000/profile/:userId?mode=preview',
        $pathname: '/profile/:userId?mode=preview',
        $title: 'Profile',
      }, { send_instantly: true });
  });
});
