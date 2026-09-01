import { requestApi } from './apiClient';
import type { CruushBadge } from './billingApi';
import type { SideBadges } from './profileApi';
import {
  decryptDisplayLocationToken,
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
  travelling?: boolean;
  travelLabel?: string;
  photo: string | null;
  photoExplicit?: boolean;
  badges?: CruushBadge[];
  sideBadges?: SideBadges;
  isDemo?: boolean;
  isCurrentUser?: boolean;
  displayMode?: DisplayMode;
  displayExpiresAtMs?: number;
  canRevealPreciseLocation?: boolean;
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
  activePing?: {
    id: string;
    expiresAt: string;
  } | null;
};

type Coordinates = {
  lat: number;
  lng: number;
};

export type DiscoveryFilterParams = {
  searchQuery?: string;
  mileHighClub?: boolean;
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
  travelling?: boolean;
  travelLabel?: string;
  photo: string | null;
  photoExplicit?: boolean;
  badges?: CruushBadge[];
  sideBadges?: SideBadges;
  relationship?: DiscoveryUser['relationship'];
  activePing?: DiscoveryUser['activePing'];
};

type NearbyUsersResponse = {
  mapEpochMs: number;
  profiles: TokenizedDiscoveryProfile[];
  /** Set when the map is pointed further than a member may browse from. */
  outsideBrowseRadius?: boolean;
  browseRadiusMiles?: number;
};

/**
 * Discovery refuses to serve a view further out than someone may browse, and
 * says so rather than returning an empty list that reads as "nobody here".
 * Mile High Club is how you move where you browse from.
 */
export class OutsideBrowseRadiusError extends Error {
  readonly browseRadiusMiles: number;

  constructor(browseRadiusMiles: number) {
    super(`Turn on Mile High Club to browse more than ${browseRadiusMiles} miles from where you are.`);
    this.name = 'OutsideBrowseRadiusError';
    this.browseRadiusMiles = browseRadiusMiles;
  }
}

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

  if (filters?.mileHighClub) {
    params.set('mileHighClub', '1');
  }

  if (filters?.searchQuery?.trim()) {
    params.set('q', filters.searchQuery.trim());
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

  if (response.outsideBrowseRadius === true) {
    throw new OutsideBrowseRadiusError(response.browseRadiusMiles ?? 50);
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
      travelling: profile.travelling === true,
      travelLabel: profile.travelLabel ?? '',
      photo: profile.photo,
      photoExplicit: profile.photoExplicit === true,
      badges: profile.badges,
      sideBadges: profile.sideBadges,
      displayMode: displayPayload.displayMode,
      displayExpiresAtMs: profile.displayExpiresAtMs,
      // The in-memory NPC demo pins have no rotation of their own, so they stay
      // out of the countdown rather than borrowing someone else's deadline.
      ...(profile.demoDisplayMode === 'NPC_GHOST_TEST'
        ? {}
        : {
          animationHint: profile.animationHint,
          ghostRotationExpiresAtMs: profile.ghostRotationExpiresAtMs,
        }),
      privacyRadiusMeters: displayPayload.accuracyDisplayM,
      npcGhostDemo: profile.demoDisplayMode === 'NPC_GHOST_TEST',
      hasSharedCrowd: profile.hasSharedCrowd === true || profile.relationshipContext === 'MUTUAL_CROWD',
      relationshipContext: profile.relationshipContext,
      relationship: profile.relationship,
      activePing: profile.activePing ?? null,
    };
  }));
}
