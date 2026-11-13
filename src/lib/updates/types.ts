export type TeamUpdateKind = "mention" | "thread" | "owner" | "assignee";

export type TeamUpdateAsset = {
  id: string;
  update_id: string;
  name: string;
  mime: string | null;
  size_bytes: number | null;
  storage_path: string | null;
  url: string | null;
  monday_asset_id: string | null;
};

export type TeamUpdate = {
  id: string;
  deal_id: string | null;
  project_id: string | null;
  parent_id: string | null;
  monday_update_id: string | null;
  author_id: string | null;
  author_name: string;
  author_email: string | null;
  author_color?: string | null;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  assets: TeamUpdateAsset[];
  mention_ids: string[];
};

export type TeamUpdateThread = TeamUpdate & { replies: TeamUpdate[] };

export type MentionableUser = {
  id: string;
  name: string;
  email: string;
  color: string;
  role: "admin" | "manager" | "sales" | "tech";
};

export type TeamUpdateNotification = {
  id: string;
  user_id: string;
  update_id: string;
  kind: TeamUpdateKind;
  title: string;
  body: string;
  link: string;
  read_at: string | null;
  created_at: string;
};

export type ImportedMondayUpdate = {
  monday_update_id: string;
  monday_item_id: string;
  monday_board_id: string;
  parent_monday_id: string | null;
  author_name: string;
  author_email: string | null;
  author_monday_id: string | null;
  body: string;
  created_at: string;
  assets: { name: string; url?: string | null; monday_asset_id?: string | null; mime?: string | null; size_bytes?: number | null }[];
};
