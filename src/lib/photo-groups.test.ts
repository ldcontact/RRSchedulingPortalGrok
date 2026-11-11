import { describe, expect, it } from "vitest";
import { groupCompletionPhotos } from "./photo-groups";
import type { Photo } from "./types";

const job = (id: string, starts_at: string) => ({ id, title: `Visit ${id}`, starts_at, status: "approved" as const, kind: "install" as const });
const photo = (id: string, job_id: string | null, kind: Photo["kind"], created_at: string): Photo => ({
  id, project_id: "p", job_id, kind, storage_path: `p/${id}.jpg`, caption: null, uploaded_by: null, created_at, requirement_id: null,
  url: `https://x/${id}`, uploader_name: "Unknown", uploader_color: "#000",
} as Photo);

describe("groupCompletionPhotos", () => {
  it("groups completion photos by visit, newest visit first, photos oldest first", () => {
    const g = groupCompletionPhotos([job("a", "2026-06-01T13:00:00Z"), job("b", "2026-07-01T13:00:00Z"), job("c", "2026-08-01T13:00:00Z")], [
      photo("1", "a", "completion", "2026-06-01T15:00:00Z"),
      photo("2", "b", "completion", "2026-07-01T16:00:00Z"),
      photo("3", "b", "completion", "2026-07-01T14:00:00Z"),
      photo("4", null, "before", "2026-05-01T14:00:00Z"),
      photo("5", "zzz", "completion", "2026-07-01T14:00:00Z"),
    ]);
    expect(g.map((x) => [x.job.id, x.photos.map((p) => p.id), x.total])).toEqual([["b", ["3", "2"], 2], ["a", ["1"], 1]]);
  });
  it("caps thumbnails per visit but keeps the full total", () => {
    const many = Array.from({ length: 30 }, (_, i) => photo(String(i), "a", "completion", `2026-06-01T15:${String(i).padStart(2, "0")}:00Z`));
    const [g] = groupCompletionPhotos([job("a", "2026-06-01T13:00:00Z")], many, 12);
    expect(g.photos).toHaveLength(12);
    expect(g.total).toBe(30);
    expect(g.photos[0].id).toBe("0");
  });
  it("returns nothing when there are no completion photos", () => {
    expect(groupCompletionPhotos([job("a", "2026-06-01T13:00:00Z")], [])).toEqual([]);
  });
});
