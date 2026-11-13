"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { SubmitButton } from "@/components/submit-button";
import { editTicketIssue } from "./actions";

export function IssueCard({
  requestId, summary, description, sub, canEdit,
}: {
  requestId: string;
  summary: string;
  description: string;
  sub: string;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="card" data-testid="ticket-issue">
      <div className="card-hd">
        <h3 className="font-semibold">Issue</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">{sub}</span>
          {canEdit && !editing && (
            <button type="button" className="btn btn-sm" onClick={() => setEditing(true)} data-testid="issue-edit">
              <Icon name="edit" className="size-3.5" />Edit
            </button>
          )}
        </div>
      </div>
      {editing ? (
        <form
          action={async (fd) => {
            await editTicketIssue(requestId, fd);
            setEditing(false);
          }}
          className="flex flex-col gap-3 p-5"
          data-testid="issue-edit-form"
        >
          <label className="flex flex-col gap-1 text-sm font-medium">
            Title
            <input name="summary" required defaultValue={summary} maxLength={200} className="input font-semibold" aria-label="Issue title" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Description
            <textarea name="description" defaultValue={description} maxLength={5000} className="input min-h-28" aria-label="Issue description" />
          </label>
          <div className="flex gap-2">
            <SubmitButton className="btn btn-primary btn-sm" pendingText="Saving…">Save</SubmitButton>
            <button type="button" className="btn btn-sm" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <div className="p-5 text-sm leading-relaxed">
          <div className="mb-1 font-semibold" data-testid="issue-summary">{summary}</div>
          <div className="whitespace-pre-wrap">{description || <span className="text-muted">No details written.</span>}</div>
        </div>
      )}
    </div>
  );
}
