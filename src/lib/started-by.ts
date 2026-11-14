import type { Person } from "@/lib/types";

/** Caption for an in-progress tile, or null when started_by is missing or unresolved. */
export function startedByCaption(
  startedBy: string | null | undefined,
  people: Pick<Person, "id" | "full_name">[],
): string | null {
  if (!startedBy) return null;
  const name = people.find((p) => p.id === startedBy)?.full_name?.trim();
  return name ? `Started by ${name}` : null;
}
