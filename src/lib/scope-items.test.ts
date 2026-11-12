import { describe, expect, it } from "vitest";
import { parseScopeItems, serializeScopeItems, scopeItemsFromForm } from "./scope-items";

describe("parseScopeItems", () => {
  it("parses leading qty with × or x, and plain lines", () => {
    expect(parseScopeItems("42 × Replace 2x4 troffers with LED\n4 x Install occupancy sensors\nRecycle old lamps and ballasts\n")).toEqual([
      { qty: 42, work_item: "Replace 2x4 troffers with LED" },
      { qty: 4, work_item: "Install occupancy sensors" },
      { qty: null, work_item: "Recycle old lamps and ballasts" },
    ]);
  });
  it("keeps a bare number line without a work item as text", () => {
    expect(parseScopeItems("42\n  \nHello")).toEqual([{ qty: null, work_item: "42" }, { qty: null, work_item: "Hello" }]);
  });
});

describe("serializeScopeItems", () => {
  it("round-trips qty rows with a times sign", () => {
    const items = [
      { qty: 42, work_item: "Replace 2x4 troffers with LED" },
      { qty: null, work_item: "Recycle old lamps" },
    ];
    const text = serializeScopeItems(items);
    expect(text).toBe("42 × Replace 2x4 troffers with LED\nRecycle old lamps");
    expect(parseScopeItems(text)).toEqual(items);
  });
});

describe("scopeItemsFromForm", () => {
  it("skips blank work items and empty qty", () => {
    const fd = new FormData();
    fd.append("qty", "3");
    fd.append("work_item", "Sensors");
    fd.append("qty", "");
    fd.append("work_item", "Cleanup");
    fd.append("qty", "2");
    fd.append("work_item", "");
    expect(scopeItemsFromForm(fd)).toEqual([
      { qty: 3, work_item: "Sensors" },
      { qty: null, work_item: "Cleanup" },
    ]);
  });
});
