import { randomUUID } from "crypto";
import { formatBatchText, formatSingleText, type TeamSmsFragment } from "./copy";
import { earliestSendAt } from "./schedule";
import { teamSmsEnabled } from "./send";
import { toE164 } from "./phone";
import { isForbiddenPhone } from "./phone";
import type { TeamSmsStore } from "./store";
import type { EnqueueInput, TeamSmsEventRow, TeamSmsOutboxRow } from "./types";

function fragmentsFrom(events: { kind: "assignment" | "same_day"; entity_type: TeamSmsEventRow["entity_type"]; summary: string; link: string }[]): TeamSmsFragment[] {
  return events.map((e) => ({ kind: e.kind, entityType: e.entity_type, summary: e.summary, link: e.link }));
}

function statusForNew(): "held" | "queued" {
  return teamSmsEnabled() ? "queued" : "held";
}

/**
 * Queue a staff event. Batches with any open 10-minute window for the same
 * person. Does nothing if the matching switch is off, the person has no
 * phone, it is a self-assignment, or the destination is reserved.
 * Comments, mentions and photos are never enqueued (callers must not pass them).
 */
export async function enqueueTeamSms(store: TeamSmsStore, input: EnqueueInput): Promise<TeamSmsOutboxRow | null> {
  if (input.actorId && input.actorId === input.profileId) return null;
  const member = await store.getMember(input.profileId);
  if (!member || !member.active || !member.role) return null;
  if (member.sms_stopped_at) return null;
  if (input.kind === "assignment" && !member.sms_notify_assignment) return null;
  if (input.kind === "same_day" && !member.sms_notify_same_day) return null;

  const phone = toE164(member.phone);
  if (!phone || isForbiddenPhone(phone)) return null;

  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const event: TeamSmsEventRow = {
    id: randomUUID(),
    profile_id: input.profileId,
    kind: input.kind,
    entity_type: input.entityType,
    entity_id: input.entityId,
    summary: input.summary,
    link: input.link,
    payload: input.payload ?? {},
    outbox_id: null,
    created_at: nowIso,
  };

  const open = await store.findOpenBatch(input.profileId, nowIso);
  if (open) {
    event.outbox_id = open.id;
    await store.insertEvent(event);
    const events = await store.listEventsForOutbox(open.id);
    const fragments = fragmentsFrom(events);
    const body = formatBatchText(fragments);
    const kind = fragments.length > 1 ? "batch" : fragments[0]?.kind ?? open.kind;
    await store.updateOutbox(open.id, { body, kind, link: fragments.length === 1 ? fragments[0]!.link : open.link });
    return { ...open, body, kind };
  }

  const sendAfter = earliestSendAt(now).toISOString();
  const body = formatSingleText({ kind: input.kind, entityType: input.entityType, summary: input.summary, link: input.link });
  const outbox: TeamSmsOutboxRow = {
    id: randomUUID(),
    profile_id: input.profileId,
    to_phone: phone,
    kind: input.kind,
    body,
    link: input.link,
    payload: { events: 1 },
    status: statusForNew(),
    send_after: sendAfter,
    sent_at: null,
    provider: null,
    provider_id: null,
    error: null,
    created_at: nowIso,
  };
  event.outbox_id = outbox.id;
  await store.insertOutbox(outbox);
  await store.insertEvent(event);
  return outbox;
}
