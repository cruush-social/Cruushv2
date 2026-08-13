import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getGoogleAnalyticsMeasurementId,
  getSanitizedAnalyticsPath,
  loadGoogleAnalytics,
  trackPageView,
} from './googleAnalytics';

describe('googleAnalytics', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    delete window.gtag;
    delete window.dataLayer;
    document.head.innerHTML = '';
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses the configured public GA measurement id', () => {
    vi.stubEnv('VITE_GOOGLE_ANALYTICS_ID', ' G-TEST123 ');

    expect(getGoogleAnalyticsMeasurementId()).toBe('G-TEST123');
  });

  it('keeps route analytics free of tokens and record ids', () => {
    expect(getSanitizedAnalyticsPath('/reset-password?token=secret-reset-token')).toBe('/reset-password');
    expect(getSanitizedAnalyticsPath('/?verifyEmailToken=secret-email-token')).toBe('/');
    expect(getSanitizedAnalyticsPath('/profile/ef12a1e3-dda4-48fd-af83-e0e8bc9a421e')).toBe('/profile/:userId');
    expect(getSanitizedAnalyticsPath('/chat/group/7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2')).toBe('/chat/group/:chatId');
    expect(getSanitizedAnalyticsPath('/map?mode=mutuals&focusUserId=user-2')).toBe('/map?mode=mutuals');
  });

  it('loads gtag once and emits a sanitized page view', () => {
    vi.stubEnv('VITE_GOOGLE_ANALYTICS_ID', 'G-TEST123');
    window.gtag = vi.fn();
    window.history.replaceState({}, '', '/profile/user-123?token=secret');

    expect(loadGoogleAnalytics()).toBe(true);
    trackPageView('/profile/user-123?token=secret');

    expect(document.querySelectorAll('#cruush-google-analytics')).toHaveLength(1);
    expect(window.gtag).toHaveBeenCalledWith('config', 'G-TEST123', {
      send_page_view: false,
    });
    expect(window.gtag).toHaveBeenCalledWith('event', 'page_view', expect.objectContaining({
      page_location: 'http://localhost:3000/profile/:userId',
      page_path: '/profile/:userId',
    }));
  });

  it('queues native Arguments objects for the Google tag protocol', () => {
    vi.stubEnv('VITE_GOOGLE_ANALYTICS_ID', 'G-QUEUE123');

    expect(loadGoogleAnalytics()).toBe(true);
    trackPageView('/map?mode=mutuals&focusUserId=private-user-id');

    expect(window.dataLayer).toHaveLength(3);
    expect(window.dataLayer?.map((entry) => Object.prototype.toString.call(entry))).toEqual([
      '[object Arguments]',
      '[object Arguments]',
      '[object Arguments]',
    ]);
    expect(Array.from(window.dataLayer?.[1] as IArguments)).toEqual([
      'config',
      'G-QUEUE123',
      { send_page_view: false },
    ]);
    expect(Array.from(window.dataLayer?.[2] as IArguments)).toEqual([
      'event',
      'page_view',
      expect.objectContaining({
        page_location: 'http://localhost:3000/map?mode=mutuals',
        page_path: '/map?mode=mutuals',
      }),
    ]);
  });
});
