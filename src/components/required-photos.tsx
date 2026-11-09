"use client";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "./icons";
import { SubmitButton } from "./submit-button";
import type { Photo, PhotoRequirement } from "@/lib/types";
import { deletePhoto, uploadPhotos } from "@/app/(app)/photo-actions";
import { addJobNote, submitJob } from "@/app/(app)/jobs/actions";

async function resize(file: File, max = 1600): Promise<File> {
  if (!file.type.startsWith("image/")) throw new Error(`${file.name} is not an image`);
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const blob = await new Promise<Blob>((ok, bad) => canvas.toBlob((b) => (b ? ok(b) : bad(new Error("resize failed"))), "image/jpeg", 0.8));
  return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
}

type Props = {
  jobId: string;
  projectId: string;
  projectName: string;
  jobTitle: string;
  visitWhen: string;
  requirements: PhotoRequirement[];
  photos: Photo[];
  noteCount: number;
  canEdit: boolean;
  canDelete: boolean;
};

export function RequiredPhotosScreen({
  jobId, projectId, projectName, jobTitle, visitWhen, requirements, photos, noteCount, canEdit, canDelete,
}: Props) {
  const router = useRouter();
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const [targetReq, setTargetReq] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<Photo | null>(null);
  const [, start] = useTransition();

  const byReq = useMemo(() => {
    const m = new Map<string, Photo[]>();
    for (const r of requirements) m.set(r.id, []);
    for (const p of photos) {
      if (p.requirement_id && m.has(p.requirement_id)) m.get(p.requirement_id)!.push(p);
    }
    return m;
  }, [requirements, photos]);

  const doneCount = requirements.filter((r) => (byReq.get(r.id)?.length ?? 0) > 0).length;
  const missing = requirements.filter((r) => !(byReq.get(r.id)?.length));
  const next = missing[0] ?? null;
  const allDone = missing.length === 0 && requirements.length > 0;
  const readyToSubmit = allDone && noteCount > 0;

  function openPicker(reqId: string, mode: "camera" | "gallery") {
    if (!canEdit) return;
    setTargetReq(reqId);
    setErr(null);
    // next tick so refs see the intent
    queueMicrotask(() => (mode === "camera" ? camRef : galRef).current?.click());
  }

  async function onFiles(list: FileList | null) {
    if (!list?.length || !targetReq) return;
    setErr(null);
    try {
      const files = [...list];
      const fd = new FormData();
      fd.set("project_id", projectId);
      fd.set("job_id", jobId);
      fd.set("kind", "completion");
      fd.set("requirement_id", targetReq);
      for (let i = 0; i < files.length; i++) {
        setBusy(`Preparing ${i + 1}/${files.length}…`);
        fd.append("files", await resize(files[i]));
      }
      setBusy(`Uploading ${files.length} photo${files.length > 1 ? "s" : ""}…`);
      const res = await uploadPhotos(fd);
      if (res?.error) setErr(res.error);
      start(() => router.refresh());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
      setTargetReq(null);
      if (camRef.current) camRef.current.value = "";
      if (galRef.current) galRef.current.value = "";
    }
  }

  async function remove(p: Photo) {
    setErr(null);
    const res = await deletePhoto(p.id, { jobId, projectId });
    if (res?.error) setErr(res.error);
    else { setOpen(null); start(() => router.refresh()); }
  }

  const missingLine = missing.length === 0
    ? null
    : missing.length === 1
      ? `1 photo still needed: ${missing[0].label}`
      : `${missing.length} photos still needed: ${missing.map((m) => m.label).join(", ")}`;

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-7rem)] max-w-lg flex-col" data-testid="required-photos">
      <div className="mb-4">
        <Link href={`/jobs/${jobId}`} className="mb-2.5 inline-flex items-center gap-1 font-medium text-muted hover:text-ink">
          <Icon name="left" />Back
        </Link>
        <h1 className="text-[22px] font-semibold tracking-tight">Required photos</h1>
        <div className="mt-0.5 text-muted">{projectName} · {jobTitle}</div>
      </div>

      {/* Summary */}
      <div className="card mb-4 overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-4 pt-4">
          <div>
            <div className="text-[15px] font-semibold">{doneCount} of {requirements.length} photos done</div>
            {missingLine && <div className="mt-1 text-[13px] font-medium text-orange-700">{missingLine}</div>}
            {!missingLine && <div className="mt-1 text-[13px] font-medium text-green-700">All required photos captured</div>}
          </div>
          <div className="shrink-0 text-right text-[12px] text-muted">{visitWhen}</div>
        </div>
        <div className="flex gap-1 px-4 py-3">
          {requirements.map((r) => {
            const done = (byReq.get(r.id)?.length ?? 0) > 0;
            return <div key={r.id} className={`h-2 flex-1 rounded-full ${done ? "bg-green-500" : "bg-slate-200"}`} title={r.label} />;
          })}
        </div>
      </div>

      {err && <div role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>}
      {busy && <div className="mb-3 text-sm text-muted">{busy}</div>}

      <div className="flex flex-1 flex-col gap-3 pb-28">
        {requirements.map((r) => {
          const shots = byReq.get(r.id) ?? [];
          const done = shots.length > 0;
          return (
            <div key={r.id} className="card p-3.5" data-testid={`req-${r.id}`}>
              <div className="mb-2.5 flex items-center gap-2.5">
                <span className={`grid size-7 place-items-center rounded-full ${done ? "bg-green-500 text-white" : "border-2 border-slate-300 bg-white text-transparent"}`}>
                  <Icon name="check" className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{r.label}</div>
                  {r.note && <div className="truncate text-xs text-muted">{r.note}</div>}
                </div>
                <span className={`text-sm font-semibold ${done ? "text-green-700" : "text-muted"}`}>
                  {shots.length === 0 ? "0 photos" : shots.length === 1 ? "1 photo" : `${shots.length} photos`}
                </span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-0.5">
                {shots.map((p) => (
                  <div key={p.id} className="relative size-20 shrink-0 overflow-hidden rounded-xl border border-line bg-canvas">
                    <button type="button" className="size-full" onClick={() => setOpen(p)} aria-label="View photo">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt={r.label} className="size-full object-cover" />
                    </button>
                    {canDelete && (
                      <button
                        type="button"
                        aria-label="Remove photo"
                        className="absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-black/70 text-white shadow"
                        onClick={() => remove(p)}
                      >
                        <Icon name="x" className="size-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => openPicker(r.id, "gallery")}
                    className="flex size-20 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-dashed border-slate-300 bg-canvas text-muted hover:border-brand hover:text-brand"
                    aria-label={`Add photo for ${r.label}`}
                    data-testid={`add-${r.id}`}
                  >
                    <Icon name="plus" className="size-5" />
                    <span className="text-[11px] font-semibold">Add</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* Note + submit when checklist complete (or always show note) */}
        {canEdit && (
          <div className="card p-4">
            <div className="mb-2 text-sm font-semibold">Completion note {noteCount > 0 ? <span className="font-normal text-green-700">· {noteCount} added</span> : <span className="font-normal text-muted">· required</span>}</div>
            <form action={addJobNote.bind(null, jobId)} className="flex flex-col gap-2">
              <textarea name="body" required className="input min-h-20" placeholder="What did you do? Fixture counts, issues, anything the office should know…" aria-label="Note" />
              <SubmitButton className="btn self-start"><Icon name="note" />Add note</SubmitButton>
            </form>
          </div>
        )}
      </div>

      {/* Sticky action */}
      {canEdit && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="pointer-events-auto w-full max-w-lg">
            {allDone ? (
              readyToSubmit ? (
                <form action={submitJob.bind(null, jobId)}>
                  <SubmitButton className="btn btn-primary w-full py-3.5 text-base shadow-lg" pendingText="Submitting…">
                    <Icon name="flag" />Mark complete &amp; submit for review
                  </SubmitButton>
                </form>
              ) : (
                <button type="button" className="btn w-full cursor-not-allowed bg-[#1f2937] py-3.5 text-base text-white/80 shadow-lg" disabled>
                  <Icon name="note" />Add a note above to finish
                </button>
              )
            ) : (
              <button
                type="button"
                className="btn w-full bg-[#1f2937] py-3.5 text-base text-white shadow-lg hover:bg-[#111827]"
                disabled={!!busy || !next}
                onClick={() => next && openPicker(next.id, "camera")}
                data-testid="take-next"
              >
                <Icon name="camera" />
                Take photo · {next?.label ?? "…"}
              </button>
            )}
          </div>
        </div>
      )}

      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" data-testid="camera-req" onChange={(e) => onFiles(e.target.files)} />
      <input ref={galRef} type="file" accept="image/*" multiple className="hidden" data-testid="gallery-req" onChange={(e) => onFiles(e.target.files)} />

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" onClick={() => setOpen(null)} role="dialog">
          <div className="flex max-h-full w-full max-w-3xl flex-col gap-2" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={open.url} alt={open.caption ?? "Photo"} className="max-h-[78vh] w-full rounded-lg object-contain" />
            <div className="flex items-center gap-2 text-sm text-white">
              <span className="flex-1">{open.caption}</span>
              {canDelete && (
                <button className="btn btn-sm btn-danger" onClick={() => remove(open)}><Icon name="trash" />Delete</button>
              )}
              <button className="btn btn-sm" onClick={() => setOpen(null)}><Icon name="x" />Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
