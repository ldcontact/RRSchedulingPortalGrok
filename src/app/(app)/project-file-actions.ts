"use server";
import { revalidatePath } from "next/cache";
import { isStaff, requireMember } from "@/lib/auth";
import { getRepo } from "@/lib/data/repo";
import { hasDeleteAccess } from "@/lib/delete-access";
import { validateProjectFile } from "@/lib/project-file";

function refreshFilePaths(job_id: string | null, project_id: string) {
  if (job_id) revalidatePath(`/jobs/${job_id}`);
  revalidatePath(`/projects/${project_id}`);
}

export async function uploadProjectFiles(fd: FormData): Promise<{ error?: string; count?: number }> {
  const user = await requireMember();
  const project_id = String(fd.get("project_id") ?? "");
  const job_id = String(fd.get("job_id") ?? "") || null;
  const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!project_id || !files.length) return { error: "Pick at least one file." };
  const repo = await getRepo();
  if (job_id) {
    const job = await repo.getJob(job_id);
    if (!job || job.project_id !== project_id) return { error: "That visit isn't available to you." };
    if (!isStaff(user.role) && job.status !== "in_progress") return { error: "Start the visit before adding files." };
  } else if (!isStaff(user.role)) {
    return { error: "Only managers can add project documents." };
  }
  try {
    for (const f of files) {
      const err = validateProjectFile(f);
      if (err) return { error: err };
      await repo.addProjectFile({ project_id, job_id }, f);
    }
  } catch (e) {
    return { error: (e as Error).message };
  }
  refreshFilePaths(job_id, project_id);
  return { count: files.length };
}

export async function deleteProjectFileAction(id: string, ctx?: { jobId?: string | null; projectId?: string }): Promise<{ error?: string }> {
  const user = await requireMember();
  if (!hasDeleteAccess(user)) return { error: "You don't have permission to delete this file." };
  try {
    await (await getRepo()).deleteProjectFile(id);
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (ctx?.jobId) revalidatePath(`/jobs/${ctx.jobId}`);
  if (ctx?.projectId) revalidatePath(`/projects/${ctx.projectId}`);
  return {};
}
