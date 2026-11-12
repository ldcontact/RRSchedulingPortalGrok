"use server";
import { revalidatePath } from "next/cache";
import { isStaff, requireMember } from "@/lib/auth";
import { getRepo } from "@/lib/data/repo";
import { derivePhotoPhase, kindForPhase } from "@/lib/photo-phase";
import type { PhotoKind, PhotoPhase } from "@/lib/types";

const MAX_BYTES = 8 * 1024 * 1024;
const PHASES: PhotoPhase[] = ["before", "after", "required", "other"];

function parsePhase(raw: string, kind: string, requirement_id: string | null): PhotoPhase {
  if (PHASES.includes(raw as PhotoPhase)) return raw as PhotoPhase;
  return derivePhotoPhase({ kind: kind === "completion" ? "completion" : "before", requirement_id });
}

function refreshPhotoPaths(job_id: string | null, project_id: string) {
  if (job_id) {
    revalidatePath(`/jobs/${job_id}`);
    revalidatePath(`/jobs/${job_id}/required-photos`);
  }
  revalidatePath(`/projects/${project_id}`);
}

export async function uploadPhotos(fd: FormData): Promise<{ error?: string; count?: number }> {
  const user = await requireMember();
  const project_id = String(fd.get("project_id") ?? "");
  const job_id = String(fd.get("job_id") ?? "") || null;
  const requirement_id = String(fd.get("requirement_id") ?? "") || null;
  const rawKind = String(fd.get("kind") ?? "");
  const phase = parsePhase(String(fd.get("phase") ?? ""), rawKind, requirement_id);
  const kind: PhotoKind = kindForPhase(phase, rawKind === "completion" ? "completion" : "before");
  const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!project_id || !files.length) return { error: "Pick at least one photo." };
  if (phase === "other") return { error: "Uncategorized photos come from imports; move one into Before or After instead." };
  if ((phase === "after" || phase === "required") && !job_id) return { error: "After and required photos belong to a visit." };
  if (requirement_id && phase !== "required") return { error: "Required items only apply to required photos." };
  if (phase === "required" && !requirement_id) return { error: "Pick a required photo item." };
  const repo = await getRepo();
  if (job_id) {
    const job = await repo.getJob(job_id);
    if (!job || job.project_id !== project_id) return { error: "That visit isn't available to you." };
    if (!isStaff(user.role) && job.status !== "in_progress") return { error: "Start the job before adding photos." };
  } else if (!isStaff(user.role)) {
    return { error: "Only managers can add project-level before photos." };
  }
  if (requirement_id) {
    const reqs = await repo.listPhotoRequirements(project_id);
    if (!reqs.some((r) => r.id === requirement_id)) return { error: "Unknown required photo item." };
  }
  try {
    for (const f of files) {
      if (!f.type.startsWith("image/")) return { error: `${f.name} is not an image.` };
      if (f.size > MAX_BYTES) return { error: `${f.name} is too large.` };
      await repo.addPhoto({ project_id, job_id, kind, phase, caption: null, requirement_id: phase === "required" ? requirement_id : null }, f);
    }
  } catch (e) {
    return { error: (e as Error).message };
  }
  refreshPhotoPaths(job_id, project_id);
  return { count: files.length };
}

/** Staff can delete any photo; techs can delete their own before/after/required photos on an in-progress visit (RLS). */
export async function deletePhoto(id: string, ctx?: { jobId?: string | null; projectId?: string }): Promise<{ error?: string }> {
  await requireMember();
  try {
    await (await getRepo()).deletePhoto(id);
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (ctx?.jobId) {
    revalidatePath(`/jobs/${ctx.jobId}`);
    revalidatePath(`/jobs/${ctx.jobId}/required-photos`);
  }
  if (ctx?.projectId) revalidatePath(`/projects/${ctx.projectId}`);
  return {};
}

/** Move a photo between the Before and After sections. Required/imported shots can be recategorized the same way. */
export async function movePhoto(id: string, phase: "before" | "after", ctx?: { jobId?: string | null; projectId?: string }): Promise<{ error?: string }> {
  await requireMember();
  if (phase !== "before" && phase !== "after") return { error: "Photos can only move between Before and After." };
  try {
    await (await getRepo()).updatePhotoPhase(id, phase);
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (ctx?.jobId) {
    revalidatePath(`/jobs/${ctx.jobId}`);
    revalidatePath(`/jobs/${ctx.jobId}/required-photos`);
  }
  if (ctx?.projectId) revalidatePath(`/projects/${ctx.projectId}`);
  return {};
}
