"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MOCK_MODE, assertMockAllowed } from "@/lib/env";
import { MOCK_COOKIE } from "@/lib/auth";
import { siteUrl } from "@/lib/site";

export type FormState = { error?: string; ok?: string } | undefined;
const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

export async function signInWithPassword(_: FormState, fd: FormData): Promise<FormState> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (!emailOk(email) || !password) return { error: "Enter your email and password." };
  if (MOCK_MODE) return { error: "Dev mock mode: pick a demo user below instead (no real passwords)." };
  const { createClient } = await import("@/lib/supabase/server");
  const { error } = await (await createClient()).auth.signInWithPassword({ email, password });
  if (error) return { error: error.message === "Email not confirmed" ? "Please confirm your email first (check your inbox)." : "That email and password don't match. Try again, or use “Forgot password”." };
  redirect("/");
}

/** "Forgot password" and "set my password" both send a reset link. */
export async function sendPasswordReset(_: FormState, fd: FormData): Promise<FormState> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  if (!emailOk(email)) return { error: "Enter a valid email address." };
  const done = { ok: `If ${email} has an account, a link to set a new password is on its way. Check your inbox (and spam).` };
  if (MOCK_MODE) return done;
  const { createClient } = await import("@/lib/supabase/server");
  const base = await siteUrl();
  await (await createClient()).auth.resetPasswordForEmail(email, { redirectTo: `${base}/auth/callback?next=/account/password` });
  return done; // same message either way: don't reveal which emails exist
}

export async function setPassword(_: FormState, fd: FormData): Promise<FormState> {
  const password = String(fd.get("password") ?? "");
  const confirm = String(fd.get("confirm") ?? "");
  if (password.length < 8) return { error: "Use at least 8 characters." };
  if (password !== confirm) return { error: "The two passwords don't match." };
  if (MOCK_MODE) return { ok: "Dev mock mode: password not stored, but the flow works." };
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Your link expired. Request a new one from “Forgot password”." };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  return { ok: "Password saved. You can now sign in with your email and password, or with Google." };
}

/* ----- DEV MOCK MODE only ----- */
export async function mockSignIn(fd: FormData) {
  assertMockAllowed();
  if (!MOCK_MODE) throw new Error("Mock sign-in is only available in dev mock mode");
  const uid = String(fd.get("uid") ?? "");
  (await cookies()).set(MOCK_COOKIE, uid, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect("/");
}
