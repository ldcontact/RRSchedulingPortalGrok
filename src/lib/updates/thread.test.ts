import { describe, expect, it } from "vitest";
import { nestUpdateThreads } from "./thread";
import type { TeamUpdate } from "./types";

const base: Omit<TeamUpdate, "id" | "parent_id" | "created_at" | "body"> = {
  deal_id: "d1", project_id: null, monday_update_id: null, author_id: "a", author_name: "A", author_email: null,
  edited_at: null, deleted_at: null, assets: [], mention_ids: [],
};

describe("nestUpdateThreads", () => {
  it("lists questions newest first and keeps full replies in order under the parent", () => {
    const rows: TeamUpdate[] = [
      { ...base, id: "q-old", parent_id: null, created_at: "2026-05-08T12:00:00.000Z", body: "Old question" },
      { ...base, id: "q-new", parent_id: null, created_at: "2026-07-23T12:00:00.000Z", body: "New question" },
      { ...base, id: "r1", parent_id: "q-new", created_at: "2026-07-23T13:00:00.000Z", body: "First reply in full" },
      { ...base, id: "r2", parent_id: "q-new", created_at: "2026-07-23T14:00:00.000Z", body: "Second reply in full" },
    ];
    const threads = nestUpdateThreads(rows);
    expect(threads.map((t) => t.id)).toEqual(["q-new", "q-old"]);
    expect(threads[0].replies.map((r) => r.body)).toEqual(["First reply in full", "Second reply in full"]);
    expect(threads[1].replies).toEqual([]);
  });
});
