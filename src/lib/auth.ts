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
    const uid = (await cookies()).get(MOCK_COOKIE)?.value; // read cookies first: keeps routes dynamic
    assertMockAllowed();
    if (!uid) return null;
    const { mockProfiles } = await import("@/lib/data/mock-repo");
    const { resolveAvatarUrl } = await import("@/lib/avatar");
    const p = mockProfiles().find((x) => x.id === uid);
    if (!p || (p as { deleted_at?: string | null }).deleted_at) return null;
    return {
      id: p.id, email: p.email, name: p.full_name, role: p.active ? p.role : null, color: p.color, active: p.active,
      avatar_source: p.avatar_source, google_avatar_url: p.google_avatar_url,
      avatar_url: resolveAvatarUrl(p, p.avatar_source === "upload" && p.avatar_path ? `/api/mock-photo/${p.avatar_path}` : null),
    };
  }
  const { createClient } = await import("@/lib/supabase/server");
  const { resolveAvatarUrl } = await import("@/lib/avatar");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: p } = await supabase.from("profiles").select("full_name, role, color, active, deleted_at, avatar_source, avatar_path, google_avatar_url").eq("id", user.id).maybeSingle();
  if (p?.deleted_at) return null;
  let avatar_url: string | null = null;
  if (p?.avatar_source === "upload" && p.avatar_path) {
    const { data: signed } = await supabase.storage.from("avatars").createSignedUrl(p.avatar_path, 3600);
    avatar_url = signed?.signedUrl ?? null;
  } else {
    avatar_url = resolveAvatarUrl({ avatar_source: p?.avatar_source, google_avatar_url: p?.google_avatar_url });
  }
  const active = p?.active !== false;
  return {
    id: user.id,
    email: user.email ?? "",
    name: p?.full_name || (user.user_metadata?.full_name as string) || user.email || "",
    role: !active ? null : ((p?.role as Role | null) ?? null),
    color: p?.color ?? "#0f766e",
    active,
    avatar_source: p?.avatar_source,
    google_avatar_url: p?.google_avatar_url,
    avatar_url,
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
