import { describe, expect, it } from "vitest";
import { isAppNavigationAnchor, isModifiedClick, pathAndSearch } from "./nav-progress";

const loc = { origin: "https://app.example", pathname: "/customers", search: "" };

function anchor(href: string, extra: { target?: string; download?: boolean } = {}) {
  return {
    href: href.startsWith("http") ? href : `https://app.example${href.startsWith("/") ? "" : "/"}${href}`,
    target: extra.target ?? "",
    hasAttribute: (n: string) => n === "download" && !!extra.download,
    getAttribute: (n: string) => (n === "href" ? href : null),
  };
}

describe("isAppNavigationAnchor", () => {
  it("accepts an in-app path change", () => {
    expect(isAppNavigationAnchor(anchor("/customers/c1"), loc)).toBe(true);
  });
  it("accepts a query-string change on the same path", () => {
    expect(isAppNavigationAnchor(anchor("/customers?q=lake"), loc)).toBe(true);
  });
  it("ignores the current path and query", () => {
    expect(isAppNavigationAnchor(anchor("/customers"), loc)).toBe(false);
    expect(isAppNavigationAnchor(anchor("/customers?tab=jobs"), { ...loc, search: "?tab=jobs" })).toBe(false);
  });
  it("ignores hash-only, mailto, tel, sms, downloads, new tabs, and off-origin links", () => {
    expect(isAppNavigationAnchor(anchor("#notes"), loc)).toBe(false);
    expect(isAppNavigationAnchor(anchor("mailto:a@b.com"), loc)).toBe(false);
    expect(isAppNavigationAnchor(anchor("tel:+1555"), loc)).toBe(false);
    expect(isAppNavigationAnchor(anchor("sms:+1555"), loc)).toBe(false);
    expect(isAppNavigationAnchor(anchor("/file.pdf", { download: true }), loc)).toBe(false);
    expect(isAppNavigationAnchor(anchor("/projects", { target: "_blank" }), loc)).toBe(false);
    const ext = { ...anchor("https://maps.google.com/?q=1"), href: "https://maps.google.com/?q=1", getAttribute: (n: string) => (n === "href" ? "https://maps.google.com/?q=1" : null) };
    expect(isAppNavigationAnchor(ext, loc)).toBe(false);
  });
});

describe("pathAndSearch / isModifiedClick", () => {
  it("strips the origin from an href", () => {
    expect(pathAndSearch("https://app.example/projects/p1?tab=visits", "https://app.example")).toBe("/projects/p1?tab=visits");
    expect(pathAndSearch("/customers/c1", "https://app.example")).toBe("/customers/c1");
  });
  it("detects modified clicks that should open without in-page pending state", () => {
    expect(isModifiedClick({ button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false })).toBe(false);
    expect(isModifiedClick({ button: 1, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false })).toBe(true);
    expect(isModifiedClick({ button: 0, metaKey: true, ctrlKey: false, shiftKey: false, altKey: false })).toBe(true);
    expect(isModifiedClick({ button: 0, metaKey: false, ctrlKey: true, shiftKey: false, altKey: false })).toBe(true);
  });
});
