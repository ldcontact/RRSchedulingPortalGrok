import type { TeamUpdate, TeamUpdateThread } from "./types";

/** Top-level newest first; replies stay under their question in chronological order. */
export function nestUpdateThreads(rows: TeamUpdate[]): TeamUpdateThread[] {
  const replies = new Map<string, TeamUpdate[]>();
  const tops: TeamUpdate[] = [];
  for (const row of rows) {
    if (row.parent_id) {
      const list = replies.get(row.parent_id) ?? [];
      list.push(row);
      replies.set(row.parent_id, list);
    } else {
      tops.push(row);
    }
  }
  tops.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
  return tops.map((top) => ({
    ...top,
    replies: (replies.get(top.id) ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)),
  }));
}

export function updatePermalink(update: Pick<TeamUpdate, "id" | "deal_id" | "project_id">, opts?: { prefer?: "deal" | "project" }): string {
  const prefer = opts?.prefer ?? (update.project_id ? "project" : "deal");
  if (prefer === "project" && update.project_id) return `/projects/${update.project_id}#update-${update.id}`;
  if (update.deal_id) return `/sales/deals/${update.deal_id}#update-${update.id}`;
  if (update.project_id) return `/projects/${update.project_id}#update-${update.id}`;
  return `#update-${update.id}`;
}
