"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isStaff, requireMember, requireRole } from "@/lib/auth";
import { findConflicts, getRepo } from "@/lib/data/repo";
import { dayKey, fmtRange, fmtDay, minutesOfDay, parseHHMM, validDay, zonedToUtc } from "@/lib/time";
import type { JobView } from "@/lib/types";

export type JobFormState = { error?: string; conflicts?: string[]; values?: Record<string, string> } | undefined;
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const describe = (c: ReturnType<typeof findConflicts>) =>
  c.map(({ person, job }) => `${person.full_name} is already on “${job.title}” (${job.customer_name}) ${fmtDay(dayKey(job.starts_at))} ${fmtRange(job.starts_at, job.ends_at)}`);
const refresh = (j: { id: string; project_id: string }) => {
  revalidatePath(`/jobs/${j.id}`); revalidatePath(`/projects/${j.project_id}`); revalidatePath("/schedule"); revalidatePath("/");
};

async function conflictsFor(people: string[], starts: string, ends: string, exceptJob?: string) {
  if (!people.length) return [];
  const around = await (await getRepo()).listJobs({ from: starts, to: ends });
  return findConflicts(around, people, starts, ends, exceptJob);
}

export async function saveJob(_: JobFormState, fd: FormData): Promise<JobFormState> {
  await requireRole("admin", "manager");
  const values = Object.fromEntries([...fd.entries()].filter(([k]) => k !== "assignees").map(([k, v]) => [k, String(v)]));
  values.assignees = fd.getAll("assignees").join(",");
  const id = s(fd, "id");
  const project_id = s(fd, "project_id"), title = s(fd, "title"), day = s(fd, "date");
  const startM = parseHHMM(s(fd, "start")), endM = parseHHMM(s(fd, "end"));
  const assignees = fd.getAll("assignees").map(String).filter(Boolean);
  if (!project_id) return { error: "Pick a project.", values };
  if (!title) return { error: "Give the visit a short title.", values };
  if (!validDay(day)) return { error: "Pick a date.", values };
  if (endM <= startM) return { error: "End time must be after the start time.", values };
  const starts_at = zonedToUtc(day, startM), ends_at = zonedToUtc(day, endM);
  if (fd.get("force") !== "1") {
    const c = await conflictsFor(assignees, starts_at, ends_at, id || undefined);
    if (c.length) return { conflicts: describe(c), values };
  }
  const repo = await getRepo();
  const input = { project_id, title, starts_at, ends_at, instructions: s(fd, "instructions") || null };
  let jobId = id;
  try {
    if (id) { await repo.updateJob(id, input); await repo.setAssignees(id, assignees); }
    else jobId = await repo.createJob(input, assignees);
  } catch (e) { return { error: (e as Error).message, values }; }
  refresh({ id: jobId, project_id });
  redirect(`/jobs/${jobId}?ok=${encodeURIComponent(id ? "Visit updated." : "Visit scheduled.")}`);
}

/** Drag-and-drop on the schedule: move to another day/time and/or from one tech's row to another's. */
export async function moveJob(input: { jobId: string; day: string; startMin?: number | null; from?: string | null; to?: string | null; force?: boolean }):
  Promise<{ ok: true } | { conflicts: string[] } | { error: string }> {
  await requireRole("admin", "manager");
  const repo = await getRepo();
  const job = await repo.getJob(input.jobId);
  if (!job) return { error: "Visit not found." };
  if (job.status === "approved" || job.status === "cancelled") return { error: "Approved or cancelled visits can't be moved." };
  if (!validDay(input.day)) return { error: "Bad date." };
  const dur = new Date(job.ends_at).getTime() - new Date(job.starts_at).getTime();
  const startMin = input.startMin ?? minutesOfDay(job.starts_at);
  const starts_at = zonedToUtc(input.day, startMin);
  const ends_at = new Date(new Date(starts_at).getTime() + dur).toISOString();
  let people = job.assignees.map((a) => a.id);
  if (input.to !== undefined && input.to !== input.from) {
    if (input.from) people = people.filter((p) => p !== input.from);
    if (input.to && !people.includes(input.to)) people.push(input.to);
  }
  if (!input.force) {
    const c = await conflictsFor(people, starts_at, ends_at, job.id);
    if (c.length) return { conflicts: describe(c) };
  }
  try {
    if (starts_at !== job.starts_at) await repo.updateJob(job.id, { starts_at, ends_at });
    if (people.join() !== job.assignees.map((a) => a.id).join()) await repo.setAssignees(job.id, people);
  } catch (e) { return { error: (e as Error).message }; }
  refresh(job);
  return { ok: true };
}

// ---------------------------------------------------------------- status flow
async function load(id: string) {
  const user = await requireMember();
  const repo = await getRepo();
  const job = await repo.getJob(id);
  if (!job) redirect("/?denied=1");
  const assigned = job.assignees.some((a) => a.id === user.id);
  return { user, repo, job, assigned, staff: isStaff(user.role) };
}
const back = (job: JobView, msg: string, kind: "ok" | "error" = "ok"): never => {
  refresh(job);
  redirect(`/jobs/${job.id}?${kind}=${encodeURIComponent(msg)}`);
};
const attempt = async (job: JobView, fn: () => Promise<void>, okMsg: string) => {
  let err: string | null = null;
  try { await fn(); } catch (e) { err = (e as Error).message; }
  back(job, err ?? okMsg, err ? "error" : "ok");
};

export async function startJob(id: string) {
  const { repo, job, assigned, staff } = await load(id);
  if (!assigned && !staff) back(job, "You're not on this visit.", "error");
  if (job.status !== "scheduled") back(job, "This visit has already started.", "error");
  await attempt(job, () => repo.updateJob(id, { status: "in_progress", ...(staff ? { started_at: new Date().toISOString() } : {}) }), "Job started. Add completion photos and a note when you're done.");
}

export async function addJobNote(id: string, fd: FormData) {
  const { repo, job, assigned, staff } = await load(id);
  const body = s(fd, "body");
  if (!body) back(job, "Write a note first.", "error");
  if (!assigned && !staff) back(job, "You're not on this visit.", "error");
  await attempt(job, () => repo.addNote({ job_id: id, body }), "Note added.");
}

export async function submitJob(id: string) {
  const { repo, job, assigned, staff } = await load(id);
  if (!assigned && !staff) back(job, "You're not on this visit.", "error");
  if (job.status !== "in_progress") back(job, "Start the job first.", "error");
  const [photos, notes] = await Promise.all([repo.listPhotos({ jobId: id, kind: "completion" }), repo.listNotes({ jobId: id })]);
  if (!photos.length || !notes.length) back(job, "Add at least one completion photo and a note before submitting.", "error");
  await attempt(job, () => repo.updateJob(id, { status: "completed", ...(staff ? { completed_at: new Date().toISOString() } : {}) }), "Submitted for review. Nice work!");
}

export async function approveJob(id: string) {
  const { user, repo, job, staff } = await load(id);
  if (!staff) back(job, "Only managers can approve.", "error");
  if (job.status !== "completed") back(job, "Only submitted visits can be approved.", "error");
  await attempt(job, () => repo.updateJob(id, { status: "approved", approved_at: new Date().toISOString(), approved_by: user.id }), "Visit approved.");
}

export async function sendBack(id: string, fd: FormData) {
  const { repo, job, staff } = await load(id);
  const note = s(fd, "review_note");
  if (!staff) back(job, "Only managers can send work back.", "error");
  if (!note) back(job, "Tell the tech what to fix.", "error");
  await attempt(job, () => repo.updateJob(id, { status: "in_progress", review_note: note, completed_at: null }), "Sent back to the tech with your note.");
}

export async function cancelJob(id: string) {
  const { repo, job, staff } = await load(id);
  if (!staff) back(job, "Only managers can cancel visits.", "error");
  await attempt(job, () => repo.updateJob(id, { status: "cancelled" }), "Visit cancelled.");
}

export async function reopenJob(id: string) {
  const { repo, job, staff } = await load(id);
  if (!staff) back(job, "Only managers can reopen visits.", "error");
  await attempt(job, () => repo.updateJob(id, { status: "scheduled", started_at: null, completed_at: null, approved_at: null, approved_by: null }), "Visit reopened.");
}

