type DemoDiscoveryUserSeed = {
  id: string;
  name: string;
  age: number;
  pronouns: string;
  lookingFor: string[];
  vibes: string[];
  photo: string | null;
  lastActiveMinutes: number;
};

const DEMO_USER_OFFSETS = [
  { lat: 0.0034, lng: -0.0021 },
  { lat: -0.0022, lng: 0.0031 },
  { lat: 0.0012, lng: 0.0043 },
  { lat: -0.0038, lng: -0.0015 },
  { lat: 0.0044, lng: 0.0011 }
];

export const demoDiscoveryUsers: DemoDiscoveryUserSeed[] = [
  {
    id: "b8b61062-f0b1-4c75-9390-7bc769278e01",
    name: "Jordan",
    age: 26,
    pronouns: "they/them",
    lookingFor: ["Friends", "Dates", "Fun"],
    vibes: ["Artsy", "Chill", "Goth"],
    photo: null,
    lastActiveMinutes: 2
  },
  {
    id: "1161e178-22fb-476c-aa5d-61f0925bc4ee",
    name: "Alex",
    age: 29,
    pronouns: "he/him",
    lookingFor: ["Dates", "Relationship", "Fun"],
    vibes: ["Nerdy", "Adventurous", "Alt"],
    photo: null,
    lastActiveMinutes: 5
  },
  {
    id: "d6cf9fb4-8141-48d7-a289-6f9aa0cbb7f7",
    name: "Sam",
    age: 24,
    pronouns: "she/her",
    lookingFor: ["Friends", "Fun", "Community"],
    vibes: ["Outdoorsy", "Creative", "Goth"],
    photo: null,
    lastActiveMinutes: 15
  },
  {
    id: "1132f749-db29-4db8-9fd7-cc068b63c516",
    name: "River",
    age: 31,
    pronouns: "they/them",
    lookingFor: ["Friends", "Community", "Networking"],
    vibes: ["Activist", "Thoughtful", "Chill"],
    photo: null,
    lastActiveMinutes: 60
  },
  {
    id: "f6ae7d55-b5ca-49e5-ba65-033627d86e0a",
    name: "Casey",
    age: 27,
    pronouns: "he/they",
    lookingFor: ["Dates", "Fun", "Relationship"],
    vibes: ["Musical", "Playful", "Artsy"],
    photo: null,
    lastActiveMinutes: 180
  }
];

function toRadians(value: number) {
  return value * (Math.PI / 180);
}

export function formatLastActiveFromMinutes(totalMinutes: number) {
  if (totalMinutes < 60) {
    return `${Math.max(1, totalMinutes)}m ago`;
  }

  if (totalMinutes < 1440) {
    return `${Math.floor(totalMinutes / 60)}h ago`;
  }

  return `${Math.floor(totalMinutes / 1440)}d ago`;
}

export function formatLastActiveFromDate(dateValue: string | Date) {
  const diffMs = Date.now() - new Date(dateValue).getTime();
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60000));
  return formatLastActiveFromMinutes(diffMinutes);
}

export const ONLINE_WINDOW_MINUTES = 5;

function latestDate(values: Array<string | Date | null | undefined>) {
  let latestMs = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (value == null) continue;
    const ms = new Date(value).getTime();
    if (!Number.isNaN(ms) && ms > latestMs) latestMs = ms;
  }
  return Number.isFinite(latestMs) ? latestMs : null;
}

/**
 * The last-active label. `lastSeenAt` is when the member last used the app;
 * `fallback` is the older location/profile timestamp, kept for members who have
 * not been seen since the column was added. A member seen within the online
 * window reads "Online", unless `allowOnline` is false (Ghost Mode), in which
 * case the label never reads closer than the window itself.
 */
export function formatPresenceLabel(input: {
  lastSeenAt?: string | Date | null;
  fallback?: string | Date | null;
  allowOnline: boolean;
  nowMs?: number;
}) {
  const latestMs = latestDate([input.lastSeenAt, input.fallback]);
  if (latestMs == null) {
    return formatLastActiveFromMinutes(ONLINE_WINDOW_MINUTES);
  }

  const diffMinutes = Math.max(0, Math.floor(((input.nowMs ?? Date.now()) - latestMs) / 60000));
  if (diffMinutes < ONLINE_WINDOW_MINUTES) {
    return input.allowOnline ? "Online" : formatLastActiveFromMinutes(ONLINE_WINDOW_MINUTES);
  }

  return formatLastActiveFromMinutes(diffMinutes);
}

export function formatDistanceMiles(fromLat: number, fromLng: number, toLat: number, toLng: number) {
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(toLat - fromLat);
  const dLng = toRadians(toLng - fromLng);
  const lat1 = toRadians(fromLat);
  const lat2 = toRadians(toLat);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return `${(earthRadiusMiles * c).toFixed(1)} mi`;
}

export function getDiscoveryCoordinates(centerLat: number, centerLng: number, index: number) {
  const offset = DEMO_USER_OFFSETS[index % DEMO_USER_OFFSETS.length] ?? DEMO_USER_OFFSETS[0];
  return {
    lat: centerLat + offset.lat,
    lng: centerLng + offset.lng
  };
}
