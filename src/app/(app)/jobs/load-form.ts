import "server-only";
import { getRepo } from "@/lib/data/repo";
import type { Person, ProjectHit } from "@/lib/types";

/** Crew list (small) plus at most one preselected project. Never loads the full project catalog. */
export async function formOptions(preselect?: { projectId?: string }): Promise<{
  people: (Person & { role: string })[];
  selected: ProjectHit | null;
}> {
  const repo = await getRepo();
  const projectId = preselect?.projectId?.trim();
  const [people, selected] = await Promise.all([
    repo.listAssignable(),
    projectId ? repo.getProjectHit(projectId) : Promise.resolve(null),
  ]);
  return { people, selected };
}
