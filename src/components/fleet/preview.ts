export const PREVIEW_ENTER_MS = 140;
export const PREVIEW_LEAVE_MS = 240;

export type PreviewTarget = { kind: "vehicle"; id: string } | { kind: "visit"; id: string } | null;

export function previewVehicleId(target: PreviewTarget): string | null {
  return target?.kind === "vehicle" ? target.id : null;
}

export function previewVisitId(target: PreviewTarget): string | null {
  return target?.kind === "visit" ? target.id : null;
}

export function createPreviewController(
  apply: (target: PreviewTarget) => void,
  timing: { enterMs?: number; leaveMs?: number } = {},
) {
  const enterMs = timing.enterMs ?? PREVIEW_ENTER_MS;
  const leaveMs = timing.leaveMs ?? PREVIEW_LEAVE_MS;
  let enterTimer: ReturnType<typeof setTimeout> | null = null;
  let leaveTimer: ReturnType<typeof setTimeout> | null = null;

  function clearEnter() {
    if (enterTimer) {
      clearTimeout(enterTimer);
      enterTimer = null;
    }
  }
  function clearLeave() {
    if (leaveTimer) {
      clearTimeout(leaveTimer);
      leaveTimer = null;
    }
  }

  return {
    enter(target: Exclude<PreviewTarget, null>) {
      clearLeave();
      clearEnter();
      enterTimer = setTimeout(() => {
        enterTimer = null;
        apply(target);
      }, enterMs);
    },
    leave() {
      clearEnter();
      clearLeave();
      leaveTimer = setTimeout(() => {
        leaveTimer = null;
        apply(null);
      }, leaveMs);
    },
    cancel() {
      clearEnter();
      clearLeave();
    },
  };
}

/** False when the user prefers reduced motion; map pans/zooms should then be instant. */
export function allowMapAnimation(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
