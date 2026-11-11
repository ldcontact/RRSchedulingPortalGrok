import { describe, expect, it } from "vitest";
import type { FleetVehicle, FleetVisitPin } from "@/lib/geotab/types";
import {
  jobFilterCounts,
  parseFilterQuery,
  serializeFilterQuery,
  vehicleMatchesFilters,
  visitMatchesFilters,
  visibleJobFilters,
} from "./filters";

function visit(partial: Partial<FleetVisitPin> & Pick<FleetVisitPin, "jobId" | "projectType" | "kind">): FleetVisitPin {
  return {
    title: "Visit", customerName: "Acme", address: "1 Main", startsAt: "2026-11-11T14:00:00.000Z", endsAt: "2026-11-11T16:00:00.000Z",
    latitude: 42, longitude: -88, assigneeIds: [], projectId: "p1", projectName: "Acme LEDs", status: "scheduled", assignees: [],
    ...partial,
  };
}

describe("fleet filter query", () => {
  it("round-trips types and vehicle status, and ignores unknown keys", () => {
    const qs = serializeFilterQuery(["lighting", "warranty"], ["driving"]);
    expect(qs).toBe("types=lighting,warranty&vehicles=driving");
    const parsed = parseFilterQuery(new URLSearchParams(qs));
    expect(parsed).toEqual({ types: ["lighting", "warranty"], vehicles: ["driving"] });
    expect(parseFilterQuery(new URLSearchParams("types=lighting,audit,weatherization&vehicles=offline,stopped"))).toEqual({
      types: ["lighting"],
      vehicles: ["stopped"],
    });
    expect(parseFilterQuery(new URLSearchParams(""))).toEqual({ types: [], vehicles: [] });
  });
});

describe("visit and vehicle matching", () => {
  const lighting = visit({ jobId: "a", projectType: "lighting", kind: "install" });
  const hvac = visit({ jobId: "b", projectType: "hvac", kind: "install" });
  const warranty = visit({ jobId: "c", projectType: "lighting", kind: "warranty" });

  it("treats an empty selection as All, and unions selected chips", () => {
    expect(visitMatchesFilters(lighting, [])).toBe(true);
    expect(visitMatchesFilters(lighting, ["hvac"])).toBe(false);
    expect(visitMatchesFilters(hvac, ["hvac"])).toBe(true);
    expect(visitMatchesFilters(warranty, ["warranty"])).toBe(true);
    expect(visitMatchesFilters(warranty, ["lighting"])).toBe(true);
    expect(visitMatchesFilters(lighting, ["lighting", "hvac"])).toBe(true);
    expect(visitMatchesFilters(hvac, ["warranty"])).toBe(false);
  });

  it("counts chips from the unfiltered visit list and hides types that are not present", () => {
    const counts = jobFilterCounts([lighting, lighting, hvac, warranty]);
    expect(counts.lighting).toBe(3);
    expect(counts.hvac).toBe(1);
    expect(counts.warranty).toBe(1);
    expect(counts.service).toBe(0);
    expect(visibleJobFilters(counts)).toEqual(["lighting", "hvac", "warranty"]);
  });

  it("filters vehicles by driving or stopped and leaves offline visible only when All is selected", () => {
    const driving = { status: "driving" } as FleetVehicle;
    const stopped = { status: "stopped" } as FleetVehicle;
    const offline = { status: "offline" } as FleetVehicle;
    expect(vehicleMatchesFilters(offline, [])).toBe(true);
    expect(vehicleMatchesFilters(driving, ["driving"])).toBe(true);
    expect(vehicleMatchesFilters(stopped, ["driving"])).toBe(false);
    expect(vehicleMatchesFilters(offline, ["stopped"])).toBe(false);
    expect(vehicleMatchesFilters(stopped, ["driving", "stopped"])).toBe(true);
  });
});
