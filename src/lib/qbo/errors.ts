/** An Intuit / QuickBooks failure with a message that is safe to show staff (never contains tokens). */
export class QboError extends Error {
  status: number;
  code: string | null;
  intuitTid: string | null;
  constructor(message: string, opts: { status?: number; code?: string | null; intuitTid?: string | null } = {}) {
    super(message);
    this.name = "QboError";
    this.status = opts.status ?? 0;
    this.code = opts.code ?? null;
    this.intuitTid = opts.intuitTid ?? null;
  }
}

/** The connection is gone or the refresh token is no longer valid: an admin must reconnect. */
export class QboAuthError extends QboError {
  constructor(message = "QuickBooks sign-in expired. An admin needs to reconnect QuickBooks in Settings.") {
    super(message, { status: 401, code: "auth" });
    this.name = "QboAuthError";
  }
}

type Fault = { Fault?: { Error?: { Message?: string; Detail?: string; code?: string }[]; type?: string } };

/** Friendly text for a QuickBooks error response body (JSON Fault or OAuth error). */
export function intuitErrorMessage(status: number, body: unknown): { message: string; code: string | null } {
  const f = (body as Fault)?.Fault;
  const err = f?.Error?.[0];
  const code = err?.code ?? null;
  if (code === "6240") return { message: "QuickBooks already has a customer with that name. Pick the existing customer instead.", code };
  if (code === "6140") return { message: "QuickBooks says that invoice number is already used.", code };
  if (code === "5010") return { message: "Someone changed this in QuickBooks just now. Refresh and try again.", code };
  if (code === "610") return { message: "That record was deleted or made inactive in QuickBooks.", code };
  if (err) {
    const detail = (err.Detail ?? "").replace(/\s+/g, " ").trim();
    const msg = (err.Message ?? "QuickBooks error").trim();
    return { message: `QuickBooks: ${msg}${detail && detail !== msg ? ` — ${detail}` : ""}`.slice(0, 400), code };
  }
  const oauth = body as { error?: string; error_description?: string };
  if (oauth?.error) {
    if (oauth.error === "invalid_grant") return { message: "QuickBooks sign-in expired. An admin needs to reconnect QuickBooks in Settings.", code: "invalid_grant" };
    return { message: `QuickBooks sign-in failed (${oauth.error}).`, code: oauth.error };
  }
  if (status === 429) return { message: "QuickBooks is busy (rate limit). Wait a minute and try again.", code: "429" };
  if (status >= 500) return { message: "QuickBooks is having trouble right now. Try again in a few minutes.", code: String(status) };
  if (status === 403) return { message: "QuickBooks refused access. Check the connected user has admin rights in QuickBooks.", code: "403" };
  return { message: `QuickBooks request failed (HTTP ${status}).`, code: String(status) };
}
