import type { AvatarSource } from "@/lib/types";

/** Pick the URL the UI should show for a person (upload signed URL or Google). */
export function resolveAvatarUrl(p: {
  avatar_source?: AvatarSource | null;
  avatar_path?: string | null;
  google_avatar_url?: string | null;
  avatar_url?: string | null;
}, signedUploadUrl?: string | null): string | null {
  if (p.avatar_url) return p.avatar_url;
  const source = p.avatar_source ?? "none";
  if (source === "upload") return signedUploadUrl || null;
  if (source === "google") return p.google_avatar_url || null;
  return null;
}

export function avatarStorageFolder(profileId: string | null | undefined, email: string): string {
  if (profileId) return profileId;
  return `pending/${email.toLowerCase()}`;
}
