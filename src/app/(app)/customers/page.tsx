import type { Metadata } from "next";
import Link from "next/link";
import { PendingLink } from "@/components/pending-link";
import { Icon } from "@/components/icons";
import { Banner, PageHeader } from "@/components/ui";
import { Pager, pageParam } from "@/components/pager";
import { requireRole } from "@/lib/auth";
import { getRepo } from "@/lib/data/repo";
import { formatAddress } from "@/lib/project-row";
import { CUSTOMER_SEARCH_HINT } from "@/lib/search";
import { LIST_PAGE_SIZE, type CustomerSort } from "@/lib/types";

export const metadata: Metadata = { title: "Customers" };

const SORTS: Record<CustomerSort, string> = { newest: "Newest first", name: "Name A–Z", name_desc: "Name Z–A" };

export default async function CustomersPage({ searchParams }: PageProps<"/customers">) {
  await requireRole("admin", "manager");
  const sp = await searchParams;
  const query = typeof sp.q === "string" ? sp.q.trim() : "";
  const sort: CustomerSort = typeof sp.sort === "string" && sp.sort in SORTS ? (sp.sort as CustomerSort) : "newest";
  // One database page (range + exact count); search and sort run in Postgres across all customers.
  const { items: list, total, page, size } = await (await getRepo()).pageCustomers({ q: query, page: pageParam(sp.page), size: LIST_PAGE_SIZE, sort });
  const href = (p: number) => `/customers?${new URLSearchParams({ ...(query ? { q: query } : {}), ...(sort !== "newest" ? { sort } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;
  return (
    <>
      <PageHeader title="Customers" sub={query ? `${total.toLocaleString("en-US")} match “${query}”` : `${total.toLocaleString("en-US")} customers and leads`}
        actions={<PendingLink href="/customers/new" className="btn btn-primary"><Icon name="plus" />Add customer</PendingLink>} />
      {typeof sp.ok === "string" && sp.ok && <div className="mb-3"><Banner tone="ok"><Icon name="check" />{sp.ok}</Banner></div>}
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <div className="flex min-w-0 flex-1 basis-full items-center gap-2 rounded-lg border border-line bg-white px-3 sm:basis-auto sm:max-w-md">
          <Icon name="search" className="size-4 text-muted" />
          <input name="q" defaultValue={query} placeholder={CUSTOMER_SEARCH_HINT} className="w-full bg-transparent py-2 text-sm outline-none" type="search" aria-label="Search customers" />
        </div>
        <select name="sort" defaultValue={sort} className="input w-auto" aria-label="Sort customers">
          {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="btn">Search</button>
        {(query || sort !== "newest") && <Link href="/customers" className="btn">Clear</Link>}
      </form>
      <div className="card divide-y divide-line">
        {list.length === 0 && <div className="p-8 text-center text-muted">{query ? "No customers match your search." : "No customers yet. Add your first one."}</div>}
        {list.map((c) => {
          const address = formatAddress(c);
          return (
          <Link key={c.id} href={`/customers/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-[#fafbf9] sm:px-5">
            <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 font-bold text-brand">{c.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{c.name}</div>
              <div className="truncate text-[12.5px] text-muted">{[c.primary_contact, c.city].filter(Boolean).join(" · ") || "—"}</div>
              <div className="flex min-w-0 items-center gap-1 text-[12.5px] text-muted"><Icon name="pin" className="size-3.5 shrink-0" /><span className="truncate" title={address || undefined}>{address || "No address on file"}</span></div>
            </div>
            <div className="hidden w-32 text-[13px] md:block">{c.phone ?? "—"}</div>
            <div className="hidden w-44 flex-wrap gap-1 lg:flex">{c.tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>
            <Icon name="right" className="size-4 text-muted" />
          </Link>
          );
        })}
      </div>
      <Pager page={page} size={size} total={total} href={href} label="Customers" />
    </>
  );
}
