"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "./ui";
import { Icon } from "./icons";

/** Center-crop to square and downscale for avatar upload. */
async function cropSquare(file: File, size = 512): Promise<File> {
  if (!file.type.startsWith("image/")) throw new Error(`${file.name} is not an image`);
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const side = Math.min(bmp.width, bmp.height);
  const sx = Math.floor((bmp.width - side) / 2);
  const sy = Math.floor((bmp.height - side) / 2);
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  canvas.getContext("2d")!.drawImage(bmp, sx, sy, side, side, 0, 0, size, size);
  bmp.close();
  const blob = await new Promise<Blob>((ok, bad) => canvas.toBlob((b) => (b ? ok(b) : bad(new Error("resize failed"))), "image/jpeg", 0.85));
  return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
}

type Props = {
  name: string;
  color: string;
  src?: string | null;
  hasGoogle?: boolean;
  source?: string;
  /** Server action: FormData with optional "file", "avatar_source", "clear" */
  action: (fd: FormData) => Promise<{ error?: string; ok?: string } | void>;
  /** Hidden fields for targeting another member (admin). */
  hidden?: Record<string, string>;
  compact?: boolean;
};

export function AvatarEditor({ name, color, src, hasGoogle, source, action, hidden, compact }: Props) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [, start] = useTransition();

  async function run(fd: FormData) {
    setErr(null); setMsg(null);
    if (hidden) for (const [k, v] of Object.entries(hidden)) fd.set(k, v);
    setBusy("Saving…");
    try {
      const res = await action(fd);
      if (res && "error" in res && res.error) setErr(res.error);
      else setMsg((res && "ok" in res && res.ok) || "Saved.");
      start(() => router.refresh());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
      if (ref.current) ref.current.value = "";
    }
  }

  async function onFile(list: FileList | null) {
    if (!list?.[0]) return;
    try {
      const file = await cropSquare(list[0]);
      if (file.size > 5 * 1024 * 1024) { setErr("Image must be under 5 MB."); return; }
      const fd = new FormData();
      fd.set("file", file);
      fd.set("avatar_source", "upload");
      await run(fd);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <div className={`flex ${compact ? "flex-col gap-2" : "flex-col gap-3 sm:flex-row sm:items-center"}`}>
      <Avatar name={name} color={color} src={src} size="lg" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-sm" disabled={!!busy} onClick={() => ref.current?.click()}>
            <Icon name="image" className="size-4" />{src && source === "upload" ? "Replace photo" : "Upload photo"}
          </button>
          {hasGoogle && (
            <button type="button" className="btn btn-sm" disabled={!!busy || source === "google"} onClick={() => { const fd = new FormData(); fd.set("avatar_source", "google"); void run(fd); }}>
              Use Google photo
            </button>
          )}
          {(src || source === "google" || source === "upload") && (
            <button type="button" className="btn btn-sm" disabled={!!busy} onClick={() => { const fd = new FormData(); fd.set("clear", "1"); void run(fd); }}>
              Remove
            </button>
          )}
        </div>
        <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void onFile(e.target.files)} />
        {busy && <div className="text-xs text-muted">{busy}</div>}
        {err && <div role="alert" className="text-xs text-red-700">{err}</div>}
        {msg && !err && <div className="text-xs text-green-800">{msg}</div>}
        {!hasGoogle && <div className="text-[11px] text-muted">Google photo appears after they sign in with Google.</div>}
      </div>
    </div>
  );
}
