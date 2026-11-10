"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { signInWithPassword } from "@/app/auth-actions";
import { GoogleLogo, Icon } from "@/components/icons";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({ mock, error, next = "/" }: { mock: boolean; error?: string; next?: string }) {
  const [state, action, pending] = useActionState(signInWithPassword, undefined);
  const [gErr, setGErr] = useState<string | null>(null);
  const [gPending, setGPending] = useState(false);

  async function google() {
    if (mock) { document.getElementById("demo-users")?.scrollIntoView({ behavior: "smooth" }); return; }
    setGPending(true);
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      // Standard consumer Google sign-in: any Google account, no hosted-domain (hd) restriction.
      options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`, queryParams: { prompt: "select_account" } },
    });
    if (error) { setGErr(error.message); setGPending(false); }
  }

  const err = state?.error ?? gErr ?? error;
  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={google} disabled={gPending} className="flex w-full items-center justify-center gap-3 rounded-full border border-[#dadce0] bg-white px-4 py-3 text-[15px] font-semibold text-[#3c4043] transition hover:border-[#c6d4f5] hover:bg-[#f8faff] disabled:opacity-60">
        <GoogleLogo />{gPending ? "Opening Google…" : "Sign in with Google"}
      </button>
      <div className="flex items-center gap-3 text-xs text-muted"><div className="h-px flex-1 bg-line" />or use email<div className="h-px flex-1 bg-line" /></div>
      <form action={action} className="flex flex-col gap-3">
        {next !== "/" && <input type="hidden" name="next" value={next} />}
        <label className="label">Email<input className="input" name="email" type="email" autoComplete="email" required placeholder="you@example.com" /></label>
        <label className="label">
          <span className="flex justify-between">Password<Link href="/forgot-password" className="font-semibold text-brand">Forgot password?</Link></span>
          <input className="input" name="password" type="password" autoComplete="current-password" required />
        </label>
        {err && <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>}
        <button className="btn btn-primary py-2.5" disabled={pending}><Icon name="lock" />{pending ? "Signing in…" : "Sign in"}</button>
      </form>
      <p className="text-xs text-muted">New team member? Use <b>Sign in with Google</b> with the email your admin added, or open the invite email to set a password.</p>
    </div>
  );
}
