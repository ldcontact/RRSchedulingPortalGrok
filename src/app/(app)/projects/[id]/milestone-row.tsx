"use client";
import { useRef } from "react";
import { Icon } from "@/components/icons";
import type { Milestone } from "@/lib/types";

/** One proposed-timeline row: check off, rename, re-date (auto-saves on change), delete. */
export function MilestoneRow({ m, overdue, toggle, update, remove }: {
  m: Milestone; overdue: boolean; toggle: () => Promise<void>; update: (fd: FormData) => Promise<void>; remove: () => Promise<void>;
}) {
  const form = useRef<HTMLFormElement>(null);
  const submit = () => form.current?.requestSubmit();
  return (
    <li className="flex items-center gap-2.5 px-4 py-2" data-testid="milestone">
      <form action={toggle}><button aria-label={m.done ? "Mark not done" : "Mark done"} className={`grid size-6 place-items-center rounded-md border-2 ${m.done ? "border-brand bg-brand text-white" : "border-[#c9d1c8] bg-white hover:border-brand"}`}>{m.done && <Icon name="check" className="size-3.5" />}</button></form>
      <form ref={form} action={update} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <input name="name" defaultValue={m.name} onBlur={(e) => e.target.value !== m.name && submit()} aria-label="Milestone"
          className={`min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm hover:border-line focus:border-brand focus:outline-none ${m.done ? "text-muted line-through" : "font-medium"}`} />
        <input name="due_date" type="date" defaultValue={m.due_date ?? ""} onChange={submit} aria-label="Due date"
          className={`rounded-md border border-line bg-white px-2 py-1 text-[13px] ${overdue ? "border-red-300 text-red-700" : ""}`} />
      </form>
      <form action={remove}><button aria-label="Delete milestone" className="rounded p-1 text-muted hover:bg-red-50 hover:text-red-700"><Icon name="trash" className="size-4" /></button></form>
    </li>
  );
}
