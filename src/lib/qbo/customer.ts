/**
 * Portal → QuickBooks customer field mapping. Pure: no network.
 * Create sends every useful field. Updates are sparse: fill only blank QBO
 * fields and never overwrite a value someone edited in QuickBooks.
 */

export type CustomerAddress = {
  line1: string;
  city: string;
  state: string;
  zip: string;
  country: string;
};

export type PortalCustomerSnapshot = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  siteAddress?: string | null;
  siteCity?: string | null;
  siteState?: string | null;
  siteZip?: string | null;
};

export type DesiredQboCustomer = {
  displayName: string;
  companyName: string | null;
  givenName: string | null;
  familyName: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  billAddr: CustomerAddress | null;
  shipAddr: CustomerAddress | null;
  notes: string;
};

export type QboAddr = {
  Line1?: string;
  Line2?: string;
  City?: string;
  CountrySubDivisionCode?: string;
  PostalCode?: string;
  Country?: string;
};

export type QboCustomerRecord = {
  Id: string;
  SyncToken?: string;
  DisplayName?: string;
  CompanyName?: string;
  GivenName?: string;
  FamilyName?: string;
  Active?: boolean;
  PrimaryEmailAddr?: { Address?: string };
  PrimaryPhone?: { FreeFormNumber?: string };
  Mobile?: { FreeFormNumber?: string };
  BillAddr?: QboAddr;
  ShipAddr?: QboAddr;
  Notes?: string;
};

const COMPANY_SUFFIX = /\b(incorporated|inc|l\.l\.c|llc|limited|ltd|corporation|corp|company|co|llp|plc|p\.c|pc|associates|association|group|enterprises|holdings|partners|partnership|trust|foundation)\.?$/i;

export function cleanDisplayName(name: string) {
  return name.replace(/:/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
}

export function splitPersonName(raw: string): { given: string; family: string } {
  const cleaned = raw.replace(/:/g, " ").replace(/\s+/g, " ").trim().replace(/^(mr|mrs|ms|miss|dr|prof)\.?\s+/i, "");
  if (!cleaned) return { given: "", family: "" };
  const parts = cleaned.split(" ");
  if (parts.length === 1) return { given: parts[0], family: "" };
  return { given: parts.slice(0, -1).join(" "), family: parts[parts.length - 1] };
}

export function isCompanyName(name: string) {
  return COMPANY_SUFFIX.test(cleanDisplayName(name));
}

function looksLikePersonName(name: string) {
  const t = cleanDisplayName(name);
  if (!t || isCompanyName(t) || /\d/.test(t)) return false;
  const parts = t.split(" ");
  if (parts.length < 2 || parts.length > 3) return false;
  return parts.every((p) => /^[\p{L}'’.?-]+$/u.test(p));
}

function sameName(a: string, b: string) {
  return cleanDisplayName(a).toLowerCase() === cleanDisplayName(b).toLowerCase();
}

export function isCompanyCustomer(customerName: string, contactName?: string | null) {
  const contact = (contactName ?? "").trim();
  if (contact && !sameName(contact, customerName)) return true;
  return isCompanyName(customerName);
}

function trim(v: string | null | undefined) {
  return (v ?? "").replace(/\s+/g, " ").trim();
}

function addr(line1?: string | null, city?: string | null, state?: string | null, zip?: string | null): CustomerAddress | null {
  const a: CustomerAddress = {
    line1: trim(line1),
    city: trim(city),
    state: trim(state),
    zip: trim(zip),
    country: "US",
  };
  if (!a.line1 && !a.city && !a.zip) return null;
  return a;
}

export function formatServiceLocation(a: { address?: string | null; city?: string | null; state?: string | null; zip?: string | null } | CustomerAddress | null | undefined) {
  if (!a) return "";
  if ("line1" in a) {
    const cityLine = [a.city, [a.state, a.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    return [a.line1, cityLine].filter(Boolean).join(", ");
  }
  const cityLine = [trim(a.city), [trim(a.state), trim(a.zip)].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [trim(a.address), cityLine].filter(Boolean).join(", ");
}

export function rrSchedulerCustomerNote(id: string) {
  return `RR Scheduler customer ${id}`;
}

export function desiredCustomerFromPortal(p: PortalCustomerSnapshot): DesiredQboCustomer {
  const displayName = cleanDisplayName(p.name);
  const contact = trim(p.contactName);
  const company = isCompanyCustomer(displayName, contact);
  let companyName: string | null = null;
  let givenName: string | null = null;
  let familyName: string | null = null;
  if (company) {
    companyName = displayName || null;
    if (contact) {
      const n = splitPersonName(contact);
      givenName = n.given || null;
      familyName = n.family || null;
    }
  } else if (contact && !sameName(contact, displayName)) {
    const n = splitPersonName(contact);
    givenName = n.given || null;
    familyName = n.family || null;
  } else if (looksLikePersonName(displayName)) {
    const n = splitPersonName(displayName);
    givenName = n.given || null;
    familyName = n.family || null;
  }
  const email = trim(p.email) || trim(p.contactEmail) || null;
  const phone = trim(p.phone) || trim(p.contactPhone) || null;
  const contactPhone = trim(p.contactPhone);
  const mobile = contactPhone && phone && contactPhone !== phone ? contactPhone : null;
  const billAddr = addr(p.address, p.city, p.state, p.zip) ?? addr(p.siteAddress, p.siteCity, p.siteState, p.siteZip);
  const shipAddr = addr(p.siteAddress, p.siteCity, p.siteState, p.siteZip) ?? billAddr;
  return {
    displayName,
    companyName,
    givenName,
    familyName,
    email,
    phone,
    mobile,
    billAddr,
    shipAddr,
    notes: p.id.trim() ? rrSchedulerCustomerNote(p.id) : "",
  };
}

/** Build a mapping snapshot from a portal customer, optional primary contact, and ticket site. */
export function snapshotFromRecords(opts: {
  customer: { id: string; name: string; email?: string | null; phone?: string | null; address?: string | null; city?: string | null; state?: string | null; zip?: string | null };
  contact?: { name?: string | null; email?: string | null; phone?: string | null } | null;
  site?: { address?: string | null; city?: string | null; state?: string | null; zip?: string | null; contactName?: string | null; contactEmail?: string | null; contactPhone?: string | null } | null;
}): PortalCustomerSnapshot {
  const c = opts.customer;
  const contact = opts.contact;
  const site = opts.site;
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    address: c.address,
    city: c.city,
    state: c.state,
    zip: c.zip,
    contactName: contact?.name || site?.contactName,
    contactEmail: contact?.email || site?.contactEmail,
    contactPhone: contact?.phone || site?.contactPhone,
    siteAddress: site?.address,
    siteCity: site?.city,
    siteState: site?.state,
    siteZip: site?.zip,
  };
}

export function qboAddrFrom(a: CustomerAddress): QboAddr {
  return {
    Line1: a.line1 || undefined,
    City: a.city || undefined,
    CountrySubDivisionCode: a.state || undefined,
    PostalCode: a.zip || undefined,
    Country: a.country || "US",
  };
}

export function buildCustomerCreatePayload(d: DesiredQboCustomer): Record<string, unknown> {
  if (!d.displayName) throw new Error("Customer name is required.");
  const body: Record<string, unknown> = { DisplayName: d.displayName };
  if (d.companyName) body.CompanyName = d.companyName;
  if (d.givenName) body.GivenName = d.givenName;
  if (d.familyName) body.FamilyName = d.familyName;
  if (d.email) body.PrimaryEmailAddr = { Address: d.email };
  if (d.phone) body.PrimaryPhone = { FreeFormNumber: d.phone };
  if (d.mobile) body.Mobile = { FreeFormNumber: d.mobile };
  if (d.billAddr) body.BillAddr = qboAddrFrom(d.billAddr);
  if (d.shipAddr) body.ShipAddr = qboAddrFrom(d.shipAddr);
  if (d.notes) body.Notes = d.notes;
  return body;
}

const blank = (v: string | null | undefined) => !trim(v);

function addrBlank(a: QboAddr | undefined) {
  if (!a) return true;
  return blank(a.Line1) && blank(a.Line2) && blank(a.City) && blank(a.PostalCode) && blank(a.CountrySubDivisionCode) && blank(a.Country);
}

function mergeAddr(existing: QboAddr | undefined, desired: CustomerAddress | null): QboAddr | undefined {
  if (!desired) return undefined;
  if (addrBlank(existing)) return qboAddrFrom(desired);
  const want = qboAddrFrom(desired);
  const merged: QboAddr = {
    Line1: blank(existing!.Line1) ? want.Line1 : existing!.Line1,
    Line2: existing!.Line2 || undefined,
    City: blank(existing!.City) ? want.City : existing!.City,
    CountrySubDivisionCode: blank(existing!.CountrySubDivisionCode) ? want.CountrySubDivisionCode : existing!.CountrySubDivisionCode,
    PostalCode: blank(existing!.PostalCode) ? want.PostalCode : existing!.PostalCode,
    Country: blank(existing!.Country) ? want.Country : existing!.Country,
  };
  const changed = (["Line1", "City", "CountrySubDivisionCode", "PostalCode", "Country"] as const).some((k) => (existing![k] ?? "") !== (merged[k] ?? ""));
  return changed ? merged : undefined;
}

/** Fields to send in a sparse Customer update. Empty object if nothing is blank. */
export function sparseCustomerPatch(existing: QboCustomerRecord, desired: DesiredQboCustomer): Record<string, unknown> | null {
  const patch: Record<string, unknown> = {};
  if (desired.companyName && blank(existing.CompanyName)) patch.CompanyName = desired.companyName;
  if (desired.givenName && blank(existing.GivenName)) patch.GivenName = desired.givenName;
  if (desired.familyName && blank(existing.FamilyName)) patch.FamilyName = desired.familyName;
  if (desired.email && blank(existing.PrimaryEmailAddr?.Address)) patch.PrimaryEmailAddr = { Address: desired.email };
  if (desired.phone && blank(existing.PrimaryPhone?.FreeFormNumber)) patch.PrimaryPhone = { FreeFormNumber: desired.phone };
  if (desired.mobile && blank(existing.Mobile?.FreeFormNumber)) patch.Mobile = { FreeFormNumber: desired.mobile };
  const bill = mergeAddr(existing.BillAddr, desired.billAddr);
  if (bill) patch.BillAddr = bill;
  const ship = mergeAddr(existing.ShipAddr, desired.shipAddr);
  if (ship) patch.ShipAddr = ship;
  if (desired.notes && blank(existing.Notes)) patch.Notes = desired.notes;
  return Object.keys(patch).length ? patch : null;
}

export function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) && v.trim().length <= 200;
}
