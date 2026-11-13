import type { MentionableUser } from "./types";

const TOKEN = /@\[([^\]]+)\]\(([^)]+)\)/gi;

/** Insert a stable @Name token the composer can round-trip. */
export function mentionToken(user: Pick<MentionableUser, "id" | "name">): string {
  return `@[${user.name}](${user.id})`;
}

export function parseMentionIds(body: string, users: MentionableUser[]): string[] {
  const ids = new Set<string>();
  const byId = new Map(users.map((u) => [u.id, u]));
  for (const m of body.matchAll(TOKEN)) {
    if (byId.has(m[2])) ids.add(m[2]);
  }
  // Also accept a plain "@Full Name" when it uniquely matches a portal user.
  for (const u of users) {
    const re = new RegExp(`(^|\\s)@${escapeReg(u.name)}\\b`, "i");
    if (re.test(body)) ids.add(u.id);
  }
  TOKEN.lastIndex = 0;
  return [...ids];
}

export function displayMentions(body: string): string {
  return body.replace(TOKEN, (_m, name) => `@${name}`);
}

export function filterMentionQuery(users: MentionableUser[], query: string): MentionableUser[] {
  const q = query.trim().toLowerCase();
  const list = q
    ? users.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
    : users;
  return list.slice(0, 8);
}

function escapeReg(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
