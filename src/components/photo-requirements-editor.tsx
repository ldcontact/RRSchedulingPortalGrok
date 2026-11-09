import { Icon } from "./icons";
import { SubmitButton } from "./submit-button";
import type { PhotoRequirement } from "@/lib/types";
import { addPhotoRequirement, deletePhotoRequirement, updatePhotoRequirement } from "@/app/(app)/projects/actions";

export function PhotoRequirementsEditor({ projectId, items }: { projectId: string; items: PhotoRequirement[] }) {
  return (
    <div className="card" data-testid="photo-requirements">
      <div className="card-hd">
        <h3 className="font-semibold">Required photos</h3>
        <span className="text-xs text-muted">{items.length ? `${items.length} item${items.length > 1 ? "s" : ""} · techs must shoot each before submit` : "Optional checklist for techs"}</span>
      </div>
      <ul className="divide-y divide-line">
        {items.length === 0 && (
          <li className="p-4 text-sm text-muted">No required items yet. Add labels like “T12 4ft”, “400W MH”, or “Wall pack” so techs know exactly what to photograph.</li>
        )}
        {items.map((r) => (
          <li key={r.id} className="flex flex-wrap items-start gap-2 px-3 py-2.5">
            <form action={updatePhotoRequirement.bind(null, projectId, r.id)} className="flex min-w-0 flex-1 flex-wrap gap-2">
              <input name="label" required defaultValue={r.label} className="input min-w-0 flex-1 !py-1.5" aria-label="Label" />
              <input name="note" defaultValue={r.note ?? ""} className="input min-w-[10rem] flex-[1.2] !py-1.5" placeholder="Optional tip" aria-label="Note" />
              <SubmitButton className="btn btn-sm">Save</SubmitButton>
            </form>
            <form action={deletePhotoRequirement.bind(null, projectId, r.id)}>
              <SubmitButton className="btn btn-sm btn-danger" pendingText="…"><Icon name="trash" /></SubmitButton>
            </form>
          </li>
        ))}
      </ul>
      <form action={addPhotoRequirement.bind(null, projectId)} className="flex flex-wrap gap-2 border-t border-line p-3" data-testid="add-photo-requirement">
        <input name="label" required className="input min-w-0 flex-1" placeholder="Add item, e.g. 400W MH" />
        <input name="note" className="input min-w-[10rem] flex-1" placeholder="Optional tip for the tech" />
        <SubmitButton className="btn"><Icon name="plus" />Add</SubmitButton>
      </form>
    </div>
  );
}
