import { useEffect, useState } from 'react';
import {
  getPostHogFeatureFlag,
  onPostHogFeatureFlags,
} from './posthog';

export const CRUUSH_PLUS_MOBILE_MAP_STORE_FLAG = 'cruush-plus-mobile-map-store-entry';

export const CRUUSH_PLUS_CONVERSION_SURFACES = [
  'map_top',
  'map_filters',
  'map_visibility',
  'map_pulse',
  'cruise_carousel',
  'activity_incoming',
  'activity_views',
  'dark_room',
  'mile_high_club',
  'feed_plus',
  'club_creation',
  'message_filters',
  'settings',
  'rewards',
] as const;

export type CruushPlusConversionSurface = typeof CRUUSH_PLUS_CONVERSION_SURFACES[number];

export const CRUUSH_PLUS_CONVERSION_BENEFITS = [
  'overview',
  'seeking_visibility',
  'more_pulses',
  'cruise_carousel',
  'full_activity',
  'dark_room',
  'mile_high_club',
  'feed_plus',
  'club_creation',
] as const;

export type CruushPlusConversionBenefit = typeof CRUUSH_PLUS_CONVERSION_BENEFITS[number];
export type CruushPlusExperimentVariant = 'control' | 'store';

function isAllowed<T extends readonly string[]>(values: T, value: string | null): value is T[number] {
  return value !== null && values.includes(value as T[number]);
}

export function buildCruushPlusStorePath(
  surface: CruushPlusConversionSurface,
  benefit: CruushPlusConversionBenefit,
  experimentVariant?: CruushPlusExperimentVariant,
) {
  const params = new URLSearchParams({ surface, benefit });
  if (experimentVariant) {
    params.set('experiment', experimentVariant);
  }
  return `/store?${params.toString()}`;
}

export function readCruushPlusConversionContext(search: string) {
  const params = new URLSearchParams(search);
  const surface = params.get('surface');
  const benefit = params.get('benefit');
  const experiment = params.get('experiment');

  return {
    surface: isAllowed(CRUUSH_PLUS_CONVERSION_SURFACES, surface) ? surface : undefined,
    benefit: isAllowed(CRUUSH_PLUS_CONVERSION_BENEFITS, benefit) ? benefit : undefined,
    experimentVariant: experiment === 'control' || experiment === 'store' ? experiment : undefined,
  };
}

function resolveMobileMapVariant(value: boolean | string | null | undefined): CruushPlusExperimentVariant {
  return value === true || value === 'store' ? 'store' : 'control';
}

export function useCruushPlusMobileMapStoreVariant() {
  const [variant, setVariant] = useState<CruushPlusExperimentVariant>('control');

  useEffect(() => {
    const sync = () => setVariant(resolveMobileMapVariant(
      getPostHogFeatureFlag(CRUUSH_PLUS_MOBILE_MAP_STORE_FLAG),
    ));
    sync();
    const unsubscribe = onPostHogFeatureFlags(sync);
    return typeof unsubscribe === 'function' ? unsubscribe : undefined;
  }, []);

  return variant;
}
