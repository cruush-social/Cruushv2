import { describe, expect, it } from 'vitest';
import { DEFAULT_VISIBILITY_STATE, countVisibilityExclusionFilters } from '../components/MapVisibilitySurface';
import { emptyProfilePayload } from './profileApi';
import { visibilityRulesToState, visibilityStateToRules } from './visibilityControls';

describe('Out of Sight visibility rule', () => {
  it('defaults off for new and legacy profiles', () => {
    expect(emptyProfilePayload.visibility_rules.outside_service_area_members).toBe(false);
    expect(visibilityRulesToState().outsideServiceAreaMembers).toBe(false);
    const legacyRules = { ...emptyProfilePayload.visibility_rules };
    delete (legacyRules as Partial<typeof legacyRules>).outside_service_area_members;
    expect(visibilityRulesToState(legacyRules).outsideServiceAreaMembers).toBe(false);
  });

  it('round-trips the opt-in and counts it as one visibility control', () => {
    const state = { ...DEFAULT_VISIBILITY_STATE, outsideServiceAreaMembers: true, mileHighClub: true };
    expect(countVisibilityExclusionFilters(state)).toBe(countVisibilityExclusionFilters({ ...state, outsideServiceAreaMembers: false }) + 1);
    const rules = visibilityStateToRules(state);
    expect(rules.outside_service_area_members).toBe(true);
    expect(rules.mile_high_club_members).toBe(true);
    expect(visibilityRulesToState(rules).outsideServiceAreaMembers).toBe(true);
  });
});


describe('independent visibility tags', () => {
  it('round-trips tags separately from general search and counts one category', () => {
    const state = { ...DEFAULT_VISIBILITY_STATE, tags: ['rope', 'leather'], searchQuery: 'different text' };
    const rules = visibilityStateToRules(state);
    expect(rules.tags).toEqual(['rope', 'leather']);
    expect(rules.search_query).toBe('different text');
    expect(visibilityRulesToState(rules).tags).toEqual(state.tags);
    expect(countVisibilityExclusionFilters(state)).toBe(2);
    const legacy = { ...rules }; delete legacy.tags;
    expect(visibilityRulesToState(legacy).tags).toEqual([]);
  });
});
