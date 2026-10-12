import type { ProfileVisibilityRules } from "./profile-sensitive.js";

export type VisibilityCoordinates = {
  lat: number | null;
  lng: number | null;
};

export type VisibilitySubjectProfile = {
  display_name?: string | null;
  bio?: string | null;
  tags?: string[] | null;
  mile_high_club_member?: boolean;
  /** Effective service-area state, including an active Mile High Club pin. */
  outside_service_area?: boolean;
  /** Undefined where the caller cannot tell, which never hides anyone. */
  has_photo?: boolean;
  year_of_birth?: number | null;
  identities?: string[] | null;
  presentations?: string[] | null;
  looking_for?: string[] | null;
  timing?: string[] | null;
  hosting?: string[] | null;
  preferred_spots?: string[] | null;
  vibes?: string[] | null;
  scenes?: string[] | null;
  archetypes?: string[] | null;
  crowds?: string[] | null;
  hobbies?: string[] | null;
  positions?: string[] | null;
  roles?: string[] | null;
  kinks?: string[] | null;
  body_types?: string[] | null;
  body_hair?: string[] | null;
  pubic_hair?: string[] | null;
  facial_hair?: string[] | null;
  sexuality?: string[] | null;
  zodiac?: string[] | null;
  substance_boundaries?: string[] | null;
  protection_boundaries?: string[] | null;
  coordinates?: VisibilityCoordinates | null;
};

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function includesAny(requiredValues: string[], actualValues: string[] | null | undefined) {
  if (requiredValues.length === 0) {
    return true;
  }

  const actualSet = new Set((actualValues ?? []).map(normalize));

  if (actualSet.size === 0) {
    return false;
  }

  return requiredValues.some((value) => actualSet.has(normalize(value)));
}

function excludesAny(excludedValues: string[], actualValues: string[] | null | undefined) {
  if (excludedValues.length === 0) {
    return true;
  }

  const actualSet = new Set((actualValues ?? []).map(normalize));

  if (actualSet.size === 0) {
    return true;
  }

  return !excludedValues.some((value) => actualSet.has(normalize(value)));
}

function matchesSearchQuery(searchQuery: string, subject: VisibilitySubjectProfile) {
  const normalizedQuery = normalize(searchQuery);
  if (!normalizedQuery) {
    return false;
  }

  const matchesProfileText = [
    subject.display_name ?? "",
    subject.bio ?? "",
    ...(subject.identities ?? []),
    ...(subject.presentations ?? []),
    ...(subject.looking_for ?? []),
    ...(subject.timing ?? []),
    ...(subject.hosting ?? []),
    ...(subject.preferred_spots ?? []),
    ...(subject.vibes ?? []),
    ...(subject.scenes ?? []),
    ...(subject.archetypes ?? []),
    ...(subject.crowds ?? []),
    ...(subject.hobbies ?? []),
    ...(subject.positions ?? []),
    ...(subject.roles ?? []),
    ...(subject.kinks ?? []),
    ...(subject.body_types ?? []),
    ...(subject.body_hair ?? []),
    ...(subject.pubic_hair ?? []),
    ...(subject.facial_hair ?? []),
    ...(subject.sexuality ?? []),
    ...(subject.zodiac ?? []),
    ...(subject.substance_boundaries ?? []),
    ...(subject.protection_boundaries ?? []),
  ].some((value) => normalize(value).includes(normalizedQuery));
  const normalizedTagQuery = normalizedQuery.replace(/^#+/, "");

  return matchesProfileText || Boolean(normalizedTagQuery && (subject.tags ?? [])
    .some((value) => normalize(value).includes(normalizedTagQuery)));
}

function getAge(yearOfBirth: number | null | undefined) {
  return yearOfBirth ? new Date().getFullYear() - yearOfBirth : null;
}

function distanceMiles(first: VisibilityCoordinates, second: VisibilityCoordinates) {
  if (first.lat == null || first.lng == null || second.lat == null || second.lng == null) {
    return null;
  }

  const earthRadiusMiles = 3958.8;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latDelta = toRadians(second.lat - first.lat);
  const lngDelta = toRadians(second.lng - first.lng);
  const firstLat = toRadians(first.lat);
  const secondLat = toRadians(second.lat);
  const a = Math.sin(latDelta / 2) ** 2 +
    Math.cos(firstLat) * Math.cos(secondLat) * Math.sin(lngDelta / 2) ** 2;

  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(a));
}

function normalizeVisibilityRules(rules: ProfileVisibilityRules): ProfileVisibilityRules {
  return {
    ...rules,
    search_query: rules.search_query ?? "",
    active_crowd_modes: rules.active_crowd_modes ?? [],
    mile_high_club_members: rules.mile_high_club_members ?? false,
    members_without_photos: rules.members_without_photos ?? false,
    outside_service_area_members: rules.outside_service_area_members ?? false,
    age_range: rules.age_range ?? null,
    distance: rules.distance ?? null,
    identities: rules.identities ?? [],
    presentations: rules.presentations ?? [],
    looking_for: rules.looking_for ?? [],
    timing: rules.timing ?? [],
    hosting: rules.hosting ?? [],
    preferred_spots: rules.preferred_spots ?? [],
    vibes: rules.vibes ?? [],
    tags: rules.tags ?? [],
    crowds: rules.crowds ?? [],
    hobbies: rules.hobbies ?? [],
    positions: rules.positions ?? [],
    roles: rules.roles ?? [],
    kinks: rules.kinks ?? [],
    body_types: rules.body_types ?? [],
    body_hair: rules.body_hair ?? [],
    pubic_hair: rules.pubic_hair ?? [],
    facial_hair: rules.facial_hair ?? [],
    sexuality: rules.sexuality ?? [],
    zodiac: rules.zodiac ?? [],
    substance_boundaries: rules.substance_boundaries ?? [],
    protection_boundaries: rules.protection_boundaries ?? []
  };
}

export function visibilityRulesArePublic(rules: ProfileVisibilityRules | null | undefined) {
  if (!rules) {
    return true;
  }

  const normalizedRules = normalizeVisibilityRules(rules);

  return normalizedRules.search_query.length === 0 &&
    normalizedRules.active_crowd_modes.length === 0 &&
    normalizedRules.mile_high_club_members === false &&
    normalizedRules.members_without_photos === false &&
    normalizedRules.outside_service_area_members === false &&
    normalizedRules.age_range === null &&
    normalizedRules.distance === null &&
    normalizedRules.identities.length === 0 &&
    normalizedRules.presentations.length === 0 &&
    normalizedRules.looking_for.length === 0 &&
    normalizedRules.timing.length === 0 &&
    normalizedRules.hosting.length === 0 &&
    normalizedRules.preferred_spots.length === 0 &&
    normalizedRules.vibes.length === 0 &&
    normalizedRules.tags.length === 0 &&
    normalizedRules.crowds.length === 0 &&
    normalizedRules.hobbies.length === 0 &&
    normalizedRules.positions.length === 0 &&
    normalizedRules.roles.length === 0 &&
    normalizedRules.kinks.length === 0 &&
    normalizedRules.body_types.length === 0 &&
    normalizedRules.body_hair.length === 0 &&
    normalizedRules.pubic_hair.length === 0 &&
    normalizedRules.facial_hair.length === 0 &&
    normalizedRules.sexuality.length === 0 &&
    normalizedRules.zodiac.length === 0 &&
    normalizedRules.substance_boundaries.length === 0 &&
    normalizedRules.protection_boundaries.length === 0;
}

export function countVisibilityExclusionFilters(rules: ProfileVisibilityRules | null | undefined) {
  if (!rules) {
    return 0;
  }

  const normalizedRules = normalizeVisibilityRules(rules);

  return [
    normalizedRules.search_query.length > 0,
    normalizedRules.age_range !== null,
    normalizedRules.distance !== null,
    normalizedRules.mile_high_club_members,
    normalizedRules.members_without_photos,
    normalizedRules.outside_service_area_members,
    normalizedRules.identities.length > 0,
    normalizedRules.presentations.length > 0,
    normalizedRules.looking_for.length > 0,
    normalizedRules.timing.length > 0,
    normalizedRules.hosting.length > 0,
    normalizedRules.preferred_spots.length > 0,
    normalizedRules.vibes.length > 0,
    normalizedRules.tags.length > 0,
    normalizedRules.crowds.length > 0,
    normalizedRules.hobbies.length > 0,
    normalizedRules.positions.length > 0,
    normalizedRules.roles.length > 0,
    normalizedRules.kinks.length > 0,
    normalizedRules.body_types.length > 0,
    normalizedRules.body_hair.length > 0,
    normalizedRules.pubic_hair.length > 0,
    normalizedRules.facial_hair.length > 0,
    normalizedRules.sexuality.length > 0,
    normalizedRules.zodiac.length > 0,
    normalizedRules.substance_boundaries.length > 0,
    normalizedRules.protection_boundaries.length > 0
  ].filter(Boolean).length;
}

export function canSubjectViewProfile(
  rules: ProfileVisibilityRules | null | undefined,
  subject: VisibilitySubjectProfile,
  targetCoordinates?: VisibilityCoordinates | null,
  targetUncertaintyMiles = 0
) {
  if (!rules) {
    return true;
  }

  const normalizedRules = normalizeVisibilityRules(rules);

  if (visibilityRulesArePublic(normalizedRules)) {
    return true;
  }

  // The owner opted out of Out of Sight viewers. An unknown effective location
  // must not turn that privacy choice into public visibility.
  if (normalizedRules.outside_service_area_members && subject.outside_service_area !== false) {
    return false;
  }

  if (normalizedRules.mile_high_club_members && subject.mile_high_club_member === true) {
    return false;
  }

  // Only an explicit false hides anyone: a caller that cannot tell whether the
  // viewer has a photo must not hide the profile from them.
  if (normalizedRules.members_without_photos && subject.has_photo === false) {
    return false;
  }

  if (matchesSearchQuery(normalizedRules.search_query, subject)) {
    return false;
  }

  if (normalizedRules.age_range) {
    const age = getAge(subject.year_of_birth);

    if (age == null || age < normalizedRules.age_range[0] || age > normalizedRules.age_range[1]) {
      return false;
    }
  }

  if (normalizedRules.distance != null) {
    const distance = subject.coordinates && targetCoordinates
      ? distanceMiles(subject.coordinates, targetCoordinates)
      : null;

    // A privacy rule fails closed. "Hide me from people farther than X" hides
    // anyone whose distance cannot be measured, because showing the profile on
    // a guess is the one outcome the member asked not to have. The route
    // measures against the encrypted location envelope, so a viewer with a
    // location is measurable and only a viewer with none is refused.
    if (distance == null || !Number.isFinite(targetUncertaintyMiles) || targetUncertaintyMiles < 0 ||
        distance + targetUncertaintyMiles > normalizedRules.distance) {
      return false;
    }
  }

  return includesAny(normalizedRules.active_crowd_modes, subject.crowds) &&
    excludesAny(normalizedRules.identities, subject.identities) &&
    excludesAny(normalizedRules.presentations, subject.presentations) &&
    excludesAny(normalizedRules.looking_for, subject.looking_for) &&
    excludesAny(normalizedRules.timing, subject.timing) &&
    excludesAny(normalizedRules.hosting, subject.hosting) &&
    excludesAny(normalizedRules.preferred_spots, subject.preferred_spots) &&
    excludesAny(normalizedRules.vibes, [
      ...(subject.vibes ?? []),
      ...(subject.scenes ?? []),
      ...(subject.archetypes ?? [])
    ]) &&
    excludesAny(normalizedRules.tags, (subject.tags ?? []).map((tag) => tag.normalize("NFKC").trim().replace(/^#+/, ""))) &&
    excludesAny(normalizedRules.crowds, subject.crowds) &&
    excludesAny(normalizedRules.hobbies, subject.hobbies) &&
    excludesAny(normalizedRules.positions, subject.positions) &&
    excludesAny(normalizedRules.roles, subject.roles) &&
    excludesAny(normalizedRules.kinks, subject.kinks) &&
    excludesAny(normalizedRules.body_types, subject.body_types) &&
    excludesAny(normalizedRules.body_hair, subject.body_hair) &&
    excludesAny(normalizedRules.pubic_hair, subject.pubic_hair) &&
    excludesAny(normalizedRules.facial_hair, subject.facial_hair) &&
    excludesAny(normalizedRules.sexuality, subject.sexuality) &&
    excludesAny(normalizedRules.zodiac, subject.zodiac) &&
    excludesAny(normalizedRules.substance_boundaries, subject.substance_boundaries) &&
    excludesAny(normalizedRules.protection_boundaries, subject.protection_boundaries);
}
