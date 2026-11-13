import { describe, expect, it } from "vitest";
import { notificationRecipients, notificationTitle } from "./recipients";

const staff = ["u-aaron", "u-ronan", "u-maya", "u-tech1", "u-luke"];

describe("notificationRecipients", () => {
  it("notifies mentions, the deal owner, assignees, and thread participants, once each", () => {
    const rec = notificationRecipients({
      actorId: "u-ronan",
      mentionIds: ["u-aaron", "u-tech1"],
      threadAuthorIds: ["u-aaron", "u-maya"],
      dealOwnerId: "u-aaron",
      projectAssigneeIds: ["u-tech1", "u-luke"],
      staffIds: staff,
    });
    const by = Object.fromEntries(rec.map((r) => [r.userId, r.kind]));
    expect(by).toEqual({
      "u-aaron": "mention", // mention beats owner and thread
      "u-tech1": "mention", // mention beats assignee
      "u-maya": "thread",
      "u-luke": "assignee",
    });
    expect(by["u-ronan"]).toBeUndefined();
  });

  it("never notifies the actor or a customer id", () => {
    const rec = notificationRecipients({
      actorId: "u-aaron",
      mentionIds: ["u-aaron", "customer-1"],
      threadAuthorIds: [],
      dealOwnerId: "u-aaron",
      projectAssigneeIds: [],
      staffIds: staff,
    });
    expect(rec).toEqual([]);
  });

  it("writes a clear subject", () => {
    expect(notificationTitle("mention", "Ronan O'Connor", "Karla Gonzalez")).toBe("Ronan O'Connor mentioned you on Karla Gonzalez");
  });
});
