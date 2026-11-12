import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { DEFAULT_AUTOMATIONS } from "./automations";
import { bookingToken } from "./booking";
import type { SalesActivity, SalesAlert, SalesAutomation, SalesDeal, SalesInboxItem, SalesProposal } from "./types";

export type SalesDB = {
  deals: SalesDeal[];
  inbox: SalesInboxItem[];
  activities: SalesActivity[];
  automations: SalesAutomation[];
  alerts: SalesAlert[];
  proposals: SalesProposal[];
};

const FILE = join(process.cwd(), ".mock-sales.json");

function iso(daysAgo: number, hour = 12) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}
function day(offset: number) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}
function pastDay(daysAgo: number) {
  return day(-daysAgo);
}

function seed(): SalesDB {
  const opened = (daysAgo: number) => iso(daysAgo, 10);
  const deal = (row: Partial<SalesDeal> & { id: string; title: string; stage_slug: string }): SalesDeal => ({
    pipeline_slug: "single_family_whe",
    customer_id: null,
    owner_id: "u-sales",
    contact_name: null,
    contact_phone: null,
    contact_email: null,
    address: null,
    city: null,
    state: "IL",
    zip: null,
    lat: null,
    lng: null,
    priority: "Medium",
    source: "manual",
    assessment_date: null,
    assessment_starts_at: null,
    assessment_ends_at: null,
    scheduled_date: null,
    close_date: null,
    opened_at: opened(20),
    value: 0,
    est_rebate: 0,
    converted_project_id: null,
    monday_item_id: null,
    monday_board_id: null,
    notes: null,
    created_at: opened(20),
    updated_at: iso(1),
    ...row,
  });

  const deals: SalesDeal[] = [
    deal({
      id: "sd-elena", title: "4821 Birchwood Ave", stage_slug: "approved_ready", customer_id: "c-sales-elena",
      contact_name: "Elena Vasquez", contact_phone: "(847) 555-0142", contact_email: "elena.vasquez@example.com",
      address: "4821 Birchwood Ave", city: "Schaumburg", zip: "60193", lat: 42.0334, lng: -88.0831,
      priority: "High", source: "web_form", assessment_date: pastDay(8), opened_at: opened(38),
      value: 2450, est_rebate: 1850, notes: "RISE data entered. Customer signed verbally; sending the written proposal.", created_at: opened(38),
    }),
    deal({
      id: "sd-priya", title: "219 Oakton St", stage_slug: "contacted_comed", customer_id: "c-sales-priya",
      owner_id: "u-sales", contact_name: "Priya Shah", contact_phone: "(847) 555-0160", contact_email: "priya.shah@example.com",
      address: "219 Oakton St", city: "Des Plaines", zip: "60016", lat: 42.0336, lng: -87.9373,
      priority: "High", source: "email", opened_at: opened(22), value: 2100, est_rebate: 1600,
      notes: "Waiting on ComEd account verification.", created_at: opened(22),
    }),
    deal({
      id: "sd-marcus", title: "14 S Mitchell Ave", stage_slug: "assessment_completed", customer_id: "c-sales-marcus",
      owner_id: "u-sales2", contact_name: "Marcus Reed", contact_phone: "(847) 555-0188", contact_email: "marcus.reed@example.com",
      address: "14 S Mitchell Ave", city: "Arlington Heights", zip: "60005", lat: 42.0884, lng: -87.9806,
      priority: "Medium", source: "xagent", assessment_date: pastDay(3), opened_at: opened(18),
      value: 1980, est_rebate: 1500, created_at: opened(18),
    }),
    deal({
      id: "sd-nora", title: "880 Weathersfield Way", stage_slug: "ready_for_assessment", customer_id: "c-sales-nora",
      owner_id: "u-sales", contact_name: "Nora Patel", contact_phone: "(224) 555-0119", contact_email: "nora.patel@example.com",
      address: "880 Weathersfield Way", city: "Schaumburg", zip: "60193", lat: 42.0298, lng: -88.0942,
      priority: "Medium", source: "web_form", opened_at: opened(9), value: 1750, est_rebate: 1300,
      created_at: opened(9),
    }),
    deal({
      id: "sd-owen", title: "6N250 Pine Ave", stage_slug: "assessment_scheduled", customer_id: "c-sales-owen",
      owner_id: "u-sales2", contact_name: "Owen Blake", contact_phone: "(847) 555-0194", contact_email: "owen.blake@example.com",
      address: "6N250 Pine Ave", city: "Itasca", zip: "60143", lat: 41.9712, lng: -88.0208,
      priority: "Medium", source: "manual", assessment_date: day(5),
      assessment_starts_at: `${day(5)}T10:00:00`, assessment_ends_at: `${day(5)}T12:00:00`,
      opened_at: opened(12), value: 1600, est_rebate: 1200, created_at: opened(12),
    }),
    deal({
      id: "sd-theo", title: "1182 Maple Lane", stage_slug: "potential_lead",
      owner_id: "u-sales", contact_name: "Theo Grant", contact_phone: "(847) 555-0120", contact_email: "theo.grant@example.com",
      address: "1182 Maple Lane", city: "Schaumburg", zip: "60193", lat: 42.0412, lng: -88.0711,
      priority: "Low", source: "web_form", opened_at: opened(4), value: 0, est_rebate: 0, created_at: opened(4),
    }),
    deal({
      id: "sd-kim", title: "55 N Plum Grove Rd", stage_slug: "project_completed",
      owner_id: "u-sales2", contact_name: "Kim Alvarez", contact_phone: "(847) 555-0177", contact_email: "kim.alvarez@example.com",
      address: "55 N Plum Grove Rd", city: "Palatine", zip: "60067", lat: 42.1111, lng: -88.0462,
      priority: "Medium", source: "monday", assessment_date: pastDay(40), scheduled_date: pastDay(20), close_date: pastDay(5),
      opened_at: opened(70), value: 2320, est_rebate: 1800, created_at: opened(70),
    }),
    deal({
      id: "sd-declined", title: "300 W Golf Rd", stage_slug: "declined",
      owner_id: "u-sales", contact_name: "Harriet Cole", contact_phone: "(847) 555-0108", contact_email: "harriet.cole@example.com",
      address: "300 W Golf Rd", city: "Schaumburg", zip: "60195", lat: 42.0499, lng: -88.076,
      priority: "Low", source: "email", opened_at: opened(28), close_date: pastDay(2), value: 0, est_rebate: 0, created_at: opened(28),
    }),
    deal({
      id: "sd-linda", title: "412 W Irving Park Rd", stage_slug: "contacted_comed", pipeline_slug: "multifamily_whe",
      customer_id: "c-sales-linda", owner_id: "u-sales", contact_name: "Linda Cho",
      contact_phone: "(630) 555-0172", contact_email: "linda.cho@example.com",
      address: "412 W Irving Park Rd", city: "Wood Dale", zip: "60191", lat: 41.9634, lng: -87.9789,
      priority: "High", source: "xagent", opened_at: opened(20), value: 8600, est_rebate: 6400, created_at: opened(20),
    }),
    deal({
      id: "sd-mf2", title: "1900 Oakwood Blvd", stage_slug: "assessment_scheduled", pipeline_slug: "multifamily_whe",
      owner_id: "u-sales2", contact_name: "Devon Price", contact_phone: "(847) 555-0211", contact_email: "devon.price@example.com",
      address: "1900 Oakwood Blvd", city: "Rolling Meadows", zip: "60008", lat: 42.079, lng: -88.0229,
      priority: "Medium", source: "manual", assessment_date: day(8), opened_at: opened(15), value: 5400, est_rebate: 4000, created_at: opened(15),
    }),
  ];

  const inbox: SalesInboxItem[] = [
    { id: "si-web", source: "web_form", name: "Chris Lang", phone: "(847) 555-0133", email: "chris.lang@example.com", address: "910 Cedar St", city: "Palatine", state: "IL", zip: "60067", pipeline_slug: "single_family_whe", message: "Saw the ComEd flyer. We'd like a Whole Home Electric assessment.", raw: null, status: "pending", accepted_deal_id: null, created_at: iso(0, 9) },
    { id: "si-mail", source: "email", name: "Avery Fox", phone: null, email: "avery.fox@example.com", address: "22 S Roselle Rd", city: "Schaumburg", state: "IL", zip: "60193", pipeline_slug: "single_family_whe", message: "Subject: Question about rebates\n\nCan you tell me if our 1970s ranch qualifies?", raw: null, status: "pending", accepted_deal_id: null, created_at: iso(1, 16) },
    { id: "si-agent", source: "xagent", name: "Samira Ali", phone: "(224) 555-0144", email: null, address: "7N120 Palatine Rd", city: "Barrington", state: "IL", zip: "60010", pipeline_slug: "single_family_whe", message: "Inbound call transcribed by xAgent: interested in a free assessment this month.", raw: { channel: "phone" }, status: "pending", accepted_deal_id: null, created_at: iso(0, 11) },
  ];

  const act = (row: Partial<SalesActivity> & { deal_id: string; kind: SalesActivity["kind"]; body: string }): SalesActivity => ({
    id: randomUUID(),
    inbox_id: null,
    direction: "internal",
    status: "logged",
    subject: null,
    to_address: null,
    from_address: null,
    author_id: "u-sales",
    meta: null,
    created_at: iso(2),
    sent_at: null,
    ...row,
  });

  const activities: SalesActivity[] = [
    act({ deal_id: "sd-elena", kind: "email", direction: "inbound", status: "received", subject: "Photos from the attic", body: "Hi Maya — attached are the panel and attic photos you asked for.", from_address: "elena.vasquez@example.com", to_address: "maya@retrofitrebates.com", author_id: null, created_at: iso(10, 14) }),
    act({ deal_id: "sd-elena", kind: "note", body: "RISE data entered. Rebate estimate $1,850. Sending the written proposal today.", created_at: iso(8, 11) }),
    act({ deal_id: "sd-elena", kind: "sms", direction: "outbound", status: "draft", body: "Elena, your Whole Home Electric proposal is ready. I'll send the signing link this afternoon.", to_address: "(847) 555-0142", created_at: iso(0, 13) }),
    act({ deal_id: "sd-elena", kind: "email", direction: "outbound", status: "draft", subject: "Your Retrofit Rebates proposal", body: "Hi Elena,\n\nThanks for walking through the assessment. The proposal and signing link are attached.\n\nMaya Chen\nRetrofit Rebates", to_address: "elena.vasquez@example.com", from_address: "maya@retrofitrebates.com", created_at: iso(0, 13) }),
    act({ deal_id: "sd-priya", kind: "automation", direction: "internal", status: "logged", body: "Stuck in Contacted ComEd Verification for more than 14 days.", created_at: iso(0, 8) }),
    act({ deal_id: "sd-owen", kind: "sms", direction: "outbound", status: "draft", body: `You're booked for a home assessment on ${deals.find((d) => d.id === "sd-owen")?.assessment_date} at 6N250 Pine Ave. Reply if you need to change it.`, to_address: "(847) 555-0194", author_id: null, created_at: iso(1, 9) }),
  ];

  const automations: SalesAutomation[] = DEFAULT_AUTOMATIONS.map((r, i) => ({ ...r, id: `auto-${i + 1}` }));

  const alerts: SalesAlert[] = [
    { id: "sa-priya", user_id: "u-sales", deal_id: "sd-priya", body: "Stuck in Contacted ComEd Verification for more than 14 days.", read_at: null, created_at: iso(0, 8) },
    { id: "sa-linda", user_id: "u-sales", deal_id: "sd-linda", body: "Stuck in Contacted ComEd Verification for more than 14 days.", read_at: null, created_at: iso(0, 8) },
  ];

  const proposals: SalesProposal[] = [
    {
      id: "sp-elena", deal_id: "sd-elena", title: "Whole Home Electric – 4821 Birchwood Ave", status: "sent",
      notes: "Panel work and weatherization as scoped on the assessment. Rebate estimate is not a guarantee of ComEd payment.",
      items: [
        { id: "spi-1", label: "Electrical assessment and panel work", amount: 2800, sort: 0 },
        { id: "spi-2", label: "Estimated ComEd rebate", amount: -1850, sort: 1 },
        { id: "spi-3", label: "Homeowner net", amount: 1500, sort: 2 },
      ],
      net: 1500, sent_at: iso(0, 14), signed_at: null, signer_name: null, signer_consent: false,
      signer_method: null, public_token: "demo-sign-elena", created_at: iso(1), updated_at: iso(0, 14),
    },
  ];

  return { deals, inbox, activities, automations, alerts, proposals };
}

let cache: SalesDB | null = null;

export function loadSales(): SalesDB {
  if (cache) return cache;
  if (existsSync(FILE)) {
    try {
      cache = JSON.parse(readFileSync(FILE, "utf8")) as SalesDB;
      return cache;
    } catch { /* fall through to seed */ }
  }
  cache = seed();
  saveSales(cache);
  return cache;
}

export function saveSales(db: SalesDB) {
  cache = db;
  try { writeFileSync(FILE, JSON.stringify(db, null, 2)); } catch { /* ephemeral fs */ }
}

export function mutateSales<T>(fn: (db: SalesDB) => T): T {
  const db = loadSales();
  const result = fn(db);
  saveSales(db);
  return result;
}

export function resetSalesStore() {
  cache = seed();
  saveSales(cache);
}

/** Used by mock-repo who() so sales can open converted projects and linked customers. */
export function convertedProjectIds(userId: string, seeAll: boolean): Set<string> {
  const ids = new Set<string>();
  for (const d of loadSales().deals) {
    if (!d.converted_project_id) continue;
    if (seeAll || !d.owner_id || d.owner_id === userId) ids.add(d.converted_project_id);
  }
  return ids;
}

export function visibleCustomerIds(userId: string, seeAll: boolean): Set<string> {
  const ids = new Set<string>();
  for (const d of loadSales().deals) {
    if (!d.customer_id) continue;
    if (seeAll || !d.owner_id || d.owner_id === userId) ids.add(d.customer_id);
  }
  return ids;
}

export function newId() { return randomUUID(); }
export { bookingToken };
