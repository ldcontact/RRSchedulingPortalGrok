import "server-only";
import { getRepo } from "@/lib/data/repo";

/** Projects that can still get visits + people who can be assigned. */
export async function formOptions() {
  const repo = await getRepo();
  const [projects, people] = await Promise.all([repo.listProjects(), repo.listAssignable()]);
  return { projects: projects.filter((p) => p.status !== "cancelled"), people };
}
