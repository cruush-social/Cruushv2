import { describe, expect, it } from "vitest";
import { shouldModerateMessageTextWithProvider } from "./message-keyword-prefilter.js";

describe("message keyword prefilter", () => {
  it("skips Stream for ordinary consensual adult dating messages", () => {
    expect(shouldModerateMessageTextWithProvider("You free tonight? Into rope, cuddles, and aftercare.")).toEqual({
      shouldModerate: false,
      matchedCategories: []
    });
  });

  it("triggers Stream for each severe-safety launch category", () => {
    const examples = [
      ["minor_safety", "Looking for underage explicit pics"],
      ["credible_threat", "I am going to hurt you"],
      ["harassment_or_stalking", "I will keep stalking you outside"],
      ["doxxing_or_location_privacy", "I will leak your address"],
      ["drug_sales", "meth delivery available"],
      ["commercial_sex", "$250 for a hookup session"],
      ["bestiality", "bestiality content"],
      ["nonconsensual_intimate_image", "I will leak her nudes"],
      ["hate_or_extremism", "kill all trans people"],
      ["scam_spam_or_platform_abuse", "this is sextortion"]
    ] as const;

    for (const [category, text] of examples) {
      expect(shouldModerateMessageTextWithProvider(text)).toMatchObject({
        shouldModerate: true,
        matchedCategories: expect.arrayContaining([category])
      });
    }
  });

  it("normalizes punctuation, case, and separators before matching", () => {
    expect(shouldModerateMessageTextWithProvider("K.Y.S.")).toMatchObject({
      shouldModerate: true,
      matchedCategories: expect.arrayContaining(["credible_threat"])
    });
    expect(shouldModerateMessageTextWithProvider("C S A M")).toMatchObject({
      shouldModerate: true,
      matchedCategories: expect.arrayContaining(["minor_safety"])
    });
  });
});
