import { describe, expect, it } from "vitest";
import { addMonths, ageText, projectDates, warrantyFor } from "./project-row";

const job = (over: Partial<Parameters<typeof projectDates>[0][number]> = {}) => ({
  starts_at: "2025-04-14T13:00:00Z", ends_at: "2025-04-14T21:00:00Z", status: "approved" as const, completed_at: "2025-04-15T20:00:00Z", kind: "install" as const, ...over,
});

describe("projectDates", () => {
  it("ignores warranty and service visits for start and completion", () => {
    const d = projectDates([job(), job({ kind: "warranty", status: "scheduled", starts_at: "2026-11-12T15:00:00Z", ends_at: "2026-11-12T17:00:00Z", completed_at: null })]);
    expect(d.completed_date).toBe("2025-04-15T20:00:00.000Z");
    expect(d.start_date).toBe("2025-04-14T13:00:00.000Z");
  });
  it("still treats old rows without a kind as install visits", () => {
    expect(projectDates([{ ...job(), kind: undefined }]).completed_date).toBe("2025-04-15T20:00:00.000Z");
  });
});

describe("warranty", () => {
  it("adds calendar months like Postgres (end-of-month clamped)", () => {
    expect(addMonths("2025-04-15T20:00:00.000Z", 12)).toBe("2026-04-15T20:00:00.000Z");
    expect(addMonths("2025-04-15T20:00:00.000Z", 24)).toBe("2027-04-15T20:00:00.000Z");
    expect(addMonths("2024-01-31T12:00:00.000Z", 1)).toBe("2024-02-29T12:00:00.000Z");
  });
  it("judges in/out on the day the customer reported it", () => {
    expect(warrantyFor("2025-11-15T20:00:00Z", 12, "2026-11-10T16:00:00Z")).toEqual({ state: "in", expires: "2026-11-15T20:00:00.000Z" });
    expect(warrantyFor("2025-04-15T20:00:00Z", 12, "2026-11-10T16:00:00Z").state).toBe("out");
    expect(warrantyFor(null, 12, "2026-11-10T16:00:00Z")).toEqual({ state: "unknown", expires: null });
  });
  it("formats time since completion", () => {
    expect(ageText("2025-04-15T20:00:00Z", "2026-11-10T16:00:00Z")).toBe("1 yr 6 mo");
    expect(ageText("2026-11-01T00:00:00Z", "2026-11-10T00:00:00Z")).toBe("9 days");
  });
});
