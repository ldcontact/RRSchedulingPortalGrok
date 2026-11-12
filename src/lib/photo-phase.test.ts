import { describe, expect, it } from "vitest";
import { bucketPhotosByPhase, derivePhotoPhase, groupPhotosByVisitAndPhase, kindForPhase, visitPhotoCounts } from "./photo-phase";
import type { Photo } from "./types";

const photo = (over: Partial<Photo> = {}): Photo => ({
  id: "p1", project_id: "proj", job_id: "j1", kind: "completion", phase: "after", storage_path: "x.jpg",
  caption: null, requirement_id: null, uploaded_by: null, uploader_name: "A", uploader_color: "#000",
  created_at: "2026-11-01T12:00:00Z", url: "https://x", ...over,
});

describe("derivePhotoPhase", () => {
  it("prefers a stored phase", () => {
    expect(derivePhotoPhase({ kind: "completion", requirement_id: "r1", phase: "other" })).toBe("other");
  });
  it("maps legacy rows: required, before, after", () => {
    expect(derivePhotoPhase({ kind: "completion", requirement_id: "r1" })).toBe("required");
    expect(derivePhotoPhase({ kind: "before", requirement_id: null })).toBe("before");
    expect(derivePhotoPhase({ kind: "completion", requirement_id: null })).toBe("after");
  });
});

describe("kindForPhase", () => {
  it("keeps kind in sync with existing enum values", () => {
    expect(kindForPhase("before")).toBe("before");
    expect(kindForPhase("after")).toBe("completion");
    expect(kindForPhase("required")).toBe("completion");
    expect(kindForPhase("other", "before")).toBe("before");
  });
});

describe("visitPhotoCounts", () => {
  it("counts visit-scoped phases and required items, ignoring other visits", () => {
    const photos = [
      photo({ id: "a", phase: "before", kind: "before" }),
      photo({ id: "b", phase: "before", kind: "before" }),
      photo({ id: "c", phase: "after" }),
      photo({ id: "d", phase: "required", requirement_id: "r1" }),
      photo({ id: "e", phase: "other", job_id: "j1" }),
      photo({ id: "f", phase: "before", kind: "before", job_id: "j2" }),
    ];
    expect(visitPhotoCounts(photos, ["r1", "r2"], "j1")).toEqual({
      before: 2, after: 1, requiredDone: 1, requiredTotal: 2, other: 1,
    });
  });
});

describe("groupPhotosByVisitAndPhase", () => {
  const job = (id: string, starts_at: string) => ({ id, title: id, starts_at, status: "approved" as const, kind: "install" as const });
  it("groups by visit then phase and keeps unassigned photos", () => {
    const photos = [
      photo({ id: "1", job_id: "a", phase: "after", kind: "completion", created_at: "2026-06-01T15:00:00Z" }),
      photo({ id: "2", job_id: "b", phase: "before", kind: "before", created_at: "2026-07-01T14:00:00Z" }),
      photo({ id: "3", job_id: "b", phase: "after", kind: "completion", created_at: "2026-07-01T16:00:00Z" }),
      photo({ id: "4", job_id: null, phase: "before", kind: "before", created_at: "2026-05-01T14:00:00Z" }),
      photo({ id: "5", job_id: null, phase: "other", kind: "before", created_at: "2026-05-02T14:00:00Z" }),
    ];
    const g = groupPhotosByVisitAndPhase([job("a", "2026-06-01T13:00:00Z"), job("b", "2026-07-01T13:00:00Z")], photos);
    expect(g.visits.map((v) => [v.job.id, v.total, v.phases.before.map((p) => p.id), v.phases.after.map((p) => p.id)])).toEqual([
      ["b", 2, ["2"], ["3"]],
      ["a", 1, [], ["1"]],
    ]);
    expect(g.unassignedTotal).toBe(2);
    expect(g.unassigned.before.map((p) => p.id)).toEqual(["4"]);
    expect(g.unassigned.other.map((p) => p.id)).toEqual(["5"]);
  });
  it("does not drop a visit-less imported photo", () => {
    const g = groupPhotosByVisitAndPhase([], [photo({ id: "hcp", job_id: null, phase: "other", kind: "completion" })]);
    expect(g.visits).toEqual([]);
    expect(g.unassigned.other).toHaveLength(1);
  });
});

describe("bucketPhotosByPhase", () => {
  it("derives phase when the stored value is missing", () => {
    const buckets = bucketPhotosByPhase([
      photo({ id: "x", phase: undefined as unknown as Photo["phase"], kind: "before", requirement_id: null }),
    ]);
    expect(buckets.before).toHaveLength(1);
  });
});
