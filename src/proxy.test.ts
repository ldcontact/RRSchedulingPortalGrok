import { describe, expect, it } from "vitest";
import { isPublicPath } from "./proxy";

describe("isPublicPath", () => {
  it("allows signed-out visitors to reach the privacy policy and get-started", () => {
    expect(isPublicPath("/privacy")).toBe(true);
    expect(isPublicPath("/get-started")).toBe(true);
    expect(isPublicPath("/login")).toBe(true);
  });

  it("keeps app pages behind login", () => {
    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/sales")).toBe(false);
    expect(isPublicPath("/customers")).toBe(false);
    expect(isPublicPath("/projects")).toBe(false);
  });
});
