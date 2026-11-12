import { describe, expect, it, vi } from "vitest";
import { applySearch, customerSearchFields, matchesSearch, parseSearch, phoneDigits, projectSearchFields } from "./search";

const cust = { name: "Elk Grove Precision Machining", phone: "(847) 555-0174", email: "dk@egp.example", address: "2250 Lunt Ave", city: "Elk Grove Village", state: "IL", zip: "60007", tags: ["ComEd SB"] };
const contacts = [{ name: "Dave Kowalski", phone: "1-773-555-0199", email: "dave@egp.example" }];
const c = customerSearchFields(cust, contacts);
const p = projectSearchFields({ name: "High-bay retrofit", scope: "Replace 40 MH fixtures", hcp_job_number: "8241", site_address: "77 Busse Rd", site_city: "Bensenville", site_state: "IL", site_zip: "60106" }, c);
const m = (q: string, f = c) => matchesSearch(f.doc, f.digits, parseSearch(q));

describe("phoneDigits", () => {
  it("strips formatting and a US leading 1", () => {
    expect(phoneDigits("(847) 555-0174")).toBe("8475550174");
    expect(phoneDigits("+1 847.555.0174")).toBe("8475550174");
    expect(phoneDigits("")).toBeNull();
  });
});

describe("parseSearch", () => {
  it("returns null for blank", () => { expect(parseSearch("  ")).toBeNull(); expect(parseSearch(undefined)).toBeNull(); });
  it("detects phone-like input with 4+ digits", () => {
    expect(parseSearch("847-555-0174")?.digits).toBe("8475550174");
    expect(parseSearch("(847) 555 0174")?.digits).toBe("8475550174");
    expect(parseSearch("0174")?.digits).toBe("0174");
    expect(parseSearch("847")?.digits).toBeNull();
    expect(parseSearch("Lunt 2250")?.digits).toBeNull();
  });
  it("strips PostgREST/wildcard characters and splits words", () => {
    expect(parseSearch('a%b_c,(d)"e*')).toEqual({ text: "a b c d e", tokens: ["a", "b", "c", "d", "e"], digits: null });
  });
});

describe("customer matching", () => {
  it.each([
    ["customer name", "precision machining"],
    ["contact first name", "dave"],
    ["contact last name", "kowalski"],
    ["contact full name", "Dave Kowalski"],
    ["street", "2250 lunt"],
    ["city", "elk grove village"],
    ["state + zip", "IL 60007"],
    ["zip only", "60007"],
    ["email (existing)", "dk@egp"],
    ["phone dashed", "847-555-0174"],
    ["phone parens", "(847) 555 0174"],
    ["phone digits", "8475550174"],
    ["partial phone run", "5550174"],
    ["last 4 digits", "0174"],
    ["contact phone with +1", "+1 773 555 0199"],
    ["words in any order", "kowalski elk"],
  ])("%s: %s", (_label, q) => expect(m(q)).toBe(true));
  it("does not match unrelated text or digits", () => {
    expect(m("schaumburg")).toBe(false);
    expect(m("555-9999")).toBe(false);
    expect(m("dave smith")).toBe(false);
  });
});

describe("project matching", () => {
  it.each([["project name", "high-bay"], ["project number", "8241"], ["scope", "40 mh"], ["site address", "busse rd"], ["site city", "bensenville"],
    ["customer name", "precision"], ["customer address", "lunt ave"], ["contact name", "dave kowalski"], ["customer phone", "(847) 555-0174"], ["contact phone", "7735550199"]])(
    "%s: %s", (_l, q) => expect(m(q, p)).toBe(true));
  it("matches a Housecall Pro job number and numbers that contain it", () => {
    const p367 = projectSearchFields({ name: "LED retrofit", scope: "Panels", hcp_job_number: "367", site_address: "1420 W Algonquin Rd" }, c);
    const pContain = projectSearchFields({ name: "Plant floor", scope: "High bays", hcp_job_number: "1367", site_address: "2250 Lunt Ave" }, c);
    expect(matchesSearch(p367.doc, p367.digits, parseSearch("367"))).toBe(true);
    expect(matchesSearch(pContain.doc, pContain.digits, parseSearch("367"))).toBe(true);
    expect(matchesSearch(p.doc, p.digits, parseSearch("367"))).toBe(false);
  });
  it("matches a project type label and slug", () => {
    const whe = projectSearchFields({ name: "Oak Ave electrification", scope: "Panel and heat pump", type: "whe_single_family" }, c);
    expect(matchesSearch(whe.doc, whe.digits, parseSearch("whole home electric"))).toBe(true);
    expect(matchesSearch(whe.doc, whe.digits, parseSearch("single family"))).toBe(true);
    expect(matchesSearch(whe.doc, whe.digits, parseSearch("LED lighting"))).toBe(false);
    const led = projectSearchFields({ name: "Office panels", scope: "Troffers", type: "lighting" }, c);
    expect(matchesSearch(led.doc, led.digits, parseSearch("LED Lighting"))).toBe(true);
    const pipe = projectSearchFields({ name: "Boiler room wrap", scope: "Insulate 80 ft of steam pipe", type: "pipe_insulation" }, c);
    expect(matchesSearch(pipe.doc, pipe.digits, parseSearch("pipe insulation"))).toBe(true);
  });
});

describe("applySearch", () => {
  it("ANDs words on the embedded doc", () => {
    const q = { ilike: vi.fn(() => q), or: vi.fn(() => q) };
    applySearch(q, "customer_search", parseSearch("Dave Kowalski")!);
    expect(q.ilike.mock.calls).toEqual([["customer_search.doc", "%dave%"], ["customer_search.doc", "%kowalski%"]]);
    expect(q.or).not.toHaveBeenCalled();
  });
  it("ORs text and digits for phone-like input", () => {
    const q = { ilike: vi.fn(() => q), or: vi.fn(() => q) };
    applySearch(q, "project_search", parseSearch("(847) 555-0174")!);
    expect(q.or).toHaveBeenCalledWith('doc.ilike."%847 555-0174%",digits.ilike."%8475550174%"', { referencedTable: "project_search" });
  });
});
