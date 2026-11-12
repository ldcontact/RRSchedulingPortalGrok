"use client";
import { useState } from "react";

function label(iso: string) {
  const d = new Date(iso.length <= 19 && !iso.endsWith("Z") ? iso : iso);
  return d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function BookForm({ token, slots }: { token: string; slots: { starts_at: string; ends_at: string }[] }) {
  const [picked, setPicked] = useState<string>("");
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (done) return <p className="mt-4 text-sm">{done} A confirmation text is saved as a draft for your rep to send — it is not sent automatically.</p>;
  return (
    <form className="mt-4 flex flex-col gap-3" onSubmit={async (e) => {
      e.preventDefault();
      const slot = slots.find((s) => s.starts_at === picked);
      if (!slot) { setErr("Pick a time."); return; }
      setBusy(true); setErr(null);
      const res = await fetch("/api/sales/booking", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, starts_at: slot.starts_at, ends_at: slot.ends_at }) });
      const json = await res.json().catch(() => ({}));
      setBusy(false);
      if (!res.ok) { setErr(json.error ?? "Could not book."); return; }
      setDone(`You're booked for ${label(slot.starts_at)}.`);
    }}>
      {slots.length === 0 && <p className="text-sm text-muted">No open windows in the next two weeks. Please call the office.</p>}
      <div className="flex flex-col gap-1">
        {slots.map((s) => (
          <label key={s.starts_at} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${picked === s.starts_at ? "border-brand bg-brand-50" : "border-line"}`}>
            <input type="radio" name="slot" value={s.starts_at} onChange={() => setPicked(s.starts_at)} />
            {label(s.starts_at)} – {label(s.ends_at).replace(/^.*,\s*/, "")}
          </label>
        ))}
      </div>
      {err && <p className="text-sm text-rose-700">{err}</p>}
      <button className="btn btn-primary" disabled={busy || !slots.length}>{busy ? "Booking…" : "Confirm assessment"}</button>
    </form>
  );
}
