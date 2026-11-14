"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { parsePickedCoords } from "@/lib/geocode/parse";
import { geocodeServiceRequestById } from "@/lib/geocode/run";
import { findConflicts, getRepo } from "@/lib/data/repo";
import { dayKey, fmtDay, fmtRange, parseHHMM, validDay, zonedToUtc } from "@/lib/time";
import { formatAddress } from "@/lib/project-row";
import { resolveNewTicketAssignee } from "@/lib/tickets";
import { MOCK_MODE } from "@/lib/env";
import { sendEmail, emailConfigured, emailMissingMessage } from "@/lib/email";
import {
  formatScheduleEmailEventBody,
  invalidEmails,
  isValidEmail,
  parseEmailList,
  pickScheduleVisit,
  scheduleEmailHtml,
} from "@/lib/service-request-email";
import { canSeeServicePrice, parseServicePrice, priceHistoryBody, formatServicePrice, sameServicePrice } from "@/lib/service-request-price";
import {
  canDeleteServiceRequestNote, canEditServiceRequestIssue, canEditServiceRequestNote,
  issueEditedHistoryBody, parseTicketIssue, parseTicketNoteBody,
} from "@/lib/service-request-notes";
import {
  SR_OPEN, ticketNo, type JobKind, type ProjectPick, type ServiceRequestInput, type SRChannel, type SRPriority, type SRStatus,
} from "@/lib/types";

/*
 * Service requests (tickets). Staff only (admin + manager). Customer email is never
 * sent automatically: a schedule notification goes out only when a staff member
 * reviews the compose dialog and clicks Send. Every send is recorded in ticket history.
 */
const staff = () => requireRole("admin", "manager");
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const orNull = (v: string) => (v ? v : null);
const CHANNELS: SRChannel[] = ["call", "email", "other"];
const PRIORITIES: SRPriority[] = ["low", "normal", "high"];
const refresh = (id?: string) => { revalidatePath("/service-requests", "layout"); if (id) revalidatePath(`/service-requests/${id}`); };
const go = (id: string, msg: string, kind: "ok" | "error" = "ok"): never => {
  refresh(id);
  redirect(`/service-requests/${id}?${kind}=${encodeURIComponent(msg)}`);
};
async function load(id: string) {
  const user = await staff();
  const repo = await getRepo();
  const sr = await repo.getServiceRequest(id);
  if (!sr) redirect("/service-requests?error=" + encodeURIComponent("That service request was not found."));
  return { user, repo, sr };
}

// ---------------------------------------------------------------- log a call / new request
export type CustomerPrefill = {
  id: string; name: string; site_address: string; site_city: string; site_state: string; site_zip: string;
  contact_name: string; contact_phone: string; contact_email: string; projects: ProjectPick[];
};
/** Selected customer: site + main contact to prefill, and their most recent projects (max 10) as suggestions. */
export async function customerPrefill(customerId: string): Promise<CustomerPrefill | null> {
  await staff();
  const repo = await getRepo();
  const [c, contacts, projects] = await Promise.all([repo.getCustomer(customerId), repo.listContacts(customerId), repo.findProjects({ customerId, limit: 10 })]);
  if (!c) return null;
  const k = contacts.find((x) => x.is_primary) ?? contacts[0];
  // finished projects first (most recently completed), then the rest
  projects.sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));
  return {
    id: c.id, name: c.name, site_address: c.address ?? "", site_city: c.city ?? "", site_state: c.state ?? "", site_zip: c.zip ?? "",
    contact_name: k?.name ?? "", contact_phone: k?.phone ?? c.phone ?? "", contact_email: k?.email ?? c.email ?? "", projects,
  };
}

export type TicketFormState = { error?: string; values?: Record<string, string> } | undefined;
export async function createTicket(_: TicketFormState, fd: FormData): Promise<TicketFormState> {
  const user = await staff();
  const values = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]));
  const channel = s(fd, "channel") as SRChannel, priority = s(fd, "priority") as SRPriority;
  const received = s(fd, "received_at"); // "YYYY-MM-DDTHH:MM" business time
  const [day, hm] = received.split("T");
  const input: ServiceRequestInput = {
    customer_id: s(fd, "customer_id"), project_id: orNull(s(fd, "project_id")),
    site_address: orNull(s(fd, "site_address")), site_city: orNull(s(fd, "site_city")), site_state: orNull(s(fd, "site_state").toUpperCase()), site_zip: orNull(s(fd, "site_zip")),
    contact_name: orNull(s(fd, "contact_name")), contact_phone: orNull(s(fd, "contact_phone")), contact_email: orNull(s(fd, "contact_email").toLowerCase()),
    channel: CHANNELS.includes(channel) ? channel : "call", priority: PRIORITIES.includes(priority) ? priority : "normal",
    received_at: validDay(day) && /^\d{2}:\d{2}$/.test(hm ?? "") ? zonedToUtc(day, parseHHMM(hm)) : new Date().toISOString(),
    summary: s(fd, "summary").slice(0, 200), description: s(fd, "description").slice(0, 5000),
  };
  if (!input.customer_id) return { error: "Pick the customer (search by name).", values };
  if (!input.summary) return { error: "Add a short summary, e.g. “Hallway lamp out”.", values };
  if (new Date(input.received_at).getTime() > Date.now() + 5 * 60e3) return { error: "Received time can't be in the future.", values };
  const price = parseServicePrice(s(fd, "service_price"));
  if ("error" in price) return { error: price.error, values };
  const repo = await getRepo();
  const explicit = s(fd, "assignee_id");
  const staffPeople = explicit
    ? (await repo.listAssignable()).filter((p) => p.role === "admin" || p.role === "manager")
    : [];
  const owner = resolveNewTicketAssignee(explicit, { id: user.id, name: user.name }, staffPeople);
  if ("error" in owner) return { error: owner.error, values };
  input.assignee_id = owner.id;
  let id: string, number: number;
  try {
    const sr = await repo.createServiceRequest(input);
    id = sr.id; number = sr.number;
    await repo.addServiceRequestEvent(id, { kind: "assigned", body: `Assigned to ${owner.name}.` });
    if (input.project_id) {
      const p = await repo.getProject(input.project_id);
      await repo.addServiceRequestEvent(id, { kind: "linked", body: `Matched to original project “${p?.name ?? "project"}”.` });
    }
    if ("amount" in price) {
      await repo.setServiceRequestPrice(id, price.amount);
      await repo.addServiceRequestEvent(id, { kind: "price", body: priceHistoryBody(null, price.amount) });
    }
  } catch (e) { return { error: (e as Error).message, values }; }
  await geocodeServiceRequestById(id);
  const picked = parsePickedCoords(fd);
  if (picked) {
    const row = await repo.getServiceRequest(id).catch(() => null);
    if (row && row.geocode_status !== "matched") {
      await repo.setServiceRequestGeocode(id, {
        lat: picked.lat, lng: picked.lng, geocoded_at: new Date().toISOString(), geocode_status: "matched",
      }).catch(() => {});
    }
  }
  refresh(id);
  redirect(`/service-requests/${id}?ok=${encodeURIComponent(`${ticketNo(number)} created. Nothing was sent to the customer.`)}`);
}

// ---------------------------------------------------------------- ticket actions
export async function addTicketNote(id: string, fd: FormData) {
  const { repo } = await load(id);
  const body = s(fd, "body");
  if (!body) go(id, "Write a note first.", "error");
  await repo.addServiceRequestEvent(id, { kind: "note", body: body.slice(0, 5000) });
  go(id, "Note added.");
}

export async function assignTicket(id: string, fd: FormData) {
  const { repo, sr } = await load(id);
  const to = s(fd, "assignee_id") || null;
  if (to === sr.assignee_id) go(id, "No change.");
  const people = await repo.listAssignable();
  const who = to ? people.find((p) => p.id === to && (p.role === "admin" || p.role === "manager")) : null;
  if (to && !who) go(id, "Pick an admin or manager.", "error");
  await repo.updateServiceRequest(id, { assignee_id: to, ...(sr.status === "new" && to ? { status: "triaged" as const } : {}) });
  await repo.addServiceRequestEvent(id, { kind: "assigned", body: who ? `Assigned to ${who.full_name}.` : "Unassigned." });
  go(id, who ? `Assigned to ${who.full_name}.` : "Unassigned.");
}

export async function markTriaged(id: string) {
  const { repo, sr } = await load(id);
  if (sr.status !== "new") go(id, "Only new tickets can be marked triaged.", "error");
  await repo.updateServiceRequest(id, { status: "triaged" });
  await repo.addServiceRequestEvent(id, { kind: "status", body: "Marked as triaged." });
  go(id, "Marked as triaged.");
}

export async function setBillable(id: string, billable: boolean) {
  const { repo } = await load(id);
  await repo.updateServiceRequest(id, { billable });
  await repo.addServiceRequestEvent(id, { kind: "billable", body: billable ? "Marked billable (outside warranty or not covered)." : "Marked not billable (covered)." });
  go(id, billable ? "Marked billable." : "Marked not billable.");
}

export async function linkProject(id: string, projectId: string) {
  const { repo, sr } = await load(id);
  const p = await repo.getProject(projectId);
  if (!p) go(id, "Project not found.", "error");
  if (p!.customer_id !== sr.customer_id) {
    const c = await repo.getCustomer(p!.customer_id);
    await repo.addServiceRequestEvent(id, { kind: "note", body: `Heads up: the linked project belongs to ${c?.name ?? "another customer"}.` });
  }
  await repo.updateServiceRequest(id, { project_id: projectId, ...(sr.status === "new" ? { status: "triaged" as const } : {}) });
  await repo.addServiceRequestEvent(id, { kind: "linked", body: `Matched to original project “${p!.name}”.` });
  go(id, `Linked to ${p!.name}.`);
}

export async function unlinkProject(id: string) {
  const { repo, sr } = await load(id);
  if (!sr.project_id) go(id, "No project is linked.");
  await repo.updateServiceRequest(id, { project_id: null });
  await repo.addServiceRequestEvent(id, { kind: "unlinked", body: `Unlinked from “${sr.project_name ?? "project"}”.` });
  go(id, "Project unlinked.");
}

/** Resolve (fixed / answered) or close (no work needed, duplicate, spam). */
export async function finishTicket(id: string, to: "resolved" | "closed", fd: FormData) {
  const { user, repo, sr } = await load(id);
  if (!SR_OPEN.includes(sr.status)) go(id, "This ticket is already finished.", "error");
  const why = s(fd, "reason");
  await repo.updateServiceRequest(id, { status: to, resolved_at: new Date().toISOString(), resolved_by: user.id, resolved_job_id: null });
  await repo.addServiceRequestEvent(id, { kind: to, body: `${to === "resolved" ? "Resolved" : "Closed"}${why ? `: ${why.slice(0, 1000)}` : "."}` });
  go(id, to === "resolved" ? "Ticket resolved." : "Ticket closed.");
}

export async function reopenTicket(id: string) {
  const { repo, sr } = await load(id);
  if (sr.status !== "resolved" && sr.status !== "closed") go(id, "Only resolved or closed tickets can be reopened.", "error");
  const live = (await repo.listJobs({ serviceRequestId: id })).some((j) => j.status === "scheduled" || j.status === "in_progress");
  const next: SRStatus = live ? "scheduled" : "triaged";
  await repo.updateServiceRequest(id, { status: next, resolved_at: null, resolved_by: null, resolved_job_id: null });
  await repo.addServiceRequestEvent(id, { kind: "reopened", body: `Reopened (now ${next}).` });
  go(id, "Ticket reopened.");
}

/** Real new work: create a Proposed project prefilled from the ticket and mark the ticket Converted. */
export async function convertTicket(id: string) {
  const { repo, sr } = await load(id);
  if (sr.status === "converted" && sr.converted_project_id) redirect(`/projects/${sr.converted_project_id}`);
  if (!SR_OPEN.includes(sr.status)) go(id, "Reopen the ticket before converting it.", "error");
  const scope = [sr.description || sr.summary, "", `From service request ${ticketNo(sr.number)} (${sr.channel === "email" ? "email" : sr.channel === "call" ? "phone call" : "other"}, ${fmtDay(dayKey(sr.received_at), { month: "short", day: "numeric", year: "numeric" })}).`,
    ...(sr.contact_name ? [`Contact: ${[sr.contact_name, sr.contact_phone, sr.contact_email].filter(Boolean).join(" · ")}`] : []),
    ...(sr.site_address ? [`Site: ${formatAddress({ address: sr.site_address, city: sr.site_city, state: sr.site_state, zip: sr.site_zip })}`] : [])].join("\n");
  let projectId = "";
  try {
    const p = await repo.createProject({ customer_id: sr.customer_id, name: sr.summary, type: sr.project_type ?? "lighting", status: "proposed", scope, value: 0, est_rebate: 0 });
    projectId = p.id;
    for (const name of ["Site assessment", "Proposal approved", "Install", "Final walkthrough + rebate paperwork"]) await repo.addMilestone(p.id, { name, due_date: null });
    await repo.updateServiceRequest(id, { status: "converted", converted_project_id: p.id });
    await repo.addServiceRequestEvent(id, { kind: "converted", body: `Converted to new project “${p.name}”.` });
  } catch (e) { go(id, (e as Error).message, "error"); }
  refresh(id); revalidatePath("/projects");
  redirect(`/projects/${projectId}?ok=${encodeURIComponent(`Created from ${ticketNo(sr.number)}. Fill in the scope, value and rebate.`)}`);
}

// ---------------------------------------------------------------- service price (office only; never shown to techs)
export async function setServiceRequestPrice(id: string, fd: FormData) {
  const { user, repo } = await load(id);
  if (!canSeeServicePrice(user.role)) go(id, "You can't edit the service price.", "error");
  const clear = s(fd, "clear") === "1";
  const parsed = clear ? ({ empty: true } as const) : parseServicePrice(s(fd, "service_price"));
  if ("error" in parsed) go(id, parsed.error, "error");
  const current = (await repo.getServiceRequestPrices([id]))[id] ?? null;
  const next = "amount" in parsed ? parsed.amount : null;
  if (sameServicePrice(current, next)) go(id, "No change.");
  if (next == null && s(fd, "confirm") !== "1") go(id, "Confirm to clear the service price.", "error");
  await repo.setServiceRequestPrice(id, next);
  await repo.addServiceRequestEvent(id, { kind: "price", body: priceHistoryBody(current, next) });
  go(id, next == null
    ? `Service price cleared (was ${formatServicePrice(current!)}).`
    : current == null
      ? `Service price set to ${formatServicePrice(next)}.`
      : `Service price changed from ${formatServicePrice(current)} to ${formatServicePrice(next)}.`);
}

// ---------------------------------------------------------------- schedule a warranty / service visit
export type ScheduleState = { error?: string; conflicts?: string[]; values?: Record<string, string> } | undefined;
const describe = (c: ReturnType<typeof findConflicts>) =>
  c.map(({ person, job }) => `${person.full_name} is already on “${job.title}” (${job.customer_name}) ${fmtDay(dayKey(job.starts_at))} ${fmtRange(job.starts_at, job.ends_at)}`);

export async function scheduleTicketVisit(_: ScheduleState, fd: FormData): Promise<ScheduleState> {
  const id = s(fd, "request_id");
  const { repo, sr } = await load(id);
  const values = Object.fromEntries([...fd.entries()].filter(([k]) => k !== "assignees").map(([k, v]) => [k, String(v)]));
  values.assignees = fd.getAll("assignees").join(",");
  const kind = (s(fd, "kind") === "service" ? "service" : "warranty") as JobKind;
  const title = s(fd, "title"), day = s(fd, "date");
  const startM = parseHHMM(s(fd, "start")), endM = parseHHMM(s(fd, "end"));
  const assignees = fd.getAll("assignees").map(String).filter(Boolean);
  if (!sr.project_id) return { error: "Link the original project first. The visit is attached to it.", values };
  if (!SR_OPEN.includes(sr.status)) return { error: "This ticket is finished. Reopen it to schedule a visit.", values };
  if (!title) return { error: "Give the visit a short title.", values };
  if (!validDay(day)) return { error: "Pick a date.", values };
  if (endM <= startM) return { error: "End time must be after the start time.", values };
  if (!assignees.length) return { error: "Assign at least one tech.", values };
  const starts_at = zonedToUtc(day, startM), ends_at = zonedToUtc(day, endM);
  if (fd.get("force") !== "1") {
    const around = await repo.listJobs({ from: starts_at, to: ends_at });
    const c = findConflicts(around, assignees, starts_at, ends_at);
    if (c.length) return { conflicts: describe(c), values };
  }
  let jobId: string;
  try {
    jobId = await repo.createJob({ project_id: sr.project_id, title, starts_at, ends_at, instructions: s(fd, "instructions") || null, kind, service_request_id: id }, assignees);
    await repo.updateServiceRequest(id, { status: "scheduled", ...(kind === "service" && !sr.billable ? { billable: true } : {}) });
    const people = (await repo.listAssignable()).filter((p) => assignees.includes(p.id)).map((p) => p.full_name);
    await repo.addServiceRequestEvent(id, { kind: "scheduled", body: `${kind === "warranty" ? "Warranty" : "Service"} visit “${title}” scheduled for ${fmtDay(day, { weekday: "short", month: "short", day: "numeric" })} ${fmtRange(starts_at, ends_at)} with ${people.join(", ")}.` });
    if (kind === "service" && !sr.billable) await repo.addServiceRequestEvent(id, { kind: "billable", body: "Marked billable (service visit)." });
  } catch (e) { return { error: (e as Error).message, values }; }
  refresh(id);
  revalidatePath("/schedule"); revalidatePath("/"); revalidatePath(`/projects/${sr.project_id}`); revalidatePath(`/jobs/${jobId}`);
  redirect(`/service-requests/${id}?ok=${encodeURIComponent(`${kind === "warranty" ? "Warranty" : "Service"} visit scheduled. ${sr.project_name ?? "The original project"} stays ${sr.project_status === "complete" ? "Complete" : "as it was"}.`)}`);
}

export async function editTicketNote(id: string, eventId: string, fd: FormData) {
  const { user, repo } = await load(id);
  const parsed = parseTicketNoteBody(s(fd, "body"));
  if (!parsed.ok) return go(id, parsed.error, "error");
  const ev = await repo.getServiceRequestEvent(eventId);
  if (!ev || ev.request_id !== id || ev.kind !== "note") go(id, "That note was not found.", "error");
  if (!canEditServiceRequestNote({ userId: user.id, role: user.role, authorId: ev!.actor_id })) go(id, "You can't edit this note.", "error");
  if (ev!.body === parsed.body) go(id, "No change.");
  await repo.updateServiceRequestEvent(id, eventId, parsed.body);
  go(id, "Note updated.");
}

export async function deleteTicketNote(id: string, eventId: string) {
  const { user, repo } = await load(id);
  const ev = await repo.getServiceRequestEvent(eventId);
  if (!ev || ev.request_id !== id || ev.kind !== "note") go(id, "That note was not found.", "error");
  if (!canDeleteServiceRequestNote({ userId: user.id, role: user.role, canDeleteFlag: user.can_delete, authorId: ev!.actor_id })) {
    go(id, "You can't delete this note.", "error");
  }
  await repo.deleteServiceRequestEvent(id, eventId);
  go(id, "Note deleted.");
}

export async function editTicketIssue(id: string, fd: FormData) {
  const { user, repo, sr } = await load(id);
  if (!canEditServiceRequestIssue({ userId: user.id, role: user.role, createdBy: sr.created_by })) {
    go(id, "You can't edit this issue.", "error");
  }
  const parsed = parseTicketIssue(s(fd, "summary"), s(fd, "description"));
  if (!parsed.ok) return go(id, parsed.error, "error");
  if (sr.summary === parsed.summary && sr.description === parsed.description) go(id, "No change.");
  await repo.updateServiceRequest(id, { summary: parsed.summary, description: parsed.description });
  await repo.addServiceRequestEvent(id, { kind: "status", body: issueEditedHistoryBody(sr.summary, parsed.summary) });
  go(id, "Issue updated.");
}

// ---------------------------------------------------------------- schedule notification email (staff-initiated only)
export async function sendScheduleEmail(fd: FormData) {
  const id = s(fd, "request_id");
  const { repo } = await load(id);
  const to = parseEmailList(s(fd, "to"))[0] ?? "";
  const cc = parseEmailList(s(fd, "cc")).filter((e) => e !== to);
  const subject = s(fd, "subject");
  const body = s(fd, "body");
  if (!isValidEmail(to)) go(id, "Enter a valid customer email in To.", "error");
  const bad = invalidEmails(cc);
  if (bad.length) go(id, `Not a valid CC email: ${bad.join(", ")}.`, "error");
  if (!subject) go(id, "Add a subject.", "error");
  if (!body) go(id, "Add a message body.", "error");

  const visits = await repo.listJobs({ serviceRequestId: id });
  const visit = pickScheduleVisit(visits);
  if (!visit) go(id, "Schedule a visit first.", "error");

  const eventBody = formatScheduleEmailEventBody(to, cc);

  if (MOCK_MODE) {
    await repo.addServiceRequestEvent(id, { kind: "emailed", body: eventBody });
    go(id, `Dev mock mode: schedule email to ${to} simulated (not sent).`);
  }
  if (!emailConfigured()) go(id, emailMissingMessage(), "error");

  let result: Awaited<ReturnType<typeof sendEmail>> | undefined;
  try {
    result = await sendEmail({
      to,
      cc: cc.length ? cc : undefined,
      subject,
      text: body,
      html: scheduleEmailHtml(body),
    });
  } catch (e) {
    go(id, (e as Error).message, "error");
  }
  if (!result || result.skipped) go(id, emailMissingMessage(), "error");
  const sent = result!;
  if (sent.rejected.includes(to) || (sent.rejected.length && !sent.accepted.length)) {
    const rejected = sent.rejected.length ? ` Not accepted: ${sent.rejected.join(", ")}.` : "";
    go(id, `The mail server did not accept ${to}.${rejected}`, "error");
  }
  await repo.addServiceRequestEvent(id, { kind: "emailed", body: eventBody });
  const ccNote = cc.length ? ` CC ${cc.join(", ")}.` : "";
  go(id, `Schedule email sent to ${to}.${ccNote}`);
}
