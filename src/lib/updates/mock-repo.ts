import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadSales, mutateSales } from "@/lib/sales/mock-store";
import { mockProfiles, mockProjectAssigneeIds } from "@/lib/data/mock-repo";
import { nestUpdateThreads } from "./thread";
import { parseMentionIds } from "./mentions";
import { notificationRecipients, notificationTitle } from "./recipients";
import { canDeleteTeamUpdate, canEditTeamUpdate } from "./permissions";
import { buildUpdateEmail } from "./email";
import { emailsToTry } from "./monday-map";
import {
  ensureUploadDir,
  loadUpdates,
  MOCK_UPLOAD_ROOT,
  mockAssetUrl,
  mutateUpdates,
  newUpdateId,
} from "./mock-store";
import type { UpdatesRepo, PostUpdateInput } from "./repo";
import { resolveAvatarUrl } from "@/lib/avatar";
import type { AvatarSource } from "@/lib/types";
import type { ImportedMondayUpdate, MentionableUser, TeamUpdate, TeamUpdateNotification } from "./types";

const STAFF = new Set(["admin", "manager", "sales", "tech"]);

function mockAvatarUrl(p: { avatar_source?: AvatarSource | null; avatar_path?: string | null; google_avatar_url?: string | null }) {
  return resolveAvatarUrl(p, p.avatar_source === "upload" && p.avatar_path ? `/api/mock-photo/${p.avatar_path}` : null);
}

function mentionable(): MentionableUser[] {
  return mockProfiles()
    .filter((p) => p.role && STAFF.has(p.role) && p.active && !p.deleted_at)
    .map((p) => ({ id: p.id, name: p.full_name, email: p.email, color: p.color, role: p.role as MentionableUser["role"], avatar_url: mockAvatarUrl(p) }));
}

function profileByEmail(email: string | null): { id: string; color: string } | null {
  if (!email) return null;
  const people = mockProfiles();
  for (const e of emailsToTry(email)) {
    const hit = people.find((p) => p.email.toLowerCase() === e && !p.deleted_at);
    if (hit) return { id: hit.id, color: hit.color };
  }
  return null;
}

function colorOf(authorId: string | null): string | null {
  if (!authorId) return null;
  return mockProfiles().find((p) => p.id === authorId)?.color ?? null;
}

function hydrate(row: TeamUpdate): TeamUpdate {
  const author = row.author_id ? mockProfiles().find((p) => p.id === row.author_id) : undefined;
  return {
    ...row,
    author_color: row.author_color ?? colorOf(row.author_id),
    author_avatar_url: row.author_avatar_url ?? (author ? mockAvatarUrl(author) : null),
    assets: (row.assets ?? []).map((a) => ({ ...a, url: mockAssetUrl(a) })),
  };
}

function threadsFor(pred: (u: TeamUpdate) => boolean) {
  const rows = loadUpdates().updates.filter(pred).map(hydrate);
  return nestUpdateThreads(rows);
}

function contextTitle(dealId: string | null): string {
  if (dealId) {
    const d = loadSales().deals.find((x) => x.id === dealId);
    if (d?.title) return d.title;
  }
  return "Update";
}

function permalink(dealId: string | null, projectId: string | null, id: string, preferProject: boolean) {
  if (preferProject && projectId) return `/projects/${projectId}#update-${id}`;
  if (dealId) return `/sales/deals/${dealId}#update-${id}`;
  if (projectId) return `/projects/${projectId}#update-${id}`;
  return `#update-${id}`;
}

function projectAssigneeIds(projectId: string | null): string[] {
  if (!projectId) return [];
  return mockProjectAssigneeIds(projectId);
}

function linkTargets(dealId: string | null, projectId: string | null) {
  const sales = loadSales();
  let deal = dealId ? sales.deals.find((d) => d.id === dealId) : undefined;
  if (!deal && projectId) deal = sales.deals.find((d) => d.converted_project_id === projectId);
  return {
    dealId: deal?.id ?? dealId ?? null,
    projectId: deal?.converted_project_id ?? projectId ?? null,
    ownerId: deal?.owner_id ?? null,
    title: deal?.title ?? "Update",
  };
}

export function mockUpdatesRepo(): UpdatesRepo {
  return {
    async listForDeal(dealId) {
      return threadsFor((u) => u.deal_id === dealId);
    },
    async listForProject(projectId) {
      return threadsFor((u) => u.project_id === projectId);
    },
    async getUpdate(id) {
      const row = loadUpdates().updates.find((u) => u.id === id);
      return row ? hydrate(row) : null;
    },
    async post(user, input: PostUpdateInput) {
      const body = input.body.trim();
      if (!body) throw new Error("body is required");
      const users = mentionable();
      const mentionIds = [...new Set([...(input.mentionIds ?? []), ...parseMentionIds(body, users)])];
      const links = linkTargets(input.dealId ?? null, input.projectId ?? null);
      if (!links.dealId && !links.projectId) throw new Error("update must belong to a deal or a project");
      let parent: TeamUpdate | undefined;
      if (input.parentId) {
        parent = loadUpdates().updates.find((u) => u.id === input.parentId);
        if (!parent) throw new Error("parent update not found");
        if (parent.parent_id) throw new Error("replies cannot be nested more than one level");
        if (parent.deleted_at) throw new Error("cannot reply to a deleted update");
      }
      const now = new Date().toISOString();
      const id = newUpdateId();
      const row: TeamUpdate = {
        id,
        deal_id: links.dealId ?? parent?.deal_id ?? null,
        project_id: links.projectId ?? parent?.project_id ?? null,
        parent_id: input.parentId ?? null,
        monday_update_id: null,
        author_id: user.id,
        author_name: user.name,
        author_email: user.email,
        author_color: user.color,
        body,
        created_at: now,
        edited_at: null,
        deleted_at: null,
        assets: [],
        mention_ids: mentionIds,
      };
      if (input.files?.length) {
        ensureUploadDir();
        for (const f of input.files) {
          const assetId = newUpdateId();
          const storage_path = `updates/${id}/${assetId}-${f.name.replace(/[/\\]/g, "_")}`;
          const dir = join(MOCK_UPLOAD_ROOT, "updates", id);
          mkdirSync(dir, { recursive: true });
          writeFileSync(join(MOCK_UPLOAD_ROOT, storage_path), f.bytes);
          row.assets.push({
            id: assetId,
            update_id: id,
            name: f.name,
            mime: f.mime,
            size_bytes: f.size,
            storage_path,
            url: null,
            monday_asset_id: null,
          });
        }
      }
      const threadAuthorIds = loadUpdates().updates
        .filter((u) => u.id === row.parent_id || u.parent_id === (row.parent_id ?? row.id) || u.id === row.id)
        .map((u) => u.author_id)
        .filter((x): x is string => !!x);
      const recipients = notificationRecipients({
        actorId: user.id,
        mentionIds,
        threadAuthorIds,
        dealOwnerId: links.ownerId,
        projectAssigneeIds: projectAssigneeIds(row.project_id),
        staffIds: users.map((u) => u.id),
      });
      const title = contextTitle(row.deal_id);
      mutateUpdates((db) => {
        db.updates.push(row);
        for (const r of recipients) {
          const preferProject = r.kind === "assignee" || users.find((u) => u.id === r.userId)?.role === "tech";
          const link = permalink(row.deal_id, row.project_id, row.id, preferProject);
          const notice: TeamUpdateNotification = {
            id: newUpdateId(),
            user_id: r.userId,
            update_id: row.id,
            kind: r.kind,
            title: notificationTitle(r.kind, user.name, title),
            body: body.slice(0, 240),
            link,
            read_at: null,
            created_at: now,
          };
          db.notifications.push(notice);
          const email = users.find((u) => u.id === r.userId)?.email;
          if (email) {
            const mail = buildUpdateEmail({
              actorName: user.name,
              contextTitle: title,
              kind: r.kind,
              body,
              link,
              postedAt: now,
            });
            db.emailDrafts.push({ id: newUpdateId(), to: email, user_id: r.userId, update_id: row.id, created_at: now, ...mail });
          }
        }
      });
      return hydrate(row);
    },
    async edit(user, id, body, mentionIds) {
      const trimmed = body.trim();
      if (!trimmed) throw new Error("body is required");
      return mutateUpdates((db) => {
        const row = db.updates.find((u) => u.id === id);
        if (!row) throw new Error("update not found");
        if (!canEditTeamUpdate({ userId: user.id, role: user.role!, authorId: row.author_id, deleted: !!row.deleted_at })) {
          throw new Error("you can only edit your own update");
        }
        row.body = trimmed;
        row.edited_at = new Date().toISOString();
        if (mentionIds) row.mention_ids = mentionIds;
        else row.mention_ids = parseMentionIds(trimmed, mentionable());
        return hydrate(row);
      });
    },
    async remove(user, id) {
      return mutateUpdates((db) => {
        const row = db.updates.find((u) => u.id === id);
        if (!row) throw new Error("update not found");
        if (!canDeleteTeamUpdate({
          userId: user.id,
          role: user.role!,
          canDeleteFlag: user.can_delete,
          authorId: row.author_id,
          deleted: !!row.deleted_at,
        })) {
          throw new Error("not allowed to delete this update");
        }
        row.deleted_at = new Date().toISOString();
        return hydrate(row);
      });
    },
    async listNotifications(userId, limit = 20) {
      return loadUpdates().notifications
        .filter((n) => n.user_id === userId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, limit);
    },
    async countUnread(userId) {
      return loadUpdates().notifications.filter((n) => n.user_id === userId && !n.read_at).length;
    },
    async markRead(userId, ids) {
      return mutateUpdates((db) => {
        let n = 0;
        for (const row of db.notifications) {
          if (row.user_id !== userId || row.read_at) continue;
          if (ids && !ids.includes(row.id)) continue;
          row.read_at = new Date().toISOString();
          n += 1;
        }
        return n;
      });
    },
    async mentionableUsers() {
      return mentionable();
    },
    async importMonday(rows: ImportedMondayUpdate[], dealsByItemId) {
      return mutateUpdates((db) => {
        const existing = new Set(db.updates.map((u) => u.monday_update_id).filter(Boolean) as string[]);
        let imported = 0, skipped = 0, unmatched = 0;
        const idByMonday = new Map(db.updates.filter((u) => u.monday_update_id).map((u) => [u.monday_update_id!, u.id]));
        // Parents first so replies can find them
        const ordered = [...rows].sort((a, b) => Number(!!a.parent_monday_id) - Number(!!b.parent_monday_id));
        for (const row of ordered) {
          if (existing.has(row.monday_update_id) || idByMonday.has(row.monday_update_id)) {
            skipped += 1;
            continue;
          }
          const deal = dealsByItemId[row.monday_item_id];
          if (!deal) { unmatched += 1; continue; }
          const author = profileByEmail(row.author_email);
          const id = `mon-up-${row.monday_update_id}`;
          const parentId = row.parent_monday_id ? idByMonday.get(row.parent_monday_id) ?? null : null;
          const rec: TeamUpdate = {
            id,
            deal_id: deal.id,
            project_id: deal.project_id,
            parent_id: parentId,
            monday_update_id: row.monday_update_id,
            author_id: author?.id ?? null,
            author_name: row.author_name,
            author_email: row.author_email,
            author_color: author?.color ?? null,
            body: row.body,
            created_at: row.created_at,
            edited_at: null,
            deleted_at: null,
            assets: row.assets.map((a) => ({
              id: newUpdateId(),
              update_id: id,
              name: a.name,
              mime: a.mime ?? null,
              size_bytes: a.size_bytes ?? null,
              storage_path: null,
              url: a.url ?? null,
              monday_asset_id: a.monday_asset_id ?? null,
            })),
            mention_ids: [],
          };
          db.updates.push(rec);
          idByMonday.set(row.monday_update_id, id);
          existing.add(row.monday_update_id);
          imported += 1;
        }
        return { imported, skipped, unmatched };
      });
    },
    async listEmailDrafts() {
      return loadUpdates().emailDrafts.slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
    async notifyTargets(updateId) {
      const users = mentionable();
      const byId = new Map(users.map((u) => [u.id, u.email]));
      return loadUpdates().notifications
        .filter((n) => n.update_id === updateId)
        .flatMap((n) => {
          const email = byId.get(n.user_id);
          return email ? [{ email, kind: n.kind, link: n.link }] : [];
        });
    },
  };
}

/** Used when a deal is converted in mock: copy the project id onto existing threads. */
export function syncMockUpdatesProject(dealId: string, projectId: string | null) {
  mutateUpdates((db) => {
    for (const u of db.updates) {
      if (u.deal_id === dealId) u.project_id = projectId;
    }
  });
  mutateSales((sales) => {
    // no-op; deal itself is updated by convertDeal
    void sales;
  });
}
