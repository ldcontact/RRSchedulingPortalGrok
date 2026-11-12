import { describe, expect, it } from "vitest";
import { deriveCustomerActivity } from "./activity";

describe("deriveCustomerActivity", () => {
  it("always includes profile created and sorts newest first", () => {
    const events = deriveCustomerActivity({
      customerId: "c1",
      createdAt: "2024-01-15T12:00:00Z",
      projects: [{ id: "p1", name: "LED retrofit", created_at: "2024-03-01T10:00:00Z" }],
      notes: [{ id: "n1", body: "Called the office manager", created_at: "2024-03-02T15:00:00Z", author_name: "Luke" }],
      messages: [],
    });
    expect(events.map((e) => e.kind)).toEqual(["note_added", "project_created", "profile_created"]);
    const project = events.find((e) => e.kind === "project_created")!;
    expect(project.href).toBe("/projects/p1");
    expect(project.hrefLabel).toBe("Open project");
    expect(project.detail).toBe("LED retrofit");
  });

  it("does not invent events when there are no projects or notes", () => {
    const events = deriveCustomerActivity({
      customerId: "c2",
      createdAt: "2024-01-01T00:00:00Z",
      projects: [],
      notes: [],
      messages: [],
    });
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("profile_created");
  });
});
