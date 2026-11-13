/** Shared parsing for the New deal and deal-detail contact/address forms. */

/** Short checkbox label on staff deal forms. */
export const SMS_CONSENT_LABEL = "This is a cell phone, OK to text";

/**
 * Staff-recorded TCPA wording shown under the checkbox, adapted from the
 * public Get started form so it reads as consent the customer gave to staff.
 * Bump SMS_CONSENT_TEXT_VERSION if this text changes.
 */
export const SMS_CONSENT_TEXT_VERSION = "staff-deal-v1";
export const SMS_CONSENT_TEXT_VERSION_GET_STARTED = "get-started-v1";
export const SMS_CONSENT_LEGAL_TEXT =
  "Customer confirmed this is a mobile number and agrees to receive texts from Retrofit Rebates, Inc. about their project and appointments. Message frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help. Consent is not a condition of service. See our Privacy Policy.";
export const SMS_CONSENT_OFF_NOTE =
  "Texting is off in Sales right now. Checking this records consent; nothing is sent automatically.";

export type ParsedDealContact = {
  title: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  address: string | null;
  city: string | null;
  state: string;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  sms_consent: boolean;
};

const EMAIL_RE = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const ZIP_RE = /^\d{5}(?:-\d{4})?$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

function text(fd: FormData, name: string): string {
  return String(fd.get(name) ?? "").trim();
}

function coord(fd: FormData, name: string): number | null {
  const raw = text(fd, name);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function parseDealContactFields(fd: FormData): { ok: true; value: ParsedDealContact } | { ok: false; error: string } {
  const dealName = text(fd, "title");
  const address = text(fd, "address") || null;
  const city = text(fd, "city") || null;
  const state = (text(fd, "state") || "IL").toUpperCase();
  const zip = text(fd, "zip") || null;
  const contact_name = text(fd, "contact_name") || null;
  const contact_phone = text(fd, "contact_phone") || null;
  const contact_email = text(fd, "contact_email").toLowerCase() || null;
  const sms_consent = ["yes", "on", "true", "1"].includes(String(fd.get("sms_consent") ?? "").toLowerCase());
  const title = dealName || address || "";
  if (!title) return { ok: false, error: "Enter a deal name or street address." };
  if (contact_email && !isValidEmail(contact_email)) {
    return { ok: false, error: "Enter a valid email address, or leave it blank." };
  }
  if (!/^[A-Z]{2}$/.test(state)) {
    return { ok: false, error: "State should be a two-letter code, such as IL." };
  }
  if (zip && !ZIP_RE.test(zip)) {
    return { ok: false, error: "Enter a 5-digit ZIP, or leave it blank." };
  }
  const lat = coord(fd, "geo_lat");
  const lng = coord(fd, "geo_lng");
  return {
    ok: true,
    value: {
      title,
      contact_name,
      contact_phone,
      contact_email,
      address,
      city,
      state,
      zip,
      lat: lat != null && lng != null ? lat : null,
      lng: lat != null && lng != null ? lng : null,
      sms_consent,
    },
  };
}

export function smsConsentPatch(opts: {
  checked: boolean;
  previous?: {
    sms_consent?: boolean | null;
    sms_consent_at?: string | null;
    sms_consent_by?: string | null;
    sms_consent_text_version?: string | null;
  } | null;
  userId: string;
  now?: string;
  textVersion?: string;
}): {
  sms_consent: boolean;
  sms_consent_at: string | null;
  sms_consent_by: string | null;
  sms_consent_text_version: string | null;
} {
  const now = opts.now ?? new Date().toISOString();
  const version = opts.textVersion ?? SMS_CONSENT_TEXT_VERSION;
  const was = !!opts.previous?.sms_consent;
  if (opts.checked === was) {
    return {
      sms_consent: opts.checked,
      sms_consent_at: opts.previous?.sms_consent_at ?? null,
      sms_consent_by: opts.previous?.sms_consent_by ?? null,
      sms_consent_text_version: opts.previous?.sms_consent_text_version ?? null,
    };
  }
  return {
    sms_consent: opts.checked,
    sms_consent_at: now,
    sms_consent_by: opts.userId,
    // Record the wording in force when consent is granted; keep it on withdrawal.
    sms_consent_text_version: opts.checked ? version : (opts.previous?.sms_consent_text_version ?? version),
  };
}

export const SMS_CONSENT_DEFAULTS = {
  sms_consent: false,
  sms_consent_at: null as string | null,
  sms_consent_by: null as string | null,
  sms_consent_text_version: null as string | null,
};
