import { PIPELINE_DEFS, pipelineBySlug, stageBySlug } from "./catalog";
import { dealLengthDays, type SalesDeal } from "./types";

export type FunnelRow = { slug: string; name: string; count: number; value: number };
export type RepRow = { owner_id: string; name: string; open: number; won: number; winRate: number; pipelineValue: number };
export type StageTimeRow = { slug: string; name: string; avgDays: number; count: number };

const WON = new Set(["project_scheduled", "project_completed", "permit_pending", "permit_final"]);
const LOST = new Set(["declined", "not_feasible"]);

export function dashboardStats(deals: SalesDeal[], ownerNames: Record<string, string>, pipeline = "single_family_whe") {
  const inPipe = deals.filter((d) => d.pipeline_slug === pipeline);
  const stages = pipelineBySlug(pipeline)?.stages ?? PIPELINE_DEFS[0].stages;
  const funnel: FunnelRow[] = stages.map((s) => {
    const rows = inPipe.filter((d) => d.stage_slug === s.slug);
    return { slug: s.slug, name: s.name, count: rows.length, value: rows.reduce((n, d) => n + d.value, 0) };
  });
  const openValue = inPipe.filter((d) => !WON.has(d.stage_slug) && !LOST.has(d.stage_slug)).reduce((n, d) => n + d.value, 0);
  const byRep = new Map<string, SalesDeal[]>();
  for (const d of inPipe) {
    const id = d.owner_id ?? "unassigned";
    const list = byRep.get(id) ?? [];
    list.push(d);
    byRep.set(id, list);
  }
  const reps: RepRow[] = [...byRep.entries()].map(([id, rows]) => {
    const won = rows.filter((d) => WON.has(d.stage_slug)).length;
    const lost = rows.filter((d) => LOST.has(d.stage_slug)).length;
    const decided = won + lost;
    return {
      owner_id: id,
      name: id === "unassigned" ? "Unassigned" : ownerNames[id] ?? "Unknown",
      open: rows.length - won - lost,
      won,
      winRate: decided ? won / decided : 0,
      pipelineValue: rows.filter((d) => !WON.has(d.stage_slug) && !LOST.has(d.stage_slug)).reduce((n, d) => n + d.value, 0),
    };
  }).sort((a, b) => b.pipelineValue - a.pipelineValue);

  const stageTime: StageTimeRow[] = stages.map((s) => {
    const rows = inPipe.filter((d) => d.stage_slug === s.slug);
    const avg = rows.length ? rows.reduce((n, d) => n + dealLengthDays(d), 0) / rows.length : 0;
    return { slug: s.slug, name: s.name, avgDays: Math.round(avg * 10) / 10, count: rows.length };
  });

  return {
    pipeline,
    pipelineName: pipelineBySlug(pipeline)?.name ?? pipeline,
    openDeals: inPipe.filter((d) => !WON.has(d.stage_slug) && !LOST.has(d.stage_slug)).length,
    openValue,
    won: inPipe.filter((d) => WON.has(d.stage_slug)).length,
    lost: inPipe.filter((d) => LOST.has(d.stage_slug)).length,
    funnel,
    reps,
    stageTime,
  };
}

export { stageBySlug };
