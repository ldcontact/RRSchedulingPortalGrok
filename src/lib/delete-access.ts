import type { Role } from "@/lib/types";

/** Admins always; managers only with the admin-granted flag; techs and others never. */
export function hasDeleteAccess(user: { role?: Role | null; can_delete?: boolean | null }): boolean {
  if (user.role === "admin") return true;
  if (user.role === "manager") return !!user.can_delete;
  return false;
}

export type CustomerDependents = { projects: number; serviceRequests: number };

/** Customers cannot be deleted while projects or service requests still point at them (FK RESTRICT). */
export function customerDeleteBlockers(deps: CustomerDependents): string | null {
  const { projects, serviceRequests } = deps;
  if (projects > 0) {
    const n = projects === 1 ? "1 project" : `${projects} projects`;
    return `This customer has ${n}. Delete or move ${projects === 1 ? "it" : "them"} first.`;
  }
  if (serviceRequests > 0) {
    const n = serviceRequests === 1 ? "1 service request" : `${serviceRequests} service requests`;
    return `This customer has ${n}. Delete ${serviceRequests === 1 ? "it" : "them"} first.`;
  }
  return null;
}

export function countLabel(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}
