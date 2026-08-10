import { requestApi } from './apiClient';
import type { CruushBadge } from './billingApi';
import {
  decryptDisplayLocationToken,
  type DisplayAnimationHint,
  type DisplayLocationToken,
  type DisplayMode,
} from './displayLocationTokens';

export type DiscoveryUser = {
  id: string;
  name: string;
  display_name: string;
  signal?: string;
  latestFeedPostPreview?: string;
  age: number | null;
  pronouns: string;
  lat: number;
  lng: number;
  lastActive: string;
  distance: string;
  lookingFor: string[];
  vibes: string[];
  identities?: string[];
  presentation?: string[];
  scenes?: string[];
  archetypes?: string[];
  position: string[];
  role: string[];
  hostingTravel: string[];
  photo: string | null;
  photoExplicit?: boolean;
  badges?: CruushBadge[];
  isDemo?: boolean;
  isCurrentUser?: boolean;
  displayMode?: DisplayMode;
  animationHint?: DisplayAnimationHint;
  displayExpiresAtMs?: number;
  ghostRotationExpiresAtMs?: number;
  privacyRadiusMeters?: number;
  npcGhostDemo?: boolean;
  hasSharedCrowd?: boolean;
  relationshipContext?: 'PUBLIC' | 'MUTUAL_CRUUSH' | 'MUTUAL_CROWD';
  relationship?: {
    mutualCruush: boolean;
    canMessage: boolean;
    precision?: 'fuzzy' | 'precise';
  } | null;
};

type Coordinates = {
  lat: number;
  lng: number;
};

export type DiscoveryFilterParams = {
  identities?: string[];
  presentations?: string[];
  lookingFor?: string[];
  timing?: string[];
  hosting?: string[];
  vibes?: string[];
  crowds?: string[];
  hobbies?: string[];
  positions?: string[];
  roles?: string[];
  kinks?: string[];
  bodyTypes?: string[];
  sexuality?: string[];
  substanceBoundaries?: string[];
};

type DiscoveryRequestOptions = {
  limit?: number;
  npcGhostDemo?: boolean;
};

type TokenizedDiscoveryProfile = {
  profileToken: string;
  name: string;
  display_name: string;
  signal?: string;
  latestFeedPostPreview?: string;
  age: number | null;
  pronouns: string;
  lastActive: string;
  distanceLabel: string;
  displayLocationToken: DisplayLocationToken;
  displayExpiresAtMs: number;
  animationHint: DisplayAnimationHint;
  ghostRotationExpiresAtMs?: number;
  demoDisplayMode?: 'NPC_GHOST_TEST';
  relationshipContext: 'PUBLIC' | 'MUTUAL_CRUUSH' | 'MUTUAL_CROWD';
  hasSharedCrowd?: boolean;
  lookingFor: string[];
  vibes: string[];
  identities?: string[];
  presentation?: string[];
  scenes?: string[];
  archetypes?: string[];
  position: string[];
  role: string[];
  hostingTravel: string[];
  photo: string | null;
  photoExplicit?: boolean;
  badges?: CruushBadge[];
  relationship?: DiscoveryUser['relationship'];
};

type NearbyUsersResponse = {
  mapEpochMs: number;
  profiles: TokenizedDiscoveryProfile[];
};

function appendListParams(params: URLSearchParams, key: string, values?: string[]) {
  for (const value of values ?? []) {
    if (value.trim()) {
      params.append(key, value);
    }
  }
}

export async function getNearbyUsers(
  coordinates?: Coordinates | null,
  filters?: DiscoveryFilterParams,
  options?: DiscoveryRequestOptions,
) {
  const params = new URLSearchParams();

  if (coordinates) {
    params.set('lat', String(coordinates.lat));
    params.set('lng', String(coordinates.lng));
  }

  if (options?.limit) {
    params.set('limit', String(options.limit));
  }

  if (options?.npcGhostDemo) {
    params.set('npcGhostDemo', '1');
  }

  appendListParams(params, 'identities', filters?.identities);
  appendListParams(params, 'presentations', filters?.presentations);
  appendListParams(params, 'lookingFor', filters?.lookingFor);
  appendListParams(params, 'timing', filters?.timing);
  appendListParams(params, 'hosting', filters?.hosting);
  appendListParams(params, 'vibes', filters?.vibes);
  appendListParams(params, 'crowds', filters?.crowds);
  appendListParams(params, 'hobbies', filters?.hobbies);
  appendListParams(params, 'positions', filters?.positions);
  appendListParams(params, 'roles', filters?.roles);
  appendListParams(params, 'kinks', filters?.kinks);
  appendListParams(params, 'bodyTypes', filters?.bodyTypes);
  appendListParams(params, 'sexuality', filters?.sexuality);
  appendListParams(params, 'substanceBoundaries', filters?.substanceBoundaries);

  const query = params.toString();
  const path = query ? `/api/users?${query}` : '/api/users';
  const response = await requestApi<NearbyUsersResponse | DiscoveryUser[]>(path);

  if (Array.isArray(response)) {
    return response.map((user) => ({
      ...user,
      photoExplicit: user.photoExplicit === true,
    }));
  }

  return Promise.all(response.profiles.map(async (profile): Promise<DiscoveryUser> => {
    const displayPayload = await decryptDisplayLocationToken(profile.displayLocationToken);

    return {
      id: profile.profileToken,
      name: profile.name,
      display_name: profile.display_name,
      signal: profile.signal,
      latestFeedPostPreview: profile.latestFeedPostPreview,
      age: profile.age,
      pronouns: profile.pronouns,
      lat: displayPayload.latitude,
      lng: displayPayload.longitude,
      lastActive: profile.lastActive,
      distance: profile.distanceLabel,
      lookingFor: profile.lookingFor,
      vibes: profile.vibes,
      identities: profile.identities,
      presentation: profile.presentation,
      scenes: profile.scenes,
      archetypes: profile.archetypes,
      position: profile.position,
      role: profile.role,
      hostingTravel: profile.hostingTravel,
      photo: profile.photo,
      photoExplicit: profile.photoExplicit === true,
      badges: profile.badges,
      displayMode: displayPayload.displayMode,
      animationHint: profile.animationHint ?? displayPayload.animationHint,
      displayExpiresAtMs: profile.displayExpiresAtMs,
      ghostRotationExpiresAtMs: profile.ghostRotationExpiresAtMs,
      privacyRadiusMeters: displayPayload.accuracyDisplayM,
      npcGhostDemo: profile.demoDisplayMode === 'NPC_GHOST_TEST',
      hasSharedCrowd: profile.hasSharedCrowd === true || profile.relationshipContext === 'MUTUAL_CROWD',
      relationshipContext: profile.relationshipContext,
      relationship: profile.relationship,
    };
  }));
}
