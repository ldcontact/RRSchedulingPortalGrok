import type { JobKind, Photo, PhotoRequirement } from "./types";

/** Project-level items (job_id is null) plus items scoped to this visit. */
export function isRequirementOnVisit(r: Pick<PhotoRequirement, "job_id">, jobId: string) {
  return !r.job_id || r.job_id === jobId;
}

/**
 * Which checklist items a tech must complete on this visit.
 * Install visits include project-level items; warranty/service visits only include visit-specific items.
 * `items` should already be the project-level + this-visit list from listPhotoRequirements(projectId, jobId).
 */
export function applicablePhotoRequirements<T extends Pick<PhotoRequirement, "job_id">>(
  kind: JobKind | null | undefined,
  items: T[],
): T[] {
  if ((kind ?? "install") === "install") return items;
  return items.filter((r) => !!r.job_id);
}

export function missingPhotoRequirementLabels(
  requirements: Pick<PhotoRequirement, "id" | "label">[],
  photos: Pick<Photo, "requirement_id" | "kind">[],
): string[] {
  return requirements
    .filter((r) => !photos.some((p) => p.kind === "completion" && p.requirement_id === r.id))
    .map((r) => r.label);
}
