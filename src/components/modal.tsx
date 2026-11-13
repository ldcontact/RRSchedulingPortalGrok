import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./icons";

/** Dialog over the current page. Closing is a plain link (works without JS and with Back) or an onClose handler for client-opened dialogs. */
export function Modal({ title, sub, closeHref, onClose, children, wide = false }: { title: ReactNode; sub?: ReactNode; closeHref?: string; onClose?: () => void; children: ReactNode; wide?: boolean }) {
  const closeBtnClass = "grid size-9 place-items-center rounded-lg border border-line hover:bg-[#fafbf9]";
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/45 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}>
      {closeHref ? (
        <Link href={closeHref} className="absolute inset-0" aria-label="Close" scroll={false} tabIndex={-1} />
      ) : (
        <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} tabIndex={-1} />
      )}
      <div className={`relative flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl ${wide ? "sm:max-w-2xl" : "sm:max-w-xl"}`}>
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div><h2 className="text-[17px] font-semibold">{title}</h2>{sub && <div className="text-[12.5px] text-muted">{sub}</div>}</div>
          {closeHref ? (
            <Link href={closeHref} scroll={false} className={closeBtnClass} aria-label="Close"><Icon name="x" className="size-4" /></Link>
          ) : (
            <button type="button" className={closeBtnClass} aria-label="Close" onClick={onClose}><Icon name="x" className="size-4" /></button>
          )}
        </div>
        <div className="overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
