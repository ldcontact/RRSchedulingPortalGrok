"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getRepo } from "@/lib/data/repo";
import { sendCustomerMessage } from "@/lib/messaging";
import { fmtDay } from "@/lib/time";
import { CHANNEL_LABEL, PROJECT_STATUSES, type Channel, type ProjectInput, type ProjectStatus, type ProjectType } from "@/lib/types";

export type ProjectFormState = { error?: string; values?: Record<string, string> } | undefined;
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (v: string) => { const x = Number(v.replace(/[$,\s]/g, "")); return Number.isFinite(x) && x >= 0 ? Math.round(x * 100) / 100 : 0; };
const TYPES: ProjectType[] = ["lighting", "hvac", "lighting_hvac", "other"];
const staff = () => requireRole("admin", "manager");
const refresh = (id: string) => { revalidatePath(`/projects/${id}`); revalidatePath("/projects"); };

export async function saveProject(_: ProjectFormState, fd: FormData): Promise<ProjectFormState> {
  await staff();
  const id = s(fd, "id");
  const values = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]));
  const type = s(fd, "type") as ProjectType;
  const status = s(fd, "status") as ProjectStatus;
  const input: ProjectInput = {
    customer_id: s(fd, "customer_id"), name: s(fd, "name"), scope: s(fd, "scope"),
    type: TYPES.includes(type) ? type : "lighting", status: PROJECT_STATUSES.includes(status) ? status : "proposed",
    value: num(s(fd, "value")), est_rebate: num(s(fd, "est_rebate")),
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
  refresh(target);
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
