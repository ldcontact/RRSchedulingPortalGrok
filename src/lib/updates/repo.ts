import { MOCK_MODE } from "@/lib/env";
import type { SessionUser } from "@/lib/types";
import type { MentionableUser, TeamUpdate, TeamUpdateNotification, TeamUpdateThread, ImportedMondayUpdate } from "./types";

export type PostUpdateInput = {
  dealId?: string | null;
  projectId?: string | null;
  parentId?: string | null;
  body: string;
  mentionIds?: string[];
  files?: { name: string; mime: string; size: number; bytes: Uint8Array }[];
};

export type UpdatesRepo = {
  listForDeal(dealId: string): Promise<TeamUpdateThread[]>;
  listForProject(projectId: string): Promise<TeamUpdateThread[]>;
  getUpdate(id: string): Promise<TeamUpdate | null>;
  post(user: SessionUser, input: PostUpdateInput): Promise<TeamUpdate>;
  edit(user: SessionUser, id: string, body: string, mentionIds?: string[]): Promise<TeamUpdate>;
  remove(user: SessionUser, id: string): Promise<TeamUpdate>;
  listNotifications(userId: string, limit?: number): Promise<TeamUpdateNotification[]>;
  countUnread(userId: string): Promise<number>;
  markRead(userId: string, ids?: string[] | null): Promise<number>;
  mentionableUsers(): Promise<MentionableUser[]>;
  importMonday(rows: ImportedMondayUpdate[], dealsByItemId: Record<string, { id: string; project_id: string | null }>): Promise<{ imported: number; skipped: number; unmatched: number }>;
  listEmailDrafts(): Promise<{ id: string; to: string; subject: string; html: string; text: string; created_at: string }[]>;
  notifyTargets(updateId: string): Promise<{ email: string; kind: "mention" | "thread" | "owner" | "assignee"; link: string }[]>;
};


export async function getUpdatesRepo(): Promise<UpdatesRepo> {
  if (MOCK_MODE) return (await import("./mock-repo")).mockUpdatesRepo();
  return (await import("./supabase-repo")).supabaseUpdatesRepo();
}
