import { APPROVED_SLUG, PROJECT_SCHEDULED_SLUG, pipelineBySlug } from "./catalog";
import type { SalesDeal } from "./types";
import type { ProjectInput, ProjectType } from "@/lib/types";

const PIPELINE_PROJECT_TYPE: Record<string, ProjectType> = {
  single_family_whe: "whe_single_family",
  multifamily_whe: "whe_multifamily",
  led_lighting: "lighting",
  hvac: "hvac",
};

export type ConvertInput = {
  deal: SalesDeal;
  visit?: { starts_at: string; ends_at: string; title?: string } | null;
};

export type ConvertPlan = {
  ok: true;
  project: ProjectInput;
  nextStage: string;
  visit: { starts_at: string; ends_at: string; title: string } | null;
} | { ok: false; error: string };

export function canOfferConvert(deal: Pick<SalesDeal, "stage_slug" | "converted_project_id">): boolean {
  return !deal.converted_project_id && deal.stage_slug === APPROVED_SLUG;
}

export function planConvert(input: ConvertInput): ConvertPlan {
  const { deal } = input;
  if (deal.converted_project_id) return { ok: false, error: "This deal already has a linked project." };
  if (!deal.customer_id) return { ok: false, error: "Link a customer before converting this deal to a project." };
  if (deal.stage_slug !== APPROVED_SLUG && deal.stage_slug !== PROJECT_SCHEDULED_SLUG) {
    return { ok: false, error: `Convert is available when the deal is in Approved - Ready to Schedule.` };
  }
  const type = PIPELINE_PROJECT_TYPE[deal.pipeline_slug] ?? "whe_single_family";
  const pipeline = pipelineBySlug(deal.pipeline_slug);
  const project: ProjectInput = {
    customer_id: deal.customer_id,
    name: deal.title,
    type,
    status: "scheduled",
    scope: `Converted from Sales · ${pipeline?.name ?? deal.pipeline_slug}`,
    value: deal.value,
    est_rebate: deal.est_rebate,
  };
  const visit = input.visit
    ? { starts_at: input.visit.starts_at, ends_at: input.visit.ends_at, title: input.visit.title ?? "Install visit" }
    : null;
  return { ok: true, project, nextStage: PROJECT_SCHEDULED_SLUG, visit };
}
