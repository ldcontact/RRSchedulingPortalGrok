import { describe, expect, it } from "vitest";
import { PROJECT_TYPE_COLOR, PROJECT_TYPE_GROUPS, PROJECT_TYPE_PICKER_ORDER } from "./project-type";
import { PROJECT_TYPES, PROJECT_TYPE_LABEL, type ProjectType } from "./types";

describe("project types", () => {
  it("lists every type in the agreed display order, including Pipe Insulation after Weatherization", () => {
    expect([...PROJECT_TYPES]).toEqual([
      "lighting",
      "hvac",
      "lighting_hvac",
      "whe_single_family",
      "whe_multifamily",
      "ac",
      "ptac_to_hpac",
      "weatherization",
      "pipe_insulation",
      "steam_traps",
      "boiler_tune_up",
      "hot_water_controllers",
      "audit",
      "other",
    ]);
    expect(PROJECT_TYPE_LABEL.lighting).toBe("LED Lighting");
    expect(PROJECT_TYPE_LABEL.pipe_insulation).toBe("Pipe Insulation");
    expect(PROJECT_TYPE_LABEL.whe_single_family).toBe("Whole Home Electric – Single Family");
    expect(PROJECT_TYPE_LABEL.whe_multifamily).toBe("Whole Home Electric – Multifamily");
    expect(PROJECT_TYPE_LABEL.ptac_to_hpac).toBe("PTAC to HPAC");
    expect(PROJECT_TYPE_LABEL.boiler_tune_up).toBe("Boiler Tune Up");
    expect(PROJECT_TYPE_LABEL.hot_water_controllers).toBe("Hot Water Controllers");
    expect(Object.keys(PROJECT_TYPE_LABEL)).toEqual([...PROJECT_TYPES]);
    for (const t of PROJECT_TYPES) {
      expect(PROJECT_TYPE_LABEL[t as ProjectType].length).toBeGreaterThan(0);
      expect(PROJECT_TYPE_COLOR[t].startsWith("#")).toBe(true);
    }
  });

  it("groups types for the Option B picker, with Pipe Insulation after Weatherization", () => {
    expect(PROJECT_TYPE_GROUPS.map((g) => g.label)).toEqual([
      "Lighting",
      "HVAC & Heat Pumps",
      "Whole Home Electric",
      "Building Envelope & Steam",
      "Other",
    ]);
    expect([...PROJECT_TYPE_GROUPS.find((g) => g.id === "envelope")!.types]).toEqual([
      "weatherization",
      "pipe_insulation",
      "steam_traps",
    ]);
    const grouped = PROJECT_TYPE_PICKER_ORDER;
    expect(new Set(grouped)).toEqual(new Set(PROJECT_TYPES));
    expect(grouped).toHaveLength(PROJECT_TYPES.length);
  });
});
