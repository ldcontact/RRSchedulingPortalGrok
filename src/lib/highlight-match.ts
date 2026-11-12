/** Split a search query into highlight tokens (whitespace-separated, non-empty). */
export function tokensFromQuery(query: string): string[] {
  return [...new Set(query.trim().split(/\s+/).filter((t) => t.length > 0))];
}

/** Break `text` into chunks, marking substrings that match any query token (case-insensitive). */
export function highlightChunks(text: string, query: string): { text: string; match: boolean }[] {
  if (!text) return [];
  const tokens = tokensFromQuery(query).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!tokens.length) return [{ text, match: false }];
  const re = new RegExp(tokens.join("|"), "gi");
  const out: { text: string; match: boolean }[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ text: text.slice(last, i), match: false });
    out.push({ text: m[0], match: true });
    last = i + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), match: false });
  return out.length ? out : [{ text, match: false }];
}
