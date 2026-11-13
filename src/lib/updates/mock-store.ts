import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { TeamUpdate, TeamUpdateAsset, TeamUpdateNotification } from "./types";
import type { UpdateEmail as Mail } from "./email";

export type UpdateEmailDraft = Mail & {
  id: string;
  to: string;
  user_id: string;
  update_id: string;
  created_at: string;
};

export type UpdatesDB = {
  updates: TeamUpdate[];
  notifications: TeamUpdateNotification[];
  emailDrafts: UpdateEmailDraft[];
};

const FILE = join(process.cwd(), ".mock-updates.json");
export const MOCK_UPLOAD_ROOT = join(process.cwd(), ".mock-uploads");

let cache: UpdatesDB | null = null;
let cacheMtime = 0;

function empty(): UpdatesDB {
  return { updates: [], notifications: [], emailDrafts: [] };
}

export function loadUpdates(): UpdatesDB {
  if (existsSync(FILE)) {
    const mtime = statSync(FILE).mtimeMs;
    if (cache && mtime === cacheMtime) return cache;
    try {
      const raw = JSON.parse(readFileSync(FILE, "utf8")) as Partial<UpdatesDB>;
      cache = {
        updates: raw.updates ?? [],
        notifications: raw.notifications ?? [],
        emailDrafts: raw.emailDrafts ?? [],
      };
      cacheMtime = mtime;
      return cache;
    } catch { /* fall through */ }
  }
  if (cache) return cache;
  cache = empty();
  saveUpdates(cache);
  return cache;
}

export function saveUpdates(db: UpdatesDB) {
  cache = db;
  try {
    writeFileSync(FILE, JSON.stringify(db, null, 2));
    cacheMtime = existsSync(FILE) ? statSync(FILE).mtimeMs : 0;
  } catch { /* ephemeral fs */ }
}

export function mutateUpdates<T>(fn: (db: UpdatesDB) => T): T {
  const db = loadUpdates();
  const result = fn(db);
  saveUpdates(db);
  return result;
}

export function resetUpdatesStore() {
  cache = empty();
  saveUpdates(cache);
}

export function newUpdateId() { return randomUUID(); }

export function mockAssetUrl(asset: Pick<TeamUpdateAsset, "id" | "update_id" | "name" | "storage_path" | "url">): string {
  if (asset.url) return asset.url;
  const path = asset.storage_path || `updates/${asset.update_id}/${asset.name}`;
  return `/api/mock-update-file/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export function ensureUploadDir() {
  mkdirSync(join(MOCK_UPLOAD_ROOT, "updates"), { recursive: true });
}
