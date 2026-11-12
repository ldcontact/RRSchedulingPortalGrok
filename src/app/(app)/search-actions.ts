"use server";

import { requireMember } from "@/lib/auth";
import { getRepo } from "@/lib/data/repo";
import { emptyWorkspaceSearch } from "@/lib/workspace-search";
import type { WorkspaceSearchResults } from "@/lib/types";

/** Authenticated Quick Find. Returns empty groups for a blank query. RLS applies in the repo. */
export async function searchWorkspaceAction(q: string): Promise<WorkspaceSearchResults> {
  await requireMember();
  const term = (q ?? "").trim();
  if (!term) return emptyWorkspaceSearch();
  return (await getRepo()).searchWorkspace(term);
}
