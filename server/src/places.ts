import { z } from "zod";
import { multilineTextSchema, publicHttpsUrlSchema, singleLineTextSchema } from "./input-schema.js";

export const PLACE_FACILITY_TYPES = [
  "clinic", "bar", "nightclub", "community_space", "park", "restroom",
  "sauna", "gym", "hotel", "dungeon", "cafe", "shop", "library",
  "staircase", "trail", "transit", "parking", "beach", "adult_venue", "other"
] as const;

export const PLACE_TAGS = [
  "lgbtq_health", "womens_health", "sexual_health", "leans_men",
  "leans_women", "t4t_spot", "techno_club"
] as const;

export const PLACE_VIBES = [
  "chill", "social", "flirty", "cruisy", "dancey", "high_energy",
  "intimate", "community", "after_hours", "outdoor", "historical", "exposed"
] as const;

export const PLACE_AMENITIES = [
  "restrooms", "drinks", "cover_charge", "accessible",
  "transit_nearby", "staff_present", "indoor", "outdoor"
] as const;

export const placeFacilityTypeSchema = z.enum(PLACE_FACILITY_TYPES);
export const placeTagSchema = z.enum(PLACE_TAGS);
export const placeVibeSchema = z.enum(PLACE_VIBES);
export const placeAmenitySchema = z.enum(PLACE_AMENITIES);

const coordinatesSchema = {
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180)
};

export const listPlacesQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusMiles: z.coerce.number().positive().max(100).default(100),
  sort: z.enum(["nearest", "active", "recent", "top_rated", "az"]).default("nearest"),
  activity: z.enum(["any", "active", "recent"]).default("any"),
  facilityTypes: z.string().optional().default(""),
  tags: z.string().optional().default(""),
  vibes: z.string().optional().default(""),
  amenities: z.string().optional().default(""),
  query: z.string().trim().max(120).optional().default(""),
  limit: z.coerce.number().int().min(1).max(500).default(500),
  offset: z.coerce.number().int().min(0).max(100000).default(0)
}).strict();

export const submitPlaceSchema = z.object({
  name: singleLineTextSchema({ min: 2, max: 120 }),
  description: multilineTextSchema({ max: 1000 }).default(""),
  accessInstructions: multilineTextSchema({ max: 1000 }).default(""),
  ...coordinatesSchema,
  address: singleLineTextSchema({ max: 300 }).optional().default(""),
  facilityType: placeFacilityTypeSchema,
  tags: z.array(placeTagSchema).length(0).default([]),
  vibes: z.array(placeVibeSchema).max(3).default([]),
  amenities: z.array(placeAmenitySchema).max(PLACE_AMENITIES.length).default([]),
  sourceUrl: publicHttpsUrlSchema({ max: 1000 }).optional()
}).strict();

export const storedPlaceSuggestionSchema = submitPlaceSchema.extend({
  tags: z.array(placeTagSchema).max(1).default([]),
  vibes: z.array(placeVibeSchema).max(3).default([]),
  amenities: z.array(placeAmenitySchema).max(PLACE_AMENITIES.length).default([])
});

export const placeCheckinSchema = z.object({
  content: multilineTextSchema({ min: 1, max: 1000 }).optional(),
  vibes: z.array(placeVibeSchema).max(3).default([]),
  amenities: z.array(placeAmenitySchema).max(PLACE_AMENITIES.length).default([]),
  durationHours: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12), z.literal(24)]),
  boardDurationHours: z.union([
    z.literal(1), z.literal(3), z.literal(6), z.literal(12), z.literal(24), z.literal(168), z.null()
  ]).optional(),
  visible: z.boolean().default(false),
  ...coordinatesSchema,
  accuracyMeters: z.number().nonnegative().max(402.336),
  observedAt: z.string().datetime()
}).strict();

export const placeBoardPostSchema = z.object({
  content: multilineTextSchema({ min: 1, max: 1000 })
}).strict();

export const placeRatingSchema = z.object({
  category: z.enum(["overall", "gender_inclusivity", "lgbtq_friendliness", "safety", "accessibility", "cleanliness"]),
  stars: z.number().int().min(1).max(5)
}).strict();

export function slugifyPlaceName(name: string) {
  const base = name.toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);

  return base || "place";
}
