import { describe, expect, it } from "vitest";
import { houseNumber, inIllinoisBbox, isStreetLevelMatch, pickStreetMatch, sparseAddressReason } from "./chain-pick";
import type { AddressSuggestion } from "@/lib/address-suggest";

const sug = (partial: Partial<AddressSuggestion> & Pick<AddressSuggestion, "street" | "lat" | "lng">): AddressSuggestion => ({
  id: partial.id ?? "x",
  label: partial.label ?? partial.street,
  street: partial.street,
  unit: partial.unit ?? null,
  city: partial.city ?? "Chicago",
  state: partial.state ?? "IL",
  zip: partial.zip ?? "",
  lat: partial.lat,
  lng: partial.lng,
  source: partial.source ?? "photon",
});

describe("sparseAddressReason", () => {
  it("skips empty or name-only addresses", () => {
    expect(sparseAddressReason({ address: null, city: null, state: "IL", zip: null })).toBe("no street address");
    expect(sparseAddressReason({ address: "Jeff", city: null, state: "IL", zip: null })).toBe("address has no house number");
    expect(sparseAddressReason({ address: "IL", city: null, state: null, zip: null })).toBe("address has no house number");
  });
  it("allows a street with a house number", () => {
    expect(sparseAddressReason({ address: "6608 Windsor Ave", city: "Berwyn", state: "IL", zip: "60402" })).toBeNull();
  });
});

describe("inIllinoisBbox and street-level match", () => {
  it("rejects out-of-state coordinates", () => {
    expect(inIllinoisBbox(33.8528671, -109.9656069)).toBe(false);
    expect(inIllinoisBbox(42.380034, -87.835934)).toBe(true);
  });
  it("requires the same house number when the query has one", () => {
    const waukegan = sug({ street: "1420 North Avenue", lat: 42.380034, lng: -87.835934 });
    const elsewhere = sug({ street: "1420 North Avenue", lat: 33.85, lng: -109.96 });
    const streetOnly = sug({ street: "North Avenue", lat: 42.38, lng: -87.83 });
    expect(isStreetLevelMatch(waukegan, "1420")).toBe(true);
    expect(isStreetLevelMatch(elsewhere, "1420")).toBe(false);
    expect(isStreetLevelMatch(streetOnly, "1420")).toBe(false);
  });
  it("prefers a ranked house match", () => {
    const items = [
      sug({ id: "city", street: "Waukegan", lat: 42.36, lng: -87.84 }),
      sug({ id: "house", street: "1420 North Avenue", lat: 42.380034, lng: -87.835934 }),
    ];
    const picked = pickStreetMatch(items, "1420 North Ave, Waukegan, IL", "1420");
    expect(picked?.id).toBe("house");
  });
});

describe("houseNumber", () => {
  it("reads a leading street number", () => {
    expect(houseNumber("13942 S Lydia Ave")).toBe("13942");
    expect(houseNumber("North Ave")).toBeNull();
  });
});
