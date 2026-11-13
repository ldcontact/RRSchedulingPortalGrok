"use client";

import { useState } from "react";
import { DeleteConfirmDialog } from "@/components/delete-confirm";
import { SubmitButton } from "@/components/submit-button";
import { Avatar } from "@/components/ui";
import { canDeleteServiceRequestNote, canEditServiceRequestNote } from "@/lib/service-request-notes";
import { fmtDateTime } from "@/lib/time";
import type { Role, SREvent } from "@/lib/types";
import { addTicketNote, deleteTicketNote, editTicketNote } from "./actions";

type User = { id: string; role: Role; can_delete: boolean };

export function NotesCard({ requestId, notes, user }: { requestId: string; notes: SREvent[]; user: User }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<SREvent | null>(null);

  return (
    <div className="card" data-testid="ticket-notes">
      <div className="card-hd"><h3 className="font-semibold">Notes</h3><span className="text-xs text-muted">Internal · not sent to the customer</span></div>
      <ol className="divide-y divide-line">
        {notes.map((n) => {
          const canEdit = canEditServiceRequestNote({ userId: user.id, role: user.role, authorId: n.actor_id });
          const canDelete = canDeleteServiceRequestNote({ userId: user.id, role: user.role, canDeleteFlag: user.can_delete, authorId: n.actor_id });
          const editing = editingId === n.id;
          return (
            <li key={n.id} className="flex gap-2.5 px-5 py-3 text-sm" data-testid="ticket-note">
              <Avatar name={n.actor_name} color={n.actor_color} src={n.actor_avatar_url} title={n.actor_name} />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted">
                  {n.actor_name} · {fmtDateTime(n.created_at)}
                  {n.edited_at ? <span data-testid="note-edited"> · (edited) {fmtDateTime(n.edited_at)}</span> : null}
                </div>
                {editing ? (
                  <form
                    action={async (fd) => {
                      await editTicketNote(requestId, n.id, fd);
                      setEditingId(null);
                    }}
                    className="mt-2 flex flex-col gap-2"
                    data-testid="note-edit-form"
                  >
                    <textarea name="body" required defaultValue={n.body} maxLength={5000} className="input min-h-20" aria-label="Edit note" />
                    <div className="flex gap-2">
                      <SubmitButton className="btn btn-primary btn-sm" pendingText="Saving…">Save</SubmitButton>
                      <button type="button" className="btn btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="whitespace-pre-wrap">{n.body}</div>
                    {(canEdit || canDelete) && (
                      <div className="mt-1.5 flex flex-wrap gap-2 text-xs font-semibold">
                        {canEdit && (
                          <button type="button" className="text-muted hover:text-ink" onClick={() => setEditingId(n.id)} data-testid="note-edit">Edit</button>
                        )}
                        {canDelete && (
                          <button type="button" className="text-muted hover:text-red-700" onClick={() => setDeleting(n)} data-testid="note-delete">Delete</button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <form action={addTicketNote.bind(null, requestId)} className="flex gap-2 border-t border-line p-4">
        <input name="body" required className="input" placeholder="Add an internal note…" aria-label="Note" maxLength={5000} />
        <SubmitButton className="btn btn-primary">Add note</SubmitButton>
      </form>
      {deleting && (
        <DeleteConfirmDialog
          title="Delete this note?"
          itemName={deleting.body.length > 80 ? `${deleting.body.slice(0, 80)}…` : deleting.body}
          onCancel={() => setDeleting(null)}
          consequences={["This internal note is removed from the ticket. This can’t be undone."]}
          confirmLabel="Delete note"
          action={async () => {
            await deleteTicketNote(requestId, deleting.id);
            setDeleting(null);
          }}
        />
      )}
    </div>
  );
}
