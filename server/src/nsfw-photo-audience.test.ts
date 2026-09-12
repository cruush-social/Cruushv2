import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { canViewNsfwPhoto, loadPhotoViewerRelationships, saveNsfwPhotoAudience } from "./nsfw-photo-audience.js";

const { getRelationshipPermissions, decryptSensitiveProfile } = vi.hoisted(() => ({
  getRelationshipPermissions: vi.fn(),
  decryptSensitiveProfile: vi.fn()
}));
vi.mock("./match-relationships.js", () => ({ getRelationshipPermissions }));
vi.mock("./profile-sensitive.js", () => ({ decryptSensitiveProfile }));

describe("NSFW photo audience", () => {
  const query = vi.fn();
  const app = { db: { query }, config: {} } as unknown as FastifyInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    getRelationshipPermissions.mockResolvedValue({ isBlocked: false, isMutualCruush: false });
    decryptSensitiveProfile.mockImplementation((_, row) => row.sensitive);
  });

  it("defaults missing policies to Public, preserves messaging settings on save, and fails closed on policy errors", async () => {
    query.mockResolvedValueOnce({ rows: [] });
    expect(await canViewNsfwPhoto(app, "owner", "viewer")).toBe(true);
    query.mockResolvedValueOnce({ rows: [{ nsfw_photo_visibility: "mutual_cruushes" }] });
    await saveNsfwPhotoAudience(app, "owner", "mutual_cruushes");
    const sql = query.mock.calls[1][0];
    expect(sql.split("on conflict")[1]).not.toContain("nsfw_send_visibility =");
    query.mockRejectedValueOnce(new Error("database offline"));
    await expect(canViewNsfwPhoto(app, "owner", "viewer")).rejects.toThrow("database offline");
  });

  it("allows the owner and only confirmed mutual cruushes for a mutual-cruush audience", async () => {
    expect(await canViewNsfwPhoto(app, "owner", "owner")).toBe(true);
    expect(query).not.toHaveBeenCalled();
    query.mockResolvedValue({ rows: [{ nsfw_photo_visibility: "mutual_cruushes" }] });
    expect(await canViewNsfwPhoto(app, "owner", "viewer")).toBe(false);
    getRelationshipPermissions.mockResolvedValueOnce({ isBlocked: false, isMutualCruush: true });
    expect(await canViewNsfwPhoto(app, "owner", "viewer")).toBe(true);
    getRelationshipPermissions.mockResolvedValueOnce({ isBlocked: true, isMutualCruush: true });
    expect(await canViewNsfwPhoto(app, "owner", "viewer")).toBe(false);
  });

  it("requires a shared decrypted Crowd and denies absent Crowd data", async () => {
    query.mockResolvedValueOnce({ rows: [{ nsfw_photo_visibility: "mutual_crowds" }] })
      .mockResolvedValueOnce({ rows: [{ id: "owner", sensitive: { crowds: ["Gay"] } }, { id: "viewer", sensitive: { crowds: ["Gay"] } }] });
    expect(await canViewNsfwPhoto(app, "owner", "viewer")).toBe(true);
    query.mockResolvedValueOnce({ rows: [{ nsfw_photo_visibility: "mutual_crowds" }] })
      .mockResolvedValueOnce({ rows: [{ id: "owner", sensitive: { crowds: ["Gay"] } }] });
    expect(await canViewNsfwPhoto(app, "owner", "viewer")).toBe(false);
  });

  it("reports the excluded owner's audience without restricting eligible viewers or own photos", async () => {
    query.mockImplementation(async (sql) => ({ rows: sql.includes('from profiles') ? [
      { id: 'viewer', sensitive: { crowds: ['Gay'] } },
      { id: 'mutual-only', sensitive: { crowds: ['Gay'] } },
      { id: 'crowd-only', sensitive: { crowds: ['Dyke'] } },
      { id: 'eligible', sensitive: { crowds: ['Gay'] } },
    ] : [
      { user_id: 'mutual-only', nsfw_photo_visibility: 'mutual_cruushes' },
      { user_id: 'crowd-only', nsfw_photo_visibility: 'mutual_crowds' },
      { user_id: 'eligible', nsfw_photo_visibility: 'mutual_crowds' },
    ] }));
    const relationships = await loadPhotoViewerRelationships(app, 'viewer', ['viewer', 'mutual-only', 'crowd-only', 'eligible']);
    expect(relationships.has('viewer')).toBe(false);
    expect(relationships.get('mutual-only')).toEqual({ isMutualCruush: false, sharesCrowd: true, nsfwPhotoRestriction: 'mutual_cruushes' });
    expect(relationships.get('crowd-only')).toEqual({ isMutualCruush: false, sharesCrowd: false, nsfwPhotoRestriction: 'mutual_crowds' });
    expect(relationships.get('eligible')?.nsfwPhotoRestriction).toBeUndefined();
  });
});
