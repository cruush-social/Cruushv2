import type { FastifyInstance } from "fastify";
import { loadLocationEnvelopes, locationPayloadToCoordinates } from "./location-privacy.js";
import { decryptProfileVisibility } from "./profile-sensitive.js";
import { isWithinServiceArea } from "./service-area.js";
import { loadTravelPins, locationPayloadAtTravelPin } from "./travel-pins.js";

type EncryptedVisibilityRow = {
  id: string;
  profile_visibility_ciphertext: string | null;
  profile_visibility_nonce: string | null;
  profile_visibility_auth_tag: string | null;
  profile_visibility_key_version: string | null;
};

type ProfileOosApp = Pick<FastifyInstance, "config" | "db">;

/**
 * The caller supplies the authenticated viewer ID. An unavailable encrypted
 * location counts as outside so an opt-in privacy rule cannot be bypassed.
 * Only the server receives the decrypted location or effective travel pin.
 */
export async function getViewerOutsideServiceArea(app: ProfileOosApp, viewerId: string): Promise<boolean> {
  const [locations, travelPins] = await Promise.all([
    loadLocationEnvelopes(app, [viewerId]),
    loadTravelPins(app as FastifyInstance, [viewerId])
  ]);
  const location = locations.get(viewerId);
  if (!location) return true;

  const pin = travelPins.get(viewerId);
  const effectiveLocation = pin ? locationPayloadAtTravelPin(location, pin) : location;
  return !isWithinServiceArea(locationPayloadToCoordinates(effectiveLocation));
}

/**
 * Filter only the Out of Sight profile-visibility rule. Other visibility rules
 * remain the caller's responsibility; existing conversation access is separate.
 * A present but unreadable encrypted policy is hidden rather than disclosed.
 */
export async function loadOosHiddenProfileIds(
  app: ProfileOosApp,
  viewerId: string,
  targetIds: string[],
  optionalViewerOos?: boolean
): Promise<Set<string>> {
  const ids = [...new Set(targetIds)].filter((id) => id !== viewerId);
  const hidden = new Set<string>();
  if (ids.length === 0) return hidden;

  const result = await app.db.query<EncryptedVisibilityRow>(
    `select id::text as id,
            profile_visibility_ciphertext,
            profile_visibility_nonce,
            profile_visibility_auth_tag,
            profile_visibility_key_version
       from profiles
      where id = any($1::uuid[])`,
    [ids]
  );

  const optedInIds: string[] = [];
  for (const row of result.rows) {
    if (row.id === viewerId) continue;
    const encryptedPolicyPresent = Boolean(
      row.profile_visibility_ciphertext || row.profile_visibility_nonce || row.profile_visibility_auth_tag
    );
    if (!encryptedPolicyPresent) continue;

    const rules = decryptProfileVisibility(app.config, row);
    if (!rules) {
      hidden.add(row.id);
    } else if (rules.outside_service_area_members) {
      optedInIds.push(row.id);
    }
  }

  if (optedInIds.length > 0 && (optionalViewerOos ?? await getViewerOutsideServiceArea(app, viewerId))) {
    optedInIds.forEach((id) => hidden.add(id));
  }

  return hidden;
}
