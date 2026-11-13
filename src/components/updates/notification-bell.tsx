"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/icons";
import { TZ } from "@/lib/time";
import type { TeamUpdateNotification } from "@/lib/updates/types";
import { markUpdateNotificationsReadAction } from "@/app/(app)/updates/actions";

function when(iso: string) {
  return new Date(iso).toLocaleString("en-US", { timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function NotificationBell({ unread, items }: { unread: number; items: TeamUpdateNotification[] }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; right: number }>({ top: 56, left: 8, right: 16 });
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const router = useRouter();

  function toggle() {
    if (open) { setOpen(false); return; }
    const r = btn.current?.getBoundingClientRect();
    const top = r ? r.bottom + 6 : 56;
    const width = Math.min(352, window.innerWidth - 16);
    const right = r ? Math.max(8, window.innerWidth - r.right) : 16;
    const left = window.innerWidth - right - width;
    setPos(left < 8 ? { top, left: 8, right: 8 } : { top, left: Math.max(8, left), right });
    setOpen(true);
  }

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (btn.current?.contains(t) || panel.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function openItem(n: TeamUpdateNotification) {
    if (!n.read_at) await markUpdateNotificationsReadAction([n.id]);
    setOpen(false);
    router.push(n.link);
    router.refresh();
  }

  async function markAll() {
    await markUpdateNotificationsReadAction(null);
    router.refresh();
  }

  const dropdown = open && (
    <div
      ref={panel}
      className="fixed z-[80] overflow-hidden rounded-xl border border-line bg-white shadow-xl"
      style={{ top: pos.top, left: pos.left, right: pos.right, width: pos.left === 8 && pos.right === 8 ? "auto" : undefined, maxWidth: "22rem" }}
      data-testid="notification-dropdown"
    >
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <div className="text-sm font-semibold">Updates</div>
        {unread > 0 && (
          <button type="button" className="text-xs font-semibold text-brand" onClick={() => void markAll()}>Mark all read</button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-muted">No notifications yet.</p>
      ) : (
        <ul className="max-h-96 overflow-auto">
          {items.map((n) => (
            <li key={n.id} className={n.read_at ? "bg-white" : "bg-brand-50/60"}>
              <button type="button" className="block w-full px-3 py-2.5 text-left hover:bg-canvas" onClick={() => void openItem(n)} data-testid="notification-item">
                <div className="text-sm font-semibold">{n.title}</div>
                <div className="mt-0.5 line-clamp-2 text-xs text-muted">{n.body}</div>
                <div className="mt-1 text-[11px] text-muted">{when(n.created_at)} CT</div>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="border-t border-line px-3 py-2 text-[11px] text-muted">Staff only · customers are never notified</div>
    </div>
  );

  return (
    <div className="relative">
      <button
        type="button"
        ref={btn}
        className="relative grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-canvas hover:text-ink"
        aria-label="Updates notifications"
        data-testid="notification-bell"
        onClick={toggle}
      >
        <Icon name="bell" />
        {unread > 0 && (
          <span className="absolute top-0.5 right-0 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] font-bold text-[#3b2600]" data-testid="notification-bell-count">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {typeof document !== "undefined" ? createPortal(dropdown, document.body) : null}
    </div>
  );
}
