import { describe, expect, it } from "vitest";
import { startedByCaption } from "./started-by";

const people = [
  { id: "u-tech1", full_name: "Carlos Mendez" },
  { id: "u-tech3", full_name: "Andre Williams" },
];

describe("startedByCaption", () => {
  it("returns null when started_by is missing", () => {
    expect(startedByCaption(null, people)).toBeNull();
    expect(startedByCaption(undefined, people)).toBeNull();
    expect(startedByCaption("", people)).toBeNull();
  });

  it("returns Started by <name> when the profile is in the list", () => {
    expect(startedByCaption("u-tech1", people)).toBe("Started by Carlos Mendez");
  });

  it("returns null for a starter who is not in the list", () => {
    expect(startedByCaption("u-manager", people)).toBeNull();
  });

  it("returns null when the matched name is blank", () => {
    expect(startedByCaption("u-x", [{ id: "u-x", full_name: "  " }])).toBeNull();
  });
});
