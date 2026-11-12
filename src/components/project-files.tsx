"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ProjectFile } from "@/lib/types";
import {
  formatFileSize, isImageFile, kindForFile, PROJECT_FILE_ACCEPT, PROJECT_FILE_KIND_COLOR, PROJECT_FILE_KIND_LABEL,
  sanitizeFilename, validateProjectFile, type ProjectFileKind,
} from "@/lib/project-file";
import { deleteProjectFileAction, uploadProjectFiles } from "@/app/(app)/project-file-actions";
import { Icon } from "./icons";
import { Spinner } from "./spinner";
import { useOptionalNavProgress } from "./nav-progress";

const ICONS: Record<ProjectFileKind, string> = {
  pdf: "M7 3.5h7l5 5V20a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5zM14 3.5V9h5M8.5 16.5v-4H10a1.2 1.2 0 0 1 0 2.4H8.5M13 12.5v4M13 14.5h1.4a1 1 0 0 0 0-2H13",
  xlsx: "M5 3.5h14a1.5 1.5 0 0 1 1.5 1.5v14A1.5 1.5 0 0 1 19 20.5H5A1.5 1.5 0 0 1 3.5 19V5A1.5 1.5 0 0 1 5 3.5zM5 9h14M5 14h14M10 9v11.5",
  xls: "M5 3.5h14a1.5 1.5 0 0 1 1.5 1.5v14A1.5 1.5 0 0 1 19 20.5H5A1.5 1.5 0 0 1 3.5 19V5A1.5 1.5 0 0 1 5 3.5zM5 9h14M5 14h14M10 9v11.5",
  csv: "M5 3.5h14a1.5 1.5 0 0 1 1.5 1.5v14A1.5 1.5 0 0 1 19 20.5H5A1.5 1.5 0 0 1 3.5 19V5A1.5 1.5 0 0 1 5 3.5zM5 9h14M5 14h14M10 9v11.5",
  image: "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM8.5 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM4 17l5-5 3 3 3-4 5 6",
};

export function FileTypeIcon({ kind, className = "size-9" }: { kind: ProjectFileKind; className?: string }) {
  const color = PROJECT_FILE_KIND_COLOR[kind];
  return (
    <span className={`grid shrink-0 place-items-center rounded-lg text-white ${className}`} style={{ background: color }} title={PROJECT_FILE_KIND_LABEL[kind]} aria-hidden>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-[18px]">
        <path d={ICONS[kind]} />
      </svg>
    </span>
  );
}

function TypeTags() {
  const kinds: ProjectFileKind[] = ["pdf", "xlsx", "csv", "image"];
  return (
    <div className="mt-2 flex flex-wrap justify-center gap-1.5">
      {kinds.map((k) => (
        <span key={k} className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-2 py-0.5 text-[11.5px] font-semibold text-muted">
          <FileTypeIcon kind={k} className="size-4 rounded" />
          {PROJECT_FILE_KIND_LABEL[k]}{k === "image" ? "s" : k === "xlsx" ? "" : ""}
        </span>
      ))}
    </div>
  );
}

function DropSurface({ onFiles, browseLabel, disabled, testId }: { onFiles: (files: File[]) => void; browseLabel: string; disabled?: boolean; testId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  function take(list: FileList | File[] | null) {
    if (!list) return;
    const files = [...list];
    if (files.length) onFiles(files);
    if (inputRef.current) inputRef.current.value = "";
  }
  return (
    <div
      className={`rounded-xl border border-dashed px-4 py-6 text-center ${over ? "border-brand bg-brand-50" : "border-line bg-[#fafbf9]"} ${disabled ? "opacity-60" : ""}`}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled) take(e.dataTransfer.files); }}
    >
      <Icon name="upload" className="mx-auto size-5 text-muted" />
      <div className="mt-1.5 text-sm font-semibold">Drop files here, or browse</div>
      <div className="mt-0.5 text-[12.5px] text-muted">PDFs, Excel (xlsx, xls, csv), and images. Multiple files are fine.</div>
      <TypeTags />
      <button type="button" className="btn btn-sm mt-3" disabled={disabled} onClick={() => inputRef.current?.click()}>
        <Icon name="plus" className="size-3.5" />{browseLabel}
      </button>
      <input ref={inputRef} type="file" accept={PROJECT_FILE_ACCEPT} multiple className="hidden" data-testid={testId} disabled={disabled} onChange={(e) => take(e.target.files)} />
    </div>
  );
}

/** Staged attachments on the New project form. Files go out with the form as `attachments`. */
export function ProjectFilePicker({ name = "attachments" }: { name?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);

  function sync(next: File[]) {
    setFiles(next);
    const input = inputRef.current;
    if (!input) return;
    const dt = new DataTransfer();
    for (const f of next) dt.items.add(f);
    input.files = dt.files;
  }

  function add(incoming: File[]) {
    const kept = [...files];
    const messages: string[] = [];
    for (const file of incoming) {
      const err = validateProjectFile(file);
      if (err) { messages.push(err); continue; }
      if (kept.some((x) => x.name === file.name && x.size === file.size)) continue;
      kept.push(file);
    }
    setError(messages[0] ?? null);
    sync(kept);
  }

  function remove(index: number) {
    sync(files.filter((_, i) => i !== index));
  }

  return (
    <div className="min-w-0" data-testid="project-file-picker">
      <input ref={inputRef} type="file" name={name} accept={PROJECT_FILE_ACCEPT} multiple className="hidden" aria-hidden />
      <DropSurface onFiles={add} browseLabel="Browse files" testId="project-file-picker-input" />
      {error && <div role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
      {files.length > 0 && (
        <ul className="mt-2.5 divide-y divide-line overflow-hidden rounded-[10px] border border-line bg-white" data-testid="project-file-staged">
          {files.map((file, i) => {
            const kind = kindForFile(file)!;
            return (
              <li key={`${file.name}-${i}`} className="flex min-w-0 items-center gap-2.5 px-3 py-2.5">
                <StagedIcon file={file} kind={kind} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-semibold">{sanitizeFilename(file.name)}</div>
                  <div className="truncate text-xs text-muted">{formatFileSize(file.size)}</div>
                </div>
                <button type="button" className="btn btn-sm shrink-0" title="Remove" aria-label={`Remove ${file.name}`} data-testid="project-file-remove" onClick={() => remove(i)}>
                  <Icon name="x" className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function StagedIcon({ file, kind }: { file: File; kind: ProjectFileKind }) {
  const url = useMemo(() => (kind === "image" ? URL.createObjectURL(file) : null), [file, kind]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  if (kind === "image" && url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- local object URL thumbnail
      <img src={url} alt="" className="size-9 shrink-0 rounded-lg border border-line object-cover" />
    );
  }
  return <FileTypeIcon kind={kind} />;
}

function FileRow({ file, canDelete, canOpen, onDelete, deleting }: {
  file: ProjectFile; canDelete: boolean; canOpen?: boolean; onDelete?: () => void; deleting?: boolean;
}) {
  const kind = kindForFile({ name: file.filename, type: file.mime }) ?? "pdf";
  const thumb = isImageFile(file) && file.url ? (
    // eslint-disable-next-line @next/next/no-img-element -- signed Storage or mock preview URL
    <img src={file.url} alt="" className="size-9 shrink-0 rounded-lg border border-line object-cover" />
  ) : <FileTypeIcon kind={kind} />;
  return (
    <li className="flex min-w-0 items-center gap-2.5 px-3 py-2.5" data-testid={`project-file-row-${file.id}`}>
      {thumb}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-semibold">{file.filename}</div>
        <div className="truncate text-xs text-muted">
          {formatFileSize(file.size_bytes)}
          {file.uploader_name ? ` · ${file.uploader_name}` : ""}
          {file.created_at ? ` · ${new Date(file.created_at).toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric" })}` : ""}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {canOpen && file.url && (
          <a href={file.url} target="_blank" rel="noopener" className="btn btn-sm" title="Open" aria-label={`Open ${file.filename}`}>
            <Icon name="open" className="size-4" />
          </a>
        )}
        <a href={file.download_url || file.url} download={file.filename} className="btn btn-sm" title="Download" aria-label={`Download ${file.filename}`} data-testid="project-file-download">
          <Icon name="download" className="size-4" />
        </a>
        {canDelete && (
          <button type="button" className="btn btn-sm btn-danger" title="Delete" aria-label={`Delete ${file.filename}`} data-testid="project-file-delete" disabled={deleting} onClick={onDelete}>
            {deleting ? <Spinner /> : <Icon name="trash" className="size-4" />}
          </button>
        )}
      </div>
    </li>
  );
}

/** Saved documents on a project or visit, with optional drop zone. */
export function ProjectFilePanel({
  files, projectId, jobId, canUpload, canDelete, canOpen, browseLabel, empty,
}: {
  files: ProjectFile[];
  projectId: string;
  jobId?: string | null;
  canUpload?: boolean;
  canDelete?: boolean;
  canOpen?: boolean;
  browseLabel?: string;
  empty?: string;
}) {
  const router = useRouter();
  const nav = useOptionalNavProgress();
  const [, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function onFiles(incoming: File[]) {
    if (!incoming.length) return;
    setErr(null);
    nav?.start();
    try {
      const fd = new FormData();
      fd.set("project_id", projectId);
      if (jobId) fd.set("job_id", jobId);
      for (const file of incoming) {
        const msg = validateProjectFile(file);
        if (msg) { setErr(msg); return; }
        fd.append("files", file);
      }
      setBusy(`Uploading ${incoming.length} file${incoming.length > 1 ? "s" : ""}…`);
      const res = await uploadProjectFiles(fd);
      if (res?.error) setErr(res.error);
      start(() => router.refresh());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
      nav?.done();
    }
  }

  async function onDelete(id: string) {
    setErr(null);
    setDeleting(id);
    try {
      const res = await deleteProjectFileAction(id, { projectId, jobId });
      if (res?.error) setErr(res.error);
      start(() => router.refresh());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="min-w-0">
      {canUpload && <DropSurface onFiles={onFiles} browseLabel={browseLabel ?? "Add documents"} disabled={!!busy} testId={jobId ? "visit-file-input" : "project-file-input"} />}
      {busy && <div className="mt-2 text-sm text-muted">{busy}</div>}
      {err && <div role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>}
      {files.length > 0 && (
        <ul className={`${canUpload ? "mt-2.5" : ""} divide-y divide-line overflow-hidden rounded-[10px] border border-line bg-white`}>
          {files.map((file) => (
            <FileRow
              key={file.id}
              file={file}
              canDelete={!!canDelete}
              canOpen={canOpen}
              deleting={deleting === file.id}
              onDelete={() => onDelete(file.id)}
            />
          ))}
        </ul>
      )}
      {files.length === 0 && !canUpload && empty && <div className="text-sm text-muted">{empty}</div>}
    </div>
  );
}
