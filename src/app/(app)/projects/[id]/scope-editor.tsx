"use client";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { SubmitButton } from "@/components/submit-button";
import type { ScopeItem } from "@/lib/scope-items";

export function ScopeEditor({ action, items }: { action: (fd: FormData) => Promise<void>; items: ScopeItem[] }) {
  const [rows, setRows] = useState<ScopeItem[]>(items.length ? items : [{ qty: null, work_item: "" }]);
  return (
    <form action={action} className="flex flex-col gap-3 p-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-0 text-left text-sm">
          <thead className="border-b border-line text-[11.5px] font-semibold tracking-wide text-muted uppercase">
            <tr>
              <th className="w-10 px-2 py-2 font-semibold">#</th>
              <th className="w-20 px-2 py-2 font-semibold">Qty</th>
              <th className="px-2 py-2 font-semibold">Work item</th>
              <th className="w-10 px-2 py-2"><span className="sr-only">Remove</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row, i) => (
              <tr key={i}>
                <td className="px-2 py-2 text-muted">{i + 1}</td>
                <td className="px-2 py-2"><input name="qty" type="number" min={0} step="any" className="input" defaultValue={row.qty ?? ""} aria-label={`Quantity ${i + 1}`} /></td>
                <td className="px-2 py-2"><input name="work_item" className="input" defaultValue={row.work_item} aria-label={`Work item ${i + 1}`} /></td>
                <td className="px-2 py-2">
                  <button type="button" className="btn btn-sm btn-danger px-2" aria-label={`Remove row ${i + 1}`} onClick={() => setRows((r) => r.filter((_, j) => j !== i).length ? r.filter((_, j) => j !== i) : [{ qty: null, work_item: "" }])}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-sm" onClick={() => setRows((r) => [...r, { qty: null, work_item: "" }])}><Icon name="plus" className="size-4" />Add row</button>
        <SubmitButton className="btn btn-sm btn-primary" pendingText="Saving…">Save scope</SubmitButton>
      </div>
    </form>
  );
}
