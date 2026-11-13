import { describe, expect, it } from "vitest";
import { isValidEmail, parseDealContactFields, smsConsentPatch, SMS_CONSENT_LABEL, SMS_CONSENT_LEGAL_TEXT, SMS_CONSENT_OFF_NOTE, SMS_CONSENT_TEXT_VERSION } from "./deal-contact";

function fd(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.set(k, v);
  return data;
}

describe("parseDealContactFields", () => {
  it("defaults a blank deal name to the street address", () => {
    const r = parseDealContactFields(fd({ address: "1182 Maple Lane", city: "Schaumburg", state: "IL", zip: "60193" }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.title).toBe("1182 Maple Lane");
      expect(r.value.address).toBe("1182 Maple Lane");
      expect(r.value.state).toBe("IL");
    }
  });

  it("keeps an explicit deal name when a street is also provided", () => {
    const r = parseDealContactFields(fd({ title: "Brennan lighting", address: "1182 Maple Lane" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.title).toBe("Brennan lighting");
  });

  it("requires a deal name or street", () => {
    const r = parseDealContactFields(fd({ city: "Schaumburg" }));
    expect(r).toEqual({ ok: false, error: "Enter a deal name or street address." });
  });

  it("accepts a blank email and rejects an invalid one", () => {
    expect(isValidEmail("tom@example.com")).toBe(true);
    expect(parseDealContactFields(fd({ title: "x" })).ok).toBe(true);
    const bad = parseDealContactFields(fd({ title: "x", contact_email: "not-an-email" }));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toMatch(/valid email/i);
  });

  it("defaults state to IL and validates ZIP", () => {
    const r = parseDealContactFields(fd({ title: "x" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.state).toBe("IL");
    const zip = parseDealContactFields(fd({ title: "x", zip: "60" }));
    expect(zip.ok).toBe(false);
  });

  it("reads the SMS consent checkbox without requiring it", () => {
    const off = parseDealContactFields(fd({ title: "x" }));
    const on = parseDealContactFields(fd({ title: "x", sms_consent: "yes" }));
    expect(off.ok && off.value.sms_consent).toBe(false);
    expect(on.ok && on.value.sms_consent).toBe(true);
  });

  it("keeps autocomplete coordinates only when both are present", () => {
    const r = parseDealContactFields(fd({ title: "x", geo_lat: "42.03", geo_lng: "-88.08" }));
    expect(r.ok && r.value.lat).toBeCloseTo(42.03);
    expect(r.ok && r.value.lng).toBeCloseTo(-88.08);
    const half = parseDealContactFields(fd({ title: "x", geo_lat: "42.03" }));
    expect(half.ok && half.value.lat).toBeNull();
  });
});

describe("smsConsentPatch", () => {
  const now = "2026-11-13T15:01:00.000Z";
  it("records who, when, and which wording when consent is granted", () => {
    expect(smsConsentPatch({ checked: true, previous: null, userId: "u-admin", now })).toEqual({
      sms_consent: true,
      sms_consent_at: now,
      sms_consent_by: "u-admin",
      sms_consent_text_version: SMS_CONSENT_TEXT_VERSION,
    });
  });

  it("leaves audit fields alone when the box is unchanged", () => {
    const previous = {
      sms_consent: true,
      sms_consent_at: "2026-11-01T00:00:00.000Z",
      sms_consent_by: "u-sales",
      sms_consent_text_version: "staff-deal-v1",
    };
    expect(smsConsentPatch({ checked: true, previous, userId: "u-admin", now })).toEqual(previous);
  });

  it("records a withdrawal with a new timestamp and keeps the wording version", () => {
    const previous = {
      sms_consent: true,
      sms_consent_at: "2026-11-01T00:00:00.000Z",
      sms_consent_by: "u-sales",
      sms_consent_text_version: "staff-deal-v1",
    };
    expect(smsConsentPatch({ checked: false, previous, userId: "u-admin", now })).toEqual({
      sms_consent: false,
      sms_consent_at: now,
      sms_consent_by: "u-admin",
      sms_consent_text_version: "staff-deal-v1",
    });
  });
});

describe("staff SMS consent wording", () => {
  it("uses the staff-recorded TCPA text and a stable version id", () => {
    expect(SMS_CONSENT_TEXT_VERSION).toBe("staff-deal-v1");
    expect(SMS_CONSENT_LABEL).toBe("This is a cell phone, OK to text");
    expect(SMS_CONSENT_LEGAL_TEXT).toContain("Customer confirmed this is a mobile number");
    expect(SMS_CONSENT_LEGAL_TEXT).toContain("Retrofit Rebates, Inc.");
    expect(SMS_CONSENT_LEGAL_TEXT).toContain("Reply STOP to opt out, HELP for help");
    expect(SMS_CONSENT_LEGAL_TEXT).toContain("Consent is not a condition of service");
    expect(SMS_CONSENT_LEGAL_TEXT).toContain("Privacy Policy");
    expect(SMS_CONSENT_OFF_NOTE).toMatch(/texting is off/i);
  });
});
