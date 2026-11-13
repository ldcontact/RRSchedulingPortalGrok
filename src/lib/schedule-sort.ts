import { compareDisplayName } from "./sort-names";

/** Sentinel id for the Unassigned lane on the schedule board. */
export const SCHEDULE_UNASSIGNED_ID = "__none";

/** A–Z by display name, case-insensitive. Ties break on id so the order is stable. */
export function sortSchedulePeople<T extends { id: string; full_name: string }>(people: readonly T[]): T[] {
  return [...people].sort((a, b) => compareDisplayName(a.full_name, b.full_name) || a.id.localeCompare(b.id));
}

/** Keep the Unassigned lane pinned last, matching the existing board. */
export function pinUnassignedLast<T extends { id: string }>(rows: readonly T[], unassigned?: T | null): T[] {
  const people = rows.filter((r) => r.id !== SCHEDULE_UNASSIGNED_ID);
  return unassigned ? [...people, unassigned] : people;
}

export function scheduleBoardRows<T extends { id: string; full_name: string }>(
  rows: readonly T[],
  opts: { includeUnassigned: boolean; unassigned: T },
): T[] {
  const sorted = sortSchedulePeople(rows.filter((r) => r.id !== SCHEDULE_UNASSIGNED_ID));
  return opts.includeUnassigned ? pinUnassignedLast(sorted, opts.unassigned) : sorted;
}

/** Visits stay in start-time order; ties break on id. */
export function sortScheduleVisits<T extends { id: string; starts_at: string }>(jobs: readonly T[]): T[] {
  return [...jobs].sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.id.localeCompare(b.id));
}

/** Crew list on the schedule day-view live map: A–Z by assignee name; unmapped trucks last. */
export function sortScheduleCrewVehicles<T extends { id: string; profile?: { full_name: string } | null }>(
  vehicles: readonly T[],
): T[] {
  return [...vehicles].sort((a, b) => {
    const aName = a.profile?.full_name;
    const bName = b.profile?.full_name;
    if (!aName && !bName) return a.id.localeCompare(b.id);
    if (!aName) return 1;
    if (!bName) return -1;
    return compareDisplayName(aName, bName) || a.id.localeCompare(b.id);
  });
}
