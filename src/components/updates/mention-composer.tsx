"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { Avatar } from "@/components/ui";
import { filterMentionQuery, mentionToken } from "@/lib/updates/mentions";
import type { MentionableUser } from "@/lib/updates/types";
import { postTeamUpdateAction } from "@/app/(app)/updates/actions";

export function MentionComposer({
  dealId,
  projectId,
  parentId,
  contextTitle,
  users,
  placeholder,
  compact,
  onPosted,
}: {
  dealId?: string | null;
  projectId?: string | null;
  parentId?: string | null;
  contextTitle: string;
  users: MentionableUser[];
  placeholder?: string;
  compact?: boolean;
  onPosted?: () => void;
}) {
  const [body, setBody] = useState("");
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [picker, setPicker] = useState<{ start: number; query: string; index: number } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const matches = picker ? filterMentionQuery(users, picker.query) : [];

  function onChange(value: string, cursor: number) {
    setBody(value);
    const until = value.slice(0, cursor);
    const m = until.match(/(^|[\s])@([A-Za-z0-9' .+-]*)$/);
    if (m) setPicker({ start: cursor - m[2].length, query: m[2], index: 0 });
    else setPicker(null);
  }

  function pick(user: MentionableUser) {
    if (!picker) return;
    const token = mentionToken(user);
    const before = body.slice(0, picker.start);
    const after = body.slice((ta.current?.selectionStart ?? body.length));
    const prefix = before.endsWith("@") ? before.slice(0, -1) : before.replace(/@([A-Za-z0-9' .+-]*)$/, "");
    const next = `${prefix}${token} ${after}`;
    setBody(next);
    setMentionIds((ids) => ids.includes(user.id) ? ids : [...ids, user.id]);
    setPicker(null);
    requestAnimationFrame(() => {
      const el = ta.current;
      if (!el) return;
      const pos = (prefix + token + " ").length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  async function submit() {
    if (!body.trim() && !files.length) return;
    setPending(true);
    setError(null);
    const form = new FormData();
    form.set("body", body);
    form.set("context_title", contextTitle);
    if (dealId) form.set("deal_id", dealId);
    if (projectId) form.set("project_id", projectId);
    if (parentId) form.set("parent_id", parentId);
    for (const id of mentionIds) form.append("mention_ids", id);
    for (const f of files) form.append("files", f);
    try {
      await postTeamUpdateAction(form);
      setBody("");
      setMentionIds([]);
      setFiles([]);
      setPicker(null);
      onPosted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post the update.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={`rounded-lg border border-dashed border-line bg-white ${compact ? "p-2" : "p-3"}`} data-testid={parentId ? "update-reply-composer" : "update-composer"}>
      <div className="relative">
        <textarea
          ref={ta}
          className={`input w-full ${compact ? "min-h-16" : "min-h-24"}`}
          name="body"
          value={body}
          placeholder={placeholder ?? "Post a question or update. Type @ to mention a teammate."}
          onChange={(e) => onChange(e.target.value, e.target.selectionStart ?? 0)}
          onKeyDown={(e) => {
            if (!picker || !matches.length) {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void submit(); }
              return;
            }
            if (e.key === "ArrowDown") { e.preventDefault(); setPicker({ ...picker, index: (picker.index + 1) % matches.length }); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setPicker({ ...picker, index: (picker.index - 1 + matches.length) % matches.length }); }
            else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(matches[picker.index] ?? matches[0]); }
            else if (e.key === "Escape") setPicker(null);
          }}
        />
        {picker && (
          <div className="absolute z-20 mt-1 w-72 overflow-hidden rounded-lg border border-line bg-white shadow-lg" data-testid="mention-picker" role="listbox">
            {matches.length === 0 && <div className="px-3 py-2 text-sm text-muted">No teammates match “{picker.query}”</div>}
            {matches.map((u, i) => (
              <button
                key={u.id}
                type="button"
                role="option"
                aria-selected={i === picker.index}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-canvas ${i === picker.index ? "bg-brand-50" : ""}`}
                onMouseDown={(e) => { e.preventDefault(); pick(u); }}
              >
                <Avatar name={u.name} color={u.color} />
                <span className="min-w-0 flex-1 truncate font-medium">{u.name}</span>
                <span className="truncate text-xs text-muted">{u.email}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {!!files.length && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-1 rounded-full border border-line bg-canvas px-2 py-0.5 text-xs">
              <Icon name="paperclip" className="size-3" />
              <span className="max-w-40 truncate">{f.name}</span>
              <button type="button" className="text-muted hover:text-ink" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                <Icon name="x" className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-2 text-xs text-amber-800">{error}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="btn btn-sm cursor-pointer">
          <Icon name="paperclip" />
          Attach
          <input
            type="file"
            name="files"
            multiple
            className="sr-only"
            onChange={(e) => {
              const next = Array.from(e.target.files ?? []);
              if (next.length) setFiles((prev) => [...prev, ...next]);
              e.currentTarget.value = "";
            }}
          />
        </label>
        <span className="text-xs text-muted"><Icon name="at" className="mr-1 inline size-3" />Mention teammates</span>
        <button type="button" className="btn btn-primary btn-sm ml-auto" disabled={pending || (!body.trim() && !files.length)} onClick={() => void submit()} data-testid="post-update">
          {pending ? "Posting…" : parentId ? "Reply" : "Post update"}
        </button>
      </div>
    </div>
  );
}
