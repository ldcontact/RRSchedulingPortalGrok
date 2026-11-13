import { describe, expect, it } from "vitest";
import { displayMentions, filterMentionQuery, mentionToken, parseMentionIds } from "./mentions";
import type { MentionableUser } from "./types";

const users: MentionableUser[] = [
  { id: "u-aaron", name: "Aaron Ozrovitz", email: "aaron@retrofitrebates.com", color: "#0369a1", role: "sales" },
  { id: "u-ronan", name: "Ronan O'Connor", email: "ronan@squarepropertyservices.com", color: "#0e7490", role: "sales" },
  { id: "u-tech1", name: "Carlos Mendez", email: "carlos.mendez@yahoo.com", color: "#ea580c", role: "tech" },
];

describe("mentions", () => {
  it("round-trips a token", () => {
    const token = mentionToken(users[0]);
    expect(token).toBe("@[Aaron Ozrovitz](u-aaron)");
    expect(parseMentionIds(`Can ${token} take this?`, users)).toEqual(["u-aaron"]);
    expect(displayMentions(`Can ${token} take this?`)).toBe("Can @Aaron Ozrovitz take this?");
  });

  it("parses a plain @Name", () => {
    expect(parseMentionIds("Need a look from @Carlos Mendez today.", users)).toEqual(["u-tech1"]);
  });

  it("ignores unknown people", () => {
    expect(parseMentionIds("Ask @[Karla Gonzalez](not-a-user) about the attic.", users)).toEqual([]);
  });

  it("filters the picker", () => {
    expect(filterMentionQuery(users, "o'connor").map((u) => u.id)).toEqual(["u-ronan"]);
    expect(filterMentionQuery(users, "retrofit").map((u) => u.id)).toEqual(["u-aaron"]);
  });
});
