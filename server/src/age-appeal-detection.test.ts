import { describe, expect, it } from "vitest";
import { isAgeSuspensionAppeal } from "./routes/support.js";

// The terms used to be matched unanchored, so "age" hit inside message, page,
// image, usage and manage. Effectively every support request was filed as an
// urgent age suspension appeal, which is why the inbox filled with them.
describe("isAgeSuspensionAppeal", () => {
  const ordinary: Array<[string, string, string]> = [
    ["a survey response", "survey", "messages stay in the text box after sending, so it is easy to double send"],
    ["a page bug", "unknown", "the map page will not load"],
    ["an image bug", "unknown", "my image upload keeps failing"],
    ["a usage question", "settings", "how do I manage my usage settings"],
    ["a messaging bug", "unknown", "messages send three times from one tap"]
  ];

  for (const [name, source, message] of ordinary) {
    it(`does not flag ${name}`, () => {
      expect(isAgeSuspensionAppeal({
        category: "comment",
        message,
        source,
        subject: "cruush feedback"
      })).toBe(false);
    });
  }

  const appeals: Array<[string, string]> = [
    ["an explicit appeal", "I was suspended and I am appealing it"],
    ["a wrong age", "my age is recorded wrong on my account"],
    ["a dob correction", "my dob was entered incorrectly at signup"],
    ["an over 18 claim", "I am 18+ and got locked out"],
    ["a minor report", "this account looks like a minor"],
    ["a birthday correction", "my birthday on file is wrong"]
  ];

  for (const [name, message] of appeals) {
    it(`still flags ${name}`, () => {
      expect(isAgeSuspensionAppeal({
        category: "comment",
        message,
        source: "auth",
        subject: "Account problem"
      })).toBe(true);
    });
  }

  it("flags the policy category regardless of wording", () => {
    expect(isAgeSuspensionAppeal({
      category: "policy",
      message: "the map page will not load",
      source: "unknown",
      subject: "cruush feedback"
    })).toBe(true);
  });

  it("never flags a survey, even one that names an appeal", () => {
    expect(isAgeSuspensionAppeal({
      category: "comment",
      message: "I was suspended and appealing, but this is survey feedback",
      source: "survey",
      subject: "cruush survey response"
    })).toBe(false);
  });
});
