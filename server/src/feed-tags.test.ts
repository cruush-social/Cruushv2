import { describe, expect, it } from "vitest";
import { MAX_FEED_TAG_SEARCH_TERMS, parseFeedTagSearchTerms } from "./routes/posts.js";
import { createPostPayloadSchema, MAX_FEED_POST_TAGS } from "./post-schema.js";

describe("feed post tags", () => {
  it("accepts ten tags on one post", () => {
    const tags = Array.from({ length: MAX_FEED_POST_TAGS }, (_, index) => `tag${index}`);
    const payload = createPostPayloadSchema.parse({ content: "hello", tags });

    expect(payload.tags).toHaveLength(10);
  });

  it("refuses an eleventh tag", () => {
    const tags = Array.from({ length: MAX_FEED_POST_TAGS + 1 }, (_, index) => `tag${index}`);

    expect(() => createPostPayloadSchema.parse({ content: "hello", tags })).toThrow();
  });

  it("normalises a search into distinct tag terms", () => {
    expect(parseFeedTagSearchTerms("#Leather, rubber  #leather")).toEqual(["leather", "rubber"]);
  });

  it("caps a search at ten tags", () => {
    const query = Array.from({ length: 15 }, (_, index) => `#tag${index}`).join(" ");

    expect(parseFeedTagSearchTerms(query)).toHaveLength(MAX_FEED_TAG_SEARCH_TERMS);
  });

  it("treats an empty search as no tag filter", () => {
    expect(parseFeedTagSearchTerms("  ##  ")).toEqual([]);
    expect(parseFeedTagSearchTerms(undefined)).toEqual([]);
  });
});
