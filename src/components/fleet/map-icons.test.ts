import { describe, expect, it } from "vitest";
import { clusterIconHtml, hasHeading, jobSiteIconHtml, JOB_SITE_FILL, vehicleIconHtml, VEHICLE_FILL, vehicleStatusDotStyle } from "./map-icons";

describe("fleet map icons", () => {
  it("uses a green vehicle when driving and a red vehicle when stopped", () => {
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
    expect(VEHICLE_FILL.stopped).toBe("#dc2626");
    expect(vehicleStatusDotStyle("driving")).toEqual({ backgroundColor: VEHICLE_FILL.driving });
    expect(vehicleStatusDotStyle("stopped")).toEqual({ backgroundColor: VEHICLE_FILL.stopped });
    expect(vehicleStatusDotStyle("offline")).toEqual({ backgroundColor: VEHICLE_FILL.offline, opacity: 0.75 });
  });

  it("puts a name tag outside the rotating body and draws a count badge on clusters", () => {
    const html = vehicleIconHtml("stopped", { heading: 90, label: "Luke Dlugosz" });
    expect(html).toContain("fleet-vehicle-label");
    expect(html).toContain("Luke Dlugosz");
    expect(html.indexOf("Luke Dlugosz")).toBeGreaterThan(html.indexOf("rotate(90deg)"));
    const rotated = html.slice(html.indexOf("rotate(90deg)"), html.indexOf("</div>", html.indexOf("rotate(90deg)")));
    expect(rotated).not.toContain("Luke Dlugosz");
    const cluster = clusterIconHtml({ count: 2, fill: VEHICLE_FILL.driving, split: true, id: "ab" });
    expect(cluster).toContain("fleet-cluster-icon");
    expect(cluster).toContain("data-count=\"2\"");
    expect(cluster).toContain("fleet-mix-ab");
    expect(cluster).toContain(VEHICLE_FILL.driving);
    expect(cluster).toContain(VEHICLE_FILL.stopped);
  });
});
