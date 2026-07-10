import { describe, expect, it } from "vitest";
import {
  prepareTextForModerationProvider,
  shouldModerateMessageTextWithProvider
} from "./message-keyword-prefilter.js";

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

  it("blocks the hard-r racial slur and sends allowed slurs for contextual review", () => {
    for (const text of ["nigger", "NIGGER!", "n.i.g.g.e.r", "n1gg3r", "niggers"]) {
      expect(shouldModerateMessageTextWithProvider(text)).toMatchObject({
        shouldModerate: true,
        matchedCategories: expect.arrayContaining(["hate_or_extremism"])
      });
    }

    for (const text of ["nigga", "niggas", "faggot", "fags", "tranny", "trannies", "dyke", "homo", "shemale", "lesbo"]) {
      expect(shouldModerateMessageTextWithProvider(text)).toMatchObject({
        shouldModerate: true,
        matchedCategories: expect.arrayContaining(["contextual_slur_review"])
      });
    }

    expect(shouldModerateMessageTextWithProvider("fuck shit bitch cunt")).toEqual({
      shouldModerate: false,
      matchedCategories: []
    });
  });

  it("normalizes allowed slurs and profanity before external provider review", () => {
    expect(prepareTextForModerationProvider(
      "faggot fags tranny trannies nigga niggas fuck shit bitch cunt slut whore dick cock pussy"
    )).toBe(
      "gay person gay people trans person trans people Black person Black people expletive expletive expletive expletive expletive expletive body body body"
    );
    expect(prepareTextForModerationProvider("kill all faggots")).toBe("kill all gay people");
    expect(prepareTextForModerationProvider(
      "dyke dykes queer queers homo homos shemale shemales lesbo lesbos ass bastard bullshit crap douche dumbass jackass prick twat wanker"
    )).toBe(
      "lesbian person lesbian people LGBTQ person LGBTQ people gay person gay people trans person trans people lesbian person lesbian people expletive expletive expletive expletive expletive expletive expletive expletive expletive expletive"
    );
  });
});
