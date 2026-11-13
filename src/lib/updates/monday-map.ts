import type { ImportedMondayUpdate } from "./types";

/** Monday user id -> email. Terry's Monday address is terryl@; the portal may also have terry@. */
export const MONDAY_AUTHOR_EMAILS: Record<string, string> = {
  "38133299": "aaron@retrofitrebates.com",
  "100118246": "mario@squarepropertyservices.com",
  "100546905": "ronan@squarepropertyservices.com",
  "99348728": "alexander@retrofitrebates.com",
  "37780942": "luke@retrofitrebates.com",
  "38133270": "terryl@retrofitrebates.com",
};

export const EMAIL_ALIASES: Record<string, string> = {
  "terryl@retrofitrebates.com": "terry@retrofitrebates.com",
  "terry@retrofitrebates.com": "terryl@retrofitrebates.com",
};

export function authorEmailForMondayUser(id: string | number | null | undefined, fallback?: string | null): string | null {
  if (fallback && fallback.includes("@")) return fallback.trim().toLowerCase();
  if (id == null) return null;
  return MONDAY_AUTHOR_EMAILS[String(id)] ?? null;
}

export function emailsToTry(email: string | null): string[] {
  if (!email) return [];
  const e = email.trim().toLowerCase();
  const alias = EMAIL_ALIASES[e];
  return alias ? [e, alias] : [e];
}

type MondayAsset = { id?: string | number; name?: string; url?: string | null; public_url?: string | null; file_extension?: string; file_size?: number };
type MondayPost = {
  id: string | number;
  item_id?: string | number;
  itemId?: string | number;
  created_at?: string;
  text_body?: string | null;
  body?: string | null;
  creator?: { id?: string | number; name?: string; email?: string };
  replies?: MondayPost[];
  assets?: MondayAsset[];
};

function postBody(p: MondayPost): string {
  const text = (p.text_body ?? "").toString().trim();
  if (text) return text;
  const html = (p.body ?? "").toString();
  return html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}

function assetsOf(p: MondayPost): ImportedMondayUpdate["assets"] {
  return (p.assets ?? []).map((a) => ({
    name: a.name || (a.file_extension ? `attachment.${a.file_extension}` : "attachment"),
    url: a.public_url || a.url || null,
    monday_asset_id: a.id != null ? String(a.id) : null,
    mime: null,
    size_bytes: a.file_size ?? null,
  }));
}

/** Flatten board/item get_updates payloads (top-level + replies) into import rows. */
export function flattenMondayUpdates(updates: MondayPost[], boardId: string): ImportedMondayUpdate[] {
  const rows: ImportedMondayUpdate[] = [];
  for (const u of updates) {
    const itemId = String(u.item_id ?? u.itemId ?? "");
    if (!itemId) continue;
    rows.push({
      monday_update_id: String(u.id),
      monday_item_id: itemId,
      monday_board_id: boardId,
      parent_monday_id: null,
      author_name: u.creator?.name || "Monday user",
      author_email: authorEmailForMondayUser(u.creator?.id ?? null, u.creator?.email),
      author_monday_id: u.creator?.id != null ? String(u.creator.id) : null,
      body: postBody(u),
      created_at: u.created_at || new Date().toISOString(),
      assets: assetsOf(u),
    });
    for (const r of u.replies ?? []) {
      rows.push({
        monday_update_id: String(r.id),
        monday_item_id: itemId,
        monday_board_id: boardId,
        parent_monday_id: String(u.id),
        author_name: r.creator?.name || "Monday user",
        author_email: authorEmailForMondayUser(r.creator?.id ?? null, r.creator?.email),
        author_monday_id: r.creator?.id != null ? String(r.creator.id) : null,
        body: postBody(r),
        created_at: r.created_at || new Date().toISOString(),
        assets: assetsOf(r),
      });
    }
  }
  return rows;
}
