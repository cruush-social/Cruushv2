import { describe, expect, it } from "vitest";
import { accountCanAuthenticate, normalizeAccountStatus } from "./account-status.js";

describe("account status", () => {
  it("normalizes unknown values to active for backwards compatibility", () => {
    expect(normalizeAccountStatus(undefined)).toBe("active");
    expect(normalizeAccountStatus("unknown")).toBe("active");
  });

  it("allows active and under-review accounts to authenticate", () => {
    expect(accountCanAuthenticate("active")).toBe(true);
    expect(accountCanAuthenticate("under_review")).toBe(true);
  });

  it("blocks suspended and deleted accounts from authenticating", () => {
    expect(accountCanAuthenticate("suspended")).toBe(false);
    expect(accountCanAuthenticate("deleted")).toBe(false);
  });
});

