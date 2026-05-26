import { ApiClientError, requestApi } from './apiClient';

export type ProfileVisibility = 'public' | 'mutual_cruushes' | 'mutual_crowds';

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
  availability: string[];
  hosting_travel: string[];
  kinks: string[];
  kink_interests: KinkInterest[];
  kinks_visibility: ProfileVisibility;
  vibes: string[];
  hobbies: string[];
  custom_hobby: string;
  looking_for: string[];
  hiv_status: string[];
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
};

export type ProfileRecord = ProfilePayload & {
  id: string;
  updated_at: string;
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
  availability: [],
  hosting_travel: [],
  kinks: [],
  kink_interests: [],
  kinks_visibility: 'public',
  vibes: [],
  hobbies: [],
  custom_hobby: '',
  looking_for: [],
  hiv_status: [],
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
