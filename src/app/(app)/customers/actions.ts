"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getRepo } from "@/lib/data/repo";
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
