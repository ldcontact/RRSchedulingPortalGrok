import { afterEach, describe, expect, it, vi } from "vitest";
import { sendSms, smsEnabled, smsProvider, toE164 } from "./sms";

const KEYS = [
  "SALES_SMS_PROVIDER",
  "SALES_SMS_ALLOW_SEND",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_MESSAGING_SERVICE_SID",
] as const;

function isolateEnv() {
  const prev: Record<string, string | undefined> = {};
  for (const k of KEYS) {
    prev[k] = process.env[k];
    delete process.env[k];
  }
  return () => {
    for (const k of KEYS) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  };
}

function wireTwilio(opts: { allowSend?: boolean; serviceSid?: string } = {}) {
  process.env.SALES_SMS_PROVIDER = "twilio";
  process.env.TWILIO_ACCOUNT_SID = "ACtestaccountsid000000000000000000";
  process.env.TWILIO_AUTH_TOKEN = "testauthtoken00000000000000000000";
  if (opts.allowSend) process.env.SALES_SMS_ALLOW_SEND = "1";
  if (opts.serviceSid) process.env.TWILIO_MESSAGING_SERVICE_SID = opts.serviceSid;
}

describe("toE164", () => {
  it("normalizes common US formats", () => {
    expect(toE164("708-679-4678")).toBe("+17086794678");
    expect(toE164("(708) 679-4678")).toBe("+17086794678");
    expect(toE164("17086794678")).toBe("+17086794678");
    expect(toE164("+17086794678")).toBe("+17086794678");
  });
  it("rejects short or empty values", () => {
    expect(toE164("")).toBeNull();
    expect(toE164("679-4678")).toBeNull();
    expect(toE164(null)).toBeNull();
  });
});

describe("sms flags stay off by default", () => {
  let restore: () => void;
  afterEach(() => restore?.());

  it("is disabled even when Twilio credentials exist in the environment", () => {
    restore = isolateEnv();
    process.env.TWILIO_ACCOUNT_SID = "ACtestaccountsid000000000000000000";
    process.env.TWILIO_AUTH_TOKEN = "testauthtoken00000000000000000000";
    expect(smsProvider()).toBe("none");
    expect(smsEnabled()).toBe(false);
  });

  it("stays disabled when the provider is selected but allow-send is not set", () => {
    restore = isolateEnv();
    wireTwilio({ serviceSid: "MGdedicatedsales00000000000000000" });
    expect(smsProvider()).toBe("twilio");
    expect(smsEnabled()).toBe(false);
  });
});

describe("sendSms", () => {
  let restore: () => void;
  afterEach(() => {
    restore?.();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not call Twilio when SMS is disabled", async () => {
    restore = isolateEnv();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await sendSms({ to: "708-679-4678", body: "Hello" });
    expect(result.skipped).toBe(true);
    expect(result.provider).toBe("none");
    expect(result.reason).toMatch(/A2P 10DLC/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not call Twilio when wired but allow-send is off", async () => {
    restore = isolateEnv();
    wireTwilio({ serviceSid: "MGdedicatedsales00000000000000000" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await sendSms({ to: "708-679-4678", body: "Hello" });
    expect(result.skipped).toBe(true);
    expect(result.provider).toBe("twilio");
    expect(result.reason).toMatch(/SALES_SMS_ALLOW_SEND=1/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses to send without a dedicated messaging service SID", async () => {
    restore = isolateEnv();
    wireTwilio({ allowSend: true });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await sendSms({ to: "708-679-4678", body: "Hello" });
    expect(result.skipped).toBe(true);
    expect(result.reason).toMatch(/Unify Notification/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not call Twilio for an invalid phone number", async () => {
    restore = isolateEnv();
    wireTwilio({ allowSend: true, serviceSid: "MGdedicatedsales00000000000000000" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await sendSms({ to: "1234", body: "Hello" });
    expect(result.skipped).toBe(true);
    expect(result.reason).toMatch(/valid US number/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts to Twilio with the messaging service and E.164 destination", async () => {
    restore = isolateEnv();
    wireTwilio({ allowSend: true, serviceSid: "MGdedicatedsales00000000000000000" });
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = String(init?.body ?? "");
      expect(body).toContain("To=%2B17086794678");
      expect(body).toContain("MessagingServiceSid=MGdedicatedsales00000000000000000");
      expect(body).not.toContain("From=");
      expect(body).toContain("Body=Hello+from+Retrofit+Rebates");
      return new Response(JSON.stringify({ sid: "SMfake000000000000000000000000000" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await sendSms({ to: "708-679-4678", body: "Hello from Retrofit Rebates" });
    expect(result).toEqual({ skipped: false, provider: "twilio", id: "SMfake000000000000000000000000000" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toMatch(/\/Messages\.json$/);
    expect(url).not.toMatch(/testauthtoken/);
  });

  it("returns a generic reason when Twilio rejects the send, with no secret in the reason", async () => {
    restore = isolateEnv();
    wireTwilio({ allowSend: true, serviceSid: "MGdedicatedsales00000000000000000" });
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ message: "Authenticate", code: 20003 }), { status: 401 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await sendSms({ to: "708-679-4678", body: "Hello" });
    expect(result.skipped).toBe(true);
    expect(result.reason).toMatch(/Twilio rejected the send \(401\)/);
    expect(result.reason).not.toMatch(/Authenticate|testauth|ACtest/);
  });
});
