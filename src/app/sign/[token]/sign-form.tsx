"use client";
import { useRef, useState } from "react";
import { signProposalAction } from "./actions";

export function SignForm({ token }: { token: string }) {
  const [err, setErr] = useState<string | null>(null);
  const [method, setMethod] = useState<"typed" | "drawn">("typed");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  }
  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = true;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = pos(e);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1b2422";
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    setMethod("drawn");
  }

  return (
    <form className="mt-4 flex flex-col gap-3" action={async (fd) => {
      setErr(null);
      if (method === "drawn") fd.set("method", "drawn");
      const res = await signProposalAction(token, fd);
      if (res?.error) setErr(res.error);
    }}>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="consent" value="yes" className="mt-1" required />
        I agree that typing or drawing my name below is my electronic signature, and I consent to do business electronically.
      </label>
      <label className="label">Type your name<input className="input font-serif text-xl" name="signer_name" required placeholder="Full legal name" /></label>
      <div>
        <div className="mb-1 text-sm font-medium">Or draw your signature</div>
        <canvas
          ref={canvasRef}
          width={560}
          height={140}
          className="h-28 w-full touch-none rounded-lg border border-line bg-white"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={() => { drawing.current = false; }}
        />
        <input type="hidden" name="method" value={method} />
      </div>
      {err && <p className="text-sm text-rose-700">{err}</p>}
      <button className="btn btn-primary">Sign proposal</button>
    </form>
  );
}
