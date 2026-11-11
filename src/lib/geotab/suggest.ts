/** First significant name token: "Mario's Pick Up 150" -> "mario". */
export function firstNameKey(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  return first.replace(/['’]s$/i, "").replace(/[^A-Za-z]/g, "").toLowerCase();
}

export function suggestFleetAssignee<T extends { full_name: string }>(
  deviceName: string,
  team: T[],
): T | null {
  const key = firstNameKey(deviceName);
  if (!key) return null;
  const matches = team.filter((m) => firstNameKey(m.full_name) === key);
  return matches.length === 1 ? matches[0] : null;
}
