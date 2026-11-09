"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./icons";
import type { Photo, PhotoKind } from "@/lib/types";
import { deletePhoto, uploadPhotos } from "@/app/(app)/photo-actions";

/** Downscale on the device before upload (phone photos are 3-12 MB): longest side 1600px, JPEG q=0.8. */
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

export function PhotoUploader({ projectId, jobId, kind, label }: { projectId: string; jobId?: string; kind: PhotoKind; label?: string }) {
  const router = useRouter();
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [, start] = useTransition();

  async function onFiles(list: FileList | null) {
    if (!list?.length) return;
    setErr(null);
    try {
      const files = [...list];
      const fd = new FormData();
      fd.set("project_id", projectId); fd.set("kind", kind); if (jobId) fd.set("job_id", jobId);
      for (let i = 0; i < files.length; i++) { setBusy(`Preparing ${i + 1}/${files.length}…`); fd.append("files", await resize(files[i])); }
      setBusy(`Uploading ${files.length} photo${files.length > 1 ? "s" : ""}…`);
      const res = await uploadPhotos(fd);
      if (res?.error) setErr(res.error);
      start(() => router.refresh());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
      if (camRef.current) camRef.current.value = "";
      if (galRef.current) galRef.current.value = "";
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => camRef.current?.click()}><Icon name="camera" />{label ?? "Take photo"}</button>
        <button type="button" className="btn" disabled={!!busy} onClick={() => galRef.current?.click()}><Icon name="image" />Choose from gallery</button>
        <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" data-testid={`camera-${kind}`} onChange={(e) => onFiles(e.target.files)} />
        <input ref={galRef} type="file" accept="image/*" multiple className="hidden" data-testid={`gallery-${kind}`} onChange={(e) => onFiles(e.target.files)} />
      </div>
      {busy && <div className="text-sm text-muted">{busy}</div>}
      {err && <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>}
    </div>
  );
}

export function PhotoGrid({ photos, canDelete = false, empty, jobId, projectId }: { photos: Photo[]; canDelete?: boolean; empty?: string; jobId?: string | null; projectId?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState<Photo | null>(null);
  if (!photos.length) return <div className="rounded-lg border border-dashed border-line p-5 text-center text-sm text-muted">{empty ?? "No photos yet."}</div>;
  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {photos.map((p) => (
          <button key={p.id} type="button" onClick={() => setOpen(p)} className="group relative aspect-[4/3] overflow-hidden rounded-lg border border-line bg-canvas">
            {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URLs, already resized client-side */}
            <img src={p.url} alt={p.caption ?? "Photo"} loading="lazy" className="size-full object-cover transition group-hover:scale-[1.03]" />
            {p.caption && <span className="absolute inset-x-0 bottom-0 truncate bg-black/45 px-1.5 py-0.5 text-left text-[10.5px] text-white">{p.caption}</span>}
          </button>
        ))}
      </div>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" onClick={() => setOpen(null)} role="dialog">
          <div className="flex max-h-full w-full max-w-3xl flex-col gap-2" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={open.url} alt={open.caption ?? "Photo"} className="max-h-[78vh] w-full rounded-lg object-contain" />
            <div className="flex items-center gap-2 text-sm text-white">
              <span className="flex-1">{open.caption}</span>
              {canDelete && <button className="btn btn-sm btn-danger" onClick={async () => { await deletePhoto(open.id, { jobId: jobId ?? open.job_id, projectId: projectId ?? open.project_id }); setOpen(null); router.refresh(); }}><Icon name="trash" />Delete</button>}
              <button className="btn btn-sm" onClick={() => setOpen(null)}><Icon name="x" />Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
