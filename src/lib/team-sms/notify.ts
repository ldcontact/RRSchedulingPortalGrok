import {
  entityLink,
  serviceRequestAssignmentSummary,
  taskAssignmentSummary,
  visitAssignmentSummary,
  visitChangeSummary,
} from "./copy";
import { enqueueTeamSms } from "./enqueue";
import { isTodayOrTomorrow } from "./schedule";
import type { TeamSmsStore } from "./store";

export type VisitNotifySnapshot = {
  id: string;
  startsAt: string;
  status: string;
  address?: string | null;
  city?: string | null;
  assigneeIds: string[];
};

export type NotifyContext = {
  store: TeamSmsStore;
  actorId?: string | null;
  now?: Date;
};

async function safe(run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (err) {
    // Team texts must never fail the underlying assignment write.
    console.error("team-sms notify failed", err);
  }
}

export async function notifyVisitCreated(ctx: NotifyContext, visit: VisitNotifySnapshot, assigneeIds: string[]): Promise<void> {
  await safe(async () => {
    const summary = visitAssignmentSummary(visit.startsAt, visit.address, visit.city);
    const link = entityLink("visit", visit.id);
    for (const profileId of new Set(assigneeIds)) {
      await enqueueTeamSms(ctx.store, {
        profileId, kind: "assignment", entityType: "visit", entityId: visit.id,
        summary, link, actorId: ctx.actorId, now: ctx.now,
      });
    }
  });
}

export async function notifyVisitAssigneesChanged(
  ctx: NotifyContext,
  visit: VisitNotifySnapshot,
  previousIds: string[],
  nextIds: string[],
): Promise<void> {
  await safe(async () => {
    const prev = new Set(previousIds);
    const next = new Set(nextIds);
    const added = [...next].filter((id) => !prev.has(id));
    const removed = [...prev].filter((id) => !next.has(id));
    const link = entityLink("visit", visit.id);
    for (const profileId of added) {
      await enqueueTeamSms(ctx.store, {
        profileId, kind: "assignment", entityType: "visit", entityId: visit.id,
        summary: visitAssignmentSummary(visit.startsAt, visit.address, visit.city),
        link, actorId: ctx.actorId, now: ctx.now,
      });
    }
    if (removed.length && isTodayOrTomorrow(visit.startsAt, ctx.now)) {
      const summary = visitChangeSummary("reassigned", visit.startsAt, visit.address, visit.city);
      for (const profileId of removed) {
        await enqueueTeamSms(ctx.store, {
          profileId, kind: "same_day", entityType: "visit", entityId: visit.id,
          summary, link, actorId: ctx.actorId, now: ctx.now,
        });
      }
    }
  });
}

export async function notifyVisitUpdated(
  ctx: NotifyContext,
  previous: VisitNotifySnapshot,
  next: VisitNotifySnapshot,
): Promise<void> {
  await safe(async () => {
    const relevant = isTodayOrTomorrow(previous.startsAt, ctx.now) || isTodayOrTomorrow(next.startsAt, ctx.now);
    if (!relevant) return;
    const moved = previous.startsAt !== next.startsAt;
    const cancelled = previous.status !== "cancelled" && next.status === "cancelled";
    if (!moved && !cancelled) return;
    const change = cancelled ? "cancelled" : "moved";
    const when = cancelled ? previous.startsAt : next.startsAt;
    const summary = visitChangeSummary(change, when, next.address ?? previous.address, next.city ?? previous.city);
    const link = entityLink("visit", next.id);
    for (const profileId of new Set(next.assigneeIds.length ? next.assigneeIds : previous.assigneeIds)) {
      await enqueueTeamSms(ctx.store, {
        profileId, kind: "same_day", entityType: "visit", entityId: next.id,
        summary, link, actorId: ctx.actorId, now: ctx.now,
      });
    }
  });
}

export async function notifyServiceRequestAssigned(
  ctx: NotifyContext,
  input: { id: string; assigneeId: string | null; previousAssigneeId?: string | null; number?: number | null; summary?: string | null },
): Promise<void> {
  await safe(async () => {
    if (!input.assigneeId || input.assigneeId === input.previousAssigneeId) return;
    await enqueueTeamSms(ctx.store, {
      profileId: input.assigneeId,
      kind: "assignment",
      entityType: "service_request",
      entityId: input.id,
      summary: serviceRequestAssignmentSummary(input.number, input.summary),
      link: entityLink("service_request", input.id),
      actorId: ctx.actorId,
      now: ctx.now,
    });
  });
}

export async function notifyTaskAssigned(
  ctx: NotifyContext,
  input: { id: string; title: string; due?: string | null; addedIds: string[] },
): Promise<void> {
  await safe(async () => {
    const summary = taskAssignmentSummary(input.title, input.due);
    const link = entityLink("task", input.id);
    for (const profileId of new Set(input.addedIds)) {
      await enqueueTeamSms(ctx.store, {
        profileId, kind: "assignment", entityType: "task", entityId: input.id,
        summary, link, actorId: ctx.actorId, now: ctx.now,
      });
    }
  });
}
