/** Public Get started form: SMS consent is optional unless a phone is provided. Checkbox starts unchecked. */
export function smsConsentRequired(phone: string | null | undefined): boolean {
  return Boolean(phone && phone.replace(/\D/g, "").length >= 10);
}

export function hasSmsConsent(value: unknown): boolean {
  if (value === true || value === "true" || value === "on" || value === "yes" || value === "1") return true;
  return false;
}

export function leadAllowsSubmit(input: { phone?: string | null; smsConsent?: unknown }): { ok: true } | { ok: false; error: string } {
  if (smsConsentRequired(input.phone) && !hasSmsConsent(input.smsConsent)) {
    return { ok: false, error: "Please check the SMS consent box to receive texts, or leave the phone number blank." };
  }
  return { ok: true };
}
