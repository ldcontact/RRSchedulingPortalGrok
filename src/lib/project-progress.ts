import type { JobStatus, JobView, Photo, PhotoRequirement, ProjectStatus } from "./types";

export const PROJECT_STEPS = ["Scope", "Scheduled", "Field work", "Review", "Closeout"] as const;
export type StepLabel = (typeof PROJECT_STEPS)[number];
export type StepState = "done" | "current" | "upcoming";
export type Step = { label: StepLabel; state: StepState };

function liveJobs<T extends { status: JobStatus }>(jobs: T[]): T[] {
  return jobs.filter((j) => j.status !== "cancelled");
}

/** Derive the 5-step project stepper from real project + visit state. */
export function projectStepper(input: {
  status: ProjectStatus;
  scope: string;
  jobs: Pick<JobView, "status" | "kind">[];
}): Step[] {
  const jobs = liveJobs(input.jobs);
  const hasScope = input.scope.trim().length > 0;
  const hasVisit = jobs.length > 0 || ["scheduled", "in_progress", "awaiting_review", "complete"].includes(input.status);
  const fieldStarted = jobs.some((j) => j.status === "in_progress" || j.status === "completed" || j.status === "approved")
    || input.status === "in_progress" || input.status === "awaiting_review" || input.status === "complete";
  const reviewReached = jobs.some((j) => j.status === "completed" || j.status === "approved")
    || input.status === "awaiting_review" || input.status === "complete";
  const reviewDone = input.status === "complete" || (jobs.length > 0 && jobs.every((j) => j.status === "approved"));
  const closed = input.status === "complete";

  const doneFlags = [hasScope, hasVisit, fieldStarted, reviewDone, closed];
  // Review is "reached" even if not done, so the current marker can sit on Review.
  const reached = [hasScope, hasVisit, fieldStarted, reviewReached || reviewDone, closed];

  if (input.status === "cancelled") {
    return PROJECT_STEPS.map((label) => ({ label, state: "upcoming" as const }));
  }

  let current = doneFlags.findIndex((d) => !d);
  if (current === -1) current = PROJECT_STEPS.length - 1;
  const waitingReview = jobs.some((j) => j.status === "completed");
  const stillInField = jobs.some((j) => j.status === "scheduled" || j.status === "in_progress");
  // Sit on Review only when work is waiting on a manager. If more visits are still
  // scheduled, stay on Field work so the stepper matches "what's next".
  if (waitingReview) current = 3;
  else if (current === 3 && stillInField) current = 2;

  return PROJECT_STEPS.map((label, i) => ({
    label,
    state: (closed || doneFlags[i] && i !== current ? "done" : i === current ? "current" : reached[i] && i < current ? "done" : "upcoming") as StepState,
  }));
}

export type WhatsNextLink = { label: string; href: string; hrefLabel: string };

export type WhatsNext = {
  title: string;
  body: string;
  href?: string;
  hrefLabel?: string;
  extras: WhatsNextLink[];
};

function installLike(j: Pick<JobView, "kind" | "status">) {
  return j.status !== "cancelled" && (j.kind ?? "install") === "install";
}

/** Next action for the project overview, plus required-photo and approval counters. */
export function projectWhatsNext(input: {
  projectId: string;
  status: ProjectStatus;
  scope: string;
  jobs: Pick<JobView, "id" | "status" | "kind" | "starts_at" | "title">[];
  requirements: Pick<PhotoRequirement, "id">[];
  completionPhotos: Pick<Photo, "requirement_id">[];
}): WhatsNext {
  const { projectId } = input;
  const jobs = liveJobs(input.jobs);
  const installs = input.jobs.filter(installLike);
  const approved = installs.filter((j) => j.status === "approved").length;
  const awaiting = jobs.filter((j) => j.status === "completed");
  const inProgress = jobs.filter((j) => j.status === "in_progress");
  const scheduled = jobs.filter((j) => j.status === "scheduled");
  const reqTotal = input.requirements.length;
  const reqDone = reqTotal ? input.requirements.filter((r) => input.completionPhotos.some((p) => p.requirement_id === r.id)).length : 0;
  const extras: WhatsNextLink[] = [];
  if (reqTotal > 0) {
    extras.push({
      label: `Required photos ${reqDone} of ${reqTotal}`,
      href: `/projects/${projectId}?tab=files`,
      hrefLabel: "View photos",
    });
  }
  if (installs.length > 0) {
    extras.push({
      label: `Manager approval ${approved} of ${installs.length} visits`,
      href: awaiting[0] ? `/jobs/${awaiting[0].id}` : `/projects/${projectId}?tab=visits`,
      hrefLabel: "Quality review",
    });
  }

  if (input.status === "cancelled") {
    return { title: "Project cancelled", body: "Reopen the project from the menu if this work should continue.", extras };
  }
  if (input.status === "complete") {
    return { title: "Project complete", body: "Closeout is done. Files, visits, and notes stay on this page.", extras };
  }
  if (!input.scope.trim()) {
    return { title: "Write the scope of work", body: "Techs see the scope on every visit. Add line items before you schedule.", href: `/projects/${projectId}?tab=scope`, hrefLabel: "Edit scope", extras };
  }
  if (jobs.length === 0) {
    return { title: "Schedule the first visit", body: "Scope is on file. Add a visit so the crew can get on the calendar.", href: `/jobs/new?project=${projectId}`, hrefLabel: "Schedule visit", extras };
  }
  if (awaiting.length > 0) {
    const j = awaiting[0];
    return { title: "Review submitted work", body: `${awaiting.length} visit${awaiting.length === 1 ? " is" : "s are"} waiting on manager approval.`, href: `/jobs/${j.id}`, hrefLabel: "Quality review", extras };
  }
  if (inProgress.length > 0) {
    const j = inProgress[0];
    return { title: "Field work in progress", body: `${j.title} is underway.`, href: `/jobs/${j.id}`, hrefLabel: "Open visit", extras };
  }
  if (scheduled.length > 0) {
    const j = [...scheduled].sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
    return { title: "Next visit is scheduled", body: j.title, href: `/jobs/${j.id}`, hrefLabel: "Open visit", extras };
  }
  if (approved === installs.length && installs.length > 0) {
    return { title: "Ready for closeout", body: "Every install visit is approved. Mark the project complete when wrap-up is done.", href: `/projects/${projectId}/edit`, hrefLabel: "Edit project", extras };
  }
  return { title: "Keep the project moving", body: "Check visits, photos, and scope, then take the next step.", href: `/projects/${projectId}?tab=visits`, hrefLabel: "View visits", extras };
}

export const VISIT_STEPS = ["Scheduled", "Field work", "Review", "Complete"] as const;
export type VisitStepLabel = (typeof VISIT_STEPS)[number];

export function visitStepper(status: JobStatus): { label: VisitStepLabel; state: StepState }[] {
  const idx = status === "scheduled" ? 0
    : status === "in_progress" ? 1
    : status === "completed" ? 2
    : status === "approved" ? 3
    : -1;
  if (status === "cancelled" || idx < 0) {
    return VISIT_STEPS.map((label) => ({ label, state: "upcoming" as const }));
  }
  return VISIT_STEPS.map((label, i) => ({
    label,
    state: (i < idx ? "done" : i === idx ? "current" : "upcoming") as StepState,
  }));
}
