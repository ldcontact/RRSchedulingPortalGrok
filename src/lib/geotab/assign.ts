import type { TeamMember } from "@/lib/types";

/** Active signed-in members plus invited people who do not have a profile yet. */
export function fleetAssignable(team: TeamMember[]): TeamMember[] {
  return team.filter((m) => m.status === "invited" || (m.status === "active" && !!m.profile_id));
}

export function fleetAssigneeOptionValue(m: Pick<TeamMember, "profile_id" | "email">): string {
  return m.profile_id ?? `invite:${m.email}`;
}

export function fleetAssigneeOptionLabel(m: Pick<TeamMember, "full_name" | "status">): string {
  return m.status === "invited" ? `${m.full_name} (invited)` : m.full_name;
}

export function parseFleetAssignee(raw: string): { profile_id: string | null; invite_email: string | null } {
  const v = raw.trim();
  if (!v) return { profile_id: null, invite_email: null };
  if (v.toLowerCase().startsWith("invite:")) {
    const email = v.slice(v.indexOf(":") + 1).trim().toLowerCase();
    return { profile_id: null, invite_email: email || null };
  }
  return { profile_id: v, invite_email: null };
}

export function selectedFleetAssigneeValue(
  mapping?: { profile_id?: string | null; invite_email?: string | null } | null,
  profileId?: string | null,
): string {
  if (mapping?.profile_id) return mapping.profile_id;
  if (mapping?.invite_email) return `invite:${mapping.invite_email}`;
  return profileId ?? "";
}
