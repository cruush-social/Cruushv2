import { DEFAULT_FILTER_STATE } from '../components/MapFiltersSurface';
import { DEFAULT_VISIBILITY_STATE, type VisibilityControlState } from '../components/MapVisibilitySurface';
import { emptyProfilePayload, type ProfileVisibilityRules } from './profileApi';

const uniqueValues = (values: string[]) => [...new Set(values)];

export function visibilityRulesToState(rules?: ProfileVisibilityRules): VisibilityControlState {
  const defaults = emptyProfilePayload.visibility_rules;
  const normalized = { ...defaults, ...(rules ?? {}) };

  return {
    ...DEFAULT_VISIBILITY_STATE,
    searchQuery: normalized.search_query ?? '',
    activeCrowdModes: uniqueValues(normalized.active_crowd_modes ?? []),
    mileHighClub: normalized.mile_high_club_members === true,
    outsideServiceAreaMembers: normalized.outside_service_area_members === true,
    hasPhoto: normalized.members_without_photos === true,
    ageRange: normalized.age_range ?? DEFAULT_FILTER_STATE.ageRange,
    distance: normalized.distance ?? DEFAULT_FILTER_STATE.distance,
    restrictAge: Boolean(normalized.age_range),
    restrictDistance: typeof normalized.distance === 'number',
    identities: uniqueValues(normalized.identities ?? []),
    presentations: uniqueValues(normalized.presentations ?? []),
    lookingFor: uniqueValues(normalized.looking_for ?? []),
    timing: uniqueValues(normalized.timing ?? []),
    hosting: uniqueValues(normalized.hosting ?? []),
    preferredSpots: uniqueValues(normalized.preferred_spots ?? []),
    vibes: uniqueValues(normalized.vibes ?? []),
    tags: uniqueValues(normalized.tags ?? []),
    crowds: uniqueValues(normalized.crowds ?? []),
    hobbies: uniqueValues(normalized.hobbies ?? []),
    positions: uniqueValues(normalized.positions ?? []),
    roles: uniqueValues(normalized.roles ?? []),
    kinks: uniqueValues(normalized.kinks ?? []),
    bodyTypes: uniqueValues(normalized.body_types ?? []),
    sexuality: uniqueValues(normalized.sexuality ?? []),
    zodiac: uniqueValues(normalized.zodiac ?? []),
    substanceBoundaries: uniqueValues(normalized.substance_boundaries ?? []),
    protectionBoundaries: uniqueValues(normalized.protection_boundaries ?? []),
  };
}

export function visibilityStateToRules(state: VisibilityControlState): ProfileVisibilityRules {
  return {
    search_query: state.searchQuery.trim(),
    active_crowd_modes: uniqueValues(state.activeCrowdModes),
    mile_high_club_members: state.mileHighClub,
    outside_service_area_members: state.outsideServiceAreaMembers,
    members_without_photos: state.hasPhoto,
    age_range: state.restrictAge ? state.ageRange : null,
    distance: state.restrictDistance ? state.distance : null,
    identities: uniqueValues(state.identities),
    presentations: uniqueValues(state.presentations),
    looking_for: uniqueValues(state.lookingFor),
    timing: uniqueValues(state.timing),
    hosting: uniqueValues(state.hosting),
    preferred_spots: uniqueValues(state.preferredSpots),
    vibes: uniqueValues(state.vibes),
    tags: uniqueValues(state.tags ?? []),
    crowds: uniqueValues(state.crowds),
    hobbies: uniqueValues(state.hobbies),
    positions: uniqueValues(state.positions),
    roles: uniqueValues(state.roles),
    kinks: uniqueValues(state.kinks),
    body_types: uniqueValues(state.bodyTypes),
    sexuality: uniqueValues(state.sexuality),
    zodiac: uniqueValues(state.zodiac),
    substance_boundaries: uniqueValues(state.substanceBoundaries),
    protection_boundaries: uniqueValues(state.protectionBoundaries),
  };
}
