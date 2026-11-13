import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { SessionUser } from "@/lib/types";
import { nestUpdateThreads } from "./thread";
import { parseMentionIds } from "./mentions";
import type { UpdatesRepo, PostUpdateInput } from "./repo";
import type { MentionableUser, TeamUpdate, TeamUpdateAsset, TeamUpdateNotification, TeamUpdateThread } from "./types";

type Row = {
  id: string;
  deal_id: string | null;
  project_id: string | null;
  parent_id: string | null;
  monday_update_id: string | null;
  author_id: string | null;
  author_name: string;
  author_email: string | null;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  team_update_assets?: Omit<TeamUpdateAsset, "url">[] | null;
  team_update_mentions?: { profile_id: string }[] | null;
};

function asUpdate(row: Row, colors: Record<string, string>, signed: Record<string, string>): TeamUpdate {
  const assets = (row.team_update_assets ?? []).map((a) => ({
    ...a,
    url: a.storage_path ? signed[a.storage_path] ?? a.url ?? null : a.url ?? null,
  }));
  return {
    id: row.id,
    deal_id: row.deal_id,
    project_id: row.project_id,
    parent_id: row.parent_id,
    monday_update_id: row.monday_update_id,
    author_id: row.author_id,
    author_name: row.author_name,
    author_email: row.author_email,
    author_color: row.author_id ? colors[row.author_id] ?? null : null,
    body: row.body,
    created_at: row.created_at,
    edited_at: row.edited_at,
    deleted_at: row.deleted_at,
    assets,
    mention_ids: (row.team_update_mentions ?? []).map((m) => m.profile_id),
  };
}

async function signedUrls(c: Awaited<ReturnType<typeof createClient>>, paths: string[]) {
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return {} as Record<string, string>;
  const { data } = await c.storage.from("team-updates").createSignedUrls(unique, 3600);
  const out: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
  }
  return out;
}

async function colorsOf(c: Awaited<ReturnType<typeof createClient>>, ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return {} as Record<string, string>;
  const { data } = await c.from("profiles").select("id, color").in("id", unique);
  const out: Record<string, string> = {};
  for (const p of data ?? []) out[p.id] = p.color;
  return out;
}

async function loadThreads(col: "deal_id" | "project_id", id: string): Promise<TeamUpdateThread[]> {
  const c = await createClient();
  const { data, error } = await c
    .from("team_updates")
    .select("*, team_update_assets(*), team_update_mentions(profile_id)")
    .eq(col, id)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as Row[];
  const signed = await signedUrls(c, rows.flatMap((r) => (r.team_update_assets ?? []).map((a) => a.storage_path || "")));
  const colors = await colorsOf(c, rows.map((r) => r.author_id || ""));
  return nestUpdateThreads(rows.map((r) => asUpdate(r, colors, signed)));
}

export function supabaseUpdatesRepo(): UpdatesRepo {
  return {
    listForDeal: (dealId) => loadThreads("deal_id", dealId),
    listForProject: (projectId) => loadThreads("project_id", projectId),
    async getUpdate(id) {
      const c = await createClient();
      const { data, error } = await c
        .from("team_updates")
        .select("*, team_update_assets(*), team_update_mentions(profile_id)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as Row;
      const signed = await signedUrls(c, (row.team_update_assets ?? []).map((a) => a.storage_path || ""));
      const colors = await colorsOf(c, [row.author_id || ""]);
      return asUpdate(row, colors, signed);
    },
    async post(user: SessionUser, input: PostUpdateInput) {
      const c = await createClient();
      const users = await this.mentionableUsers();
      const mentionIds = [...new Set([...(input.mentionIds ?? []), ...parseMentionIds(input.body, users)])];
      const { data, error } = await c.rpc("post_team_update", {
        p_deal_id: input.dealId ?? null,
        p_project_id: input.projectId ?? null,
        p_parent_id: input.parentId ?? null,
        p_body: input.body,
        p_mention_ids: mentionIds,
      });
      if (error) throw error;
      const rec = data as { id: string };
      if (input.files?.length) {
        for (const f of input.files) {
          const path = `${rec.id}/${crypto.randomUUID()}-${f.name.replace(/[/\\]/g, "_")}`;
          const up = await c.storage.from("team-updates").upload(path, f.bytes, { contentType: f.mime || "application/octet-stream", upsert: false });
          if (up.error) throw up.error;
          const att = await c.rpc("attach_team_update_asset", {
            p_update_id: rec.id,
            p_name: f.name,
            p_mime: f.mime,
            p_size_bytes: f.size,
            p_storage_path: path,
            p_url: null,
            p_monday_asset_id: null,
          });
          if (att.error) throw att.error;
        }
      }
      const full = await this.getUpdate(rec.id);
      if (!full) throw new Error("failed to load posted update");
      void user;
      return full;
    },
    async edit(_user, id, body, mentionIds) {
      const c = await createClient();
      const { error } = await c.rpc("edit_team_update", { p_id: id, p_body: body, p_mention_ids: mentionIds ?? null });
      if (error) throw error;
      const full = await this.getUpdate(id);
      if (!full) throw new Error("failed to load update");
      return full;
    },
    async remove(_user, id) {
      const c = await createClient();
      const { error } = await c.rpc("delete_team_update", { p_id: id });
      if (error) throw error;
      const full = await this.getUpdate(id);
      if (!full) throw new Error("failed to load update");
      return full;
    },
    async listNotifications(userId, limit = 20) {
      const c = await createClient();
      const { data, error } = await c
        .from("team_update_notifications")
        .select("id, user_id, update_id, kind, title, body, link, read_at, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as TeamUpdateNotification[];
    },
    async countUnread(userId) {
      const c = await createClient();
      const { count, error } = await c
        .from("team_update_notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .is("read_at", null);
      if (error) throw error;
      return count ?? 0;
    },
    async markRead(_userId, ids) {
      const c = await createClient();
      const { data, error } = await c.rpc("mark_team_update_notifications_read", { p_ids: ids ?? null });
      if (error) throw error;
      return (data as number) ?? 0;
    },
    async mentionableUsers() {
      const c = await createClient();
      const { data, error } = await c
        .from("profiles")
        .select("id, full_name, email, color, role")
        .in("role", ["admin", "manager", "sales", "tech"])
        .eq("active", true)
        .is("deleted_at", null)
        .order("full_name");
      if (error) throw error;
      return (data ?? []).map((p) => ({
        id: p.id,
        name: p.full_name,
        email: p.email,
        color: p.color,
        role: p.role as MentionableUser["role"],
      }));
    },
    async importMonday() {
      throw new Error("Monday import runs from scripts/import_monday_updates.py, not the app client.");
    },
    async listEmailDrafts() {
      return [];
    },
    async notifyTargets(updateId) {
      const c = await createClient();
      const { data, error } = await c.rpc("team_update_notify_targets", { p_update_id: updateId });
      if (error) throw error;
      return (data ?? []) as { email: string; kind: "mention" | "thread" | "owner" | "assignee"; link: string }[];
    },
  };
}
