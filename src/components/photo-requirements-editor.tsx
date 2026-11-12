import { Icon } from "./icons";
import { SubmitButton } from "./submit-button";
import type { PhotoRequirement } from "@/lib/types";
import { addPhotoRequirement, deletePhotoRequirement, updatePhotoRequirement } from "@/app/(app)/projects/actions";

export function PhotoRequirementsEditor({
  projectId, jobId = null, items, inherited = [],
}: {
  projectId: string;
  jobId?: string | null;
  items: PhotoRequirement[];
  inherited?: PhotoRequirement[];
}) {
  const total = inherited.length + items.length;
  return (
    <div className="card" data-testid="photo-requirements">
      <div className="card-hd">
        <h3 className="font-semibold">Required photos</h3>
        <span className="text-xs text-muted">{total ? `${total} item${total > 1 ? "s" : ""} · techs must shoot each before submit` : "Optional checklist for techs"}</span>
      </div>
      <ul className="divide-y divide-line">
        {total === 0 && (
          <li className="p-4 text-sm text-muted">No required items yet. Add labels like “T12 4ft”, “400W MH”, or “Wall pack” so techs know exactly what to photograph.</li>
        )}
        {inherited.map((r) => (
          <li key={r.id} className="flex flex-wrap items-start gap-2 px-3 py-2.5" data-testid={`req-inherited-${r.id}`}>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="font-medium">{r.label}</div>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-muted">From project</span>
              </div>
              {r.note ? <div className="mt-0.5 text-sm text-muted">{r.note}</div> : null}
            </div>
          </li>
        ))}
        {items.map((r) => (
          <li key={r.id} className="flex flex-wrap items-start gap-2 px-3 py-2.5">
            <form action={updatePhotoRequirement.bind(null, projectId, r.id, jobId)} className="flex min-w-0 flex-1 flex-wrap gap-2">
              <input name="label" required defaultValue={r.label} className="input min-w-0 flex-1 !py-1.5" aria-label="Label" />
              <input name="note" defaultValue={r.note ?? ""} className="input min-w-[10rem] flex-[1.2] !py-1.5" placeholder="Optional tip" aria-label="Note" />
              <SubmitButton className="btn btn-sm">Save</SubmitButton>
            </form>
            <form action={deletePhotoRequirement.bind(null, projectId, r.id, jobId)}>
              <SubmitButton className="btn btn-sm btn-danger" pendingText="…"><Icon name="trash" /></SubmitButton>
            </form>
          </li>
        ))}
      </ul>
      <form action={addPhotoRequirement.bind(null, projectId, jobId)} className="flex flex-wrap gap-2 border-t border-line p-3" data-testid="add-photo-requirement">
        <input name="label" required className="input min-w-0 flex-1" placeholder="Add item, e.g. 400W MH" />
        <input name="note" className="input min-w-[10rem] flex-1" placeholder="Optional tip for the tech" />
        <SubmitButton className="btn"><Icon name="plus" />Add</SubmitButton>
      </form>
    </div>
  );
}
