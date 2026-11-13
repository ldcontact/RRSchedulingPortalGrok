import { describe, expect, it } from "vitest";
import { isPublicPath } from "./proxy";

describe("isPublicPath", () => {
  it("allows signed-out visitors to reach the privacy policy and get-started", () => {
    expect(isPublicPath("/privacy")).toBe(true);
    expect(isPublicPath("/get-started")).toBe(true);
    expect(isPublicPath("/login")).toBe(true);
  });

  it("lets the team-sms cron and inbound webhook authenticate themselves", () => {
    expect(isPublicPath("/api/cron/team-sms")).toBe(true);
    expect(isPublicPath("/api/team/sms/inbound")).toBe(true);
  });

  it("keeps app pages behind login", () => {
    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/sales")).toBe(false);
    expect(isPublicPath("/customers")).toBe(false);
    expect(isPublicPath("/projects")).toBe(false);
    expect(isPublicPath("/team")).toBe(false);
    expect(isPublicPath("/api/fleet/locations")).toBe(false);
  });
});
