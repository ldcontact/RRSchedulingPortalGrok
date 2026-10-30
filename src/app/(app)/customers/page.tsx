import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { getRepo } from "@/lib/data/repo";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: PageProps<"/customers">) {
  await requireRole("admin", "manager");
  const { q } = await searchParams;
  const query = typeof q === "string" ? q : "";
  const repo = await getRepo();
  const [list, all] = await Promise.all([repo.listCustomers(query), query ? repo.counts() : null]);
  const total = all?.customers ?? list.length;
  return (
    <>
      <PageHeader title="Customers" sub={query ? `${list.length} of ${total} match “${query}”` : `${total} customers and leads`}
        actions={<Link href="/customers/new" className="btn btn-primary"><Icon name="plus" />Add customer</Link>} />
      <form className="mb-4 flex gap-2" role="search">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-line bg-white px-3 sm:max-w-md">
          <Icon name="search" className="size-4 text-muted" />
          <input name="q" defaultValue={query} placeholder="Search name, city, phone, email…" className="w-full bg-transparent py-2 text-sm outline-none" type="search" aria-label="Search customers" />
        </div>
        <button className="btn">Search</button>
        {query && <Link href="/customers" className="btn">Clear</Link>}
      </form>
      <div className="card divide-y divide-line">
        {list.length === 0 && <div className="p-8 text-center text-muted">{query ? "No customers match your search." : "No customers yet. Add your first one."}</div>}
        {list.map((c) => (
          <Link key={c.id} href={`/customers/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-[#fafbf9] sm:px-5">
            <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 font-bold text-brand">{c.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}</div>
            <div className="min-w-0 flex-1"><div className="truncate font-semibold">{c.name}</div><div className="truncate text-[12.5px] text-muted">{[c.primary_contact, c.city].filter(Boolean).join(" · ") || "—"}</div></div>
            <div className="hidden w-32 text-[13px] md:block">{c.phone ?? "—"}</div>
            <div className="hidden w-44 flex-wrap gap-1 lg:flex">{c.tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>
            <Icon name="right" className="size-4 text-muted" />
          </Link>
        ))}
      </div>
    </>
  );
}
