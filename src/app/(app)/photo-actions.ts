"use server";
import { revalidatePath } from "next/cache";
import { isStaff, requireMember } from "@/lib/auth";
import { getRepo } from "@/lib/data/repo";
import type { PhotoKind } from "@/lib/types";

const MAX_BYTES = 8 * 1024 * 1024;

export async function uploadPhotos(fd: FormData): Promise<{ error?: string; count?: number }> {
  const user = await requireMember();
  const project_id = String(fd.get("project_id") ?? "");
  const job_id = String(fd.get("job_id") ?? "") || null;
  const kind = fd.get("kind") === "completion" ? "completion" : ("before" as PhotoKind);
  const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!project_id || !files.length) return { error: "Pick at least one photo." };
  if (kind === "before" && !isStaff(user.role)) return { error: "Only managers can add before photos." };
  if (kind === "completion" && !job_id) return { error: "Completion photos belong to a visit." };
  const repo = await getRepo();
  if (job_id) { // also enforced by RLS; this gives a friendly message
    const job = await repo.getJob(job_id);
    if (!job || job.project_id !== project_id) return { error: "That visit isn't available to you." };
    if (!isStaff(user.role) && job.status !== "in_progress") return { error: "Start the job before adding completion photos." };
  }
  try {
    for (const f of files) {
      if (!f.type.startsWith("image/")) return { error: `${f.name} is not an image.` };
      if (f.size > MAX_BYTES) return { error: `${f.name} is too large.` };
      await repo.addPhoto({ project_id, job_id, kind, caption: null }, f);
    }
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath(job_id ? `/jobs/${job_id}` : `/projects/${project_id}`);
  return { count: files.length };
}

export async function deletePhoto(id: string) {
  const user = await requireMember();
  if (!isStaff(user.role)) return;
  await (await getRepo()).deletePhoto(id);
}
