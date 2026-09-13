/** Categories offered by Spot discovery and submission surfaces. */
export const PLACE_FACILITY_TYPES = [
  'clinic', 'bar', 'nightclub', 'community_space', 'park', 'restroom',
  'sauna', 'gym', 'hotel', 'library', 'trail', 'transit',
  'rail_station', 'bus_stop', 'beach', 'adult_venue',
  'music_venue', 'sports_venue', 'woods', 'rest_stop', 'bridge', 'other',
] as const;

// Archived records and existing member references retain their stored category.
export type PlaceFacilityType = typeof PLACE_FACILITY_TYPES[number]
  | 'venue' | 'dungeon' | 'cafe' | 'shop' | 'adult_shop' | 'retail' | 'parking' | 'staircase';

export const PLACE_FACILITY_LABELS: Record<PlaceFacilityType, string> = {
  clinic: 'Healthcare clinic', bar: 'Bars', nightclub: 'Nightclub', community_space: 'Community space',
  park: 'Park', restroom: 'Bathroom', sauna: 'Sauna', gym: 'Gym', hotel: 'Hotel',
  library: 'Library', staircase: 'Other', trail: 'Trail', transit: 'Transit',
  rail_station: 'Train stations', bus_stop: 'Bus stops', parking: 'Other', beach: 'Beach',
  adult_venue: 'Adult venues & stores', music_venue: 'Music venue', sports_venue: 'Sports venue',
  woods: 'Woods', rest_stop: 'Rest stops', bridge: 'Bridges', other: 'Other',
  venue: 'Other', dungeon: 'Adult venues & stores', adult_shop: 'Adult venues & stores',
  cafe: 'Other', shop: 'Other', retail: 'Other',
};

export const PLACE_FACILITY_SINGULAR_LABELS: Record<PlaceFacilityType, string> = {
  ...PLACE_FACILITY_LABELS,
  bar: 'Bar', bus_stop: 'Bus stop', rail_station: 'Train station',
  adult_venue: 'Adult venue or store', dungeon: 'Adult venue or store', adult_shop: 'Adult venue or store',
  rest_stop: 'Rest stop', bridge: 'Bridge', other: 'Spot', venue: 'Spot',
};
