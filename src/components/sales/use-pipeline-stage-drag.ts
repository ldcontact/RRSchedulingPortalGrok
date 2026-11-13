"use client";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { StageDef } from "@/lib/sales/catalog";
import {
  applyStageMove,
  LONG_PRESS_CANCEL_PX,
  LONG_PRESS_MS,
  MOUSE_DRAG_THRESHOLD_PX,
  pendingStageMove,
  stageSlugFromDropTarget,
  type PendingStageMove,
} from "@/lib/sales/pipeline-table-drag";
import { dealHeadline } from "@/lib/sales/pipeline-table";
import type { SalesDeal } from "@/lib/sales/types";

export type StageDragGhost = { x: number; y: number; headline: string };

type Press = {
  deal: SalesDeal;
  pointerId: number;
  startX: number;
  startY: number;
  immediate: boolean;
  pointerType: string;
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

  const startDrag = useCallback((press: Press, x: number, y: number) => {
    draggingRef.current = true;
    suppressClickRef.current = true;
    setDraggingId(press.deal.id);
    setGhost({ x, y, headline: dealHeadline(press.deal) });
    setError(null);
  }, []);

  const endPress = useCallback(() => {
    clearTimer();
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
    };
    pressRef.current = press;
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
      const dx = e.clientX - press.startX;
      const dy = e.clientY - press.startY;
      const dist = Math.hypot(dx, dy);
      if (!draggingRef.current) {
        if (press.pointerType !== "mouse" && dist > LONG_PRESS_CANCEL_PX) {
          clearTimer();
          pressRef.current = null;
          return;
        }
        if (press.pointerType === "mouse" && dist >= MOUSE_DRAG_THRESHOLD_PX) {
          startDrag(press, e.clientX, e.clientY);
        }
        return;
      }
      e.preventDefault();
      setGhost({ x: e.clientX, y: e.clientY, headline: dealHeadline(press.deal) });
      const el = document.elementFromPoint(e.clientX, e.clientY);
      setOverSlug(stageSlugFromDropTarget(el));
    };

    const onUp = (e: PointerEvent) => {
      const press = pressRef.current;
      if (!press || press.pointerId !== e.pointerId) return;
      const wasDragging = draggingRef.current;
      const deal = press.deal;
      const slug = wasDragging ? stageSlugFromDropTarget(document.elementFromPoint(e.clientX, e.clientY)) : null;
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

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
    };
  }, [enabled, endPress, requestMove, startDrag]);

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
    onPointerDown,
    onHandlePointerDown,
    onRowClickCapture,
    requestMove,
    cancelMove,
    confirmMove,
  };
}
