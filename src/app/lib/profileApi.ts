import { ApiClientError, requestApi } from './apiClient';
import type { CruushBadge } from './billingApi';
import type { DisplayLocationToken } from './displayLocationTokens';

export type ProfileVisibility = 'public' | 'mutual_cruushes' | 'mutual_crowds';

export type ProfileVisibilityRules = {
  active_crowd_modes: string[];
  age_range: [number, number] | null;
  distance: number | null;
  identities: string[];
  presentations: string[];
  looking_for: string[];
  timing: string[];
  hosting: string[];
  vibes: string[];
  crowds: string[];
  hobbies: string[];
  positions: string[];
  roles: string[];
  kinks: string[];
  body_types: string[];
  sexuality: string[];
  substance_boundaries: string[];
};

export type KinkInterest = {
  kink_id: string;
  label?: string;
  category?: string;
};

export type ProfilePayload = {
  display_name: string;
  photos: string[];
  bio: string;
  pronouns: string[];
  custom_pronouns: string;
  year_of_birth: number | null;
  ethnicity: string;
  identities: string[];
  presentation: string[];
  sexuality: string[];
  body_type: string[];
  height: string;
  weight: string;
  position: string[];
  role: string[];
  is_trans: boolean | null;
  trans_status_visibility: ProfileVisibility;
  crowds: string[];
  availability: string[];
  hosting_travel: string[];
  kinks: string[];
  kink_interests: KinkInterest[];
  kinks_visibility: ProfileVisibility;
  vibes: string[];
  scenes: string[];
  archetypes: string[];
  hobbies: string[];
  custom_hobby: string;
  looking_for: string[];
  hiv_status: string[];
  hiv_status_visibility: ProfileVisibility;
  custom_hiv_status: string;
  condoms: string[];
  custom_condoms: string;
  prep: string[];
  custom_prep: string;
  doxypep: string[];
  custom_doxypep: string;
  covid_vaccine: string[];
  custom_covid_vaccine: string;
  mpox_vaccine: string[];
  custom_mpox_vaccine: string;
  substance_boundaries: string[];
  visibility_rules: ProfileVisibilityRules;
};

export type ProfileRecord = ProfilePayload & {
  id: string;
  updated_at: string;
  badges?: CruushBadge[];
  location?: {
    id: string;
    display_location_token?: DisplayLocationToken;
    display_expires_at_ms?: number;
    display_mode?: 'PRECISE' | 'GHOST';
    animation_hint?: 'NONE' | 'FADE_LAST_MINUTE' | 'SIGNAL_LOSS' | 'REAPPEAR';
    lat?: number | null;
    lng?: number | null;
    fuzzy_lat?: number | null;
    fuzzy_lng?: number | null;
    fuzz_radius_meters?: number;
    location_updated_at: string | null;
  } | null;
  viewer_relationship?: {
    match_id: string | null;
    mutual_cruush: boolean;
    outgoing_cruush?: boolean;
    can_message: boolean;
    can_reveal_precise_location: boolean;
  };
};

export type ProfileVisibilitySet = {
  id: string;
  name: string;
  visibility_rules: ProfileVisibilityRules;
  created_at: string;
  updated_at: string;
};

export type ProfileVisibilitySetPayload = {
  name: string;
  visibility_rules: ProfileVisibilityRules;
};

export const emptyProfilePayload: ProfilePayload = {
  display_name: '',
  photos: [],
  bio: '',
  pronouns: [],
  custom_pronouns: '',
  year_of_birth: null,
  ethnicity: '',
  identities: [],
  presentation: [],
  sexuality: [],
  body_type: [],
  height: '',
  weight: '',
  position: [],
  role: [],
  is_trans: null,
  trans_status_visibility: 'mutual_cruushes',
  crowds: [],
  availability: [],
  hosting_travel: [],
  kinks: [],
  kink_interests: [],
  kinks_visibility: 'public',
  vibes: [],
  scenes: [],
  archetypes: [],
  hobbies: [],
  custom_hobby: '',
  looking_for: [],
  hiv_status: [],
  hiv_status_visibility: 'mutual_cruushes',
  custom_hiv_status: '',
  condoms: [],
  custom_condoms: '',
  prep: [],
  custom_prep: '',
  doxypep: [],
  custom_doxypep: '',
  covid_vaccine: [],
  custom_covid_vaccine: '',
  mpox_vaccine: [],
  custom_mpox_vaccine: '',
  substance_boundaries: [],
  visibility_rules: {
    active_crowd_modes: [],
    age_range: null,
    distance: null,
    identities: [],
    presentations: [],
    looking_for: [],
    timing: [],
    hosting: [],
    vibes: [],
    crowds: [],
    hobbies: [],
    positions: [],
    roles: [],
    kinks: [],
    body_types: [],
    sexuality: [],
    substance_boundaries: [],
  },
};

export { ApiClientError as ProfileApiError };

export function toKinkId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function toDefaultKinkInterest(kink: string): KinkInterest {
  return {
    kink_id: toKinkId(kink),
    label: kink,
  };
}

export async function getMyProfile() {
  return requestApi<ProfileRecord>('/api/profiles/me');
}

export async function getProfileById(userId: string) {
  return requestApi<ProfileRecord>(`/api/profiles/${userId}`);
}

export async function saveMyProfile(profile: ProfilePayload) {
  return requestApi<ProfileRecord>('/api/profiles/me', {
    method: 'PUT',
    body: JSON.stringify(profile),
  });
}

export function getMyVisibilitySets() {
  return requestApi<ProfileVisibilitySet[]>('/api/profiles/me/visibility-sets');
}

export function saveMyVisibilitySet(payload: ProfileVisibilitySetPayload) {
  return requestApi<ProfileVisibilitySet>('/api/profiles/me/visibility-sets', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateMyVisibilitySet(id: string, payload: ProfileVisibilitySetPayload) {
  return requestApi<ProfileVisibilitySet>(`/api/profiles/me/visibility-sets/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function deleteMyVisibilitySet(id: string) {
  return requestApi<{ deleted: true; id: string }>(`/api/profiles/me/visibility-sets/${id}`, {
    method: 'DELETE',
  });
}

export function applyMyVisibilitySet(id: string) {
  return requestApi<ProfileRecord>(`/api/profiles/me/visibility-sets/${id}/apply`, {
    method: 'POST',
  });
}

export async function uploadProfilePhoto(photo: File) {
  const formData = new FormData();
  formData.set('photo', photo);

  return requestApi<{ url: string }>('/api/profile-photos', {
    method: 'POST',
    body: formData,
  });
}
