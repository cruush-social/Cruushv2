import { describe, expect, it } from "vitest";
import { parseProfilePhotoFilename } from "./routes/media.js";

describe("profile photo media paths", () => {
  it("keeps legacy two-UUID URLs readable while accepting UUID-only URLs for new uploads", () => {
    const ownerId = "d271f6da-c51d-4d73-a322-d9c56f45d4fa";
    const mediaId = "11111111-1111-4111-8111-111111111111";

    expect(parseProfilePhotoFilename({ filename: `${ownerId}-${mediaId}.jpg` })).toEqual({
      filename: `${ownerId}-${mediaId}.jpg`
    });
    expect(parseProfilePhotoFilename({ filename: `${mediaId}.webp` })).toEqual({
      filename: `${mediaId}.webp`
    });
    expect(() => parseProfilePhotoFilename({ filename: `user-${mediaId}.png` })).toThrow("Invalid media path.");
  });
});
