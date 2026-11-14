import { describe, expect, it } from "vitest";
import { countActiveServiceFilters } from "./service-request-filters";

describe("countActiveServiceFilters", () => {
  it("is 0 when nothing is set", () => {
    expect(countActiveServiceFilters({})).toBe(0);
    expect(countActiveServiceFilters({ channel: "", warranty: "  ", assignee: undefined })).toBe(0);
  });

  it("counts channel, warranty, and assignee only", () => {
    expect(countActiveServiceFilters({ channel: "call" })).toBe(1);
    expect(countActiveServiceFilters({ channel: "email", warranty: "out" })).toBe(2);
    expect(countActiveServiceFilters({ channel: "other", warranty: "in", assignee: "me" })).toBe(3);
    expect(countActiveServiceFilters({ assignee: "none" })).toBe(1);
  });
});
