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

/** Confirm-dialog lines for deleting one visit. Counts can be zero. */
export function visitDeleteConsequences(input: {
  photoCount: number;
  fileCount: number;
  visitRequirementCount: number;
  linkedToServiceRequest: boolean;
}): string[] {
  const lines = [
    "This visit is removed. The project and other visits stay.",
    input.photoCount
      ? `${countLabel(input.photoCount, "photo", "photos")} from this visit (files are removed from storage)`
      : "No photos are attached to this visit",
    input.fileCount
      ? `${countLabel(input.fileCount, "document", "documents")} on this visit (files are removed from storage)`
      : "No documents are attached to this visit",
    "Notes and assignments for this visit are removed",
    input.visitRequirementCount
      ? `${countLabel(input.visitRequirementCount, "visit-specific required photo", "visit-specific required photos")} ${input.visitRequirementCount === 1 ? "is" : "are"} removed. The project checklist stays.`
      : "Visit-specific required photos for this visit are removed, if any. The project checklist stays.",
  ];
  if (input.linkedToServiceRequest) {
    lines.push("The linked service request stays in the inbox (the visit link is cleared)");
  }
  return lines;
}
