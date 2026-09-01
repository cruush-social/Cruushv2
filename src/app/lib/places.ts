export const PLACE_FACILITY_TYPES = [
  'clinic', 'bar', 'nightclub', 'community_space', 'park', 'restroom',
  'sauna', 'gym', 'hotel', 'dungeon', 'cafe', 'shop', 'library',
  'staircase', 'trail', 'transit', 'parking', 'beach', 'adult_venue', 'other',
] as const;

export const PLACE_TAGS = [
  'lgbtq_health', 'womens_health', 'sexual_health', 'gay_spot',
  'dyke_spot', 't4t_spot', 'techno_club',
] as const;

export type PlaceFacilityType = typeof PLACE_FACILITY_TYPES[number] | 'venue';
export type PlaceTag = typeof PLACE_TAGS[number] | 'dyke_bar';
export type PlaceSort = 'nearest' | 'active' | 'recent' | 'top_rated' | 'az';

export const PLACE_FACILITY_LABELS: Record<PlaceFacilityType, string> = {
  clinic: 'Healthcare clinic', bar: 'Bars', nightclub: 'Nightclub', community_space: 'Community space',
  park: 'Park', restroom: 'Bathroom', sauna: 'Sauna', gym: 'Gym', hotel: 'Hotel',
  dungeon: 'Dungeon', venue: 'Other', cafe: 'Café', shop: 'Shop', library: 'Library',
  staircase: 'Staircase', trail: 'Trail', transit: 'Transit', parking: 'Parking',
  beach: 'Beach', adult_venue: 'Adult venue', other: 'Other',
};

export const PLACE_TAG_LABELS: Record<PlaceTag, string> = {
  lgbtq_health: 'LGBTQ health', womens_health: 'Ob/gyn health', sexual_health: 'Sexual health',
  gay_spot: 'Gay spot', dyke_spot: 'Dyke spot', dyke_bar: 'Dyke spot', t4t_spot: 'T4T spot', techno_club: 'Techno club',
};

export function getVisibleSpotTags(tags: PlaceTag[]) {
  return [...new Set(tags.map((tag) => tag === 'dyke_bar' ? 'dyke_spot' : tag))]
    .filter((tag) => tag !== 'dyke_spot')
    .filter((tag): tag is typeof PLACE_TAGS[number] => PLACE_TAGS.includes(tag as typeof PLACE_TAGS[number]));
}

export function getSpotCategoryLabels(facilityType: PlaceFacilityType, tags: PlaceTag[]) {
  return [
    PLACE_FACILITY_LABELS[facilityType],
    ...getVisibleSpotTags(tags).map((tag) => PLACE_TAG_LABELS[tag]),
  ].slice(0, 2);
}
