import type { DescriptionSpan } from "@/lib/task-description";
import { parseTaskDescription } from "@/lib/task-description";

function Spans({ spans }: { spans: DescriptionSpan[] }) {
  return (
    <>
      {spans.map((span, i) =>
        span.type === "link" ? (
          <a key={i} href={span.href} className="font-semibold text-brand hover:underline" target="_blank" rel="noreferrer">
            {span.text}
          </a>
        ) : (
          <span key={i}>{span.text}</span>
        ),
      )}
    </>
  );
}

export function TaskDescription({ text }: { text: string | null | undefined }) {
  const blocks = parseTaskDescription(text);
  if (!blocks.length) return <span className="text-muted">No additional details.</span>;
  return (
    <div className="min-w-0 text-sm leading-relaxed">
      {blocks.map((block, i) =>
        block.type === "paragraph" ? (
          <p key={i} className="whitespace-pre-wrap px-5 py-4 md:px-7">{<Spans spans={block.spans} />}</p>
        ) : (
          <ol key={i} className="m-0 list-none px-5 pt-2 pb-4 md:max-w-[46rem] md:px-7 md:pt-1 md:pb-5">
            {block.items.map((item, j) => (
              <li key={j} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-2.5 border-b border-[#f0f2ef] py-2 last:border-b-0 md:gap-3.5 md:py-2 md:text-[15px] md:leading-[1.65]">
                <span className="pt-0.5 text-right text-[13px] font-semibold text-brand tabular-nums">{item.number}</span>
                <span className="min-w-0 whitespace-pre-wrap"><Spans spans={item.spans} /></span>
              </li>
            ))}
          </ol>
        ),
      )}
    </div>
  );
}
