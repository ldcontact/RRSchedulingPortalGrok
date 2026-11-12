"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getRepo } from "@/lib/data/repo";
import { scopeItemsFromForm, serializeScopeItems } from "@/lib/scope-items";
import { sendCustomerMessage } from "@/lib/messaging";
import { fmtDay } from "@/lib/time";
import { CHANNEL_LABEL, PROJECT_STATUSES, PROJECT_TYPES, type Channel, type ProjectInput, type ProjectStatus, type ProjectType } from "@/lib/types";
import { validateProjectFile } from "@/lib/project-file";

export type ProjectFormState = { error?: string; values?: Record<string, string> } | undefined;
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (v: string) => { const x = Number(v.replace(/[$,\s]/g, "")); return Number.isFinite(x) && x >= 0 ? Math.round(x * 100) / 100 : 0; };
const staff = () => requireRole("admin", "manager");
const refresh = (id: string, jobId?: string | null) => {
  revalidatePath(`/projects/${id}`);
  revalidatePath("/projects");
  if (jobId) revalidatePath(`/jobs/${jobId}`);
};

export async function saveProject(_: ProjectFormState, fd: FormData): Promise<ProjectFormState> {
  await staff();
  const id = s(fd, "id");
  const values = Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string").map(([k, v]) => [k, String(v)]));
  const attachments = fd.getAll("attachments").filter((f): f is File => f instanceof File && f.size > 0);
  const type = s(fd, "type") as ProjectType;
  const status = s(fd, "status") as ProjectStatus;
  const input: ProjectInput = {
    customer_id: s(fd, "customer_id"), name: s(fd, "name"), scope: s(fd, "scope"),
    type: (PROJECT_TYPES as readonly string[]).includes(type) ? type : "lighting", status: PROJECT_STATUSES.includes(status) ? status : "proposed",
    value: num(s(fd, "value")), est_rebate: num(s(fd, "est_rebate")),
    ...(s(fd, "warranty_months") !== "" ? { warranty_months: Math.min(600, Math.max(0, Math.round(Number(s(fd, "warranty_months")) || 0))) } : {}),
  };
  if (!input.customer_id) return { error: "Pick a customer.", values };
  if (!input.name) return { error: "Project name is required.", values };
  const repo = await getRepo();
  let target = id;
  try {
    if (id) await repo.updateProject(id, input);
    else {
      const p = await repo.createProject(input);
      target = p.id;
      const defaults = [["Site assessment", 0], ["Proposal approved", 7], ["Install", 14], ["Final walkthrough + rebate paperwork", 21]] as const;
      for (const [name] of defaults) await repo.addMilestone(p.id, { name, due_date: null });
    }
  } catch (e) { return { error: (e as Error).message, values }; }
  const failed: string[] = [];
  if (!id && attachments.length) {
    for (const file of attachments) {
      const err = validateProjectFile(file) ?? null;
      if (err) { failed.push(err); continue; }
      try { await repo.addProjectFile({ project_id: target, job_id: null }, file); }
      catch (e) { failed.push((e as Error).message); }
    }
  }
  refresh(target);
  if (failed.length) {
    redirect(`/projects/${target}?tab=files&ok=${encodeURIComponent(`Project created, but some files did not upload: ${failed[0]}`)}`);
  }
  if (!id && attachments.length) {
    redirect(`/projects/${target}?tab=files&ok=${encodeURIComponent(`Project created with ${attachments.length} document${attachments.length === 1 ? "" : "s"}.`)}`);
  }
  redirect(`/projects/${target}?saved=1`);
}

export async function setProjectStatus(id: string, status: ProjectStatus) {
  await staff();
  await (await getRepo()).updateProject(id, { status });
  refresh(id);
}

// ---- milestones (proposed timeline)
export async function addMilestone(projectId: string, fd: FormData) {
  await staff();
  const name = s(fd, "name");
  if (!name) return;
  await (await getRepo()).addMilestone(projectId, { name, due_date: s(fd, "due_date") || null });
  refresh(projectId);
}
export async function updateMilestone(projectId: string, id: string, fd: FormData) {
  await staff();
  const name = s(fd, "name");
  await (await getRepo()).updateMilestone(id, { ...(name ? { name } : {}), due_date: s(fd, "due_date") || null });
  refresh(projectId);
}
export async function toggleMilestone(projectId: string, id: string, done: boolean) {
  await staff();
  await (await getRepo()).updateMilestone(id, { done });
  refresh(projectId);
}
export async function deleteMilestone(projectId: string, id: string) {
  await staff();
  await (await getRepo()).deleteMilestone(id);
  refresh(projectId);
}

/** "Send" the proposed timeline: builds the message, hands it to the messaging hook (log-only today), and logs it. */
export async function sendTimeline(projectId: string, fd: FormData) {
  await staff();
  const channel = (["email", "text"].includes(s(fd, "channel")) ? s(fd, "channel") : "email") as Channel;
  const repo = await getRepo();
  const [p, ms] = await Promise.all([repo.getProject(projectId), repo.listMilestones(projectId)]);
  if (!p) return;
  const [c, contacts] = await Promise.all([repo.getCustomer(p.customer_id), repo.listContacts(p.customer_id)]);
  const who = contacts.find((k) => k.is_primary) ?? contacts[0];
  const lines = ms.map((m) => `• ${m.due_date ? fmtDay(m.due_date, { month: "short", day: "numeric" }) : "TBD"}: ${m.name}`).join("\n");
  const subject = `Proposed timeline: ${p.name}`;
  const body = `Hi ${who?.name.split(" ")[0] ?? "there"}, here is the proposed timeline for ${p.name}:\n${lines}\nReply to approve or suggest changes. – Retrofit Rebates`;
  const res = await sendCustomerMessage({ channel, to: { phone: who?.phone ?? c?.phone, email: who?.email ?? c?.email, name: who?.name }, subject, body });
  await repo.logMessage({ customer_id: p.customer_id, project_id: p.id, channel: "timeline", direction: "outbound", subject, body: `Via ${CHANNEL_LABEL[channel].toLowerCase()} (${res.provider})\n${body}` });
  await repo.updateProject(projectId, { timeline_sent_at: new Date().toISOString(), timeline_sent_via: channel, timeline_approved_at: null });
  refresh(projectId);
  redirect(`/projects/${projectId}?ok=${encodeURIComponent(`Timeline logged as sent by ${channel} (log only, nothing was delivered yet).`)}`);
}

export async function markTimelineApproved(projectId: string) {
  await staff();
  const repo = await getRepo();
  const p = await repo.getProject(projectId);
  if (!p) return;
  await repo.updateProject(projectId, { timeline_approved_at: new Date().toISOString() });
  await repo.logMessage({ customer_id: p.customer_id, project_id: p.id, channel: "note", direction: "inbound", subject: null, body: "Customer approved the proposed timeline." });
  refresh(projectId);
}

// ---- required completion photos checklist
export async function addPhotoRequirement(projectId: string, jobId: string | null, fd: FormData) {
  await staff();
  const label = s(fd, "label");
  if (!label) return;
  const note = s(fd, "note") || null;
  await (await getRepo()).addPhotoRequirement(projectId, { label, note, job_id: jobId });
  refresh(projectId, jobId);
}
export async function updatePhotoRequirement(projectId: string, id: string, jobId: string | null, fd: FormData) {
  await staff();
  const label = s(fd, "label");
  if (!label) return;
  const repo = await getRepo();
  const items = await repo.listPhotoRequirements(projectId, jobId ?? undefined);
  const row = items.find((r) => r.id === id && (jobId ? r.job_id === jobId : !r.job_id));
  if (!row) return;
  await repo.updatePhotoRequirement(id, { label, note: s(fd, "note") || null });
  refresh(projectId, jobId);
}
export async function deletePhotoRequirement(projectId: string, id: string, jobId: string | null) {
  await staff();
  const repo = await getRepo();
  const items = await repo.listPhotoRequirements(projectId, jobId ?? undefined);
  const row = items.find((r) => r.id === id && (jobId ? r.job_id === jobId : !r.job_id));
  if (!row) return;
  await repo.deletePhotoRequirement(id);
  refresh(projectId, jobId);
}

export async function saveProjectScope(projectId: string, fd: FormData) {
  await staff();
  const items = scopeItemsFromForm(fd);
  await (await getRepo()).updateProject(projectId, { scope: serializeScopeItems(items) });
  refresh(projectId);
  redirect(`/projects/${projectId}?tab=scope&ok=${encodeURIComponent("Scope saved.")}`);
}

export async function addProjectNote(projectId: string, fd: FormData) {
  await staff();
  const body = s(fd, "body");
  if (!body) return;
  const p = await (await getRepo()).getProject(projectId);
  if (!p) return;
  await (await getRepo()).addNote({ project_id: projectId, customer_id: p.customer_id, body });
  refresh(projectId);
}
