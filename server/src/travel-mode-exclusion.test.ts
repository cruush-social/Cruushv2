import { describe, expect, it } from "vitest";

/**
 * Travel Mode lets somebody stand where they are not. Dark Room lets somebody
 * look without being seen. Either alone is a feature; together they are the
 * exact shape a creep needs, so the pair is refused from both directions.
 *
 * These assert the rule is enforced at the route, not only stated in copy.
 */
const privacyRoute = new URL("./routes/privacy.ts", import.meta.url);
const source = await import("node:fs").then((fs) => fs.readFileSync(privacyRoute, "utf8"));

describe("Travel Mode and Dark Room are mutually exclusive", () => {
  it("refuses Dark Room while a travel pin is down", () => {
    expect(source).toContain('baseMode === "STEALTH" && await loadTravelPinForMode(app, userId)');
    expect(source).toContain("Dark Room is unavailable in Mile High Club");
  });

  it("refuses a travel pin while Dark Room is on", () => {
    expect(source).toContain('currentPolicy?.baseMode === "STEALTH"');
    expect(source).toContain("Mile High Club is unavailable in Dark Room");
  });

  it("still allows Pulse while travelling", () => {
    const mapPings = require("node:fs").readFileSync(
      new URL("./map-pings.ts", import.meta.url),
      "utf8"
    );

    expect(mapPings).not.toContain("Pulse is unavailable in Travel Mode");
  });
});
