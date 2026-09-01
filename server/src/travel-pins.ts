import type { FastifyInstance } from "fastify";
import { isWithinBetaLaunchArea } from "./beta-access.js";
import { ApiError } from "./errors.js";
import type { LocationPayload } from "./location-privacy.js";

/**
 * Mile High Club. A member visiting another place drops a pin there and the map
 * shows them at that pin instead of their device location.
 *
 * The pin holds for a few hours before it can be moved again. A pin that can be
 * dragged around freely is a scammer's tool, so the wait is enforced here at the
 * database boundary rather than in the interface.
 */

export const TRAVEL_PIN_MOVE_COOLDOWN_MS = 3 * 60 * 60 * 1000;
export const TRAVEL_PIN_MIN_DISTANCE_MILES = 50;

export function isTravelPinDistanceAllowed(distanceMiles: number) {
  return Number.isFinite(distanceMiles) && distanceMiles > TRAVEL_PIN_MIN_DISTANCE_MILES;
}

/**
 * A trip, not a residence. The pin lapses on its own after a day so nobody has
 * to remember to turn it off, and somebody who left a city three weeks ago is
 * not still standing in it.
 */
export const TRAVEL_PIN_LIFETIME_MS = 24 * 60 * 60 * 1000;
export const TRAVEL_LABEL_MAX_LENGTH = 60;

export type TravelPin = {
  userId: string;
  latitude: number;
  longitude: number;
  label: string;
  setAtMs: number;
  /** When this pin may next be moved. */
  movableAtMs: number;
  /** When it lapses on its own. */
  expiresAtMs: number;
};

export function locationPayloadAtTravelPin(location: LocationPayload, pin: TravelPin): LocationPayload {
  return {
    ...location,
    locationVersion: pin.setAtMs,
    latE7: Math.round(pin.latitude * 10_000_000),
    lonE7: Math.round(pin.longitude * 10_000_000),
    accuracyM: 0,
    source: "MANUAL",
    deviceReportedAtMs: pin.setAtMs,
    collectedAtMs: pin.setAtMs,
    expiresAtMs: pin.expiresAtMs
  };
}

type TravelPinRow = {
  user_id: string;
  latitude: number;
  longitude: number;
  label: string;
  set_at: string | Date;
};

function mapTravelPin(row: TravelPinRow): TravelPin {
  const setAtMs = new Date(row.set_at).getTime();

  return {
    userId: row.user_id,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    label: row.label ?? "",
    setAtMs,
    movableAtMs: setAtMs + TRAVEL_PIN_MOVE_COOLDOWN_MS,
    expiresAtMs: setAtMs + TRAVEL_PIN_LIFETIME_MS
  };
}

export async function getTravelPin(app: FastifyInstance, userId: string): Promise<TravelPin | null> {
  const result = await app.db.query<TravelPinRow>(
    `select user_id::text as user_id, latitude, longitude, label, set_at
     from user_travel_pins
     where user_id = $1
       and set_at > now() - interval '24 hours'
     limit 1`,
    [userId]
  );
  const row = result.rows[0];

  return row ? mapTravelPin(row) : null;
}

export async function loadTravelPins(app: FastifyInstance, userIds: string[]) {
  const pins = new Map<string, TravelPin>();
  if (userIds.length === 0) {
    return pins;
  }

  const result = await app.db.query<TravelPinRow>(
    `select user_id::text as user_id, latitude, longitude, label, set_at
     from user_travel_pins
     where user_id = any($1::uuid[])
       and set_at > now() - interval '24 hours'`,
    [userIds]
  );

  result.rows.forEach((row) => {
    pins.set(row.user_id, mapTravelPin(row));
  });

  return pins;
}

export class TravelPinCooldownError extends Error {
  readonly movableAtMs: number;

  constructor(movableAtMs: number) {
    super("This travel pin cannot be moved yet.");
    this.name = "TravelPinCooldownError";
    this.movableAtMs = movableAtMs;
  }
}

export async function setTravelPin(
  app: FastifyInstance,
  userId: string,
  input: { latitude: number; longitude: number; label?: string },
  nowMs = Date.now()
): Promise<TravelPin> {
  if (!isWithinBetaLaunchArea({ lat: input.latitude, lng: input.longitude })) {
    throw new ApiError(
      403,
      "FEATURE_RESTRICTED",
      "That location is outside the current cruush service area."
    );
  }
  const existing = await getTravelPin(app, userId);
  if (existing && nowMs < existing.movableAtMs) {
    throw new TravelPinCooldownError(existing.movableAtMs);
  }

  const label = (input.label ?? "").trim().slice(0, TRAVEL_LABEL_MAX_LENGTH);
  const result = await app.db.query<TravelPinRow>(
    `insert into user_travel_pins (user_id, latitude, longitude, label, set_at, updated_at)
     values ($1, $2, $3, $4, now(), now())
     on conflict (user_id) do update
       set latitude = excluded.latitude,
           longitude = excluded.longitude,
           label = excluded.label,
           set_at = now(),
           updated_at = now()
     returning user_id::text as user_id, latitude, longitude, label, set_at`,
    [userId, input.latitude, input.longitude, label]
  );

  return mapTravelPin(result.rows[0]);
}

/** Landing. Clearing a pin is always allowed; only moving one waits. */
export async function clearTravelPin(app: FastifyInstance, userId: string) {
  await app.db.query(`delete from user_travel_pins where user_id = $1`, [userId]);
}
