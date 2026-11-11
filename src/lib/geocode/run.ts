import "server-only";
import { getRepo } from "@/lib/data/repo";
import { geocodeOneline } from "./client";
import { addressChanged, emptyGeocode, formatGeocodeLine, shouldGeocode, type AddressParts } from "./parse";
import type { Customer, GeocodeFields } from "@/lib/types";

function fields(r: { lat: number | null; lng: number | null; status: import("./parse").GeocodeStatus }): GeocodeFields {
  return { lat: r.lat, lng: r.lng, geocoded_at: new Date().toISOString(), geocode_status: r.status };
}

/**
 * Geocode a saved customer. Never throws — failures are stored as geocode_status=error
 * so the original insert/update still succeeds.
 */
export async function geocodeCustomerById(id: string, prev: AddressParts | null, isNew: boolean) {
  const repo = await getRepo();
  const c = await repo.getCustomer(id);
  if (!c) return;
  const action = shouldGeocode(c, c, prev, isNew);
  if (action === "skip") return;
  if (action === "clear") {
    await repo.setCustomerGeocode(id, emptyGeocode());
    return;
  }
  const result = await geocodeOneline(c);
  try {
    await repo.setCustomerGeocode(id, fields(result));
  } catch {
    // already saved; leave previous geocode state
  }
}

export async function geocodeServiceRequestById(id: string) {
  const repo = await getRepo();
  const sr = await repo.getServiceRequest(id);
  if (!sr) return;
  const site: AddressParts = { address: sr.site_address, city: sr.site_city, state: sr.site_state, zip: sr.site_zip };
  if (!formatGeocodeLine(site)) {
    await repo.setServiceRequestGeocode(id, emptyGeocode()).catch(() => {});
    return;
  }
  // Same site as the customer? Reuse coords so we don't spend another Census call.
  const customer: Customer | null = await repo.getCustomer(sr.customer_id).catch(() => null);
  if (customer && !addressChanged(site, customer) && customer.geocode_status === "matched" && customer.lat != null && customer.lng != null) {
    await repo.setServiceRequestGeocode(id, { lat: customer.lat, lng: customer.lng, geocoded_at: customer.geocoded_at, geocode_status: "matched" }).catch(() => {});
    return;
  }
  const result = await geocodeOneline(site);
  await repo.setServiceRequestGeocode(id, fields(result)).catch(() => {});
}

export type { AddressParts };
export { addressChanged, shouldGeocode };

