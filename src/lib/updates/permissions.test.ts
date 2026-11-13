import { describe, expect, it } from "vitest";
import { canDeleteTeamUpdate, canEditTeamUpdate } from "./permissions";

describe("update permissions", () => {
  it("lets people edit only their own live posts", () => {
    expect(canEditTeamUpdate({ userId: "u-aaron", role: "sales", authorId: "u-aaron", deleted: false })).toBe(true);
    expect(canEditTeamUpdate({ userId: "u-luke", role: "admin", authorId: "u-aaron", deleted: false })).toBe(false);
    expect(canEditTeamUpdate({ userId: "u-aaron", role: "sales", authorId: "u-aaron", deleted: true })).toBe(false);
    expect(canEditTeamUpdate({ userId: "u-luke", role: "admin", authorId: null, deleted: false })).toBe(false);
  });

  it("follows the delete rule for other people's posts; techs can still delete their own", () => {
    const base = { userId: "u-x", authorId: "u-aaron", deleted: false as const };
    expect(canDeleteTeamUpdate({ ...base, userId: "u-aaron", role: "sales", canDeleteFlag: false })).toBe(true);
    expect(canDeleteTeamUpdate({ ...base, userId: "u-tech1", role: "tech", canDeleteFlag: false, authorId: "u-tech1" })).toBe(true);
    expect(canDeleteTeamUpdate({ ...base, userId: "u-tech1", role: "tech", canDeleteFlag: false })).toBe(false);
    expect(canDeleteTeamUpdate({ ...base, userId: "u-luke", role: "admin", canDeleteFlag: false })).toBe(true);
    expect(canDeleteTeamUpdate({ ...base, userId: "u-maria", role: "manager", canDeleteFlag: false })).toBe(false);
    expect(canDeleteTeamUpdate({ ...base, userId: "u-maria", role: "manager", canDeleteFlag: true })).toBe(true);
  });
});
