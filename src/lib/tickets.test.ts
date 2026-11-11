import { describe, expect, it } from "vitest";
import { resolveNewTicketAssignee } from "./tickets";

const luke = { id: "u-luke", name: "Luke" };
const staff = [
  { id: "u-luke", full_name: "Luke" },
  { id: "u-manager", full_name: "Alex Manager" },
];

describe("resolveNewTicketAssignee", () => {
  it("defaults to the person who logged the ticket", () => {
    expect(resolveNewTicketAssignee(undefined, luke, staff)).toEqual({ id: "u-luke", name: "Luke" });
    expect(resolveNewTicketAssignee("", luke, staff)).toEqual({ id: "u-luke", name: "Luke" });
    expect(resolveNewTicketAssignee("   ", luke, staff)).toEqual({ id: "u-luke", name: "Luke" });
    expect(resolveNewTicketAssignee(null, luke)).toEqual({ id: "u-luke", name: "Luke" });
  });

  it("uses an explicitly chosen staff assignee", () => {
    expect(resolveNewTicketAssignee("u-manager", luke, staff)).toEqual({ id: "u-manager", name: "Alex Manager" });
  });

  it("rejects an unknown or non-staff assignee", () => {
    expect(resolveNewTicketAssignee("u-tech", luke, staff)).toEqual({ error: "Pick an admin or manager." });
    expect(resolveNewTicketAssignee("u-manager", luke, [])).toEqual({ error: "Pick an admin or manager." });
  });
});
