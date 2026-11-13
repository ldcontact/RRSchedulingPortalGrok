/** Simple wordmark tile — not Intuit's official logo. */
export function QboMark({ className = "size-10" }: { className?: string }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-lg bg-[#2ca01c] font-bold tracking-tight text-white shadow-sm ${className}`} aria-hidden>
      <span className="text-[13px] leading-none">QB</span>
    </span>
  );
}
