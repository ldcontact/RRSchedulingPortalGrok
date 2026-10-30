import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MOCK_MODE, assertMockAllowed } from "@/lib/env";
import type { Role, SessionUser } from "@/lib/types";

export const MOCK_COOKIE = "rr_mock_uid";

/** The signed-in user with their app role (null role = authenticated but not on the team list). */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  if (MOCK_MODE) {
    assertMockAllowed();
    const uid = (await cookies()).get(MOCK_COOKIE)?.value;
    if (!uid) return null;
    const { mockProfiles } = await import("@/lib/data/mock-repo");
    const p = mockProfiles().find((x) => x.id === uid);
    return p ? { id: p.id, email: p.email, name: p.full_name, role: p.role, color: p.color, active: p.active } : null;
  }
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: p } = await supabase.from("profiles").select("full_name, role, color, active").eq("id", user.id).maybeSingle();
  return {
    id: user.id,
    email: user.email ?? "",
    name: p?.full_name || (user.user_metadata?.full_name as string) || user.email || "",
    role: p?.active === false ? null : ((p?.role as Role | null) ?? null),
    color: p?.color ?? "#0f766e",
    active: p?.active ?? true,
  };
});

/** Require a signed-in team member; otherwise send to login or the "not invited" screen. */
export async function requireMember(): Promise<SessionUser & { role: Role }> {
  const u = await getSessionUser();
  if (!u) redirect("/login");
  if (!u.role) redirect("/not-invited");
  return u as SessionUser & { role: Role };
}

/** Require one of the given roles (server-side route + action protection). */
export async function requireRole(...roles: Role[]) {
  const u = await requireMember();
  if (!roles.includes(u.role)) redirect("/?denied=1");
  return u;
}

export const isStaff = (r: Role | null | undefined) => r === "admin" || r === "manager";
