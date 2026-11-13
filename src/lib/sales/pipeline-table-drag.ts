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
/** Viewport edge band that starts auto-scroll while dragging, in px. */
export const AUTO_SCROLL_EDGE_PX = 72;
/** Peak auto-scroll step per frame when the pointer is at the very edge. */
export const AUTO_SCROLL_MAX_PX = 22;
export const GHOST_WIDTH_MIN = 220;
export const GHOST_WIDTH_MAX = 520;
export const GHOST_WIDTH_FALLBACK = 360;

export type PendingStageMove = {
  dealId: string;
  headline: string;
  fromSlug: string;
  fromName: string;
  toSlug: string;
  toName: string;
};

export type StageDragGhost = {
  dealId: string;
  headline: string;
  width: number;
  x: number;
  y: number;
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

export function pointerDistance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.hypot(x2 - x1, y2 - y1);
}

export function shouldStartMouseDrag(dist: number): boolean {
  return dist >= MOUSE_DRAG_THRESHOLD_PX;
}

export function shouldCancelLongPress(dist: number): boolean {
  return dist > LONG_PRESS_CANCEL_PX;
}

export function capGhostWidth(rowWidth: number, min = GHOST_WIDTH_MIN, max = GHOST_WIDTH_MAX): number {
  if (!Number.isFinite(rowWidth) || rowWidth <= 0) return GHOST_WIDTH_FALLBACK;
  return Math.min(max, Math.max(min, Math.round(rowWidth)));
}

/** Dollar label for the drag ghost; omitted when there is no value. */
export function formatDealValue(value: number): string | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

/** Keep the pointer on the left of the floating row, vertically near the center. */
export function ghostPointerOffset(width: number, height = 52): { x: number; y: number } {
  return { x: Math.min(28, Math.max(16, width * 0.08)), y: Math.round(height / 2) };
}

export function applyGhostPosition(
  el: { style: { left: string; top: string; width?: string }; dataset: { x?: string; y?: string } },
  x: number,
  y: number,
  offsetX: number,
  offsetY: number,
  viewport?: { width: number; height: number; ghostWidth?: number; ghostHeight?: number },
): void {
  const width = viewport?.ghostWidth ?? GHOST_WIDTH_FALLBACK;
  const height = viewport?.ghostHeight ?? 56;
  const box = clampGhostOrigin(x, y, offsetX, offsetY, width, height, viewport?.width, viewport?.height);
  el.style.left = `${box.left}px`;
  el.style.top = `${box.top}px`;
  if (viewport?.ghostWidth) el.style.width = `${Math.round(viewport.ghostWidth)}px`;
  el.dataset.x = String(Math.round(x));
  el.dataset.y = String(Math.round(y));
}

/** Keep the floating row fully on-screen, including on a 390-wide phone. */
export function clampGhostOrigin(
  pointerX: number,
  pointerY: number,
  offsetX: number,
  offsetY: number,
  width: number,
  height: number,
  viewportW?: number,
  viewportH?: number,
  pad = 8,
): { left: number; top: number } {
  let left = Math.round(pointerX - offsetX);
  let top = Math.round(pointerY - offsetY);
  if (Number.isFinite(viewportW) && viewportW! > 0) {
    const maxLeft = Math.max(pad, viewportW! - width - pad);
    left = Math.min(Math.max(pad, left), maxLeft);
  }
  if (Number.isFinite(viewportH) && viewportH! > 0) {
    const maxTop = Math.max(pad, viewportH! - height - pad);
    top = Math.min(Math.max(pad, top), maxTop);
  }
  return { left, top };
}

export function viewportCappedGhostWidth(rowWidth: number, viewportW: number, pad = 24): number {
  const cap = Number.isFinite(viewportW) && viewportW > 0 ? Math.max(GHOST_WIDTH_MIN, viewportW - pad) : GHOST_WIDTH_MAX;
  return capGhostWidth(rowWidth, GHOST_WIDTH_MIN, Math.min(GHOST_WIDTH_MAX, cap));
}

/**
 * Scroll delta for a frame. Negative scrolls up when the pointer is in the
 * top edge band; positive scrolls down in the bottom band. Zero in the middle.
 */
export function autoScrollDelta(
  clientY: number,
  viewportHeight: number,
  edgePx = AUTO_SCROLL_EDGE_PX,
  maxPx = AUTO_SCROLL_MAX_PX,
): number {
  if (!Number.isFinite(clientY) || !Number.isFinite(viewportHeight) || viewportHeight <= 0 || edgePx <= 0) return 0;
  if (clientY < edgePx) {
    const t = Math.min(1, (edgePx - Math.max(0, clientY)) / edgePx);
    return -Math.ceil(maxPx * t);
  }
  const bottom = viewportHeight - edgePx;
  if (clientY > bottom) {
    const t = Math.min(1, (Math.min(viewportHeight, clientY) - bottom) / edgePx);
    return Math.ceil(maxPx * t);
  }
  return 0;
}

/** Walk up from a hit target to the nearest vertically scrollable ancestor. */
export function nearestScrollContainer(start: Element | null): HTMLElement | null {
  if (typeof HTMLElement === "undefined") return null;
  let el: HTMLElement | null = start instanceof HTMLElement ? start : start?.parentElement ?? null;
  const body = typeof document !== "undefined" ? document.body : null;
  const root = typeof document !== "undefined" ? document.documentElement : null;
  const view = typeof window !== "undefined" ? window : null;
  while (el && el !== body && el !== root) {
    const style = view?.getComputedStyle(el);
    if (style) {
      const oy = style.overflowY;
      if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 1) return el;
    }
    el = el.parentElement;
  }
  return null;
}

const ROW_SELECTOR = "[data-testid^='sales-deal-row-'], [data-testid^='sales-deal-card-']";

export function ghostWidthFromTarget(target: { closest?: (sel: string) => { getBoundingClientRect?: () => { width: number } } | null } | null): number {
  const row = target?.closest?.(ROW_SELECTOR);
  return capGhostWidth(row?.getBoundingClientRect?.().width ?? GHOST_WIDTH_FALLBACK);
}
