"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { MOCK_MODE } from "@/lib/env";
import { getRepo } from "@/lib/data/repo";
import { siteUrl } from "@/lib/site";
import { ROLES, type InviteInput, type Role } from "@/lib/types";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const back = (msg: string, tone: "ok" | "error" = "ok"): never => redirect(`/team?${tone}=${encodeURIComponent(msg)}`);

function readMember(fd: FormData, email: string): InviteInput | string {
  const role = s(fd, "role") as Role;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email address (any provider: Gmail, Outlook, company email…).";
  if (!ROLES.includes(role)) return "Pick a role.";
  return { email, role, full_name: s(fd, "full_name"), title: s(fd, "title") || null, phone: s(fd, "phone") || null, color: s(fd, "color") || "#0891b2" };
}

/** Email a sign-up / set-password link. Needs SUPABASE_SERVICE_ROLE_KEY (server only). */
async function emailInvite(email: string): Promise<string> {
  if (MOCK_MODE) return `Dev mock mode: invite email to ${email} simulated.`;
  const base = await siteUrl();
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();
  if (!admin) return `${email} is on the team list. Invite emails need SUPABASE_SERVICE_ROLE_KEY; until then they can use Sign in with Google, or “Forgot password” after signing in once.`;
  const { error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${base}/account/password` });
  if (!error) return `Invite email sent to ${email}.`;
  if (/already|registered|exists/i.test(error.message)) {
    // Existing account (e.g. signed in with Google before): send a set-password link instead.
    const { createClient } = await import("@/lib/supabase/server");
    await (await createClient()).auth.resetPasswordForEmail(email, { redirectTo: `${base}/auth/callback?next=/account/password` });
    return `${email} already has an account, so we sent them a link to set a password.`;
  }
  return `Saved, but the invite email failed: ${error.message}`;
}

export async function inviteMember(fd: FormData) {
  await requireRole("admin");
  const email = s(fd, "email").toLowerCase();
  const input = readMember(fd, email);
  if (typeof input === "string") back(input, "error");
  await (await getRepo()).upsertInvite(input as InviteInput);
  const msg = fd.get("send_email") === "on" ? await emailInvite(email) : `${email} added to the team list. They can sign in with Google or email.`;
  revalidatePath("/team");
  back(msg);
}

export async function updateMember(email: string, fd: FormData) {
  const me = await requireRole("admin");
  const input = readMember(fd, email);
  if (typeof input === "string") back(input, "error");
  if (email === me.email && (input as InviteInput).role !== "admin") back("You can't remove your own admin role. Ask another admin.", "error");
  await (await getRepo()).upsertInvite(input as InviteInput);
  revalidatePath("/team");
  back(`Updated ${email}.`);
}

export async function resendInvite(email: string) {
  await requireRole("admin");
  const msg = await emailInvite(email);
  back(msg);
}

export async function removeMember(email: string) {
  const me = await requireRole("admin");
  if (email === me.email) back("You can't remove yourself.", "error");
  await (await getRepo()).removeFromTeam(email);
  revalidatePath("/team");
  back(`${email} removed from the team list. They can no longer get in.`);
}

export async function setMemberActive(profileId: string, active: boolean) {
  const me = await requireRole("admin");
  if (profileId === me.id) back("You can't deactivate yourself.", "error");
  await (await getRepo()).setActive(profileId, active);
  revalidatePath("/team");
  back(active ? "Member reactivated." : "Member deactivated. They keep their history but can't sign in to the app.");
}
