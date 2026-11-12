import type { ProjectStatus } from "@/lib/types";

/**
 * Customer-page project stats. Hierarchy is Customer -> Projects -> Visits.
 * Total excludes cancelled projects; completed is the project's own "complete" status
 * (not visit approvals).
 */
export function customerProjectStats(projects: { status: ProjectStatus }[]) {
  const live = projects.filter((p) => p.status !== "cancelled");
  return { total: live.length, completed: live.filter((p) => p.status === "complete").length };
}
