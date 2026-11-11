export function SampleBadge({ className = "" }: { className?: string }) {
  return (
    <span data-testid="sample-data-badge" className={`inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800 ${className}`}>
      Sample data
    </span>
  );
}
