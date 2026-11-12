/** Inline spinner for pending buttons and links. Inherits color from `currentColor`. */
export function Spinner({ className = "" }: { className?: string }) {
  return <span className={`rr-spin ${className}`.trim()} aria-hidden />;
}
