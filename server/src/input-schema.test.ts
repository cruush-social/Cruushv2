import { describe, expect, it } from "vitest";
import { publicHttpsUrlSchema } from "./input-schema.js";

describe("publicHttpsUrlSchema", () => {
  it("allows public HTTPS domains that begin with IPv6 private-range letters", () => {
    expect(publicHttpsUrlSchema().parse("https://fc-example.test/avatar.png")).toBe("https://fc-example.test/avatar.png");
  });

  it("rejects IPv6 private and loopback URL hosts", () => {
    expect(() => publicHttpsUrlSchema().parse("https://[::1]/avatar.png")).toThrow();
    expect(() => publicHttpsUrlSchema().parse("https://[fd00::1]/avatar.png")).toThrow();
  });
});
