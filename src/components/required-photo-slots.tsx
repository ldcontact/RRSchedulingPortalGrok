"use client";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "./icons";
import { Spinner } from "./spinner";
import { useOptionalNavProgress } from "./nav-progress";
import type { Photo, PhotoRequirement } from "@/lib/types";
import { deletePhoto, uploadPhotos } from "@/app/(app)/photo-actions";

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

/** Checklist of required photos on a visit: each item shows captured shots or an upload slot. */
export function RequiredPhotoSlots({
  jobId, projectId, requirements, photos, canEdit, canDelete,
}: {
  jobId: string; projectId: string; requirements: PhotoRequirement[]; photos: Photo[]; canEdit: boolean; canDelete: boolean;
}) {
  const router = useRouter();
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const [targetReq, setTargetReq] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<Photo | null>(null);
  const [, start] = useTransition();
  const nav = useOptionalNavProgress();

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

  function openPicker(reqId: string, mode: "camera" | "gallery") {
    if (!canEdit) return;
    setTargetReq(reqId);
    setErr(null);
    queueMicrotask(() => (mode === "camera" ? camRef : galRef).current?.click());
  }

  async function onFiles(list: FileList | null) {
    if (!list?.length || !targetReq) return;
    setErr(null);
    nav?.start();
    try {
      const files = [...list];
      const fd = new FormData();
      fd.set("project_id", projectId);
      fd.set("job_id", jobId);
      fd.set("kind", "completion");
      fd.set("phase", "required");
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
      nav?.done();
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

  return (
    <div className="flex flex-col gap-3" data-testid="required-photo-slots">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium">{doneCount} of {requirements.length} done</div>
        <Link href={`/jobs/${jobId}/required-photos`} className="text-xs font-semibold text-brand">Open required photos</Link>
      </div>
      <div className="flex gap-1">
        {requirements.map((r) => {
          const ok = (byReq.get(r.id)?.length ?? 0) > 0;
          return <div key={r.id} className={`h-2 flex-1 rounded-full ${ok ? "bg-green-500" : "bg-slate-200"}`} title={r.label} />;
        })}
      </div>
      {missing.length > 0
        ? <p className="text-sm font-medium text-orange-700">{missing.length === 1 ? `1 photo still needed: ${missing[0].label}` : `${missing.length} photos still needed: ${missing.map((m) => m.label).join(", ")}`}</p>
        : <p className="text-sm font-medium text-green-700">All required photos captured</p>}
      {err && <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>}
      {busy && <div className="text-sm text-muted">{busy}</div>}
      {requirements.map((r) => {
        const shots = byReq.get(r.id) ?? [];
        const done = shots.length > 0;
        return (
          <div key={r.id} className="rounded-lg border border-line p-3" data-testid={`req-${r.id}`}>
            <div className="mb-2 flex items-center gap-2">
              <span className={`grid size-6 shrink-0 place-items-center rounded-full ${done ? "bg-green-500 text-white" : "border-2 border-slate-300 bg-white text-transparent"}`}>
                <Icon name="check" className="size-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <div className="truncate text-sm font-semibold">{r.label}</div>
                  {!r.job_id && <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-muted">From project</span>}
                </div>
                {r.note && <div className="truncate text-xs text-muted">{r.note}</div>}
              </div>
            </div>
            <div className="flex gap-2 overflow-x-auto">
              {shots.map((p) => (
                <div key={p.id} className="relative size-20 shrink-0 overflow-hidden rounded-xl border border-line bg-canvas">
                  <button type="button" className="size-full" onClick={() => setOpen(p)} aria-label={`View ${r.label} photo`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={r.label} className="size-full object-cover" />
                  </button>
                  {canDelete && (
                    <button type="button" aria-label="Remove photo" className="absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-black/70 text-white" onClick={() => remove(p)}>
                      <Icon name="x" className="size-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {canEdit && (
                <>
                  <button type="button" onClick={() => openPicker(r.id, "camera")} disabled={!!busy} aria-busy={busy != null && targetReq === r.id} className="flex size-20 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-dashed border-slate-300 bg-canvas text-muted hover:border-brand hover:text-brand disabled:opacity-70" aria-label={`Take photo for ${r.label}`}>
                    {busy && targetReq === r.id ? <Spinner className="size-5" /> : <Icon name="camera" className="size-5" />}
                    <span className="text-[11px] font-semibold">{busy && targetReq === r.id ? (busy.startsWith("Uploading") ? "Uploading…" : "Preparing…") : "Camera"}</span>
                  </button>
                  <button type="button" onClick={() => openPicker(r.id, "gallery")} disabled={!!busy} className="flex size-20 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-dashed border-slate-300 bg-canvas text-muted hover:border-brand hover:text-brand disabled:opacity-70" aria-label={`Add photo for ${r.label}`} data-testid={`add-${r.id}`}>
                    <Icon name="plus" className="size-5" /><span className="text-[11px] font-semibold">Add</span>
                  </button>
                </>
              )}
              {!canEdit && shots.length === 0 && <div className="flex size-20 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-line text-center text-[11px] text-muted">No photo yet</div>}
            </div>
          </div>
        );
      })}
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" data-testid="camera-required" onChange={(e) => onFiles(e.target.files)} />
      <input ref={galRef} type="file" accept="image/*" multiple className="hidden" data-testid="gallery-required" onChange={(e) => onFiles(e.target.files)} />
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" onClick={() => setOpen(null)} role="dialog">
          <div className="flex max-h-full w-full max-w-3xl flex-col gap-2" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={open.url} alt={open.caption ?? "Photo"} className="max-h-[78vh] w-full rounded-lg object-contain" />
            <div className="flex flex-wrap items-center gap-2 text-sm text-white">
              <span className="min-w-0 flex-1"><span className="block text-xs text-white/70">Uploaded by {open.uploader_name}</span></span>
              {canDelete && <button className="btn btn-sm btn-danger" onClick={() => remove(open)}><Icon name="trash" />Delete</button>}
              <button className="btn btn-sm" onClick={() => setOpen(null)}><Icon name="x" />Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
