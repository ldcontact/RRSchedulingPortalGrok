import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const MIN_PASSWORD = 8;

export function adminKeyMissingMessage() {
  return "Admin key not configured. Set SUPABASE_SERVICE_ROLE_KEY (server-only, never NEXT_PUBLIC) in the environment to enable suspend bans, password changes, and auth deletes.";
}

export function requireAdminClient() {
  const admin = createAdminClient();
  if (!admin) throw new Error(adminKeyMissingMessage());
  return admin;
}

export function validateAdminPassword(password: string): string | null {
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  return null;
}

/** Ban duration ~100 years; 'none' clears the ban. */
export async function banAuthUser(userId: string, banned: boolean) {
  const admin = requireAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: banned ? "876600h" : "none",
  } as { ban_duration: string });
  if (error) throw new Error(error.message);
}

export async function setAuthPassword(userId: string, password: string) {
  const err = validateAdminPassword(password);
  if (err) throw new Error(err);
  const admin = requireAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) throw new Error(error.message);
}

export async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const admin = requireAdminClient();
  // listUsers is paginated; for small teams this is fine. Prefer getUserByEmail if available.
  const getByEmail = (admin.auth.admin as { getUserByEmail?: (e: string) => Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }> }).getUserByEmail;
  if (getByEmail) {
    const { data, error } = await getByEmail(email);
    if (error) throw new Error(error.message);
    return data.user?.id ?? null;
  }
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(error.message);
  const u = data.users.find((x) => (x.email ?? "").toLowerCase() === email.toLowerCase());
  return u?.id ?? null;
}

export async function updateAuthEmail(userId: string, email: string) {
  const admin = requireAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { email, email_confirm: true });
  if (error) throw new Error(error.message);
}
