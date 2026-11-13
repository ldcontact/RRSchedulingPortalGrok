import { describe, expect, it } from "vitest";
import { leadAllowsSubmit, smsConsentRequired } from "./opt-in";

describe("SMS opt-in on Get started", () => {
  it("does not require consent when no phone is given", () => {
    expect(smsConsentRequired("")).toBe(false);
    expect(leadAllowsSubmit({ phone: "", smsConsent: false })).toEqual({ ok: true });
  });
  it("requires an unchecked-by-default consent box when a phone is present", () => {
    expect(smsConsentRequired("708-679-4678")).toBe(true);
    expect(leadAllowsSubmit({ phone: "708-679-4678", smsConsent: undefined }).ok).toBe(false);
    expect(leadAllowsSubmit({ phone: "708-679-4678", smsConsent: "yes" })).toEqual({ ok: true });
  });
});
