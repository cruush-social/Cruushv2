import { getSanitizedAnalyticsPath } from './analyticsPath';
import type { CryptoSendingApp } from './cryptoCheckoutApi';

type PostHogClient = typeof import('posthog-js').default;
let posthog: PostHogClient | undefined;
let initializing: Promise<void> | null = null;
let pendingActions: Array<(client: PostHogClient) => void> = [];

const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com';

let initialized = false;

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

  if (initialized || initializing) {
    return true;
  }

  // Analytics must not be a dependency of the first app render.
  initializing = import('posthog-js').then(({ default: client }) => {
    posthog = client;
    client.init(key, {
      api_host: getPostHogHost(),
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
      persistence: 'memory',
    });
    client.opt_in_capturing();
    initialized = true;
    const actions = pendingActions;
    pendingActions = [];
    actions.forEach((action) => action(client));
  }).catch(() => {
    initializing = null;
    posthog = undefined;
    pendingActions = [];
    initialized = false;
  });

  return true;
}

export function trackPostHogPageView(
  path: string,
  title = typeof document === 'undefined' ? '' : document.title,
) {
  if (!initializePostHog()) return false;
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
  captureEvent(event, {
    product_type: details.productType,
    product_id: details.productId,
    sending_app: details.sendingApp,
  });

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
  captureEvent(event, {
    ...(details.surface ? { surface: details.surface } : {}),
    ...(details.benefit ? { benefit: details.benefit } : {}),
    ...(details.productType ? { product_type: details.productType } : {}),
    ...(details.productId ? { product_id: details.productId } : {}),
    ...(details.sendingApp ? { sending_app: details.sendingApp } : {}),
    ...(details.experimentVariant ? { experiment_variant: details.experimentVariant } : {}),
  });

  return true;
}

export function getPostHogFeatureFlag(key: string) {
  if (!initializePostHog()) {
    return undefined;
  }

  return posthog?.getFeatureFlag(key);
}

export function onPostHogFeatureFlags(callback: () => void) {
  if (!initializePostHog()) {
    return undefined;
  }

  let active = true;
  let unsubscribe: (() => void) | undefined;
  const subscribe = (client: PostHogClient) => {
    if (active) unsubscribe = client.onFeatureFlags(callback);
  };
  if (initialized && posthog) subscribe(posthog);
  else pendingActions.push(subscribe);
  return () => { active = false; unsubscribe?.(); };
}

function capturePostHogPageView(path: string, title: string) {

  const sanitizedPath = getSanitizedAnalyticsPath(path);
  captureEvent('$pageview', {
    $current_url: `${window.location.origin}${sanitizedPath}`,
    $pathname: sanitizedPath,
    $title: title,
  });

}

function captureEvent(event: string, properties: Record<string, unknown>) {
  const capture = (client: PostHogClient) => client.capture(event, properties, { send_instantly: true });
  if (initialized && posthog) capture(posthog);
  else pendingActions.push(capture);
}
