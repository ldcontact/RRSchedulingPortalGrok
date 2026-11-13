"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { Avatar } from "@/components/ui";
import { TZ } from "@/lib/time";
import { displayMentions } from "@/lib/updates/mentions";
import { canDeleteTeamUpdate, canEditTeamUpdate } from "@/lib/updates/permissions";
import type { MentionableUser, TeamUpdate, TeamUpdateThread } from "@/lib/updates/types";
import type { Role } from "@/lib/types";
import { deleteTeamUpdateAction, editTeamUpdateAction } from "@/app/(app)/updates/actions";
import { MentionComposer } from "./mention-composer";

function when(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: TZ,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function UpdateBody({ body }: { body: string }) {
  const text = displayMentions(body);
  const parts = text.split(/(@[A-Za-z][A-Za-z0-9' .+-]*)/g);
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed">
      {parts.map((part, i) =>
        part.startsWith("@") ? <strong key={i} className="font-semibold text-brand">{part}</strong> : <span key={i}>{part}</span>,
      )}
    </p>
  );
}

function Assets({ assets }: { assets: TeamUpdate["assets"] }) {
  if (!assets.length) return null;
  return (
    <ul className="mt-2 flex flex-col gap-2">
      {assets.map((a) => {
        const href = a.url;
        const image = (a.mime || "").startsWith("image/") || /\.(png|jpe?g|gif|webp|heic)$/i.test(a.name);
        return (
          <li key={a.id}>
            {image && href ? (
              <a href={href} target="_blank" rel="noopener" className="block overflow-hidden rounded-md border border-line">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={href} alt={a.name} className="max-h-56 w-full object-contain bg-canvas" />
              </a>
            ) : href ? (
              <a href={href} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand">
                <Icon name="paperclip" className="size-3.5" />{a.name}
              </a>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-sm text-muted"><Icon name="paperclip" className="size-3.5" />{a.name} (unavailable)</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Post({
  row,
  user,
  users,
  dealId,
  projectId,
  contextTitle,
  isReply,
}: {
  row: TeamUpdate;
  user: { id: string; role: Role; can_delete: boolean };
  users: MentionableUser[];
  dealId?: string | null;
  projectId?: string | null;
  contextTitle: string;
  isReply?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [replying, setReplying] = useState(false);
  const [draft, setDraft] = useState(displayMentions(row.body));
  const canEdit = canEditTeamUpdate({ userId: user.id, role: user.role, authorId: row.author_id, deleted: !!row.deleted_at });
  const canDelete = canDeleteTeamUpdate({ userId: user.id, role: user.role, canDeleteFlag: user.can_delete, authorId: row.author_id, deleted: !!row.deleted_at });

  return (
    <article id={`update-${row.id}`} className={isReply ? "scroll-mt-20" : "scroll-mt-24"} data-testid={isReply ? "update-reply" : "update-post"}>
      <div className="flex items-start gap-2.5">
        <Avatar name={row.author_name} color={row.author_color ?? "#64748b"} src={row.author_avatar_url} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="font-semibold">{row.author_name}</span>
            {row.monday_update_id && <span className="text-[11px] font-medium text-muted">From Monday</span>}
            <span className="text-xs text-muted">{when(row.created_at)} CT{row.edited_at ? " · edited" : ""}</span>
          </div>
          {row.deleted_at ? (
            <p className="mt-1 text-sm italic text-muted">This update was deleted.</p>
          ) : editing ? (
            <form
              className="mt-2 flex flex-col gap-2"
              action={async (form) => {
                await editTeamUpdateAction(form);
                setEditing(false);
              }}
            >
              <input type="hidden" name="id" value={row.id} />
              <textarea className="input min-h-20" name="body" value={draft} onChange={(e) => setDraft(e.target.value)} required />
              <div className="flex gap-2">
                <button className="btn btn-primary btn-sm">Save</button>
                <button type="button" className="btn btn-sm" onClick={() => { setEditing(false); setDraft(displayMentions(row.body)); }}>Cancel</button>
              </div>
            </form>
          ) : (
            <div className="mt-1">
              <UpdateBody body={row.body} />
              <Assets assets={row.assets} />
            </div>
          )}
          {!row.deleted_at && (
            <div className="mt-1.5 flex flex-wrap gap-2 text-xs font-semibold">
              {!isReply && (
                <button type="button" className="text-brand hover:underline" onClick={() => setReplying((v) => !v)} data-testid="reply-toggle">Reply</button>
              )}
              {canEdit && <button type="button" className="text-muted hover:text-ink" onClick={() => setEditing(true)}>Edit</button>}
              {canDelete && (
                <form action={deleteTeamUpdateAction}>
                  <input type="hidden" name="id" value={row.id} />
                  <button className="text-muted hover:text-red-700">Delete</button>
                </form>
              )}
            </div>
          )}
          {replying && !isReply && (
            <div className="mt-2">
              <MentionComposer
                dealId={dealId ?? row.deal_id}
                projectId={projectId ?? row.project_id}
                parentId={row.id}
                contextTitle={contextTitle}
                users={users}
                placeholder="Write a reply…"
                compact
                onPosted={() => setReplying(false)}
              />
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export function UpdatesPanel({
  dealId,
  projectId,
  contextTitle,
  threads,
  users,
  user,
  empty,
  showComposer = true,
}: {
  dealId?: string | null;
  projectId?: string | null;
  contextTitle: string;
  threads: TeamUpdateThread[];
  users: MentionableUser[];
  user: { id: string; role: Role; can_delete: boolean };
  empty?: string;
  showComposer?: boolean;
}) {
  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    if (hash.startsWith("#update-")) {
      document.getElementById(hash.slice(1))?.scrollIntoView({ block: "center" });
    }
  }, []);

  const count = threads.reduce((n, t) => n + 1 + t.replies.length, 0);

  return (
    <section className="card p-4" data-testid="updates-panel">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="font-semibold">Updates</h2>
        <span className="text-xs text-muted">{count} post{count === 1 ? "" : "s"} · questions and answers, newest first</span>
      </div>
      <p className="mb-3 text-xs text-muted">Internal team only. Mentions, replies, and files stay with the deal and remain visible on the project after conversion. Nothing here is sent to the customer.</p>
      {showComposer && (
        <div className="mb-4">
          <MentionComposer dealId={dealId} projectId={projectId} contextTitle={contextTitle} users={users} />
        </div>
      )}
      {threads.length === 0 && <p className="text-sm text-muted">{empty ?? "No updates yet."}</p>}
      <ol className="flex flex-col gap-5">
        {threads.map((thread) => (
          <li key={thread.id} className="border-t border-line pt-4 first:border-t-0 first:pt-0" data-testid="update-thread">
            <Post row={thread} user={user} users={users} dealId={dealId} projectId={projectId} contextTitle={contextTitle} />
            {!!thread.replies.length && (
              <ol className="mt-3 ml-4 flex flex-col gap-3 border-l-2 border-brand-100 pl-4 md:ml-8">
                {thread.replies.map((reply) => (
                  <li key={reply.id}>
                    <Post row={reply} user={user} users={users} dealId={dealId} projectId={projectId} contextTitle={contextTitle} isReply />
                  </li>
                ))}
              </ol>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
