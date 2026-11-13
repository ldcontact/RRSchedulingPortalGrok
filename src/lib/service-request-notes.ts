import { resolveAvatarUrl } from "@/lib/avatar";
import type { AvatarSource, Role } from "@/lib/types";

/** Author can edit their own note; admins can edit any. Managers cannot edit others'. */
export function canEditServiceRequestNote(opts: {
  userId: string;
  role: Role | null | undefined;
  authorId: string | null | undefined;
}): boolean {
  if (!opts.authorId) return false;
  if (opts.authorId === opts.userId) return true;
  return opts.role === "admin";
}

/** Own notes always; others only if admin, or a manager with the Delete access toggle. Sales and techs never delete others'. */
export function canDeleteServiceRequestNote(opts: {
  userId: string;
  role: Role | null | undefined;
  canDeleteFlag: boolean;
  authorId: string | null | undefined;
}): boolean {
  if (!opts.authorId) return false;
  if (opts.authorId === opts.userId) return true;
  if (opts.role === "admin") return true;
  if (opts.role === "manager" && opts.canDeleteFlag) return true;
  return false;
}

/** Admins and managers can edit the Issue card; the ticket creator can too. */
export function canEditServiceRequestIssue(opts: {
  userId: string;
  role: Role | null | undefined;
  createdBy: string | null | undefined;
}): boolean {
  if (opts.role === "admin" || opts.role === "manager") return true;
  return !!opts.createdBy && opts.createdBy === opts.userId;
}

export function parseTicketNoteBody(raw: string): { ok: true; body: string } | { ok: false; error: string } {
  const body = raw.trim();
  if (!body) return { ok: false, error: "Write a note first." };
  return { ok: true, body: body.slice(0, 5000) };
}

export function parseTicketIssue(summaryRaw: string, descriptionRaw: string):
  | { ok: true; summary: string; description: string }
  | { ok: false; error: string } {
  const summary = summaryRaw.trim().slice(0, 200);
  const description = descriptionRaw.trim().slice(0, 5000);
  if (!summary) return { ok: false, error: "Add a short summary, e.g. “Hallway lamp out”." };
  return { ok: true, summary, description };
}

/** Profile photo for a ticket note or history actor (upload signed URL or Google), else null for initials. */
export function serviceRequestActorAvatarUrl(
  profile: {
    avatar_source?: AvatarSource | null;
    avatar_path?: string | null;
    google_avatar_url?: string | null;
    avatar_url?: string | null;
  } | null | undefined,
  signedUploadUrl?: string | null,
): string | null {
  if (!profile) return null;
  return resolveAvatarUrl(profile, signedUploadUrl ?? null);
}

export function issueEditedHistoryBody(previousSummary: string, nextSummary: string): string {
  if (previousSummary !== nextSummary) return `Issue edited: “${nextSummary}”.`;
  return "Issue edited.";
}
