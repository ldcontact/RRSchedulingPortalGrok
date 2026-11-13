/** Case-insensitive, accent-insensitive compare for people display names. */
export function compareDisplayName(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

export function sortByDisplayName<T>(
  items: readonly T[],
  nameOf: (item: T) => string,
  tieBreak?: (a: T, b: T) => number,
): T[] {
  return [...items].sort((a, b) => compareDisplayName(nameOf(a), nameOf(b)) || (tieBreak ? tieBreak(a, b) : 0));
}
