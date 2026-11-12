"use client";
import Link from "next/link";
import { useActionState } from "react";
import { sendPasswordReset } from "@/app/auth-actions";
import { AuthLayout } from "@/components/auth-layout";
import { Icon } from "@/components/icons";
import { SubmitButton } from "@/components/submit-button";

export default function ForgotPasswordPage() {
  const [state, action] = useActionState(sendPasswordReset, undefined);
  return (
    <AuthLayout>
      <div><h1 className="text-[26px] font-semibold tracking-tight">Reset your password</h1><p className="mt-1 text-muted">We&apos;ll email you a link to set a new password. This also works if you signed in with Google before and want a password too.</p></div>
      {state?.ok ? (
        <div className="rounded-lg bg-green-100 px-3.5 py-3 text-sm text-green-900">{state.ok}</div>
      ) : (
        <form action={action} className="flex flex-col gap-3">
          <label className="label">Email<input className="input" name="email" type="email" autoComplete="email" required autoFocus /></label>
          {state?.error && <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</div>}
          <SubmitButton className="btn btn-primary py-2.5" pendingText="Sending…"><Icon name="send" />Email me a reset link</SubmitButton>
        </form>
      )}
      <Link href="/login" className="text-sm font-semibold text-brand">← Back to sign in</Link>
    </AuthLayout>
  );
}
