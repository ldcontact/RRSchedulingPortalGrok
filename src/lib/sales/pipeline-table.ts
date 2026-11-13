import type { StageDef } from "./catalog";
import { dealLengthDays, type SalesDeal } from "./types";

/** First N rows shown in a stage group before "Show N more". */
export const PREVIEW_ROWS = 5;
/** Length turns orange after this many days open. */
export const LENGTH_HOT_DAYS = 30;

const LATE_SLUGS = new Set([
  "declined",
  "not_feasible",
  "project_completed",
  "permit_pending",
  "permit_final",
]);

/** Terminal stages, completed/permit stages, and other "late" columns. */
export function isLateStage(stage: Pick<StageDef, "slug" | "terminal">): boolean {
  return !!stage.terminal || LATE_SLUGS.has(stage.slug);
}

/** Empty and late stages start collapsed, as in the approved table mock. */
export function defaultCollapsed(stage: Pick<StageDef, "slug" | "terminal">, count: number): boolean {
  return count === 0 || isLateStage(stage);
}

export function avgDaysOpen(deals: Pick<SalesDeal, "opened_at" | "close_date">[], now = new Date()): number {
  if (!deals.length) return 0;
  return Math.round(deals.reduce((n, d) => n + dealLengthDays(d, now), 0) / deals.length);
}

export function formatLocation(d: Pick<SalesDeal, "city" | "state">): string {
  const city = (d.city ?? "").trim();
  const state = (d.state ?? "").trim() || "IL";
  if (city && state) return `${city}, ${state}`;
  return city || state || "—";
}

export function lengthTone(days: number): "ok" | "hot" {
  return days > LENGTH_HOT_DAYS ? "hot" : "ok";
}

export type StageGroup<T extends { stage_slug: string } = SalesDeal> = {
  stage: StageDef;
  deals: T[];
};

export function groupDealsByStage<T extends { stage_slug: string }>(deals: T[], stages: StageDef[]): StageGroup<T>[] {
  const by = new Map<string, T[]>();
  for (const d of deals) {
    const list = by.get(d.stage_slug) ?? [];
    list.push(d);
    by.set(d.stage_slug, list);
  }
  const groups = stages.map((stage) => ({ stage, deals: by.get(stage.slug) ?? [] }));
  const known = new Set(stages.map((s) => s.slug));
  const unknown = deals.filter((d) => !known.has(d.stage_slug));
  if (unknown.length) {
    groups.push({
      stage: { slug: "_other", name: "Other", color: "#66706c", bg: "#e8eae8", sort: 99 },
      deals: unknown,
    });
  }
  return groups;
}

export function pipelineCounts(deals: { pipeline_slug: string }[], slugs: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of slugs) out[s] = 0;
  for (const d of deals) out[d.pipeline_slug] = (out[d.pipeline_slug] ?? 0) + 1;
  return out;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

/** Bold first line of the Deal column: street address when we have one. */
export function dealHeadline(d: Pick<SalesDeal, "title" | "address">): string {
  return (d.address ?? "").trim() || d.title;
}

/** Second line: customer name, title-cased when the import stored it in ALL CAPS. */
export function dealCustomerName(d: Pick<SalesDeal, "title" | "address" | "contact_name">): string {
  const name = (d.contact_name ?? "").trim() || ((d.address ?? "").trim() && d.title !== (d.address ?? "").trim() ? d.title : "");
  return prettyName(name);
}

export function prettyName(s: string): string {
  const t = s.trim();
  if (!t) return t;
  const letters = t.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 3 && letters === letters.toUpperCase()) {
    return t.toLowerCase().replace(/(^|[\s/&-])([a-z])/g, (_, a, b) => a + b.toUpperCase());
  }
  return t;
}
