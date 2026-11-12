import { describe, expect, it } from "vitest";
import { parseInboundEmail } from "./inbound-email";
import { checkWebhookSecret, webhookSecretConfigured } from "./webhook";

describe("inbound email parser", () => {
  it("reads From, subject, phone, and an Illinois address", () => {
    const p = parseInboundEmail(
      "From: Chris Lang <chris.lang@example.com>\nSubject: Whole Home Electric question\n\nWe live at 910 Cedar St, Palatine, IL 60067. Call me at (847) 555-0133.\nThanks.",
    );
    expect(p.name).toBe("Chris Lang");
    expect(p.email).toBe("chris.lang@example.com");
    expect(p.phone).toMatch(/555-0133/);
    expect(p.city).toBe("Palatine");
    expect(p.zip).toBe("60067");
    expect(p.message).toMatch(/Cedar St/);
  });
});

describe("webhook secret", () => {
  it("rejects missing or mismatched secrets and never throws", () => {
    expect(webhookSecretConfigured("")).toBe(false);
    expect(checkWebhookSecret("abc", "abcdefgh")).toBe(false);
    expect(checkWebhookSecret("abcdefgh", "abcdefgh")).toBe(true);
    expect(checkWebhookSecret(null, "abcdefgh")).toBe(false);
  });
});
