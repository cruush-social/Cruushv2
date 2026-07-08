import type { ProfileVisibilityRules } from "./profile-sensitive.js";

export type VisibilityCoordinates = {
  lat: number | null;
  lng: number | null;
};

export type VisibilitySubjectProfile = {
  year_of_birth?: number | null;
  identities?: string[] | null;
  presentations?: string[] | null;
  looking_for?: string[] | null;
  timing?: string[] | null;
  hosting?: string[] | null;
  vibes?: string[] | null;
  scenes?: string[] | null;
  archetypes?: string[] | null;
  crowds?: string[] | null;
  hobbies?: string[] | null;
  positions?: string[] | null;
  roles?: string[] | null;
  kinks?: string[] | null;
  body_types?: string[] | null;
  sexuality?: string[] | null;
  substance_boundaries?: string[] | null;
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

export function visibilityRulesArePublic(rules: ProfileVisibilityRules | null | undefined) {
  if (!rules) {
    return true;
  }

  return rules.active_crowd_modes.length === 0 &&
    rules.age_range === null &&
    rules.distance === null &&
    rules.identities.length === 0 &&
    rules.presentations.length === 0 &&
    rules.looking_for.length === 0 &&
    rules.timing.length === 0 &&
    rules.hosting.length === 0 &&
    rules.vibes.length === 0 &&
    rules.crowds.length === 0 &&
    rules.hobbies.length === 0 &&
    rules.positions.length === 0 &&
    rules.roles.length === 0 &&
    rules.kinks.length === 0 &&
    rules.body_types.length === 0 &&
    rules.sexuality.length === 0 &&
    rules.substance_boundaries.length === 0;
}

export function countVisibilityExclusionFilters(rules: ProfileVisibilityRules | null | undefined) {
  if (!rules) {
    return 0;
  }

  return [
    rules.age_range !== null,
    rules.distance !== null,
    rules.identities.length > 0,
    rules.presentations.length > 0,
    rules.looking_for.length > 0,
    rules.timing.length > 0,
    rules.hosting.length > 0,
    rules.vibes.length > 0,
    rules.crowds.length > 0,
    rules.hobbies.length > 0,
    rules.positions.length > 0,
    rules.roles.length > 0,
    rules.kinks.length > 0,
    rules.body_types.length > 0,
    rules.sexuality.length > 0,
    rules.substance_boundaries.length > 0
  ].filter(Boolean).length;
}

export function canSubjectViewProfile(
  rules: ProfileVisibilityRules | null | undefined,
  subject: VisibilitySubjectProfile,
  targetCoordinates?: VisibilityCoordinates | null
) {
  if (visibilityRulesArePublic(rules)) {
    return true;
  }

  if (!rules) {
    return true;
  }

  if (rules.age_range) {
    const age = getAge(subject.year_of_birth);

    if (age == null || age < rules.age_range[0] || age > rules.age_range[1]) {
      return false;
    }
  }

  if (rules.distance != null) {
    const distance = subject.coordinates && targetCoordinates
      ? distanceMiles(subject.coordinates, targetCoordinates)
      : null;

    if (distance == null || distance > rules.distance) {
      return false;
    }
  }

  return includesAny(rules.active_crowd_modes, subject.crowds) &&
    excludesAny(rules.identities, subject.identities) &&
    excludesAny(rules.presentations, subject.presentations) &&
    excludesAny(rules.looking_for, subject.looking_for) &&
    excludesAny(rules.timing, subject.timing) &&
    excludesAny(rules.hosting, subject.hosting) &&
    excludesAny(rules.vibes, [
      ...(subject.vibes ?? []),
      ...(subject.scenes ?? []),
      ...(subject.archetypes ?? [])
    ]) &&
    excludesAny(rules.crowds, subject.crowds) &&
    excludesAny(rules.hobbies, subject.hobbies) &&
    excludesAny(rules.positions, subject.positions) &&
    excludesAny(rules.roles, subject.roles) &&
    excludesAny(rules.kinks, subject.kinks) &&
    excludesAny(rules.body_types, subject.body_types) &&
    excludesAny(rules.sexuality, subject.sexuality) &&
    excludesAny(rules.substance_boundaries, subject.substance_boundaries);
}
