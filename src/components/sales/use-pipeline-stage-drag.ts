"use client";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { StageDef } from "@/lib/sales/catalog";
import {
  applyGhostPosition,
  applyStageMove,
  autoScrollDelta,
  ghostPointerOffset,
  ghostWidthFromTarget,
  LONG_PRESS_MS,
  nearestScrollContainer,
  viewportCappedGhostWidth,
  pendingStageMove,
  pointerDistance,
  shouldCancelLongPress,
  shouldStartMouseDrag,
  stageSlugFromDropTarget,
  type PendingStageMove,
  type StageDragGhost,
} from "@/lib/sales/pipeline-table-drag";
import { dealHeadline } from "@/lib/sales/pipeline-table";
import type { SalesDeal } from "@/lib/sales/types";

export type { StageDragGhost };

type Press = {
  deal: SalesDeal;
  pointerId: number;
  startX: number;
  startY: number;
  immediate: boolean;
  pointerType: string;
  width: number;
};

export function usePipelineStageDrag({
  deals,
  stages,
  onMoveStage,
}: {
  deals: SalesDeal[];
  stages: StageDef[];
  onMoveStage?: (dealId: string, stage: string) => Promise<void>;
}) {
  const [pending, setPending] = useState<PendingStageMove | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overSlug, setOverSlug] = useState<string | null>(null);
  const [ghost, setGhost] = useState<StageDragGhost | null>(null);
  const [snapshot, setSnapshot] = useState(deals);
  const [localDeals, setLocalDeals] = useState(deals);

  if (!pending && !saving && deals !== snapshot) {
    setSnapshot(deals);
    setLocalDeals(deals);
  }

  const pressRef = useRef<Press | null>(null);
  const timerRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const suppressClickRef = useRef(false);
  const pendingRef = useRef<PendingStageMove | null>(null);
  const savingRef = useRef(false);
  const snapshotRef = useRef(snapshot);
  const ghostElRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const widthRef = useRef(360);
  const animRef = useRef<number | null>(null);
  const enabled = typeof onMoveStage === "function";

  useEffect(() => {
    pendingRef.current = pending;
    savingRef.current = saving;
    snapshotRef.current = snapshot;
  }, [pending, saving, snapshot]);

  const clearTimer = () => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const stopAnim = () => {
    if (animRef.current != null) {
      window.cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
  };

  const paintGhost = useCallback((x: number, y: number) => {
    const el = ghostElRef.current;
    if (!el) return;
    const width = viewportCappedGhostWidth(widthRef.current, window.innerWidth);
    const off = ghostPointerOffset(width);
    const height = el.getBoundingClientRect().height || 56;
    applyGhostPosition(el, x, y, off.x, off.y, {
      width: window.innerWidth,
      height: window.innerHeight,
      ghostWidth: width,
      ghostHeight: height,
    });
  }, []);

  const bindGhostEl = useCallback((el: HTMLDivElement | null) => {
    ghostElRef.current = el;
    if (el) paintGhost(pointerRef.current.x, pointerRef.current.y);
  }, [paintGhost]);

  const startDrag = useCallback((press: Press, x: number, y: number) => {
    draggingRef.current = true;
    suppressClickRef.current = true;
    pointerRef.current = { x, y };
    const width = typeof window !== "undefined" ? viewportCappedGhostWidth(press.width, window.innerWidth) : press.width;
    widthRef.current = width;
    setDraggingId(press.deal.id);
    setGhost({
      dealId: press.deal.id,
      headline: dealHeadline(press.deal),
      width,
      x,
      y,
    });
    setError(null);
  }, []);

  useEffect(() => {
    if (!draggingId) return;
    let frame = 0;
    const tick = () => {
      frame = window.requestAnimationFrame(tick);
      animRef.current = frame;
      const { x, y } = pointerRef.current;
      paintGhost(x, y);
      const dy = autoScrollDelta(y, window.innerHeight);
      if (dy) {
        const hit = document.elementFromPoint(x, y);
        const box = nearestScrollContainer(hit);
        if (box) box.scrollBy(0, dy);
        else window.scrollBy(0, dy);
      }
      const slug = stageSlugFromDropTarget(document.elementFromPoint(x, y));
      setOverSlug((cur) => (cur === slug ? cur : slug));
    };
    frame = window.requestAnimationFrame(tick);
    animRef.current = frame;
    return () => {
      window.cancelAnimationFrame(frame);
      if (animRef.current === frame) animRef.current = null;
    };
  }, [draggingId, paintGhost]);

  const endPress = useCallback(() => {
    clearTimer();
    stopAnim();
    pressRef.current = null;
    draggingRef.current = false;
    setDraggingId(null);
    setOverSlug(null);
    setGhost(null);
  }, []);

  const requestMove = useCallback((deal: SalesDeal, toSlug: string) => {
    const next = pendingStageMove({ deal, stages, toSlug });
    if (!next) return;
    setError(null);
    setLocalDeals((cur) => applyStageMove(cur, deal.id, toSlug));
    setPending(next);
  }, [stages]);

  const cancelMove = useCallback(() => {
    if (savingRef.current) return;
    setPending(null);
    setLocalDeals(snapshotRef.current);
  }, []);

  const confirmMove = useCallback(async () => {
    const move = pendingRef.current;
    if (!move || !onMoveStage || savingRef.current) return;
    setSaving(true);
    setError(null);
    try {
      await onMoveStage(move.dealId, move.toSlug);
      const next = applyStageMove(snapshotRef.current, move.dealId, move.toSlug);
      setSnapshot(next);
      setLocalDeals(next);
      setPending(null);
    } catch {
      setLocalDeals(snapshotRef.current);
      setPending(null);
      setError("Couldn't update the stage. Try again.");
    } finally {
      setSaving(false);
    }
  }, [onMoveStage]);

  const onPointerDown = useCallback((deal: SalesDeal, e: ReactPointerEvent, immediate = false) => {
    if (!enabled) return;
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if (!immediate) {
      const target = e.target as HTMLElement;
      if (target.closest("button, summary, select, input, textarea, [data-no-drag]")) return;
      // Keep mouse clicks on the deal link working; touch can long-press the card/link to drag.
      if (e.pointerType === "mouse" && target.closest("a")) return;
    }
    clearTimer();
    const press: Press = {
      deal,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      immediate,
      pointerType: e.pointerType,
      width: ghostWidthFromTarget(e.currentTarget as HTMLElement),
    };
    pressRef.current = press;
    pointerRef.current = { x: e.clientX, y: e.clientY };
    try { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
    if (immediate) {
      e.preventDefault();
      startDrag(press, e.clientX, e.clientY);
      return;
    }
    if (e.pointerType !== "mouse") {
      timerRef.current = window.setTimeout(() => {
        const current = pressRef.current;
        if (!current || current.pointerId !== press.pointerId) return;
        startDrag(current, current.startX, current.startY);
      }, LONG_PRESS_MS);
    }
  }, [enabled, startDrag]);

  const onHandlePointerDown = useCallback((deal: SalesDeal, e: ReactPointerEvent) => {
    e.stopPropagation();
    onPointerDown(deal, e, true);
  }, [onPointerDown]);

  useEffect(() => {
    if (!enabled) return;

    const onMove = (e: PointerEvent) => {
      const press = pressRef.current;
      if (!press || press.pointerId !== e.pointerId) return;
      const dist = pointerDistance(press.startX, press.startY, e.clientX, e.clientY);
      if (!draggingRef.current) {
        if (press.pointerType !== "mouse" && shouldCancelLongPress(dist)) {
          clearTimer();
          pressRef.current = null;
          return;
        }
        if (press.pointerType === "mouse" && shouldStartMouseDrag(dist)) {
          startDrag(press, e.clientX, e.clientY);
        }
        return;
      }
      e.preventDefault();
      pointerRef.current = { x: e.clientX, y: e.clientY };
    };

    const onUp = (e: PointerEvent) => {
      const press = pressRef.current;
      if (!press || press.pointerId !== e.pointerId) return;
      const wasDragging = draggingRef.current;
      const deal = press.deal;
      const { x, y } = pointerRef.current;
      const slug = wasDragging ? stageSlugFromDropTarget(document.elementFromPoint(x, y)) : null;
      endPress();
      if (wasDragging && slug) requestMove(deal, slug);
      if (wasDragging) {
        window.setTimeout(() => { suppressClickRef.current = false; }, 0);
      }
    };

    const onCancel = (e: PointerEvent) => {
      const press = pressRef.current;
      if (!press || press.pointerId !== e.pointerId) return;
      endPress();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (draggingRef.current || pressRef.current) endPress();
      else if (pendingRef.current && !savingRef.current) {
        setPending(null);
        setLocalDeals(snapshotRef.current);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (draggingRef.current) e.preventDefault();
    };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("touchmove", onTouchMove);
      stopAnim();
    };
  }, [enabled, endPress, requestMove, startDrag]);

  useEffect(() => {
    if (!draggingId) return;
    const body = document.body;
    const prevUserSelect = body.style.userSelect;
    const prevTouchAction = body.style.touchAction;
    const prevCursor = body.style.cursor;
    body.style.userSelect = "none";
    body.style.touchAction = "none";
    body.style.cursor = "grabbing";
    body.classList.add("rr-pipeline-dragging");
    const onSelect = (e: Event) => e.preventDefault();
    document.addEventListener("selectstart", onSelect);
    return () => {
      body.style.userSelect = prevUserSelect;
      body.style.touchAction = prevTouchAction;
      body.style.cursor = prevCursor;
      body.classList.remove("rr-pipeline-dragging");
      document.removeEventListener("selectstart", onSelect);
    };
  }, [draggingId]);

  const onRowClickCapture = useCallback((e: { preventDefault(): void; stopPropagation(): void }) => {
    if (!suppressClickRef.current) return;
    e.preventDefault();
    e.stopPropagation();
  }, []);

  return {
    localDeals,
    pending,
    saving,
    error,
    setError,
    draggingId,
    overSlug,
    ghost,
    enabled,
    bindGhostEl,
    onPointerDown,
    onHandlePointerDown,
    onRowClickCapture,
    requestMove,
    cancelMove,
    confirmMove,
  };
}
