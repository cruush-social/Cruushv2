import { describe, expect, it } from "vitest";
import { emptyProfile } from "./profile-schema.js";
import type { ProfileVisibilityRules } from "./profile-sensitive.js";
import {
  canSubjectViewProfile,
  countVisibilityExclusionFilters,
  visibilityRulesArePublic
} from "./profile-visibility.js";

describe("profile visibility rules", () => {
  it("makes Out of Sight an opt-in exclusion that fails closed independently of other audiences", () => {
    const rules: ProfileVisibilityRules = {
      ...emptyProfile.visibility_rules,
      outside_service_area_members: true
    };

    expect(visibilityRulesArePublic(emptyProfile.visibility_rules)).toBe(true);
    expect(visibilityRulesArePublic(rules)).toBe(false);
    expect(countVisibilityExclusionFilters(rules)).toBe(1);
    expect(canSubjectViewProfile(rules, { outside_service_area: false })).toBe(true);
    expect(canSubjectViewProfile(rules, { outside_service_area: true })).toBe(false);
    expect(canSubjectViewProfile(rules, {})).toBe(false);
    // Existing relationships do not override this rule, including a mutual
    // whose effective location is still outside the service area.
    expect(canSubjectViewProfile(rules, { outside_service_area: true, mile_high_club_member: false })).toBe(false);
    expect(canSubjectViewProfile(rules, { outside_service_area: false, mile_high_club_member: true })).toBe(true);
  });

  it("treats selected trait values as excluded audiences", () => {
    const rules: ProfileVisibilityRules = {
      ...emptyProfile.visibility_rules,
      identities: ["nonbinary"],
      kinks: ["leather"]
    };

    expect(canSubjectViewProfile(rules, {
      identities: ["nonbinary"],
      kinks: []
    })).toBe(false);
    expect(canSubjectViewProfile(rules, {
      identities: ["man"],
      kinks: ["leather"]
    })).toBe(false);
    expect(canSubjectViewProfile(rules, {
      identities: ["man"],
      kinks: []
    })).toBe(true);
  });

  it("keeps crowd mode as a positive show-only privacy mode", () => {
    const rules: ProfileVisibilityRules = {
      ...emptyProfile.visibility_rules,
      active_crowd_modes: ["T4T"]
    };

    expect(canSubjectViewProfile(rules, { crowds: ["T4T"] })).toBe(true);
    expect(canSubjectViewProfile(rules, { crowds: ["Gay"] })).toBe(false);
  });

  it("hides a profile from active Mile High Club members", () => {
    const rules: ProfileVisibilityRules = {
      ...emptyProfile.visibility_rules,
      mile_high_club_members: true
    };

    expect(canSubjectViewProfile(rules, { mile_high_club_member: true })).toBe(false);
    expect(canSubjectViewProfile(rules, { mile_high_club_member: false })).toBe(true);
  });

  it("hides a distance-limited profile from anyone it cannot measure", () => {
    const rules: ProfileVisibilityRules = {
      ...emptyProfile.visibility_rules,
      distance: 10
    };

    // A privacy rule fails closed. A viewer whose distance is unknown is not
    // shown the profile on a guess; the route measures against the encrypted
    // location envelope, so a viewer with a location is measurable and only a
    // viewer with none is refused.
    expect(canSubjectViewProfile(rules, {}, null)).toBe(false);
    expect(canSubjectViewProfile(rules, { coordinates: { lat: 40.7128, lng: -74.006 } }, null)).toBe(false);
    expect(canSubjectViewProfile(rules, {}, { lat: 40.72, lng: -74.0 })).toBe(false);
    expect(canSubjectViewProfile(
      rules,
      { coordinates: { lat: 40.7128, lng: -74.006 } },
      { lat: 40.72, lng: -74.0 }
    )).toBe(true);
    expect(canSubjectViewProfile(
      rules,
      { coordinates: { lat: 40.7128, lng: -74.006 } },
      { lat: 42.5, lng: -74.0 }
    )).toBe(false);
  });

  it("hides a profile from people with no profile picture", () => {
    const rules: ProfileVisibilityRules = {
      ...emptyProfile.visibility_rules,
      members_without_photos: true
    };

    expect(canSubjectViewProfile(rules, { has_photo: false })).toBe(false);
    expect(canSubjectViewProfile(rules, { has_photo: true })).toBe(true);
    // A caller that cannot tell must not hide anyone.
    expect(canSubjectViewProfile(rules, {})).toBe(true);
  });

  it("uses the Visibility search in reverse across names, bios, and profile keywords", () => {
    const rules: ProfileVisibilityRules = {
      ...emptyProfile.visibility_rules,
      search_query: "watersports"
    };

    expect(canSubjectViewProfile(rules, { display_name: "Jay", kinks: ["Watersports"] })).toBe(false);
    expect(canSubjectViewProfile(rules, { display_name: "Watersports fan", kinks: [] })).toBe(false);
    expect(canSubjectViewProfile(rules, { display_name: "Jay", bio: "Ask me about watersports", kinks: [] })).toBe(false);
    expect(canSubjectViewProfile(rules, { display_name: "Jay", bio: "Leather and rope", kinks: [] })).toBe(true);
  });

  it("reaches the tags on a profile, with or without the hash", () => {
    const rules: ProfileVisibilityRules = {
      ...emptyProfile.visibility_rules,
      search_query: "leatherdaddy"
    };

    expect(canSubjectViewProfile(rules, { display_name: "Jay", tags: ["leatherdaddy"] })).toBe(false);
    expect(canSubjectViewProfile(rules, { display_name: "Jay", tags: ["rope"] })).toBe(true);

    const hashed: ProfileVisibilityRules = {
      ...emptyProfile.visibility_rules,
      search_query: "#leatherdaddy"
    };

    expect(canSubjectViewProfile(hashed, { display_name: "Jay", tags: ["leatherdaddy"] })).toBe(false);
  });

  it("counts only exclusion filters toward the free visibility limit", () => {
    expect(countVisibilityExclusionFilters({
      ...emptyProfile.visibility_rules,
      active_crowd_modes: ["T4T"],
      age_range: [25, 45],
      distance: 25,
      mile_high_club_members: true,
      identities: ["nonbinary"],
      kinks: ["leather"]
    })).toBe(5);
  });

  it("treats a selected Zodiac value as an excluded audience", () => {
    const rules: ProfileVisibilityRules = {
      ...emptyProfile.visibility_rules,
      zodiac: ["Leo"]
    };

    expect(canSubjectViewProfile(rules, { zodiac: ["Leo"] })).toBe(false);
    expect(canSubjectViewProfile(rules, { zodiac: ["Virgo"] })).toBe(true);
  });
});
