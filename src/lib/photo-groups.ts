import type { Job, Photo } from "@/lib/types";

export type VisitPhotoGroup = { job: Pick<Job, "id" | "title" | "starts_at" | "status" | "kind">; photos: Photo[]; total: number };

/**
 * Completion photos grouped by visit for the project page: visits in schedule order (newest
 * first), photos in taken order. Each group shows at most `perVisit` thumbnails; `total` is the
 * full count so the page can link to the visit for the rest. Photos whose visit isn't in `jobs`
 * are dropped (completion photos always belong to a visit of this project).
 */
export function groupCompletionPhotos(jobs: Pick<Job, "id" | "title" | "starts_at" | "status" | "kind">[], photos: Photo[], perVisit = 12): VisitPhotoGroup[] {
  const byJob = new Map<string, Photo[]>();
  for (const p of photos) if (p.kind === "completion" && p.job_id) byJob.set(p.job_id, [...(byJob.get(p.job_id) ?? []), p]);
  return [...jobs]
    .filter((j) => byJob.has(j.id))
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at))
    .map((job) => {
      const all = byJob.get(job.id)!.sort((a, b) => a.created_at.localeCompare(b.created_at));
      return { job, photos: all.slice(0, perVisit), total: all.length };
    });
}
