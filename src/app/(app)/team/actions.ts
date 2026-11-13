"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { MOCK_MODE } from "@/lib/env";
import { getRepo } from "@/lib/data/repo";
import { siteUrl } from "@/lib/site";
import { ROLES, type InviteInput, type Role } from "@/lib/types";
import {
  adminKeyMissingMessage,
  banAuthUser,
  setAuthPassword,
  updateAuthEmail,
  validateAdminPassword,
} from "@/lib/admin-users";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, emailConfigured, emailMissingMessage } from "@/lib/email";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const back = (msg: string, tone: "ok" | "error" = "ok"): never => redirect(`/team?${tone}=${encodeURIComponent(msg)}`);

function readMember(fd: FormData, email: string): InviteInput | string {
  const role = s(fd, "role") as Role;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email address (any provider: Gmail, Outlook, company email…).";
  if (!ROLES.includes(role)) return "Pick a role.";
  return { email, role, full_name: s(fd, "full_name"), title: s(fd, "title") || null, phone: s(fd, "phone") || null, color: s(fd, "color") || "#0891b2" };
}

async function emailInvite(email: string): Promise<string> {
  if (MOCK_MODE) return `Dev mock mode: invite email to ${email} simulated.`;
  const base = await siteUrl();
  const admin = createAdminClient();
  if (!admin) return `${email} is on the team list. Invite emails need SUPABASE_SERVICE_ROLE_KEY; until then they can use Sign in with Google, or “Forgot password” after signing in once.`;
  const { error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${base}/account/password` });
  if (!error) return `Invite email sent to ${email}.`;
  if (/already|registered|exists/i.test(error.message)) {
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
  const repo = await getRepo();
  const existing = (await repo.listTeam()).find((m) => m.email === email);
  if (existing?.status === "inactive") {
    back(`${email} is suspended. Restore them under Manage instead of inviting again.`, "error");
  }
  await repo.upsertInvite(input as InviteInput);
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

/** Suspend (active=false + auth ban) or restore. */
export async function setMemberActive(profileId: string, active: boolean) {
  const me = await requireRole("admin");
  if (profileId === me.id) back("You can't suspend yourself.", "error");
  const repo = await getRepo();
  const profile = await repo.getProfile(profileId);
  if (!profile || profile.deleted_at) back("Member not found.", "error");
  if (!active && profile!.role === "admin") {
    const admins = await repo.countActiveAdmins();
    if (admins <= 1) back("You can't suspend the last active admin.", "error");
  }
  await repo.setActive(profileId, active);
  let banNote = "";
  if (!MOCK_MODE) {
    try {
      await banAuthUser(profileId, !active);
    } catch (e) {
      banNote = ` App access updated, but auth ban failed: ${(e as Error).message}`;
    }
  }
  await repo.writeAdminAudit({
    actor_id: me.id,
    action: active ? "restore" : "suspend",
    target_email: profile!.email,
    target_profile_id: profileId,
  });
  revalidatePath("/team");
  back((active ? "Member restored." : "Member suspended. Their app sessions are blocked.") + banNote);
}

export async function deleteMember(fd: FormData) {
  const me = await requireRole("admin");
  const profileId = s(fd, "profile_id");
  const confirm = s(fd, "confirm_name");
  if (!profileId) back("Missing member.", "error");
  if (profileId === me.id) back("You can't delete yourself.", "error");
  const repo = await getRepo();
  const profile = await repo.getProfile(profileId);
  if (!profile || profile.deleted_at) back("Member not found.", "error");
  if (confirm !== profile!.full_name) back("Type their full name exactly to confirm delete.", "error");
  if (profile!.role === "admin") {
    const admins = await repo.countActiveAdmins();
    if (admins <= 1) back("You can't delete the last active admin.", "error");
  }
  const { email, full_name } = await repo.softDeleteMember(profileId, me.id);
  let authNote = "";
  if (!MOCK_MODE) {
    try {
      await banAuthUser(profileId, true);
      try {
        await updateAuthEmail(profileId, `deleted-${profileId.slice(0, 8)}@deleted.invalid`);
      } catch { /* optional */ }
    } catch (e) {
      authNote = ` Profile removed in-app; auth ban/email update failed: ${(e as Error).message}`;
    }
  }
  await repo.writeAdminAudit({
    actor_id: me.id,
    action: "soft_delete",
    target_email: email,
    target_profile_id: profileId,
    detail: { full_name },
  });
  revalidatePath("/team");
  back(`${full_name} deleted (soft). Job/photo history kept; name anonymized.${authNote}`);
}

export async function adminSetPassword(fd: FormData) {
  const me = await requireRole("admin");
  const profileId = s(fd, "profile_id");
  const password = String(fd.get("password") ?? "");
  const verr = validateAdminPassword(password);
  if (verr) back(verr, "error");
  if (!profileId) back("Missing member.", "error");
  const repo = await getRepo();
  const profile = await repo.getProfile(profileId);
  if (!profile || profile.deleted_at) back("Member not found.", "error");
  if (MOCK_MODE) {
    await repo.writeAdminAudit({ actor_id: me.id, action: "set_password", target_email: profile!.email, target_profile_id: profileId, detail: { mock: true } });
    revalidatePath("/team");
    back(`Dev mock mode: password change for ${profile!.email} simulated (not stored).`);
  }
  try {
    await setAuthPassword(profileId, password);
  } catch (e) {
    const msg = (e as Error).message;
    back(msg.includes("not configured") || msg.includes("Admin key") ? adminKeyMissingMessage() : msg, "error");
  }
  await repo.writeAdminAudit({ actor_id: me.id, action: "set_password", target_email: profile!.email, target_profile_id: profileId });
  revalidatePath("/team");
  back(`Password updated for ${profile!.email}.`);
}

export async function sendPasswordResetNoted(email: string) {
  await requireRole("admin");
  back(`Password reset email for ${email} needs Resend SMTP (deferred). Use “Set password” above for now.`, "error");
}

export async function manageMemberAvatar(fd: FormData): Promise<{ error?: string; ok?: string }> {
  await requireRole("admin");
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const profileId = String(fd.get("profile_id") ?? "").trim() || null;
  if (!email) return { error: "Missing email." };
  const repo = await getRepo();
  const target = { email, profile_id: profileId };
  try {
    if (fd.get("clear") === "1") {
      await repo.removeAvatar(target);
      revalidatePath("/team");
      return { ok: "Photo removed." };
    }
    const file = fd.get("file");
    if (file instanceof File && file.size > 0) {
      if (!file.type.startsWith("image/")) return { error: "Not an image." };
      if (file.size > 5 * 1024 * 1024) return { error: "Image must be under 5 MB." };
      await repo.uploadAvatar(target, file);
      revalidatePath("/team");
      return { ok: "Photo uploaded." };
    }
    const source = String(fd.get("avatar_source") ?? "").trim();
    if (source === "google" || source === "none" || source === "upload") {
      await repo.setAvatarSource(target, source);
      revalidatePath("/team");
      return { ok: source === "google" ? "Using Google photo." : "Avatar updated." };
    }
    return { error: "Nothing to update." };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Admin-only: send one test message to the signed-in admin. Does not email customers. */
export async function sendSelfTestEmail() {
  const me = await requireRole("admin");
  if (!me.email) back("Your account has no email address.", "error");
  if (MOCK_MODE) {
    back(`Dev mock mode: test email to ${me.email} simulated (not sent).`);
  }
  if (!emailConfigured()) back(emailMissingMessage(), "error");
  try {
    const result = await sendEmail({
      to: me.email,
      subject: "RR Scheduler test email",
      text: "This is a test from RR Scheduler. The portal can now send email from this mailbox.",
    });
    if (result.skipped) back(emailMissingMessage(), "error");
    const id = result.messageId ? ` Message ID: ${result.messageId}` : "";
    const rejected = result.rejected.length ? ` Not accepted: ${result.rejected.join(", ")}.` : "";
    if (result.rejected.includes(me.email) || (result.rejected.length && !result.accepted.length)) {
      back(`The mail server did not accept ${me.email}.${rejected}${id}`, "error");
    }
    back(`Test email sent to ${me.email}.${id}${rejected}`);
  } catch (e) {
    back((e as Error).message, "error");
  }
}


export async function setTeamSmsPrefAction(fd: FormData) {
  await requireRole("admin");
  const email = s(fd, "email").toLowerCase();
  const flag = s(fd, "flag");
  const on = s(fd, "value") === "on";
  if (!email || !["sms_notify_assignment", "sms_notify_same_day", "sms_notify_morning"].includes(flag)) return;
  await (await getRepo()).setTeamSmsPrefs(email, { [flag]: on });
  revalidatePath("/team");
  revalidatePath("/account");
}
