import { describe, expect, it } from "vitest";
import { firstNameKey, suggestFleetAssignee } from "./suggest";

const team = [
  { profile_id: "p-damian", full_name: "Damian Frosztega" },
  { profile_id: "p-rafal", full_name: "Rafal Koziara" },
  { profile_id: "p-mark", full_name: "Mark Maksimowicz" },
  { profile_id: "p-mariusz", full_name: "Mariusz Serwaczak" },
  { profile_id: "p-luke", full_name: "Luke Dlugosz" },
];

describe("suggestFleetAssignee", () => {
  it("normalizes possessives and matches a unique first name", () => {
    expect(firstNameKey("Mario's Pick Up 150")).toBe("mario");
    expect(suggestFleetAssignee("Damian White Van", team)?.full_name).toBe("Damian Frosztega");
    expect(suggestFleetAssignee("Rafal Red Van", team)?.full_name).toBe("Rafal Koziara");
    expect(suggestFleetAssignee("Mark White Van", team)?.full_name).toBe("Mark Maksimowicz");
  });
  it("does not treat Mariusz as Mario, or suggest when the first name is missing or duplicated", () => {
    expect(suggestFleetAssignee("Mario Pick Up", team)).toBeNull();
    expect(suggestFleetAssignee("Mario's Pick Up 150", team)).toBeNull();
    expect(suggestFleetAssignee("Kenny White Van", team)).toBeNull();
    const twoMarks = [...team, { profile_id: "p-mark2", full_name: "Mark Smith" }];
    expect(suggestFleetAssignee("Mark White Van", twoMarks)).toBeNull();
  });
});
