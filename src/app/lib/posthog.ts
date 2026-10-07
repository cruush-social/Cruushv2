import posthog from 'posthog-js';
import { getSanitizedAnalyticsPath } from './analyticsPath';
import type { CryptoSendingApp } from './cryptoCheckoutApi';

const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com';

let initialized = false;
let pendingPageView: { path: string; title: string } | null = null;

export type BitcoinCheckoutMilestone =
  | 'bitcoin payment method selected'
  | 'bitcoin order created'
  | 'bitcoin payment confirmed';

type BitcoinCheckoutMilestoneDetails = {
  productType: 'cruush_plus' | 'ping_pack';
  productId: string;
  sendingApp: CryptoSendingApp;
};

export type CruushPlusConversionEvent =
  | 'cruush_plus_paywall_viewed'
  | 'cruush_plus_upgrade_clicked'
  | 'cruush_plus_store_viewed'
  | 'cruush_plus_plan_selected'
  | 'cruush_plus_checkout_started'
  | 'cruush_plus_order_created'
  | 'cruush_plus_purchase_completed';

export type CruushPlusConversionDetails = {
  surface?: string;
  benefit?: string;
  productType?: 'cruush_plus' | 'ping_pack';
  productId?: string;
  sendingApp?: CryptoSendingApp;
  experimentVariant?: 'control' | 'store';
};

function getPostHogKey() {
  return import.meta.env.VITE_POSTHOG_KEY?.trim() ?? '';
}

export function getPostHogHost() {
  return import.meta.env.VITE_POSTHOG_HOST?.trim() || DEFAULT_POSTHOG_HOST;
}

export function initializePostHog() {
  const key = getPostHogKey();

  if (!key || typeof window === 'undefined') {
    return false;
  }

  if (initialized) {
    return true;
  }

  posthog.init(key, {
    api_host: getPostHogHost(),
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    persistence: 'memory',
    loaded: () => {
      if (!pendingPageView) {
        return;
      }

      const { path, title } = pendingPageView;
      pendingPageView = null;
      capturePostHogPageView(path, title);
    },
  });
  posthog.opt_in_capturing();
  initialized = true;

  return true;
}

export function trackPostHogPageView(
  path: string,
  title = typeof document === 'undefined' ? '' : document.title,
) {
  const wasInitialized = initialized;

  if (!wasInitialized) {
    pendingPageView = { path, title };
  }

  if (!initializePostHog()) {
    pendingPageView = null;
    return false;
  }

  if (!wasInitialized) {
    return true;
  }

  capturePostHogPageView(path, title);
  return true;
}

export function trackBitcoinCheckoutMilestone(
  event: BitcoinCheckoutMilestone,
  details: BitcoinCheckoutMilestoneDetails,
) {
  if (!initializePostHog()) {
    return false;
  }

  // Keep payment analytics deliberately aggregate-only. In particular, never
  // pass an intent ID, wallet address, transaction ID, amount, URL, or error.
  posthog.capture(event, {
    product_type: details.productType,
    product_id: details.productId,
    sending_app: details.sendingApp,
  }, { send_instantly: true });

  return true;
}

export function trackCruushPlusConversion(
  event: CruushPlusConversionEvent,
  details: CruushPlusConversionDetails = {},
) {
  if (!initializePostHog()) {
    return false;
  }

  // Conversion events are deliberately aggregate-only. Keep this explicit
  // allowlist so payment, member, wallet, URL, coupon, and error data cannot
  // accidentally reach analytics through an object spread.
  posthog.capture(event, {
    ...(details.surface ? { surface: details.surface } : {}),
    ...(details.benefit ? { benefit: details.benefit } : {}),
    ...(details.productType ? { product_type: details.productType } : {}),
    ...(details.productId ? { product_id: details.productId } : {}),
    ...(details.sendingApp ? { sending_app: details.sendingApp } : {}),
    ...(details.experimentVariant ? { experiment_variant: details.experimentVariant } : {}),
  }, { send_instantly: true });

  return true;
}

export function getPostHogFeatureFlag(key: string) {
  if (!initializePostHog()) {
    return undefined;
  }

  return posthog.getFeatureFlag(key);
}

export function onPostHogFeatureFlags(callback: () => void) {
  if (!initializePostHog()) {
    return undefined;
  }

  return posthog.onFeatureFlags(callback);
}

function capturePostHogPageView(path: string, title: string) {

  const sanitizedPath = getSanitizedAnalyticsPath(path);
  posthog.capture('$pageview', {
    $current_url: `${window.location.origin}${sanitizedPath}`,
    $pathname: sanitizedPath,
    $title: title,
  }, { send_instantly: true });

}
