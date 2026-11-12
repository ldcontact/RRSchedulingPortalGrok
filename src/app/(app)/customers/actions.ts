"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getRepo } from "@/lib/data/repo";
import { formatAddress } from "@/lib/project-row";
import type { CustomerInput } from "@/lib/types";
import { geocodeCustomerById } from "@/lib/geocode/run";

export type CustomerFormState = { error?: string; values?: Record<string, string> } | undefined;
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const n = (v: string) => (v ? v : null);

export async function saveCustomer(_: CustomerFormState, fd: FormData): Promise<CustomerFormState> {
  await requireRole("admin", "manager");
  const id = s(fd, "id");
  const values = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]));
  const input: CustomerInput = {
    name: s(fd, "name"), phone: n(s(fd, "phone")), email: n(s(fd, "email").toLowerCase()), address: n(s(fd, "address")),
    city: n(s(fd, "city")), state: n(s(fd, "state").toUpperCase()) ?? "IL", zip: n(s(fd, "zip")), notes: n(s(fd, "notes")),
    tags: s(fd, "tags").split(",").map((t) => t.trim()).filter(Boolean),
  };
  if (!input.name) return { error: "Business name is required.", values };
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) return { error: "That email address doesn't look right.", values };
  const repo = await getRepo();
  let targetId = id;
  const prev = id ? await repo.getCustomer(id).catch(() => null) : null;
  try {
    if (id) await repo.updateCustomer(id, input);
    else {
      const c = await repo.createCustomer(input);
      targetId = c.id;
      const contact = s(fd, "contact_name");
      if (contact) await repo.addContact(c.id, { name: contact, title: n(s(fd, "contact_title")), phone: input.phone, email: input.email, is_primary: true });
    }
  } catch (e) {
    return { error: (e as Error).message, values };
  }
  // Geocode after the row is saved so a Census timeout/error never blocks the customer.
  await geocodeCustomerById(targetId, prev, !id);
  const pickedLat = Number(s(fd, "geo_lat"));
  const pickedLng = Number(s(fd, "geo_lng"));
  if (Number.isFinite(pickedLat) && Number.isFinite(pickedLng)) {
    const row = await repo.getCustomer(targetId).catch(() => null);
    if (row && row.geocode_status !== "matched") {
      await repo.setCustomerGeocode(targetId, {
        lat: pickedLat, lng: pickedLng, geocoded_at: new Date().toISOString(), geocode_status: "matched",
      }).catch(() => {});
    }
  }
  revalidatePath("/customers");
  revalidatePath("/fleet");
  revalidatePath("/schedule");
  redirect(`/customers/${targetId}?saved=1`);
}

export async function addContact(customerId: string, fd: FormData) {
  await requireRole("admin", "manager");
  const name = s(fd, "name");
  if (!name) return;
  await (await getRepo()).addContact(customerId, { name, title: n(s(fd, "title")), phone: n(s(fd, "phone")), email: n(s(fd, "email").toLowerCase()), is_primary: fd.get("is_primary") === "on" });
  revalidatePath(`/customers/${customerId}`);
}

export async function deleteContact(customerId: string, contactId: string) {
  await requireRole("admin", "manager");
  await (await getRepo()).deleteContact(contactId);
  revalidatePath(`/customers/${customerId}`);
}

/** Log a call / text / email with a customer. Log only: real sending goes through lib/messaging.ts later. */
export async function logCustomerMessage(customerId: string, projectId: string | null, fd: FormData) {
  await requireRole("admin", "manager");
  const channel = s(fd, "channel");
  const body = s(fd, "body");
  if (!body || !["call", "text", "email", "note"].includes(channel)) return;
  const repo = await getRepo();
  const direction = s(fd, "direction") === "inbound" ? "inbound" : "outbound";
  if (direction === "outbound" && (channel === "text" || channel === "email")) {
    const { sendCustomerMessage } = await import("@/lib/messaging");
    const c = await repo.getCustomer(customerId);
    await sendCustomerMessage({ channel, to: { phone: c?.phone, email: c?.email }, subject: n(s(fd, "subject")), body });
  }
  await repo.logMessage({ customer_id: customerId, project_id: projectId, channel: channel as "call" | "text" | "email" | "note", direction, subject: n(s(fd, "subject")), body });
  revalidatePath(`/customers/${customerId}`);
  if (projectId) revalidatePath(`/projects/${projectId}`);
}

export async function setCustomerTags(customerId: string, fd: FormData) {
  await requireRole("admin", "manager");
  const repo = await getRepo();
  const c = await repo.getCustomer(customerId);
  if (!c) return;
  const existing = [...c.tags];
  const add = s(fd, "tag");
  const remove = s(fd, "remove");
  let tags = existing;
  if (remove) tags = existing.filter((t) => t !== remove);
  else if (add) {
    const next = add.split(",").map((t) => t.trim()).filter(Boolean);
    for (const t of next) if (!tags.includes(t)) tags.push(t);
  }
  await repo.updateCustomer(customerId, {
    name: c.name, phone: c.phone, email: c.email, address: c.address,
    city: c.city, state: c.state, zip: c.zip, notes: c.notes, tags,
  });
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
}

export async function addCustomerNote(customerId: string, fd: FormData) {
  await requireRole("admin", "manager");
  const body = s(fd, "body");
  if (!body) return;
  await (await getRepo()).addNote({ customer_id: customerId, body });
  revalidatePath(`/customers/${customerId}`);
}

// ---------------------------------------------------------------- typeahead (New project, Log a call, …)
export type CustomerHit = { id: string; name: string; address: string };
const staff = () => requireRole("admin", "manager");

/** Bounded customer search for the typeahead: at most 10 matches, never the whole list. RLS via the user-scoped repo. */
export async function searchCustomers(q: string): Promise<CustomerHit[]> {
  await staff();
  const term = q.trim();
  if (term.length < 2) return [];
  const { items } = await (await getRepo()).pageCustomers({ q: term, page: 1, size: 10, sort: "name" });
  return items.map((c) => ({ id: c.id, name: c.name, address: formatAddress(c) }));
}

/** Resolve one customer for a preselected id (e.g. /projects/new?customer=). */
export async function getCustomerHit(id: string): Promise<CustomerHit | null> {
  await staff();
  const term = id.trim();
  if (!term) return null;
  const c = await (await getRepo()).getCustomer(term);
  return c ? { id: c.id, name: c.name, address: formatAddress(c) } : null;
}
