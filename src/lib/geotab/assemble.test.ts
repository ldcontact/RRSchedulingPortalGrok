import { describe, expect, it } from "vitest";
import { assembleLocations } from "./assemble";
import { SAMPLE_AS_OF, SAMPLE_DEFAULT_MAP, SAMPLE_VEHICLES } from "./sample";
import type { FleetPerson } from "./types";

const people: FleetPerson[] = [
  { id: "u-admin", full_name: "Luke Dlugosz", color: "#0f766e" },
  { id: "u-tech1", full_name: "Carlos Mendez", color: "#ea580c" },
  { id: "u-tech2", full_name: "Jake Sullivan", color: "#2563eb" },
  { id: "u-tech3", full_name: "Andre Williams", color: "#db2777" },
  { id: "u-tech4", full_name: "Emily Chen", color: "#16a34a" },
];
const jobs = [
  { id: "j3", title: "High bays – bays 1 & 2", customer_name: "Golf Road Auto Body", address: "905 E Golf Rd, Schaumburg IL", starts_at: "2026-11-11T13:00:00.000Z", ends_at: "2026-11-11T17:00:00.000Z", assignees: [{ id: "u-tech4" }] },
  { id: "j2", title: "Exam rooms + hallway retrofit", customer_name: "Lakeview Family Dental", address: "1420 W Algonquin Rd", starts_at: "2026-11-11T14:00:00.000Z", ends_at: "2026-11-11T21:00:00.000Z", assignees: [{ id: "u-tech1" }, { id: "u-tech2" }] },
];

const base = { asOf: SAMPLE_AS_OF, snapshots: SAMPLE_VEHICLES, mappings: SAMPLE_DEFAULT_MAP, people, jobs };

describe("assembleLocations", () => {
  it("flags sample data and pins today's visits only when sample coords exist", () => {
    const res = assembleLocations({ ...base, sample: true, scope: "all", viewerId: "u-admin" });
    expect(res.sample).toBe(true);
    expect(res.geocoding).toBe("census");
    expect(res.vehicles).toHaveLength(SAMPLE_VEHICLES.length);
    expect(res.visits.map((v) => v.jobId).sort()).toEqual(["j2", "j3"]);
  });
  it("marks Emily / Truck 2 as arrived at Golf Road and Carlos as en route", () => {
    const res = assembleLocations({ ...base, sample: true, scope: "all", viewerId: "u-admin" });
    const emily = res.vehicles.find((v) => v.profile?.id === "u-tech4")!;
    expect(emily.nearestVisit?.kind).toBe("onsite");
    expect(emily.nearestVisit?.customerName).toBe("Golf Road Auto Body");
    const carlos = res.vehicles.find((v) => v.profile?.id === "u-tech1")!;
    expect(carlos.nearestVisit?.kind).toBe("enroute");
    expect(carlos.status).toBe("driving");
    expect(carlos.speedMph).toBeGreaterThan(0);
  });
  it("hides unmapped / other trucks from a tech with own scope", () => {
    const res = assembleLocations({ ...base, sample: true, scope: "own", viewerId: "u-tech1" });
    expect(res.vehicles).toHaveLength(1);
    expect(res.vehicles[0].profile?.id).toBe("u-tech1");
  });
  it("does not attach visit pins when not in sample mode and jobs have no stored coords", () => {
    const res = assembleLocations({ ...base, sample: false, scope: "all", viewerId: "u-admin" });
    expect(res.sample).toBe(false);
    expect(res.visits).toEqual([]);
    expect(res.vehicles.find((v) => v.profile?.id === "u-tech4")!.nearestVisit).toBeNull();
  });
  it("uses stored Census coordinates even when Geotab is live (not sample), including 150 m arrival", () => {
    const withCoords = [
      { ...jobs[0], latitude: 42.048335210405, longitude: -88.100787329604 },
      { ...jobs[1], latitude: 42.05564871268, longitude: -87.999730840348 },
    ];
    const res = assembleLocations({ ...base, jobs: withCoords, sample: false, scope: "all", viewerId: "u-admin" });
    expect(res.visits).toHaveLength(2);
    expect(res.visits.find((v) => v.jobId === "j3")).toMatchObject({ latitude: 42.048335210405, longitude: -88.100787329604 });
    const emily = res.vehicles.find((v) => v.profile?.id === "u-tech4")!;
    expect(emily.nearestVisit?.kind).toBe("onsite");
    expect(emily.nearestVisit?.customerName).toBe("Golf Road Auto Body");
    const carlos = res.vehicles.find((v) => v.profile?.id === "u-tech1")!;
    expect(carlos.nearestVisit?.kind).toBe("enroute");
  });
});
