import { describe, expect, it } from "vitest";
import { authorEmailForMondayUser, flattenMondayUpdates } from "./monday-map";

describe("flattenMondayUpdates", () => {
  it("keeps replies under the question and maps author emails", () => {
    const rows = flattenMondayUpdates([
      {
        id: "u1",
        item_id: "11633298670",
        created_at: "2026-07-23T18:49:08.000Z",
        text_body: "Question in full",
        creator: { id: "100546905", name: "Ronan O'Connor" },
        replies: [
          { id: "r1", created_at: "2026-07-23T19:10:00.000Z", text_body: "Reply in full", creator: { id: "38133299", name: "Aaron Ozrovitz" } },
        ],
        assets: [],
      },
    ], "3747287195");
    expect(rows).toHaveLength(2);
    expect(rows[0].parent_monday_id).toBeNull();
    expect(rows[1].parent_monday_id).toBe("u1");
    expect(rows[0].author_email).toBe("ronan@squarepropertyservices.com");
    expect(rows[1].author_email).toBe("aaron@retrofitrebates.com");
    expect(rows[1].body).toBe("Reply in full");
  });

  it("maps Terry's Monday email", () => {
    expect(authorEmailForMondayUser("38133270")).toBe("terryl@retrofitrebates.com");
  });
});
