import Link from "next/link";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { SubmitButton } from "@/components/submit-button";

export function DeleteConfirmDialog({
  title,
  itemName,
  cancelHref,
  onCancel,
  action,
  consequences,
  blocked,
  confirmLabel = "Delete",
}: {
  title: string;
  itemName?: string;
  cancelHref?: string;
  onCancel?: () => void;
  action: (formData: FormData) => void | Promise<void>;
  consequences?: string[];
  blocked?: string | null;
  confirmLabel?: string;
}) {
  return (
    <Modal title={title} sub="This can’t be undone." closeHref={cancelHref} onClose={onCancel}>
      <form action={action} className="flex flex-col gap-4 p-5" data-testid="delete-confirm">
        {itemName ? <p className="text-sm">You are about to delete <span className="font-semibold">{itemName}</span>.</p> : null}
        {blocked ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900" role="alert">{blocked}</div>
        ) : consequences && consequences.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            {consequences.map((line) => <li key={line}>{line}</li>)}
          </ul>
        ) : null}
        <div className={`flex justify-end gap-2 ${itemName || blocked || (consequences && consequences.length) ? "border-t border-line pt-4" : ""}`}>
          {cancelHref ? (
            <Link href={cancelHref} scroll={false} className="btn">Cancel</Link>
          ) : (
            <button type="button" className="btn" onClick={onCancel}>Cancel</button>
          )}
          {!blocked && (
            <SubmitButton className="btn btn-danger" pendingText="Deleting…">
              <Icon name="trash" />{confirmLabel}
            </SubmitButton>
          )}
        </div>
      </form>
    </Modal>
  );
}
