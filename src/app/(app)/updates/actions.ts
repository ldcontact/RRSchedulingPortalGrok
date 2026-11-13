"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth";
import { getUpdatesRepo } from "@/lib/updates/repo";
import { scheduleUpdateMails } from "@/lib/updates/notify";
import { displayMentions } from "@/lib/updates/mentions";

function revalidateTargets(dealId?: string | null, projectId?: string | null) {
  if (dealId) revalidatePath(`/sales/deals/${dealId}`);
  if (projectId) revalidatePath(`/projects/${projectId}`);
  revalidatePath("/", "layout");
}

async function readFiles(form: FormData) {
  const files: { name: string; mime: string; size: number; bytes: Uint8Array }[] = [];
  for (const value of form.getAll("files")) {
    if (!(value instanceof File) || !value.size) continue;
    files.push({
      name: value.name || "attachment",
      mime: value.type || "application/octet-stream",
      size: value.size,
      bytes: new Uint8Array(await value.arrayBuffer()),
    });
  }
  return files;
}

function mentionIdsFrom(form: FormData): string[] {
  return form.getAll("mention_ids").flatMap((v) => String(v).split(",")).map((s) => s.trim()).filter(Boolean);
}

export async function postTeamUpdateAction(form: FormData) {
  const user = await requireMember();
  const body = String(form.get("body") ?? "");
  const dealId = String(form.get("deal_id") ?? "") || null;
  const projectId = String(form.get("project_id") ?? "") || null;
  const parentId = String(form.get("parent_id") ?? "") || null;
  const repo = await getUpdatesRepo();
  const row = await repo.post(user, {
    dealId,
    projectId,
    parentId,
    body,
    mentionIds: mentionIdsFrom(form),
    files: await readFiles(form),
  });
  const title = String(form.get("context_title") ?? "Update");
  const targets = await repo.notifyTargets(row.id);
  scheduleUpdateMails({
    actorName: user.name,
    contextTitle: title,
    body: displayMentions(row.body),
    postedAt: row.created_at,
    targets,
  });
  revalidateTargets(row.deal_id, row.project_id);
  return { id: row.id };
}

export async function editTeamUpdateAction(form: FormData) {
  const user = await requireMember();
  const id = String(form.get("id") ?? "");
  const body = String(form.get("body") ?? "");
  const repo = await getUpdatesRepo();
  const row = await repo.edit(user, id, body, mentionIdsFrom(form));
  revalidateTargets(row.deal_id, row.project_id);
}

export async function deleteTeamUpdateAction(form: FormData) {
  const user = await requireMember();
  const id = String(form.get("id") ?? "");
  const repo = await getUpdatesRepo();
  const row = await repo.remove(user, id);
  revalidateTargets(row.deal_id, row.project_id);
}

export async function markUpdateNotificationsReadAction(ids?: string[] | null) {
  const user = await requireMember();
  const repo = await getUpdatesRepo();
  await repo.markRead(user.id, ids ?? null);
  revalidatePath("/", "layout");
}
