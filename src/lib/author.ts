/** Display label for the person who created a note/message/photo. */
export function authorLabel(
  id: string | null | undefined,
  profile: { full_name?: string | null; deleted_at?: string | null } | null | undefined,
): string {
  if (profile?.deleted_at) return "Former user";
  const name = profile?.full_name?.trim();
  if (name && name !== "Removed user") return name;
  if (name === "Removed user" || id) return "Former user";
  return "Unknown";
}

export function authorColor(
  profile: { color?: string | null } | null | undefined,
): string {
  return profile?.color?.trim() || "#64748b";
}
