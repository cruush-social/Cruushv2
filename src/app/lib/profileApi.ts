import { ApiClientError, requestApi } from './apiClient';
import type { CruushBadge } from './billingApi';
import type { DisplayLocationToken } from './displayLocationTokens';

export type ProfileVisibility = 'public' | 'mutual_cruushes' | 'mutual_crowds';

export type ProfileVisibilityRules = {
  search_query: string;
  active_crowd_modes: string[];
  mile_high_club_members: boolean;
  age_range: [number, number] | null;
  distance: number | null;
  identities: string[];
  presentations: string[];
  looking_for: string[];
  timing: string[];
  hosting: string[];
  preferred_spots: string[];
  vibes: string[];
  crowds: string[];
  hobbies: string[];
  positions: string[];
  roles: string[];
  kinks: string[];
  body_types: string[];
  body_hair: string[];
  pubic_hair: string[];
  facial_hair: string[];
  sexuality: string[];
  zodiac: string[];
  substance_boundaries: string[];
  protection_boundaries: string[];
};

export type KinkInterest = {
  kink_id: string;
  label?: string;
  category?: string;
};

export type SideBadgeSelection = {
  badge_id: string;
  intent: 'none' | 'give' | 'receive' | 'switch' | 'service' | 'stone';
  frame: string;
};

export type SideBadges = {
  left: SideBadgeSelection | null;
  right: SideBadgeSelection | null;
};

export const emptySideBadges: SideBadges = {
  left: null,
  right: null,
};

export type ProfilePhotoMetadata = {
  url: string;
  explicit: boolean;
};

export type ProfilePayload = {
  display_name: string;
  photos: string[];
  photo_metadata?: ProfilePhotoMetadata[];
  bio: string;
  tags: string[];
  signal: string;
  pronouns: string[];
  custom_pronouns: string;
  year_of_birth: number | null;
  date_of_birth?: string;
  ethnicity: string;
  identities: string[];
  presentation: string[];
  sexuality: string[];
  body_type: string[];
  body_hair: string[];
  pubic_hair: string[];
  facial_hair: string[];
  height: string;
  weight: string;
  position: string[];
  role: string[];
  side_badges: SideBadges;
  is_trans: boolean | null;
  trans_status_visibility: ProfileVisibility;
  crowds: string[];
  availability: string[];
  hosting_travel: string[];
  preferred_spots: string[];
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
  protections: string[];
  health_preferences: string[];
  birth_control: string[];
  relationship_status: string[];
  zodiac: string[];
  substance_boundaries: string[];
  protection_boundaries: string[];
  visibility_rules: ProfileVisibilityRules;
};

export type ProfileRecord = ProfilePayload & {
  id: string;
  updated_at: string;
  photo_metadata?: ProfilePhotoMetadata[];
  badges?: CruushBadge[];
  attendingLaunchParty?: boolean;
  travelling?: boolean;
  travelLabel?: string;
  location?: {
    id: string;
    display_location_token?: DisplayLocationToken;
    display_expires_at_ms?: number;
    ghost_display_location_token?: DisplayLocationToken;
    ghost_display_expires_at_ms?: number;
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
    location_mode?: 'PUBLIC_PRECISE' | 'GHOST' | 'STEALTH';
    dark_room_distance_label?: boolean;
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
  tags: [],
  signal: '',
  pronouns: [],
  custom_pronouns: '',
  year_of_birth: null,
  ethnicity: '',
  identities: [],
  presentation: [],
  sexuality: [],
  body_type: [],
  body_hair: [],
  pubic_hair: [],
  facial_hair: [],
  height: '',
  weight: '',
  position: [],
  role: [],
  side_badges: emptySideBadges,
  is_trans: null,
  trans_status_visibility: 'mutual_cruushes',
  crowds: [],
  availability: [],
  hosting_travel: [],
  preferred_spots: [],
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
  protections: [],
  custom_mpox_vaccine: '',
  health_preferences: [],
  birth_control: [],
  relationship_status: [],
  zodiac: [],
  substance_boundaries: [],
  protection_boundaries: [],
  visibility_rules: {
    search_query: '',
    active_crowd_modes: [],
    mile_high_club_members: false,
    age_range: null,
    distance: null,
    identities: [],
    presentations: [],
    looking_for: [],
    timing: [],
    hosting: [],
    preferred_spots: [],
    vibes: [],
    crowds: [],
    hobbies: [],
    positions: [],
    roles: [],
    kinks: [],
    body_types: [],
    body_hair: [],
    pubic_hair: [],
    facial_hair: [],
    sexuality: [],
    zodiac: [],
    substance_boundaries: [],
    protection_boundaries: [],
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

export const PROFILE_CHANGED_EVENT = 'cruush:profile-changed';

export function notifyProfileChanged(profile: ProfileRecord) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent<ProfileRecord>(PROFILE_CHANGED_EVENT, {
    detail: profile,
  }));
}

export function addProfileChangedListener(listener: (profile: ProfileRecord) => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleProfileChanged = (event: Event) => {
    listener((event as CustomEvent<ProfileRecord>).detail);
  };

  window.addEventListener(PROFILE_CHANGED_EVENT, handleProfileChanged);

  return () => {
    window.removeEventListener(PROFILE_CHANGED_EVENT, handleProfileChanged);
  };
}

export async function getProfileById(userId: string) {
  return requestApi<ProfileRecord>(`/api/profiles/${userId}`);
}

export async function saveMyProfile(profile: ProfilePayload) {
  const savedProfile = await requestApi<ProfileRecord>('/api/profiles/me', {
    method: 'PUT',
    body: JSON.stringify(profile),
  });
  notifyProfileChanged(savedProfile);
  return savedProfile;
}

export async function saveMySideBadges(sideBadges: SideBadges) {
  const savedSideBadges = await requestApi<SideBadges>('/api/profiles/me/side-badges', {
    method: 'PUT',
    body: JSON.stringify(sideBadges),
  });

  try {
    notifyProfileChanged(await getMyProfile());
  } catch {
    // The badge save succeeded. A later profile refresh can reconcile the map
    // if this best-effort immediate refresh is temporarily unavailable.
  }

  return savedSideBadges;
}

export async function saveMyVisibilityRules(visibilityRules: ProfileVisibilityRules) {
  const savedProfile = await requestApi<ProfileRecord>('/api/profiles/me/visibility-rules', {
    method: 'PUT',
    body: JSON.stringify({ visibility_rules: visibilityRules }),
  });
  notifyProfileChanged(savedProfile);
  return savedProfile;
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
  }).then((savedProfile) => {
    notifyProfileChanged(savedProfile);
    return savedProfile;
  });
}

export async function uploadProfilePhoto(photo: File) {
  const formData = new FormData();
  formData.set('photo', photo);

  return requestApi<
    | { url: string; explicit?: boolean; photos?: string[]; status?: undefined }
    | { status: 'pending_review'; assetId: string }
  >('/api/profile-photos', {
    method: 'POST',
    body: formData,
  });
}
