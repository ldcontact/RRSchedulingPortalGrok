/** Active inbox filters that hide behind the mobile Filters button (not search or status). */
export function countActiveServiceFilters(f: {
  channel?: string | null;
  warranty?: string | null;
  assignee?: string | null;
}): number {
  return [f.channel, f.warranty, f.assignee].filter((v) => !!v && v.trim() !== "").length;
}
