"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { isAppNavigationAnchor, isModifiedClick, pathAndSearch } from "@/lib/nav-progress";

const PENDING_CLASS = "is-nav-pending";

type Api = {
  start: () => void;
  done: () => void;
  pendingHref: string | null;
  preview: (pct: number) => void;
};

const NavProgressContext = createContext<Api | null>(null);

export function useNavProgress(): Api {
  const ctx = useContext(NavProgressContext);
  if (!ctx) throw new Error("useNavProgress must be used within NavProgressProvider");
  return ctx;
}

export function useOptionalNavProgress(): Api | null {
  return useContext(NavProgressContext);
}

export function useNavPendingHref(): string | null {
  return useContext(NavProgressContext)?.pendingHref ?? null;
}

declare global {
  interface Window {
    __rrNavProgress?: { start: () => void; done: () => void; preview: (pct: number) => void };
  }
}

function useProgressApi() {
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const count = useRef(0);
  const trickle = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAt = useRef(0);
  const widthRef = useRef(0);
  const previewing = useRef(false);

  const setBar = useCallback((pct: number) => {
    widthRef.current = pct;
    setWidth(pct);
  }, []);

  const stopTimers = useCallback(() => {
    if (trickle.current) { clearInterval(trickle.current); trickle.current = null; }
    if (safetyTimer.current) { clearTimeout(safetyTimer.current); safetyTimer.current = null; }
  }, []);

  const clearPressed = useCallback(() => {
    document.querySelectorAll(`a.${PENDING_CLASS}`).forEach((el) => el.classList.remove(PENDING_CLASS));
    setPendingHref(null);
  }, []);

  const finishBar = useCallback((quick: boolean) => {
    stopTimers();
    if (quick) {
      setVisible(false);
      setBar(0);
      return;
    }
    setBar(100);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      setVisible(false);
      setBar(0);
      hideTimer.current = null;
    }, 180);
  }, [setBar, stopTimers]);

  const start = useCallback(() => {
    if (previewing.current) return;
    count.current += 1;
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
    if (count.current === 1) {
      startedAt.current = Date.now();
      setVisible(true);
      setBar(12);
      if (trickle.current) clearInterval(trickle.current);
      trickle.current = setInterval(() => {
        const cur = widthRef.current;
        if (cur >= 90) return;
        setBar(cur + Math.max(0.5, (90 - cur) * 0.08));
      }, 200);
      if (safetyTimer.current) clearTimeout(safetyTimer.current);
      safetyTimer.current = setTimeout(() => {
        count.current = 0;
        previewing.current = false;
        finishBar(false);
        clearPressed();
      }, 12000);
    }
  }, [clearPressed, finishBar, setBar]);

  const done = useCallback(() => {
    if (previewing.current) return;
    if (count.current === 0) return;
    count.current = Math.max(0, count.current - 1);
    if (count.current > 0) return;
    finishBar(Date.now() - startedAt.current < 120);
    clearPressed();
  }, [clearPressed, finishBar]);

  const preview = useCallback((pct: number) => {
    previewing.current = true;
    stopTimers();
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
    count.current = 1;
    setVisible(true);
    const n = pct <= 1 ? pct * 100 : pct;
    setBar(Math.max(0, Math.min(100, n)));
  }, [setBar, stopTimers]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || isModifiedClick(e)) return;
      const t = e.target;
      if (!(t instanceof Element)) return;
      const a = t.closest("a[href]");
      if (!(a instanceof HTMLAnchorElement)) return;
      const loc = { origin: window.location.origin, pathname: window.location.pathname, search: window.location.search };
      if (!isAppNavigationAnchor(a, loc)) return;
      a.classList.add(PENDING_CLASS);
      setPendingHref(pathAndSearch(a.href, loc.origin));
      start();
    };
    const onPop = () => { start(); };
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPop);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPop);
    };
  }, [start]);

  useEffect(() => {
    window.__rrNavProgress = { start, done, preview };
    return () => { if (window.__rrNavProgress?.start === start) delete window.__rrNavProgress; };
  }, [start, done, preview]);

  useEffect(() => () => {
    stopTimers();
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, [stopTimers]);

  return { width, visible, api: { start, done, pendingHref, preview } as Api };
}

function UrlChangeCompleter() {
  const pathname = usePathname();
  const search = useSearchParams();
  const { done } = useNavProgress();
  const key = `${pathname}?${search.toString()}`;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    done();
  }, [key, done]);
  return null;
}

export function NavProgressProvider({ children }: { children: ReactNode }) {
  const { width, visible, api } = useProgressApi();
  return (
    <NavProgressContext.Provider value={api}>
      <Suspense fallback={null}>
        <UrlChangeCompleter />
      </Suspense>
      <div
        className={`rr-topbar${visible ? " is-on" : ""}`}
        role={visible ? "progressbar" : undefined}
        aria-hidden={visible ? undefined : true}
        aria-valuemin={visible ? 0 : undefined}
        aria-valuemax={visible ? 100 : undefined}
        aria-valuenow={visible ? Math.round(width) : undefined}
        aria-label={visible ? "Page loading" : undefined}
      >
        <div className="rr-topbar-bar" style={{ width: visible ? `${width}%` : "0%" }} />
      </div>
      {children}
    </NavProgressContext.Provider>
  );
}
