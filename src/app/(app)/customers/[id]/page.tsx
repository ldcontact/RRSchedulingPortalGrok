import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icons";
import { Banner, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { requireRole } from "@/lib/auth";
import { customerDeleteBlockers, hasDeleteAccess } from "@/lib/delete-access";
import { DeleteConfirmDialog } from "@/components/delete-confirm";
import { deleteCustomerAction } from "@/app/(app)/delete-actions";
import { getRepo } from "@/lib/data/repo";
import { addContact, deleteContact } from "../actions";
import { MessageLog } from "@/components/messages";
import { ProjectStatusPill } from "@/components/status";
import { fmtWhen, money } from "@/lib/time";

export async function generateMetadata({ params }: PageProps<"/customers/[id]">): Promise<Metadata> {
  const c = await (await getRepo()).getCustomer((await params).id).catch(() => null);
  return { title: c?.name ?? "Customer" };
}

const tel = (p: string) => `tel:${p.replace(/[^\d+]/g, "")}`;

export default async function CustomerPage({ params, searchParams }: PageProps<"/customers/[id]">) {
  const user = await requireRole("admin", "manager");
  const canDelete = hasDeleteAccess(user);
  const { id } = await params;
  const sp = await searchParams;
  const saved = sp.saved;
  const error = typeof sp.error === "string" ? sp.error : null;
  const repo = await getRepo();
  const [c, contacts, projects, messages, dependents] = await Promise.all([
    repo.getCustomer(id), repo.listContacts(id), repo.listProjects({ customerId: id }), repo.listMessages({ customerId: id }),
    canDelete ? repo.countCustomerDependents(id) : Promise.resolve({ projects: 0, serviceRequests: 0 }),
  ]);
  if (!c) notFound();
  const primary = contacts.find((x) => x.is_primary) ?? contacts[0];
  const addr = [c.address, [c.city, c.state].filter(Boolean).join(", "), c.zip].filter(Boolean).join(" ");
  return (
    <>
      <PageHeader back={{ href: "/customers", label: "Customers" }} title={c.name}
        sub={<>{primary ? `${primary.name}${primary.title ? `, ${primary.title}` : ""}` : "No contact yet"} · since {new Date(c.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</>}
        actions={<>
          {c.phone && <a href={tel(c.phone)} className="btn"><Icon name="phone" />Call</a>}
          {c.phone && <a href={`sms:${c.phone.replace(/[^\d+]/g, "")}`} className="btn"><Icon name="text" />Text</a>}
          {c.email && <a href={`mailto:${c.email}`} className="btn"><Icon name="mail" />Email</a>}
          <Link href={`/customers/${c.id}/edit`} className="btn"><Icon name="edit" />Edit</Link>
          {canDelete && <Link href={`/customers/${c.id}?delete=1`} scroll={false} className="btn btn-danger" data-testid="delete-button"><Icon name="trash" />Delete</Link>}
        </>} />
      {(saved || error) && <div className="mb-4">{saved && <Banner tone="ok"><Icon name="check" />Customer saved.</Banner>}{error && <Banner tone="error"><Icon name="alert" />{error}</Banner>}</div>}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <div className="card">
            <div className="card-hd"><h3 className="font-semibold">Details</h3>{c.tags.length > 0 && <div className="flex flex-wrap gap-1">{c.tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>}</div>
            <dl className="grid gap-x-6 gap-y-3 p-5 text-sm sm:grid-cols-2">
              <div className="flex gap-2"><Icon name="phone" className="mt-0.5 size-4 text-muted" /><div><dt className="text-xs text-muted">Phone</dt><dd>{c.phone ?? "—"}</dd></div></div>
              <div className="flex gap-2"><Icon name="mail" className="mt-0.5 size-4 text-muted" /><div className="min-w-0"><dt className="text-xs text-muted">Email</dt><dd className="truncate">{c.email ?? "—"}</dd></div></div>
              <div className="flex gap-2"><Icon name="pin" className="mt-0.5 size-4 text-muted" /><div><dt className="text-xs text-muted">Address</dt><dd>{addr || "—"}</dd>{addr && <a className="text-xs font-semibold text-brand" target="_blank" rel="noopener" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`}>Open in Maps</a>}</div></div>
              <div className="flex gap-2"><Icon name="note" className="mt-0.5 size-4 text-muted" /><div><dt className="text-xs text-muted">Notes</dt><dd className="whitespace-pre-wrap">{c.notes ?? "—"}</dd></div></div>
            </dl>
          </div>
          <div className="card">
            <div className="card-hd"><h3 className="font-semibold">Projects</h3><Link href={`/projects/new?customer=${c.id}`} className="btn btn-sm"><Icon name="plus" />New project</Link></div>
            <div className="divide-y divide-line">
              {projects.length === 0 && <div className="p-6 text-center text-sm text-muted">No projects yet.</div>}
              {projects.map((p) => (
                <Link key={p.id} href={`/projects/${p.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-[#fafbf9]">
                  <div className="min-w-0 flex-1"><div className="truncate font-semibold">{p.name}</div><div className="text-[12.5px] text-muted">{money(p.value)} · {money(p.est_rebate)} rebate · {p.next_visit ? `next visit ${fmtWhen(p.next_visit)}` : "no visit scheduled"}</div></div>
                  <ProjectStatusPill status={p.status} />
                </Link>
              ))}
            </div>
          </div>
          <MessageLog messages={messages} customerId={c.id} />
        </div>
        <div className="card">
          <div className="card-hd"><h3 className="font-semibold">Contacts</h3><span className="text-xs text-muted">{contacts.length}</span></div>
          <div className="divide-y divide-line">
            {contacts.map((k) => (
              <div key={k.id} className="flex items-start gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-semibold">{k.name}{k.is_primary && <span className="pill bg-brand-50 text-brand">Primary</span>}</div>
                  <div className="text-xs text-muted">{k.title ?? ""}</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-xs">{k.phone && <a className="font-semibold text-brand" href={tel(k.phone)}>{k.phone}</a>}{k.email && <a className="font-semibold text-brand" href={`mailto:${k.email}`}>{k.email}</a>}</div>
                </div>
                <form action={deleteContact.bind(null, c.id, k.id)}><button className="btn btn-sm btn-danger" aria-label={`Remove ${k.name}`}><Icon name="trash" className="size-4" /></button></form>
              </div>
            ))}
            {contacts.length === 0 && <div className="px-5 py-4 text-sm text-muted">No contacts yet.</div>}
          </div>
          <form action={addContact.bind(null, c.id)} className="grid gap-2 border-t border-line p-5">
            <div className="text-sm font-semibold">Add contact</div>
            <input className="input" name="name" placeholder="Name" required />
            <div className="grid grid-cols-2 gap-2"><input className="input" name="title" placeholder="Title" /><input className="input" name="phone" placeholder="Phone" type="tel" /></div>
            <input className="input" name="email" placeholder="Email" type="email" />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_primary" className="accent-brand" />Primary contact</label>
            <SubmitButton className="btn btn-sm" pendingText="Adding…"><Icon name="plus" className="size-4" />Add contact</SubmitButton>
          </form>
        </div>
      </div>
      {canDelete && sp.delete === "1" && (
        <DeleteConfirmDialog
          title="Delete customer"
          itemName={c.name}
          cancelHref={`/customers/${c.id}`}
          action={deleteCustomerAction.bind(null, c.id)}
          blocked={customerDeleteBlockers(dependents)}
          consequences={[
            "Contacts and notes for this customer",
            "Messages to and from this customer",
          ]}
          confirmLabel="Delete customer"
        />
      )}
    </>
  );
}
