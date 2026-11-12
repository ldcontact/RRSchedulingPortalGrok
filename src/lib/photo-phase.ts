import type { Job, Photo, PhotoKind, PhotoPhase, PhotoRequirement } from "./types";

export type { PhotoPhase };
export const PHOTO_PHASES: PhotoPhase[] = ["before", "after", "required", "other"];
export const PHOTO_PHASE_LABEL: Record<PhotoPhase, string> = {
  before: "Before",
  after: "After",
  required: "Required",
  other: "Uncategorized",
};
export type MoveablePhase = "before" | "after";

/** Map a legacy kind/requirement row (or a stored phase) onto the visit/project photo phase. */
export function derivePhotoPhase(p: { kind: PhotoKind; requirement_id?: string | null; phase?: PhotoPhase | null }): PhotoPhase {
  if (p.phase === "before" || p.phase === "after" || p.phase === "required" || p.phase === "other") return p.phase;
  if (p.requirement_id) return "required";
  if (p.kind === "before") return "before";
  if (p.kind === "completion") return "after";
  return "other";
}

/** Keep public.photos.kind in sync so existing RLS, storage paths, and submit guards keep working. */
export function kindForPhase(phase: PhotoPhase, fallback: PhotoKind = "completion"): PhotoKind {
  if (phase === "before") return "before";
  if (phase === "after" || phase === "required") return "completion";
  return fallback;
}

export type VisitPhotoCounts = { before: number; after: number; requiredDone: number; requiredTotal: number; other: number };

export function visitPhotoCounts(
  photos: { phase: PhotoPhase; job_id?: string | null; requirement_id?: string | null }[],
  requirementIds: string[],
  jobId?: string,
): VisitPhotoCounts {
  const mine = jobId ? photos.filter((p) => p.job_id === jobId) : photos;
  const requiredDone = requirementIds.filter((id) => mine.some((p) => p.phase === "required" && p.requirement_id === id)).length;
  return {
    before: mine.filter((p) => p.phase === "before").length,
    after: mine.filter((p) => p.phase === "after").length,
    requiredDone,
    requiredTotal: requirementIds.length,
    other: mine.filter((p) => p.phase === "other").length,
  };
}

export type PhaseBuckets = Record<PhotoPhase, Photo[]>;

export function bucketPhotosByPhase(photos: Photo[]): PhaseBuckets {
  const buckets: PhaseBuckets = { before: [], after: [], required: [], other: [] };
  for (const p of photos) buckets[derivePhotoPhase(p)].push(p);
  return buckets;
}

export type VisitPhaseGroup = {
  job: Pick<Job, "id" | "title" | "starts_at" | "status" | "kind">;
  phases: PhaseBuckets;
  total: number;
};

/**
 * All photos for a project, grouped by visit (newest first) then by phase.
 * Photos with no visit stay in `unassigned` so imported / project-level shots never disappear.
 */
export function groupPhotosByVisitAndPhase(
  jobs: Pick<Job, "id" | "title" | "starts_at" | "status" | "kind">[],
  photos: Photo[],
): { visits: VisitPhaseGroup[]; unassigned: PhaseBuckets; unassignedTotal: number } {
  const byJob = new Map<string, Photo[]>();
  const loose: Photo[] = [];
  for (const p of photos) {
    if (p.job_id) byJob.set(p.job_id, [...(byJob.get(p.job_id) ?? []), p]);
    else loose.push(p);
  }
  const visits = [...jobs]
    .filter((j) => (byJob.get(j.id) ?? []).length > 0)
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at))
    .map((job) => {
      const list = (byJob.get(job.id) ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at));
      return { job, phases: bucketPhotosByPhase(list), total: list.length };
    });
  const unassignedList = loose.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return { visits, unassigned: bucketPhotosByPhase(unassignedList), unassignedTotal: unassignedList.length };
}

export function requirementsSatisfied(photos: { requirement_id?: string | null }[], requirements: Pick<PhotoRequirement, "id">[]) {
  return requirements.filter((r) => photos.some((p) => p.requirement_id === r.id)).length;
}
