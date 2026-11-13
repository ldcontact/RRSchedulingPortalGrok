import type { TeamUpdateKind } from "./types";

const KIND_RANK: Record<TeamUpdateKind, number> = { mention: 1, thread: 2, owner: 3, assignee: 4 };

export type RecipientInput = {
  actorId: string | null;
  mentionIds: string[];
  threadAuthorIds: string[];
  dealOwnerId: string | null;
  projectAssigneeIds: string[];
  /** Portal users who may be notified. Customers are never included. */
  staffIds: Iterable<string>;
};

export type Recipient = { userId: string; kind: TeamUpdateKind };

/** One recipient per person, highest-priority reason wins. Never the actor, never a customer. */
export function notificationRecipients(input: RecipientInput): Recipient[] {
  const staff = new Set(input.staffIds);
  const picked = new Map<string, TeamUpdateKind>();
  const consider = (id: string | null | undefined, kind: TeamUpdateKind) => {
    if (!id || id === input.actorId) return;
    if (!staff.has(id)) return;
    const prev = picked.get(id);
    if (!prev || KIND_RANK[kind] < KIND_RANK[prev]) picked.set(id, kind);
  };
  for (const id of input.mentionIds) consider(id, "mention");
  for (const id of input.threadAuthorIds) consider(id, "thread");
  consider(input.dealOwnerId, "owner");
  for (const id of input.projectAssigneeIds) consider(id, "assignee");
  return [...picked.entries()].map(([userId, kind]) => ({ userId, kind }));
}

export function notificationTitle(kind: TeamUpdateKind, actorName: string, contextTitle: string): string {
  if (kind === "mention") return `${actorName} mentioned you on ${contextTitle}`;
  if (kind === "thread") return `${actorName} replied on ${contextTitle}`;
  return `${actorName} posted an update on ${contextTitle}`;
}
