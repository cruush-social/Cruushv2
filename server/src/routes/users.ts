import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  demoDiscoveryUsers,
  formatDistanceMiles,
  formatLastActiveFromDate,
  formatLastActiveFromMinutes,
  getDiscoveryCoordinates
} from "../discovery-users.js";
import { getAuthenticatedUserId } from "../request-auth.js";

type DiscoveryProfileRow = {
  id: string;
  display_name: string | null;
  year_of_birth: number | null;
  pronouns: string[] | null;
  looking_for: string[] | null;
  vibes: string[] | null;
  photos: string[] | null;
  updated_at: string | Date;
};

type LegacyDiscoveryProfileRow = {
  id: string;
  display_name: string | null;
  age: number | null;
  pronouns: string | null;
  looking_for: unknown;
  legacy_vibe_tags: unknown;
  primary_photo_url: string | null;
  last_active: string | Date | null;
  lat: number | null;
  lng: number | null;
  fuzzy_lat: number | null;
  fuzzy_lng: number | null;
};

const discoveryQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional()
});

const DEFAULT_CENTER = {
  lat: 40.6782,
  lng: -73.9442
};

function isSchemaCompatibilityError(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: string }).code)
    : "";

  if (["42703", "42P01", "42883", "22P02"].includes(code)) {
    return true;
  }

  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("column") ||
    message.includes("relation") ||
    message.includes("operator does not exist") ||
    message.includes("does not exist")
  );
}

function coerceStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (!trimmed) {
      return [];
    }

    if (trimmed.startsWith("[")) {
      try {
        return coerceStringArray(JSON.parse(trimmed));
      } catch {
        return [trimmed];
      }
    }

    return trimmed.includes(",")
      ? trimmed.split(",").map((item) => item.trim()).filter(Boolean)
      : [trimmed];
  }

  return [];
}

function coerceDisplayName(value: string | null) {
  return value?.trim() || "Cruush user";
}

function getLegacyCoordinates(
  row: LegacyDiscoveryProfileRow,
  centerLat: number,
  centerLng: number,
  index: number
) {
  const fallbackCoordinates = getDiscoveryCoordinates(centerLat, centerLng, index);

  return {
    lat: row.fuzzy_lat ?? row.lat ?? fallbackCoordinates.lat,
    lng: row.fuzzy_lng ?? row.lng ?? fallbackCoordinates.lng
  };
}

async function loadDiscoveryRows(app: FastifyInstance) {
  try {
    const modernRows = await app.db.query<DiscoveryProfileRow>(
      `select
         id::text as id,
         display_name,
         year_of_birth,
         pronouns,
         looking_for,
         vibes,
         photos,
         updated_at
       from profiles
       order by updated_at desc
       limit 12`
    );

    return {
      mode: "modern" as const,
      rows: modernRows.rows
    };
  } catch (error) {
    if (!isSchemaCompatibilityError(error)) {
      throw error;
    }

    const legacyRows = await app.db.query<LegacyDiscoveryProfileRow>(
      `select
         id::text as id,
         display_name,
         age,
         pronouns,
         looking_for,
         tribes as legacy_vibe_tags,
         primary_photo_url,
         last_active,
         lat,
         lng,
         fuzzy_lat,
         fuzzy_lng
       from profiles
       order by last_active desc nulls last
       limit 12`
    );

    return {
      mode: "legacy" as const,
      rows: legacyRows.rows
    };
  }
}

export async function registerUserRoutes(app: FastifyInstance) {
  app.get("/api/users", async (request, reply) => {
    getAuthenticatedUserId(request);
    const parsedQuery = discoveryQuerySchema.parse(request.query);
    const centerLat = parsedQuery.lat ?? DEFAULT_CENTER.lat;
    const centerLng = parsedQuery.lng ?? DEFAULT_CENTER.lng;

    const usedIds = new Set<string>();
    const discoveryRows = await loadDiscoveryRows(app);
    const realUsers = discoveryRows.rows.map((row, index) => {
      usedIds.add(row.id);

      if (discoveryRows.mode === "modern") {
        const coordinates = getDiscoveryCoordinates(centerLat, centerLng, index);

        return {
          id: row.id,
          name: coerceDisplayName(row.display_name),
          display_name: coerceDisplayName(row.display_name),
          age: row.year_of_birth ? new Date().getFullYear() - row.year_of_birth : null,
          pronouns: coerceStringArray(row.pronouns).join(", "),
          lat: coordinates.lat,
          lng: coordinates.lng,
          lastActive: formatLastActiveFromDate(row.updated_at),
          distance: formatDistanceMiles(centerLat, centerLng, coordinates.lat, coordinates.lng),
          lookingFor: coerceStringArray(row.looking_for),
          vibes: coerceStringArray(row.vibes),
          photo: row.photos?.[0] ?? null
        };
      }

      const legacyCoordinates = getLegacyCoordinates(row, centerLat, centerLng, index);

      return {
        id: row.id,
        name: coerceDisplayName(row.display_name),
        display_name: coerceDisplayName(row.display_name),
        age: row.age ?? null,
        pronouns: row.pronouns?.trim() ?? "",
        lat: legacyCoordinates.lat,
        lng: legacyCoordinates.lng,
        lastActive: row.last_active
          ? formatLastActiveFromDate(row.last_active)
          : formatLastActiveFromMinutes(5 + index * 7),
        distance: formatDistanceMiles(centerLat, centerLng, legacyCoordinates.lat, legacyCoordinates.lng),
        lookingFor: coerceStringArray(row.looking_for),
        vibes: coerceStringArray(row.legacy_vibe_tags),
        photo: row.primary_photo_url?.trim() || null
      };
    });

    const fallbackUsers = demoDiscoveryUsers
      .filter((user) => !usedIds.has(user.id))
      .map((user, index) => {
        const coordinates = getDiscoveryCoordinates(centerLat, centerLng, realUsers.length + index);

        return {
          id: user.id,
          name: user.name,
          display_name: user.name,
          age: user.age,
          pronouns: user.pronouns,
          lat: coordinates.lat,
          lng: coordinates.lng,
          lastActive: formatLastActiveFromMinutes(user.lastActiveMinutes),
          distance: formatDistanceMiles(centerLat, centerLng, coordinates.lat, coordinates.lng),
          lookingFor: user.lookingFor,
          vibes: user.vibes,
          photo: user.photo
        };
      });

    return reply.send({
      data: [...realUsers, ...fallbackUsers].slice(0, 12)
    });
  });
}
