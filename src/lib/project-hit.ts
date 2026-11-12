import type { ProjectHit } from "@/lib/types";

export const PROJECT_HIT_LIMIT = 10;

export function projectHitSubtitle(p: Pick<ProjectHit, "customer_name" | "hcp_job_number">): string {
  const n = (p.hcp_job_number ?? "").trim();
  const job = n ? (n.startsWith("#") ? `Job ${n}` : `Job #${n}`) : "";
  return [p.customer_name, job].filter(Boolean).join(" · ");
}

export function projectHitLabel(p: Pick<ProjectHit, "name" | "customer_name">): string {
  return [p.customer_name, p.name].filter(Boolean).join(" · ");
}

export function toProjectHit(row: {
  id: string; name: string; status: ProjectHit["status"]; hcp_job_number?: string | null;
  customer_name?: string | null;
  customers?: { name: string } | { name: string }[] | null;
}): ProjectHit {
  const rel = row.customers;
  const customer = Array.isArray(rel) ? rel[0] : rel;
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    hcp_job_number: row.hcp_job_number ?? null,
    customer_name: row.customer_name ?? customer?.name ?? "",
  };
}
