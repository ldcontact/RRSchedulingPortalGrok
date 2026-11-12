/**
 * US address autocomplete helpers (Photon/Komoot + Nominatim parse/rank,
 * abbreviation expansion, Census component parse). Pure; no network.
 */

export type AddressSuggestSource = "photon" | "nominatim" | "census";

export type AddressSuggestion = {
  id: string;
  label: string;
  street: string;
  unit: string | null;
  city: string;
  state: string;
  zip: string;
  lat: number | null;
  lng: number | null;
  source: AddressSuggestSource;
};

export const ADDRESS_SUGGEST_MIN_CHARS = 3;
export const ADDRESS_SUGGEST_LIMIT = 8;
/** Schaumburg, IL — bias center for Chicago-suburb work. */
export const ADDRESS_BIAS = { lat: 42.0334, lng: -88.0834 };

/** Illinois + nearby collar counties, used as a soft Photon bbox (not a hard exclusive filter). */
export const ILLINOIS_BBOX = { minLon: -91.6, minLat: 36.97, maxLon: -87.02, maxLat: 42.51 };

export const US_STATE_ABBR: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", "district of columbia": "DC",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL",
  indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA",
  maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
  mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK",
  oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI",
  wyoming: "WY",
};

const STREET_ABBR: Record<string, string> = {
  n: "North", s: "South", e: "East", w: "West",
  ne: "Northeast", nw: "Northwest", se: "Southeast", sw: "Southwest",
  rd: "Road", st: "Street", ave: "Avenue", blvd: "Boulevard",
  ln: "Lane", dr: "Drive", hwy: "Highway", pkwy: "Parkway",
  ct: "Court", cir: "Circle", pl: "Place", ter: "Terrace",
  trl: "Trail", xing: "Crossing",
};

export function stateAbbr(raw: string | null | undefined): string {
  const t = (raw ?? "").trim();
  if (!t) return "";
  if (t.length === 2) return t.toUpperCase();
  return US_STATE_ABBR[t.toLowerCase()] ?? t;
}

export function hasStateOrCountry(q: string): boolean {
  const s = (q ?? "").trim();
  if (!s) return false;
  if (/\b(usa|us|united states)\b/i.test(s)) return true;
  // 2-letter code after a comma or before a ZIP ("Chicago, IL" / "IL 60602"), not bare words like "in"/"or".
  if (/,\s*[A-Za-z]{2}\b/.test(s) || /\b[A-Z]{2}\s+\d{5}\b/.test(s)) return true;
  for (const name of Object.keys(US_STATE_ABBR)) {
    if (new RegExp(`\\b${name}\\b`, "i").test(s)) return true;
  }
  // Explicit IL (this shop's default), even without a comma.
  if (/\bIL\b/i.test(s)) return true;
  return false;
}

/** Expand USPS-style street abbreviations so Photon/Nominatim can match OSM's full names. */
export function expandStreetAbbrevs(q: string): string {
  return q
    .replace(/[.]/g, "")
    .replace(/\b([A-Za-z]+)\b/g, (word, raw: string, offset: number, full: string) => {
      const key = raw.toLowerCase();
      const mapped = STREET_ABBR[key];
      if (!mapped) return word;
      // Don't expand "in", "or", "me", "hi" etc. — those aren't in STREET_ABBR.
      // Don't expand "St" at the start of a city (Saint) when followed by a capitalized name
      // and not preceded by a housenumber/direction: leave as-is if previous token is a city-like comma.
      const before = full.slice(0, offset);
      if (key === "st" && /,\s*$/.test(before)) return word;
      return mapped;
    })
    .replace(/\s+/g, " ")
    .trim();
}

/** Query sent to Photon/Nominatim: expanded abbrevs, Illinois/USA bias if no state given. */
export function prepareAddressQuery(raw: string): string {
  let q = expandStreetAbbrevs((raw ?? "").trim());
  if (!q) return "";
  if (!hasStateOrCountry(q)) q = `${q.replace(/,\s*$/, "")}, IL, USA`;
  else if (!/\b(usa|us|united states)\b/i.test(q)) q = `${q.replace(/,\s*$/, "")}, USA`;
  return q;
}

export function formatStreet(opts: { housenumber?: string | null; street?: string | null; unit?: string | null; name?: string | null }): string {
  const unit = (opts.unit ?? "").trim();
  const num = (opts.housenumber ?? "").trim();
  const street = (opts.street ?? "").trim();
  const line = [num, street].filter(Boolean).join(" ").trim();
  if (line) return unit ? `${line} ${/^(apt|unit|suite|ste|#)/i.test(unit) ? unit : `#${unit}`}` : line;
  return (opts.name ?? "").trim();
}

export function formatAddressLabel(s: Pick<AddressSuggestion, "street" | "unit" | "city" | "state" | "zip">): string {
  const street = s.street || "";
  const place = [s.city, [s.state, s.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [street, place].filter(Boolean).join(", ");
}

export function suggestionKey(s: Pick<AddressSuggestion, "street" | "city" | "state" | "zip">): string {
  const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
  return [norm(s.street), norm(s.city), (s.state || "").toUpperCase(), (s.zip || "").slice(0, 5)].join("|");
}

function isUsCountry(code: string | null | undefined, name: string | null | undefined): boolean {
  const c = (code ?? "").trim().toLowerCase();
  const n = (name ?? "").trim().toLowerCase();
  return c === "us" || c === "usa" || n === "united states" || n === "united states of america" || n === "usa";
}

export type PhotonFeature = {
  geometry?: { coordinates?: unknown };
  properties?: Record<string, unknown>;
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function coords(lon: unknown, lat: unknown): { lat: number | null; lng: number | null } {
  const la = Number(lat), ln = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(ln) || la < -90 || la > 90 || ln < -180 || ln > 180) {
    return { lat: null, lng: null };
  }
  return { lat: la, lng: ln };
}

export function parsePhotonFeature(f: PhotonFeature, index = 0): AddressSuggestion | null {
  const p = f.properties ?? {};
  if (!isUsCountry(str(p.countrycode) || str(p.country), str(p.country))) return null;
  const city = str(p.city) || str(p.town) || str(p.village) || str(p.locality) || str(p.district);
  const streetName = str(p.street);
  const unit = str(p.unit) || null;
  const street = formatStreet({ housenumber: str(p.housenumber), street: streetName, unit, name: str(p.name) });
  if (!street && !city) return null;
  const state = stateAbbr(str(p.state) || str(p.statecode));
  const zip = str(p.postcode) || str(p.postalcode);
  const [lng, lat] = Array.isArray(f.geometry?.coordinates) ? f.geometry!.coordinates! as unknown[] : [null, null];
  const c = coords(lng, lat);
  const item: AddressSuggestion = {
    id: `photon-${str(p.osm_id) || index}`,
    label: "",
    street,
    unit,
    city,
    state,
    zip,
    lat: c.lat,
    lng: c.lng,
    source: "photon",
  };
  item.label = formatAddressLabel(item);
  return item.label ? item : null;
}

export type NominatimHit = {
  lat?: unknown;
  lon?: unknown;
  place_id?: unknown;
  display_name?: unknown;
  address?: Record<string, unknown>;
};

export function parseNominatimHit(h: NominatimHit, index = 0): AddressSuggestion | null {
  const a = h.address ?? {};
  const country = str(a.country_code) || str(a.country);
  if (!isUsCountry(country, str(a.country))) return null;
  const city = str(a.city) || str(a.town) || str(a.village) || str(a.hamlet) || str(a.municipality) || str(a.county);
  const unit = str(a.unit) || str(a.house) || null;
  const street = formatStreet({
    housenumber: str(a.house_number),
    street: str(a.road) || str(a.pedestrian) || str(a.residential),
    unit,
  });
  if (!street && !city) return null;
  const state = stateAbbr(str(a.state) || str(a.state_code));
  const zip = (str(a.postcode) || "").split("-")[0];
  const c = coords(h.lon, h.lat);
  const item: AddressSuggestion = {
    id: `nominatim-${String(h.place_id ?? index)}`,
    label: "",
    street: street || str(h.display_name).split(",")[0],
    unit,
    city,
    state,
    zip,
    lat: c.lat,
    lng: c.lng,
    source: "nominatim",
  };
  item.label = formatAddressLabel(item);
  return item.label ? item : null;
}

export type CensusMatch = {
  matchedAddress?: unknown;
  coordinates?: { x?: unknown; y?: unknown };
  addressComponents?: Record<string, unknown>;
};

export function parseCensusMatch(m: CensusMatch): AddressSuggestion | null {
  const a = m.addressComponents ?? {};
  const num = str(a.fromAddress);
  const pre = str(a.preDirection) || str(a.prefixDirection);
  const name = str(a.streetName);
  const suf = str(a.suffixType);
  const street = [num, pre, name, suf].filter(Boolean).join(" ");
  const city = str(a.city);
  const state = stateAbbr(str(a.state));
  const zip = str(a.zip);
  const c = coords(m.coordinates?.x, m.coordinates?.y);
  if (!street && !str(m.matchedAddress)) return null;
  // Title-case the Census ALL-CAPS street/city for the form.
  const niceStreet = titleCaseAddress(street || str(m.matchedAddress).split(",")[0]);
  const niceCity = titleCaseAddress(city);
  const item: AddressSuggestion = {
    id: `census-${niceStreet}-${niceCity}-${zip}`,
    label: "",
    street: niceStreet,
    unit: null,
    city: niceCity,
    state,
    zip,
    lat: c.lat,
    lng: c.lng,
    source: "census",
  };
  item.label = formatAddressLabel(item);
  return item.label ? item : null;
}

export function titleCaseAddress(s: string): string {
  const keep = new Set(["NE", "NW", "SE", "SW", "US", "IL"]);
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => {
      const up = w.toUpperCase();
      if (keep.has(up) || /^[nswe]$/i.test(w)) return up;
      if (!w) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

function queryHouseNumber(q: string): string | null {
  const m = q.trim().match(/^(\d+[A-Za-z]?)/);
  return m ? m[1].toLowerCase() : null;
}

export function scoreSuggestion(s: AddressSuggestion, query: string): number {
  let n = 0;
  if (s.state === "IL") n += 6;
  else if (s.state) n += 2;
  if (s.city) n += 1;
  if (s.zip) n += 2;
  if (s.lat != null && s.lng != null) n += 1;
  const house = /^\d/.test(s.street);
  if (house) n += 3;
  const qNum = queryHouseNumber(query);
  if (qNum && s.street.toLowerCase().startsWith(qNum)) n += 10;
  const q = query.toLowerCase();
  if (s.city && q.includes(s.city.toLowerCase())) n += 4;
  // Prefer closer to the Schaumburg bias when we have coords.
  if (s.lat != null && s.lng != null) {
    const dlat = s.lat - ADDRESS_BIAS.lat;
    const dlng = (s.lng - ADDRESS_BIAS.lng) * Math.cos(ADDRESS_BIAS.lat * Math.PI / 180);
    const miles = Math.sqrt(dlat * dlat + dlng * dlng) * 69;
    if (miles < 15) n += 4;
    else if (miles < 40) n += 2;
    else if (miles < 80) n += 1;
  }
  return n;
}

export function rankAndDedupe(items: AddressSuggestion[], query: string, limit = ADDRESS_SUGGEST_LIMIT): AddressSuggestion[] {
  const seen = new Set<string>();
  const unique: AddressSuggestion[] = [];
  for (const it of items) {
    const k = suggestionKey(it);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    unique.push(it);
  }
  unique.sort((a, b) => scoreSuggestion(b, query) - scoreSuggestion(a, query));
  const houses = unique.filter((s) => /^\d/.test(s.street));
  const rest = unique.filter((s) => !/^\d/.test(s.street));
  // Prefer house-level hits; keep a couple of street-level rows only if we have few houses.
  const picked = houses.length >= 3 ? houses : [...houses, ...rest];
  return picked.slice(0, limit);
}

/** When Photon's house-level hits don't include the typed number, try Nominatim. */
export function shouldQueryNominatim(query: string, photon: AddressSuggestion[]): boolean {
  const compact = query.replace(/[^a-z0-9]/gi, "");
  if (compact.length < 10) return false;
  if (!/^\s*\d/.test(query)) return false;
  const qNum = queryHouseNumber(query);
  if (qNum && photon.some((s) => s.street.toLowerCase().startsWith(qNum))) return false;
  return true;
}
