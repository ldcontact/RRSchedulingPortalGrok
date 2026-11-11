import { describe, expect, it } from "vitest";
import { VEHICLE_FILL } from "./map-icons";
import {
  CLUSTER_RADIUS_PX,
  clusterAppearance,
  clusterByPixelDistance,
  minPairPixelDistance,
  spiderfyOffsets,
  vehicleTagLabel,
  zoomToSeparate,
} from "./cluster";

const project = (lat: number, lng: number) => ({ x: lng, y: -lat });

describe("clusterByPixelDistance", () => {
  it("groups vehicles that are within a few pixels and leaves far ones alone", () => {
    const items = [
      { id: "a", latitude: 10, longitude: 20 },
      { id: "b", latitude: 10, longitude: 20 + 10 },
      { id: "c", latitude: 10, longitude: 20 + 200 },
    ];
    const groups = clusterByPixelDistance(items, project, 36);
    expect(groups).toHaveLength(2);
    const sizes = groups.map((g) => g.members.map((m) => m.id).sort().join(",")).sort();
    expect(sizes).toEqual(["a,b", "c"]);
  });

  it("never clusters a single isolated vehicle", () => {
    const groups = clusterByPixelDistance([{ id: "a", latitude: 1, longitude: 2 }], project, 36);
    expect(groups).toHaveLength(1);
    expect(groups[0].members).toHaveLength(1);
  });
});

describe("zoomToSeparate", () => {
  it("zooms in until members would exceed the cluster radius", () => {
    const res = zoomToSeparate(10, 12, 19, 36);
    expect(res.spiderfy).toBe(false);
    expect(res.zoom).toBeGreaterThan(12);
    expect(res.zoom).toBeLessThanOrEqual(19);
    // 10 * 2^(z-12) >= 56 → z >= 12 + log2(5.6) ≈ 14.5
    expect(res.zoom).toBeCloseTo(12 + Math.log2(56 / 10), 6);
  });

  it("spiderfies at the current zoom when points cannot separate by max zoom", () => {
    expect(zoomToSeparate(0, 14, 19).spiderfy).toBe(true);
    expect(zoomToSeparate(0.01, 18, 19).spiderfy).toBe(true);
    const almostSame = zoomToSeparate(0.2, 14, 19, 36);
    expect(almostSame.spiderfy).toBe(true);
  });

  it("does not zoom further when already separated", () => {
    const res = zoomToSeparate(80, 15, 19, 36);
    expect(res).toEqual({ zoom: 15, spiderfy: false });
  });
});

describe("clusterAppearance", () => {
  it("is green when any member is driving, red when all stopped, and split when both are present", () => {
    expect(clusterAppearance(["driving", "offline"])).toEqual({ fill: VEHICLE_FILL.driving, split: false });
    expect(clusterAppearance(["stopped", "stopped"])).toEqual({ fill: VEHICLE_FILL.stopped, split: false });
    expect(clusterAppearance(["driving", "stopped"])).toEqual({ fill: VEHICLE_FILL.driving, split: true });
    expect(clusterAppearance(["offline"])).toEqual({ fill: VEHICLE_FILL.offline, split: false });
  });
});

describe("vehicleTagLabel", () => {
  it("uses the assigned team member, or the vehicle name when unassigned", () => {
    expect(vehicleTagLabel({ profile: { full_name: "Ronan Blake" }, label: null, name: "White Van" }, false)).toBe("Ronan Blake");
    expect(vehicleTagLabel({ profile: { full_name: "Ronan Blake" }, label: null, name: "White Van" }, true)).toBe("Ronan");
    expect(vehicleTagLabel({ profile: null, label: null, name: "Ronan White Van" }, false)).toBe("Ronan White Van");
  });
});

describe("spiderfyOffsets", () => {
  it("fans members out around the origin with unique positions", () => {
    const two = spiderfyOffsets(2);
    expect(two).toHaveLength(2);
    expect(Math.hypot(two[0].x - two[1].x, two[0].y - two[1].y)).toBeGreaterThan(CLUSTER_RADIUS_PX);
    const four = spiderfyOffsets(4);
    const keys = new Set(four.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`));
    expect(keys.size).toBe(4);
  });
});

describe("minPairPixelDistance", () => {
  it("returns the closest pair distance", () => {
    expect(minPairPixelDistance([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 30, y: 0 }])).toBe(5);
  });
});
