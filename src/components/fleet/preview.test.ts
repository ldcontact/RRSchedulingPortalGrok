import { afterEach, describe, expect, it, vi } from "vitest";
import { allowMapAnimation, createPreviewController, previewVehicleId, previewVisitId, type PreviewTarget } from "./preview";

afterEach(() => {
  vi.useRealTimers();
});

describe("createPreviewController", () => {
  it("debounces enter and leave so moving across rows does not apply every card", () => {
    vi.useFakeTimers();
    const seen: PreviewTarget[] = [];
    const ctl = createPreviewController((t) => seen.push(t), { enterMs: 100, leaveMs: 200 });
    ctl.enter({ kind: "vehicle", id: "a" });
    vi.advanceTimersByTime(50);
    ctl.enter({ kind: "vehicle", id: "b" });
    vi.advanceTimersByTime(99);
    expect(seen).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(seen).toEqual([{ kind: "vehicle", id: "b" }]);
    ctl.leave();
    vi.advanceTimersByTime(199);
    expect(seen).toEqual([{ kind: "vehicle", id: "b" }]);
    vi.advanceTimersByTime(1);
    expect(seen).toEqual([{ kind: "vehicle", id: "b" }, null]);
  });

  it("cancels a pending leave when another row is entered", () => {
    vi.useFakeTimers();
    const seen: PreviewTarget[] = [];
    const ctl = createPreviewController((t) => seen.push(t), { enterMs: 100, leaveMs: 200 });
    ctl.enter({ kind: "visit", id: "j1" });
    vi.advanceTimersByTime(100);
    ctl.leave();
    ctl.enter({ kind: "visit", id: "j2" });
    vi.advanceTimersByTime(200);
    expect(seen).toEqual([{ kind: "visit", id: "j1" }, { kind: "visit", id: "j2" }]);
  });

  it("does not apply a preview that is left before the enter delay", () => {
    vi.useFakeTimers();
    const seen: PreviewTarget[] = [];
    const ctl = createPreviewController((t) => seen.push(t), { enterMs: 100, leaveMs: 200 });
    ctl.enter({ kind: "vehicle", id: "a" });
    ctl.leave();
    vi.advanceTimersByTime(300);
    expect(seen).toEqual([null]);
  });
});

describe("preview helpers", () => {
  it("reads the vehicle or visit id from a target", () => {
    expect(previewVehicleId({ kind: "vehicle", id: "v1" })).toBe("v1");
    expect(previewVisitId({ kind: "vehicle", id: "v1" })).toBeNull();
    expect(previewVisitId({ kind: "visit", id: "j1" })).toBe("j1");
    expect(previewVehicleId(null)).toBeNull();
  });

  it("disables map animation when the user prefers reduced motion", () => {
    const previous = globalThis.window;
    function stub(matches: boolean) {
      return {
        matchMedia: (query: string) => ({
          matches,
          media: query,
          onchange: null,
          addListener() {},
          removeListener() {},
          addEventListener() {},
          removeEventListener() {},
          dispatchEvent() { return false; },
        }),
      } as unknown as Window & typeof globalThis;
    }
    globalThis.window = stub(true);
    expect(allowMapAnimation()).toBe(false);
    globalThis.window = stub(false);
    expect(allowMapAnimation()).toBe(true);
    globalThis.window = previous;
  });
});
