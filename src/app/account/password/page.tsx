"use client";
import Link from "next/link";
import { useActionState } from "react";
import { setPassword } from "@/app/auth-actions";
import { AuthLayout } from "@/components/auth-layout";
import { Icon } from "@/components/icons";

/** Landing page for invite + password-reset links (the link signs the user in first). */
export default function SetPasswordPage() {
  const [state, action, pending] = useActionState(setPassword, undefined);
  return (
    <AuthLayout>
      <div><h1 className="text-[26px] font-semibold tracking-tight">Set your password</h1><p className="mt-1 text-muted">Choose a password for email sign-in. You can still use Sign in with Google with the same email.</p></div>
      {state?.ok ? (
        <><div className="rounded-lg bg-green-100 px-3.5 py-3 text-sm text-green-900">{state.ok}</div><Link href="/" className="btn btn-primary py-2.5">Continue to RR Scheduler</Link></>
      ) : (
        <form action={action} className="flex flex-col gap-3">
          <label className="label">New password<input className="input" name="password" type="password" autoComplete="new-password" minLength={8} required autoFocus /></label>
          <label className="label">Confirm password<input className="input" name="confirm" type="password" autoComplete="new-password" minLength={8} required /></label>
          {state?.error && <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</div>}
          <button className="btn btn-primary py-2.5" disabled={pending}><Icon name="lock" />{pending ? "Saving…" : "Save password"}</button>
        </form>
      )}
    </AuthLayout>
  );
}
