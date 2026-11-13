import type { Role } from "@/lib/types";

export function canEditTeamUpdate(opts: { userId: string; role: Role; authorId: string | null; deleted: boolean }): boolean {
  if (opts.deleted) return false;
  return !!opts.authorId && opts.authorId === opts.userId;
}

/** Own posts always; others only if admin, or a manager with the Delete access toggle. Techs never delete others. */
export function canDeleteTeamUpdate(opts: {
  userId: string;
  role: Role;
  canDeleteFlag: boolean;
  authorId: string | null;
  deleted: boolean;
}): boolean {
  if (opts.deleted) return false;
  if (opts.authorId && opts.authorId === opts.userId) return true;
  if (opts.role === "admin") return true;
  if (opts.role === "manager" && opts.canDeleteFlag) return true;
  return false;
}
