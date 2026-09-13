import { PLACE_FACILITY_LABELS } from '../../../server/src/place-categories';
import type { PlaceFacilityType } from '../../../server/src/place-categories';
export { PLACE_FACILITY_TYPES, PLACE_FACILITY_LABELS, PLACE_FACILITY_SINGULAR_LABELS } from '../../../server/src/place-categories';
export type { PlaceFacilityType } from '../../../server/src/place-categories';

export const DEFAULT_EXCLUDED_PLACE_FACILITY_TYPES: readonly PlaceFacilityType[] = ['bus_stop'];

export const PLACE_TAGS = [
  'lgbtq_health', 'womens_health', 'sexual_health',
] as const;

export const PLACE_VIBES = [
  'chill', 'social', 'flirty', 'cruisy', 'dancey', 'high_energy',
  'intimate', 'community', 'after_hours', 'outdoor', 'historical', 'exposed',
] as const;

export const PLACE_AMENITIES = [
  'restrooms', 'drinks', 'cover_charge', 'accessible',
  'transit_nearby', 'staff_present', 'indoor', 'outdoor',
] as const;

export type PlaceTag = typeof PLACE_TAGS[number];
export type PlaceVibe = typeof PLACE_VIBES[number];
export type PlaceAmenity = typeof PLACE_AMENITIES[number];
export type PlaceSort = 'nearest' | 'active' | 'recent' | 'top_rated' | 'az';

export const PLACE_TAG_LABELS: Record<PlaceTag, string> = {
  lgbtq_health: 'LGBTQ health', womens_health: 'Ob/gyn health', sexual_health: 'Sexual health',
};

export const PLACE_VIBE_LABELS: Record<PlaceVibe, string> = {
  chill: 'Chill', social: 'Social', flirty: 'Flirty', cruisy: 'Cruisy',
  dancey: 'Dancey', high_energy: 'High-energy', intimate: 'Intimate',
  community: 'Community', after_hours: 'After-hours', outdoor: 'Outdoor',
  historical: 'Historical', exposed: 'Exposed',
};

export const PLACE_AMENITY_LABELS: Record<PlaceAmenity, string> = {
  restrooms: 'Restrooms', drinks: 'Drinks', cover_charge: 'Cover charge',
  accessible: 'Accessible', transit_nearby: 'Transit nearby',
  staff_present: 'Staff present', indoor: 'Indoor', outdoor: 'Outdoor',
};

export function getVisibleSpotTags(tags: PlaceTag[]) {
  return [...new Set(tags)]
    .filter((tag): tag is typeof PLACE_TAGS[number] => PLACE_TAGS.includes(tag as typeof PLACE_TAGS[number]));
}

export function getSpotCategoryLabels(facilityType: PlaceFacilityType, tags: PlaceTag[]) {
  return [
    PLACE_FACILITY_LABELS[facilityType],
    ...getVisibleSpotTags(tags).map((tag) => PLACE_TAG_LABELS[tag]),
  ].slice(0, 2);
}
