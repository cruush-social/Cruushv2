import type { FastifyInstance } from "fastify";
import { getTravelPin } from "./travel-pins.js";
import { loadTravelPinTownLabel } from "./current-town-labels.js";

/** Display only: membership, privacy filters, and pin permissions stay physical. */
export async function getMhcLocationLabel(app: FastifyInstance, subjectUserId: string, sharedMode: "approximate" | "precise") {
  const pin = await getTravelPin(app, subjectUserId);
  if (!pin || pin.expiresAtMs <= Date.now()) return null;
  return sharedMode === "precise" ? await loadTravelPinTownLabel(app, pin) ?? "Nearby" : "Nearby";
}
