import { compareDisplayName } from "./sort-names";
import type { TeamMember } from "./types";

export const TEAM_ROLE_ORDER = { admin: 0, manager: 1, sales: 2, tech: 3 } as const;
export const TEAM_STATUS_ORDER = { active: 0, invited: 1, inactive: 2 } as const;
export type TeamSortKey = "name" | "role" | "status";

export function sortMembers(team: readonly TeamMember[], key: TeamSortKey, dir: "asc" | "desc"): TeamMember[] {
  const mul = dir === "asc" ? 1 : -1;
  return [...team].sort((a, b) => {
    const nameA = a.full_name || a.email;
    const nameB = b.full_name || b.email;
    let cmp = 0;
    if (key === "name") cmp = compareDisplayName(nameA, nameB) || a.email.localeCompare(b.email);
    else if (key === "role") cmp = (TEAM_ROLE_ORDER[a.role ?? "tech"] - TEAM_ROLE_ORDER[b.role ?? "tech"]) || compareDisplayName(nameA, nameB);
    else cmp = (TEAM_STATUS_ORDER[a.status] - TEAM_STATUS_ORDER[b.status]) || compareDisplayName(nameA, nameB);
    return cmp * mul;
  });
}
