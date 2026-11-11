import { describe, expect, it } from "vitest";
import { addressChanged, formatBatchInput, isPendingGeocode, parseBatchResponse, parseCensusLngLat, parseOnelineResponse, shouldGeocode, visitCoords } from "./parse";
import { haversineMeters } from "@/lib/geotab/distance";

const MATCH_LINE = '"1","2250 Lunt Ave, Elk Grove Village, IL, 60007","Match","Exact","2250 LUNT AVE, ELK GROVE VILLAGE, IL, 60007","-87.948362438668,42.002294921649","111721694","L"';
const NO_MATCH_LINE = '"2","99999 No Such Street, Schaumburg, IL, 60173","No_Match"';
const TIE_LINE = '"3","100 Main St, Springfield, IL, 62701","Tie"';
const TIE_EXTRA = '"4","Oak St, Chicago, IL,","Tie","Non_Exact","OAK ST, CHICAGO, IL, 60601"';
const BAD_COORDS = '"5","1 Main St, Chicago, IL, 60601","Match","Exact","1 MAIN ST, CHICAGO, IL, 60601","not-a-coord","1","L"';

describe("parseBatchResponse", () => {
  it("parses Match with the combined lng,lat field, No_Match, and Tie", () => {
    const rows = parseBatchResponse([MATCH_LINE, NO_MATCH_LINE, TIE_LINE, TIE_EXTRA].join("\n"));
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ id: "1", status: "matched", matchType: "Exact", lat: 42.002294921649, lng: -87.948362438668, matchedAddress: "2250 LUNT AVE, ELK GROVE VILLAGE, IL, 60007" });
    expect(rows[1]).toMatchObject({ id: "2", status: "no_match", lat: null, lng: null });
    expect(rows[2]).toMatchObject({ id: "3", status: "tie", lat: null, lng: null });
    expect(rows[3]).toMatchObject({ id: "4", status: "tie", lat: null, lng: null, matchedAddress: "OAK ST, CHICAGO, IL, 60601" });
  });
  it("treats a Match with unreadable coordinates as error", () => {
    expect(parseBatchResponse(BAD_COORDS)[0].status).toBe("error");
  });
  it("writes batch input without a header", () => {
    const csv = formatBatchInput([{ id: "c4", address: "2250 Lunt Ave", city: "Elk Grove Village", state: "IL", zip: "60007" }]);
    expect(csv).toBe("c4,2250 Lunt Ave,Elk Grove Village,IL,60007\n");
  });
});

describe("parseOnelineResponse", () => {
  it("reads coordinates as y=lat, x=lng and treats no hits as no_match", () => {
    const ok = parseOnelineResponse({ result: { addressMatches: [{ matchedAddress: "2250 LUNT AVE, ELK GROVE VILLAGE, IL, 60007", coordinates: { x: -87.948362438668, y: 42.002294921649 } }] } });
    expect(ok).toMatchObject({ status: "matched", lat: 42.002294921649, lng: -87.948362438668 });
    expect(parseOnelineResponse({ result: { addressMatches: [] } }).status).toBe("no_match");
  });
  it("treats multiple matches as a tie and does not pick one", () => {
    const m = { matchedAddress: "A", coordinates: { x: -88, y: 42 } };
    expect(parseOnelineResponse({ result: { addressMatches: [m, m] } })).toMatchObject({ status: "tie", lat: null, lng: null });
  });
});

describe("helpers", () => {
  it("detects address changes and pending backfill rows", () => {
    expect(addressChanged({ address: "1 Main", city: "Chicago", state: "il", zip: "60601" }, { address: "1 Main", city: "Chicago", state: "IL", zip: "60601" })).toBe(false);
    expect(addressChanged({ address: "1 Main", city: "Chicago", state: "IL", zip: "60601" }, { address: "2 Main", city: "Chicago", state: "IL", zip: "60601" })).toBe(true);
    expect(shouldGeocode(null, { address: "1 Main", city: "Chicago", state: "IL", zip: "60601" }, null, true)).toBe("geocode");
    expect(shouldGeocode({ geocode_status: "matched", lat: 42 }, { address: "1 Main", city: "Chicago", state: "IL", zip: "60601" }, { address: "1 Main", city: "Chicago", state: "IL", zip: "60601" }, false)).toBe("skip");
    expect(shouldGeocode({ geocode_status: "matched", lat: 42 }, { address: "2 Main", city: "Chicago", state: "IL", zip: "60601" }, { address: "1 Main", city: "Chicago", state: "IL", zip: "60601" }, false)).toBe("geocode");
    expect(shouldGeocode({ geocode_status: "no_match", lat: null }, { address: "1 Main" }, { address: "1 Main" }, false)).toBe("skip");
    expect(shouldGeocode({ geocode_status: "error", lat: null }, { address: "1 Main" }, { address: "1 Main" }, false)).toBe("geocode");
    expect(shouldGeocode({ geocode_status: "matched", lat: 42 }, { address: null }, { address: "1 Main" }, false)).toBe("clear");
    expect(isPendingGeocode({ address: "1 Main", lat: null, geocode_status: null })).toBe(true);
    expect(isPendingGeocode({ address: "1 Main", lat: null, geocode_status: "no_match" })).toBe(false);
    expect(isPendingGeocode({ address: "1 Main", lat: null, geocode_status: "error" })).toBe(true);
    expect(parseCensusLngLat("-87.948362438668,42.002294921649")).toEqual({ lat: 42.002294921649, lng: -87.948362438668 });
  });
  it("uses ticket site coords when the ticket has its own address, otherwise the customer", () => {
    const customer = { lat: 42, lng: -88, geocode_status: "matched" as const };
    const site = { lat: 41.9, lng: -87.9, geocode_status: "matched" as const, site_address: "1 Other St" };
    expect(visitCoords(customer, site)).toEqual({ latitude: 41.9, longitude: -87.9 });
    expect(visitCoords(customer, { ...site, site_address: null })).toEqual({ latitude: 42, longitude: -88 });
    expect(visitCoords(customer, { lat: null, lng: null, geocode_status: "no_match", site_address: "99 Nowhere" })).toEqual({ latitude: null, longitude: null });
  });
});

describe("distance from a Census-matched site", () => {
  it("treats a truck ~78 m from 905 Golf Rd as arrived (<= 150 m)", () => {
    const site = { lat: 42.048335210405, lng: -88.100787329604 };
    const truck = { lat: 42.048784365992496, lng: -88.10151315934525 };
    const m = haversineMeters(truck, site);
    expect(m).toBeGreaterThan(50);
    expect(m).toBeLessThanOrEqual(150);
  });
});
