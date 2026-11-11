import Link from "next/link";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { SubmitButton } from "@/components/submit-button";

export function DeleteConfirmDialog({
  title,
  itemName,
  cancelHref,
  action,
  consequences,
  blocked,
  confirmLabel = "Delete",
}: {
  title: string;
  itemName: string;
  cancelHref: string;
  action: (formData: FormData) => void | Promise<void>;
  consequences: string[];
  blocked?: string | null;
  confirmLabel?: string;
}) {
  return (
    <Modal title={title} sub="This can’t be undone." closeHref={cancelHref}>
      <form action={action} className="flex flex-col gap-4 p-5" data-testid="delete-confirm">
        <p className="text-sm">You are about to delete <span className="font-semibold">{itemName}</span>.</p>
        {blocked ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900" role="alert">{blocked}</div>
        ) : (
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            {consequences.map((line) => <li key={line}>{line}</li>)}
          </ul>
        )}
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Link href={cancelHref} scroll={false} className="btn">Cancel</Link>
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
