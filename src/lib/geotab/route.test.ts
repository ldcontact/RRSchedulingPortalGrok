import { afterEach, describe, expect, it, vi } from "vitest";
import { clearRouteCache, fetchDrivingRoute, mapPool, routeCacheKey } from "./route";

afterEach(() => {
  clearRouteCache();
  vi.unstubAllGlobals();
});

describe("fetchDrivingRoute", () => {
  const from = { lat: 42.03, lng: -87.97 };
  const to = { lat: 42.055, lng: -87.999 };

  it("returns an OSRM route and reuses the cache", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: "Ok",
        routes: [{ distance: 5544, duration: 434, geometry: { coordinates: [[-87.97, 42.03], [-87.99, 42.05]] } }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const first = await fetchDrivingRoute(from, to, 30, "j2");
    expect(first).toMatchObject({ source: "osrm", meters: 5544, minutes: 7 });
    expect(first.route).toEqual([[42.03, -87.97], [42.05, -87.99]]);
    const second = await fetchDrivingRoute({ lat: 42.03001, lng: -87.97001 }, to, 30, "j2");
    expect(second.source).toBe("osrm");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(routeCacheKey(from, "j2")).toBe("j2:42.0300,-87.9700");
  });

  it("falls back to straight-line distance when OSRM fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    const out = await fetchDrivingRoute(from, to, 25, "j-fail");
    expect(out.source).toBe("straight-line");
    expect(out.route).toEqual([]);
    expect(out.meters).toBeGreaterThan(1000);
    expect(out.minutes).toBeGreaterThan(0);
  });
});

describe("mapPool", () => {
  it("runs at most N tasks at a time", async () => {
    let live = 0;
    let max = 0;
    await mapPool([1, 2, 3, 4, 5], 2, async (n) => {
      live += 1;
      max = Math.max(max, live);
      await new Promise((r) => setTimeout(r, 15));
      live -= 1;
      return n * 2;
    }).then((out) => {
      expect(out).toEqual([2, 4, 6, 8, 10]);
    });
    expect(max).toBeLessThanOrEqual(2);
  });
});
