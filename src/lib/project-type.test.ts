import { describe, expect, it } from "vitest";
import { PROJECT_TYPES, PROJECT_TYPE_LABEL, type ProjectType } from "./types";

describe("project types", () => {
  it("lists every type in the agreed display order, including existing lighting (relabeled)", () => {
    expect([...PROJECT_TYPES]).toEqual([
      "lighting",
      "hvac",
      "lighting_hvac",
      "whe_single_family",
      "whe_multifamily",
      "ac",
      "ptac_to_hpac",
      "weatherization",
      "steam_traps",
      "boiler_tune_up",
      "hot_water_controllers",
      "audit",
      "other",
    ]);
    expect(PROJECT_TYPE_LABEL.lighting).toBe("LED Lighting");
    expect(PROJECT_TYPE_LABEL.whe_single_family).toBe("Whole Home Electric – Single Family");
    expect(PROJECT_TYPE_LABEL.whe_multifamily).toBe("Whole Home Electric – Multifamily");
    expect(PROJECT_TYPE_LABEL.ptac_to_hpac).toBe("PTAC to HPAC");
    expect(PROJECT_TYPE_LABEL.boiler_tune_up).toBe("Boiler Tune Up");
    expect(PROJECT_TYPE_LABEL.hot_water_controllers).toBe("Hot Water Controllers");
    expect(Object.keys(PROJECT_TYPE_LABEL)).toEqual([...PROJECT_TYPES]);
    for (const t of PROJECT_TYPES) {
      expect(PROJECT_TYPE_LABEL[t as ProjectType].length).toBeGreaterThan(0);
    }
  });
});
