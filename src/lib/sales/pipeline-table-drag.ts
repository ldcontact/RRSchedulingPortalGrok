import type { StageDef } from "./catalog";
import { dealHeadline } from "./pipeline-table";
import type { SalesDeal } from "./types";

/** MIME-style key for deal drag payloads (HTML5 fallback and tests). */
export const DEAL_DRAG_TYPE = "application/x-rr-deal";

export const LONG_PRESS_MS = 400;
/** Finger movement before a long-press is cancelled so the page can scroll. */
export const LONG_PRESS_CANCEL_PX = 10;
/** Mouse movement before a row click turns into a drag (so links still work). */
export const MOUSE_DRAG_THRESHOLD_PX = 5;

export type PendingStageMove = {
  dealId: string;
  headline: string;
  fromSlug: string;
  fromName: string;
  toSlug: string;
  toName: string;
};

export function applyStageMove<T extends { id: string; stage_slug: string }>(
  deals: T[],
  dealId: string,
  toSlug: string,
): T[] {
  let changed = false;
  const next = deals.map((d) => {
    if (d.id !== dealId || d.stage_slug === toSlug) return d;
    changed = true;
    return { ...d, stage_slug: toSlug };
  });
  return changed ? next : deals;
}

export function stageBySlugIn(stages: StageDef[], slug: string): StageDef | undefined {
  return stages.find((s) => s.slug === slug);
}

export function pendingStageMove(opts: {
  deal: Pick<SalesDeal, "id" | "title" | "address" | "stage_slug">;
  stages: StageDef[];
  toSlug: string;
}): PendingStageMove | null {
  const { deal, stages, toSlug } = opts;
  if (!toSlug || toSlug === deal.stage_slug || toSlug === "_other") return null;
  const from = stageBySlugIn(stages, deal.stage_slug);
  const to = stageBySlugIn(stages, toSlug);
  if (!to) return null;
  return {
    dealId: deal.id,
    headline: dealHeadline(deal),
    fromSlug: deal.stage_slug,
    fromName: from?.name ?? deal.stage_slug,
    toSlug: to.slug,
    toName: to.name,
  };
}

export function moveStageConfirmText(p: Pick<PendingStageMove, "headline" | "fromName" | "toName">): string {
  return `Move ${p.headline} from ${p.fromName} to ${p.toName}?`;
}

export function stageSlugFromDropTarget(el: Element | null): string | null {
  const node = el?.closest("[data-stage-drop]") as HTMLElement | null;
  const slug = node?.dataset.stageDrop ?? "";
  return slug && slug !== "_other" ? slug : null;
}
