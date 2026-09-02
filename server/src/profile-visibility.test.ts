import { describe, expect, it } from "vitest";
import { emptyProfile } from "./profile-schema.js";
import type { ProfileVisibilityRules } from "./profile-sensitive.js";
import {
  canSubjectViewProfile,
  countVisibilityExclusionFilters
} from "./profile-visibility.js";

describe("profile visibility rules", () => {
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
});
