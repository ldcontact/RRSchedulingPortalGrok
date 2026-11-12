import { describe, expect, it } from "vitest";
import {
  expandStreetAbbrevs,
  formatAddressLabel,
  formatStreet,
  hasStateOrCountry,
  parseCensusMatch,
  parseNominatimHit,
  parsePhotonFeature,
  prepareAddressQuery,
  rankAndDedupe,
  shouldQueryNominatim,
  stateAbbr,
  titleCaseAddress,
} from "./address-suggest";

describe("expandStreetAbbrevs / prepareAddressQuery", () => {
  it("expands direction and street type abbreviations", () => {
    expect(expandStreetAbbrevs("206 N Green Bay Rd Waukegan")).toBe("206 North Green Bay Road Waukegan");
    expect(expandStreetAbbrevs("1350 E Algonquin Rd")).toBe("1350 East Algonquin Road");
    expect(expandStreetAbbrevs("1 N Dearborn St")).toBe("1 North Dearborn Street");
  });

  it("does not expand St after a comma (Saint)", () => {
    expect(expandStreetAbbrevs("100 Main, St Louis")).toBe("100 Main, St Louis");
  });

  it("appends Illinois/USA when no state is present", () => {
    expect(prepareAddressQuery("206 N Green Bay Rd Waukegan")).toBe("206 North Green Bay Road Waukegan, IL, USA");
    expect(prepareAddressQuery("1 N Dearborn, Chicago, IL")).toBe("1 North Dearborn, Chicago, IL, USA");
  });

  it("does not treat 'in' as Indiana", () => {
    expect(hasStateOrCountry("100 Main in Waukegan")).toBe(false);
    expect(hasStateOrCountry("100 Main, IL")).toBe(true);
    expect(hasStateOrCountry("Schaumburg Illinois")).toBe(true);
  });
});

describe("format / state", () => {
  it("abbreviates state names and formats street + unit", () => {
    expect(stateAbbr("Illinois")).toBe("IL");
    expect(stateAbbr("il")).toBe("IL");
    expect(formatStreet({ housenumber: "206", street: "North Green Bay Road" })).toBe("206 North Green Bay Road");
    expect(formatStreet({ housenumber: "1", street: "Main St", unit: "2B" })).toBe("1 Main St #2B");
    expect(formatStreet({ housenumber: "1", street: "Main St", unit: "Apt 4" })).toBe("1 Main St Apt 4");
  });

  it("title-cases Census ALL CAPS without lowercasing directions", () => {
    expect(titleCaseAddress("1 N DEARBORN ST")).toBe("1 N Dearborn St");
  });
});

describe("parsers", () => {
  it("parses a US Photon house feature and drops non-US", () => {
    const us = parsePhotonFeature({
      geometry: { coordinates: [-87.8759, 42.362] },
      properties: {
        osm_id: 1, housenumber: "206", street: "North Green Bay Road",
        city: "Waukegan", state: "Illinois", postcode: "60085", countrycode: "US",
      },
    });
    expect(us?.street).toBe("206 North Green Bay Road");
    expect(us?.city).toBe("Waukegan");
    expect(us?.state).toBe("IL");
    expect(us?.zip).toBe("60085");
    expect(us?.lat).toBeCloseTo(42.362);
    expect(us?.lng).toBeCloseTo(-87.8759);
    expect(us?.label).toContain("Waukegan");

    expect(parsePhotonFeature({
      geometry: { coordinates: [90.38, 23.74] },
      properties: { name: "Kathal Bagan", city: "Dhaka", countrycode: "BD" },
    })).toBeNull();
  });

  it("parses Nominatim and Census matches, including ZIP", () => {
    const n = parseNominatimHit({
      place_id: 9, lat: "42.0701334", lon: "-88.0490535",
      address: { house_number: "1350", road: "East Algonquin Road", city: "Schaumburg", state: "Illinois", postcode: "60173-1234", country_code: "us" },
    });
    expect(n?.street).toBe("1350 East Algonquin Road");
    expect(n?.zip).toBe("60173");
    expect(n?.state).toBe("IL");

    const c = parseCensusMatch({
      matchedAddress: "1 N DEARBORN ST, CHICAGO, IL, 60602",
      coordinates: { x: -87.629326, y: 41.882056 },
      addressComponents: { fromAddress: "1", preDirection: "N", streetName: "DEARBORN", suffixType: "ST", city: "CHICAGO", state: "IL", zip: "60602" },
    });
    expect(c?.street).toBe("1 N Dearborn St");
    expect(c?.city).toBe("Chicago");
    expect(c?.zip).toBe("60602");
    expect(c?.lat).toBeCloseTo(41.882056);
  });
});

describe("rank and nominatim gate", () => {
  it("dedupes, prefers a matching house number in Illinois, and gates Nominatim", () => {
    const a = {
      id: "1", label: "", street: "1812 South Dearborn Street", unit: null, city: "Chicago", state: "IL", zip: "",
      lat: 41.857, lng: -87.628, source: "photon" as const,
    };
    a.label = formatAddressLabel(a);
    const b = {
      id: "2", label: "", street: "1 North Dearborn Street", unit: null, city: "Chicago", state: "IL", zip: "60602",
      lat: 41.882, lng: -87.629, source: "photon" as const,
    };
    b.label = formatAddressLabel(b);
    const dup = { ...b, id: "3" };
    const ranked = rankAndDedupe([a, b, dup], "1 N Dearborn Chicago");
    expect(ranked).toHaveLength(2);
    expect(ranked[0].street).toBe("1 North Dearborn Street");

    expect(shouldQueryNominatim("1350 E Algonquin Rd Schaumburg", [])).toBe(true);
    expect(shouldQueryNominatim("13", [])).toBe(false);
    expect(shouldQueryNominatim("1350 E Algonquin Rd Schaumburg", [{
      id: "x", label: "1350 East Algonquin Road, Schaumburg, IL", street: "1350 East Algonquin Road",
      unit: null, city: "Schaumburg", state: "IL", zip: "60173", lat: 42.07, lng: -88.05, source: "photon",
    }])).toBe(false);
  });
});
