import { describe, expect, it } from "vitest";
import { hasHeading, jobSiteIconHtml, JOB_SITE_FILL, vehicleIconHtml, VEHICLE_FILL, vehicleStatusDotStyle } from "./map-icons";

describe("fleet map icons", () => {
  it("uses a green vehicle when driving and a slate vehicle when stopped", () => {
    const driving = vehicleIconHtml("driving");
    const stopped = vehicleIconHtml("stopped");
    expect(driving).toContain(VEHICLE_FILL.driving);
    expect(stopped).toContain(VEHICLE_FILL.stopped);
    expect(VEHICLE_FILL.driving).not.toBe(VEHICLE_FILL.stopped);
    expect(driving).toContain("<svg");
    expect(stopped).toContain("<svg");
    expect(driving).not.toContain(VEHICLE_FILL.stopped);
  });

  it("mutes offline vehicles and never treats them as driving-green", () => {
    const offline = vehicleIconHtml("offline");
    expect(offline).toContain(VEHICLE_FILL.offline);
    expect(offline).toContain("is-offline");
    expect(offline).toContain("opacity:.75");
    expect(offline).not.toContain(VEHICLE_FILL.driving);
  });

  it("rotates by heading when it is a finite number, otherwise leaves the icon unrotated", () => {
    expect(vehicleIconHtml("driving", { heading: 120 })).toContain("rotate(120deg)");
    expect(vehicleIconHtml("stopped", { heading: 0 })).toContain("rotate(0deg)");
    expect(hasHeading(90)).toBe(true);
    expect(hasHeading(null)).toBe(false);
    expect(hasHeading(Number.NaN)).toBe(false);
    expect(vehicleIconHtml("driving", { heading: null })).not.toContain("rotate(");
    expect(vehicleIconHtml("driving", { heading: Number.NaN })).not.toContain("rotate(");
  });

  it("marks the selected vehicle and uses an orange house pin for job sites", () => {
    const selected = vehicleIconHtml("driving", { selected: true });
    expect(selected).toContain("is-selected");
    expect(selected).toContain("box-shadow");
    const site = jobSiteIconHtml();
    expect(site).toContain("<svg");
    expect(site).toContain(JOB_SITE_FILL);
    expect(site).toContain("fleet-jobsite-icon");
  });

  it("exposes the same status colors for list dots as the map icons", () => {
    expect(vehicleStatusDotStyle("driving")).toEqual({ backgroundColor: VEHICLE_FILL.driving });
    expect(vehicleStatusDotStyle("stopped")).toEqual({ backgroundColor: VEHICLE_FILL.stopped });
    expect(vehicleStatusDotStyle("offline")).toEqual({ backgroundColor: VEHICLE_FILL.offline, opacity: 0.75 });
  });
});
