import { QBO_MINOR_VERSION, qboApiBase, type QboEnvironment } from "./config";
import { QboAuthError, QboError, intuitErrorMessage } from "./errors";
import type { FetchLike } from "./oauth";
import type { QboInvoiceRecord } from "./status";
import { buildCustomerCreatePayload, desiredCustomerFromPortal, isValidEmail, type PortalCustomerSnapshot, type QboCustomerRecord } from "./customer";

/** Minimal shapes of the QuickBooks entities we use. */
export type QboCustomerEntity = QboCustomerRecord;
export type QboInvoiceEntity = {
  Id: string; SyncToken: string; DocNumber?: string; TxnDate?: string; DueDate?: string;
  TotalAmt?: number; Balance?: number; EmailStatus?: string; PrivateNote?: string;
  CustomerRef?: { value: string; name?: string };
};

export type QboCustomer = { id: string; name: string; email: string; address: string };
export type QboPick = { id: string; name: string };
export type QboTerm = QboPick & { dueDays: number | null };
export type QboTaxOption = QboPick & { rate: number | null };

export function toQboCustomer(c: QboCustomerEntity): QboCustomer {
  const a = c.BillAddr ?? {};
  const cityLine = [a.City, [a.CountrySubDivisionCode, a.PostalCode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return {
    id: String(c.Id),
    name: c.DisplayName,
    email: c.PrimaryEmailAddr?.Address ?? "",
    address: [a.Line1, cityLine].filter(Boolean).join(", "),
  };
}

export function invoiceRecordFrom(inv: QboInvoiceEntity): QboInvoiceRecord {
  return {
    qboInvoiceId: String(inv.Id),
    docNumber: inv.DocNumber ?? null,
    total: Number(inv.TotalAmt ?? 0),
    balance: Number(inv.Balance ?? 0),
    emailStatus: inv.EmailStatus ?? null,
    dueDate: inv.DueDate ?? null,
    txnDate: inv.TxnDate ?? null,
  };
}

/** Escape a value for a QuickBooks query string literal ('…'). */
export function qboQuote(v: string) {
  return `'${v.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

export type QboAuthProvider = {
  /** A valid access token (refreshing first if it is about to expire). */
  accessToken(): Promise<string>;
  /** Force a refresh after a 401 and return the new access token. */
  refresh(): Promise<string>;
};

const sleepMs = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * QuickBooks Online Accounting API client (v3, minorversion pinned). Retries once after a
 * 401 with a refreshed token, and backs off on 429 rate limits. Creating an invoice never
 * emails the customer (EmailStatus is NotSet). The only send path is sendInvoice, which
 * calls QuickBooks POST /invoice/{id}/send — the portal itself never sends email.
 */
export class QboApi {
  private base: string;
  constructor(
    private opts: {
      environment: QboEnvironment;
      realmId: string;
      auth: QboAuthProvider;
      fetch?: FetchLike;
      sleep?: (ms: number) => Promise<void>;
      baseUrl?: string;
    },
  ) {
    this.base = (opts.baseUrl ?? qboApiBase(opts.environment)).replace(/\/$/, "");
  }

  get realmId() { return this.opts.realmId; }

  private url(path: string, query: Record<string, string> = {}) {
    const u = new URL(`${this.base}/v3/company/${encodeURIComponent(this.opts.realmId)}/${path.replace(/^\//, "")}`);
    for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
    u.searchParams.set("minorversion", QBO_MINOR_VERSION);
    return u.toString();
  }

  async request<T>(method: "GET" | "POST", path: string, opts: { query?: Record<string, string>; body?: unknown } = {}): Promise<T> {
    const doFetch = this.opts.fetch ?? fetch;
    const sleep = this.opts.sleep ?? sleepMs;
    let token = await this.opts.auth.accessToken();
    let refreshed = false;
    for (let attempt = 0; ; attempt++) {
      const res = await doFetch(this.url(path, opts.query), {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        cache: "no-store",
      });
      if (res.status === 401 && !refreshed) {
        refreshed = true;
        token = await this.opts.auth.refresh();
        continue;
      }
      if (res.status === 429 && attempt < 3) {
        const ra = Number(res.headers.get("retry-after"));
        await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 10) * 1000 : 1000 * 2 ** attempt);
        continue;
      }
      if (res.status >= 500 && method === "GET" && attempt < 1) {
        await sleep(500);
        continue;
      }
      const text = await res.text();
      let body: unknown = null;
      try { body = text ? JSON.parse(text) : null; } catch { body = null; }
      if (!res.ok || (body as { Fault?: unknown })?.Fault) {
        const { message, code } = intuitErrorMessage(res.status, body);
        if (res.status === 401) throw new QboAuthError();
        throw new QboError(message, { status: res.status, code, intuitTid: res.headers.get("intuit_tid") });
      }
      return body as T;
    }
  }

  async query<T>(entity: string, sql: string): Promise<T[]> {
    const r = await this.request<{ QueryResponse?: Record<string, unknown> }>("GET", "query", { query: { query: sql } });
    return ((r.QueryResponse?.[entity] as T[] | undefined) ?? []);
  }

  async companyName(): Promise<string> {
    const r = await this.request<{ CompanyInfo?: { CompanyName?: string; LegalName?: string } }>("GET", `companyinfo/${encodeURIComponent(this.opts.realmId)}`);
    return r.CompanyInfo?.CompanyName || r.CompanyInfo?.LegalName || "QuickBooks company";
  }

  /** Search by display name / company name (LIKE) and exact email. QBO queries have no OR, so we merge. */
  async searchCustomers(q: string, limit = 20): Promise<QboCustomer[]> {
    const needle = q.trim().slice(0, 100);
    const seen = new Map<string, QboCustomerEntity>();
    const add = (rows: QboCustomerEntity[]) => rows.forEach((c) => { if (!seen.has(String(c.Id))) seen.set(String(c.Id), c); });
    if (!needle) {
      add(await this.query<QboCustomerEntity>("Customer", `select * from Customer where Active = true orderby DisplayName maxresults ${limit}`));
    } else {
      const like = qboQuote(`%${needle.replace(/%/g, "")}%`);
      add(await this.query<QboCustomerEntity>("Customer", `select * from Customer where DisplayName like ${like} maxresults ${limit}`));
      if (needle.includes("@")) add(await this.query<QboCustomerEntity>("Customer", `select * from Customer where PrimaryEmailAddr = ${qboQuote(needle)} maxresults ${limit}`));
      else if (seen.size < limit) add(await this.query<QboCustomerEntity>("Customer", `select * from Customer where CompanyName like ${like} maxresults ${limit}`));
    }
    return [...seen.values()].filter((c) => c.Active !== false).slice(0, limit).map(toQboCustomer);
  }

  async customerByDisplayName(name: string): Promise<QboCustomer | null> {
    const rows = await this.query<QboCustomerEntity>("Customer", `select * from Customer where DisplayName = ${qboQuote(name.trim())}`);
    return rows[0] ? toQboCustomer(rows[0]) : null;
  }

  async customerByEmail(email: string): Promise<QboCustomer[]> {
    if (!email.trim()) return [];
    const rows = await this.query<QboCustomerEntity>("Customer", `select * from Customer where PrimaryEmailAddr = ${qboQuote(email.trim())}`);
    return rows.filter((c) => c.Active !== false).map(toQboCustomer);
  }

  async getCustomer(id: string): Promise<QboCustomer | null> {
    try {
      const r = await this.request<{ Customer?: QboCustomerEntity }>("GET", `customer/${encodeURIComponent(id)}`);
      return r.Customer ? toQboCustomer(r.Customer) : null;
    } catch (e) {
      if (e instanceof QboError && (e.status === 400 || e.status === 404) && e.code === "610") return null;
      throw e;
    }
  }

  async getCustomerEntity(id: string): Promise<QboCustomerRecord | null> {
    try {
      const r = await this.request<{ Customer?: QboCustomerRecord }>("GET", `customer/${encodeURIComponent(id)}`);
      return r.Customer ?? null;
    } catch (e) {
      if (e instanceof QboError && (e.status === 400 || e.status === 404) && e.code === "610") return null;
      throw e;
    }
  }

  /** Create a customer with every useful portal field, unless one with the same display name already exists. */
  async createCustomer(input: PortalCustomerSnapshot | { name: string; email?: string | null; phone?: string | null; address?: string | null; city?: string | null; state?: string | null; zip?: string | null; id?: string }): Promise<{ customer: QboCustomer; existed: boolean }> {
    const desired = desiredCustomerFromPortal({ id: "id" in input && input.id ? input.id : "", ...input });
    if (!desired.displayName) throw new QboError("Customer name is required.");
    const existing = await this.customerByDisplayName(desired.displayName);
    if (existing) return { customer: existing, existed: true };
    const r = await this.request<{ Customer: QboCustomerEntity }>("POST", "customer", { body: buildCustomerCreatePayload(desired) });
    return { customer: toQboCustomer(r.Customer), existed: false };
  }

  /**
   * Sparse update: send only the provided fields plus Id and SyncToken. Retries once on a
   * stale SyncToken (Intuit code 5010) with the current token. Callers must only pass
   * fields that are blank in QuickBooks (see sparseCustomerPatch).
   */
  async updateCustomerSparse(id: string, patch: Record<string, unknown>, syncToken?: string): Promise<QboCustomerRecord> {
    const send = async (token: string) => {
      const r = await this.request<{ Customer: QboCustomerRecord }>("POST", "customer", {
        body: { Id: id, SyncToken: token, sparse: true, ...patch },
      });
      return r.Customer;
    };
    let token = syncToken;
    if (!token) {
      const cur = await this.getCustomerEntity(id);
      if (!cur) throw new QboError("That QuickBooks customer no longer exists. Pick another.");
      token = String(cur.SyncToken ?? "0");
    }
    try {
      return await send(token);
    } catch (e) {
      if (!(e instanceof QboError) || e.code !== "5010") throw e;
      const cur = await this.getCustomerEntity(id);
      if (!cur) throw e;
      return await send(String(cur.SyncToken ?? "0"));
    }
  }

  /**
   * Ask QuickBooks to email the invoice to sendTo. This is the only send path: POST
   * /invoice/{id}/send?sendTo=. The portal does not send email itself.
   */
  async sendInvoice(id: string, sendTo: string): Promise<QboInvoiceEntity> {
    const email = sendTo.trim();
    if (!isValidEmail(email)) throw new QboError("Enter a valid email address.");
    const r = await this.request<{ Invoice?: QboInvoiceEntity }>("POST", `invoice/${encodeURIComponent(id)}/send`, { query: { sendTo: email } });
    return r.Invoice ?? await this.getInvoice(id);
  }

  async listItems(): Promise<QboPick[]> {
    const rows = await this.query<{ Id: string; Name: string; Type?: string; Active?: boolean }>("Item", "select * from Item where Active = true maxresults 1000");
    return rows.filter((i) => i.Type !== "Category" && i.Type !== "Group").map((i) => ({ id: String(i.Id), name: i.Name })).sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Find the "Service call" item, creating it (Service type, first income account) if missing. */
  async ensureServiceItem(name = "Service call"): Promise<QboPick> {
    const found = await this.query<{ Id: string; Name: string }>("Item", `select * from Item where Name = ${qboQuote(name)}`);
    if (found[0]) return { id: String(found[0].Id), name: found[0].Name };
    const accounts = await this.query<{ Id: string; Name: string }>("Account", "select * from Account where AccountType = 'Income' and Active = true maxresults 50");
    const acct = accounts.find((a) => /service/i.test(a.Name)) ?? accounts[0];
    if (!acct) throw new QboError("QuickBooks has no income account to attach a Service call item to.");
    const r = await this.request<{ Item: { Id: string; Name: string } }>("POST", "item", { body: { Name: name, Type: "Service", IncomeAccountRef: { value: String(acct.Id) } } });
    return { id: String(r.Item.Id), name: r.Item.Name };
  }

  async listTerms(): Promise<QboTerm[]> {
    const rows = await this.query<{ Id: string; Name: string; DueDays?: number }>("Term", "select * from Term where Active = true");
    return rows.map((t) => ({ id: String(t.Id), name: t.Name, dueDays: typeof t.DueDays === "number" ? t.DueDays : null }));
  }

  /** Non-taxable first, then each sales tax code with its combined rate (estimate; QuickBooks computes final tax). */
  async listTaxOptions(): Promise<QboTaxOption[]> {
    const [codes, rates] = await Promise.all([
      this.query<{ Id: string; Name: string; Taxable?: boolean; SalesTaxRateList?: { TaxRateDetail?: { TaxRateRef?: { value: string } }[] } }>("TaxCode", "select * from TaxCode where Active = true"),
      this.query<{ Id: string; RateValue?: number }>("TaxRate", "select * from TaxRate where Active = true"),
    ]);
    const rateById = new Map(rates.map((r) => [String(r.Id), Number(r.RateValue ?? 0)]));
    const out: QboTaxOption[] = [{ id: "NON", name: "Non-taxable", rate: 0 }];
    for (const c of codes) {
      if (c.Id === "NON" || c.Id === "TAX" || c.Taxable === false) continue;
      const details = c.SalesTaxRateList?.TaxRateDetail ?? [];
      if (!details.length) continue;
      const rate = details.reduce((s, d) => s + (rateById.get(String(d.TaxRateRef?.value)) ?? 0), 0);
      out.push({ id: String(c.Id), name: `${c.Name} (${+rate.toFixed(3)}%)`, rate });
    }
    if (out.length === 1) out.push({ id: "TAX", name: "Taxable (QuickBooks calculates)", rate: null });
    return out;
  }

  async createInvoice(payload: Record<string, unknown>): Promise<QboInvoiceEntity> {
    if ("EmailStatus" in payload && payload.EmailStatus !== "NotSet") throw new QboError("Invoices are created without email.");
    const r = await this.request<{ Invoice: QboInvoiceEntity }>("POST", "invoice", { body: payload });
    return r.Invoice;
  }

  async getInvoice(id: string): Promise<QboInvoiceEntity> {
    const r = await this.request<{ Invoice: QboInvoiceEntity }>("GET", `invoice/${encodeURIComponent(id)}`);
    return r.Invoice;
  }

  /** Void (not delete) an invoice. Reads the current SyncToken first. */
  async voidInvoice(id: string): Promise<QboInvoiceEntity> {
    const cur = await this.getInvoice(id);
    const r = await this.request<{ Invoice: QboInvoiceEntity }>("POST", "invoice", { query: { operation: "void" }, body: { Id: String(cur.Id), SyncToken: String(cur.SyncToken), sparse: true } });
    return r.Invoice;
  }
}
