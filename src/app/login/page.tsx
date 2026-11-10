import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthLayout } from "@/components/auth-layout";
import { Avatar, MockBadge, RolePill } from "@/components/ui";
import { MOCK_MODE } from "@/lib/env";
import { getSessionUser } from "@/lib/auth";
import { mockSignIn } from "@/app/auth-actions";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const user = await getSessionUser();
  if (user) redirect(user.role ? "/" : "/not-invited");
  const { error } = await searchParams;
  const demo = MOCK_MODE ? (await import("@/lib/data/mock-repo")).mockProfiles() : [];
  return (
    <AuthLayout>
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-1 text-muted">Sign in with Google or your email and password.</p>
      </div>
      <LoginForm mock={MOCK_MODE} error={typeof error === "string" ? error : undefined} />
      {MOCK_MODE && (
        <div id="demo-users" className="rounded-xl border border-dashed border-amber-300 bg-amber-50/60 p-3">
          <div className="mb-2 flex items-center justify-between"><MockBadge /><span className="text-xs text-amber-800">Pick a demo user (no real auth)</span></div>
          <div className="flex flex-col gap-1.5">
            {demo.map((p) => (
              <form key={p.id} action={mockSignIn}>
                <input type="hidden" name="uid" value={p.id} />
                <button className="flex w-full items-center gap-3 rounded-lg border border-line bg-white px-3 py-2 text-left hover:border-brand hover:bg-brand-50">
                  <Avatar name={p.full_name} color={p.color} size="sm" src={p.avatar_source === "upload" && p.avatar_path ? `/api/mock-photo/${p.avatar_path}` : p.google_avatar_url} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{p.full_name}</span><span className="block truncate text-xs text-muted">{p.email}</span></span>
                  <RolePill role={p.role} />
                </button>
              </form>
            ))}
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
