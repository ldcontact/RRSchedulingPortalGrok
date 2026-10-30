import Link from "next/link";
import { Icon } from "@/components/icons";
import { Banner } from "@/components/ui";
import { isStaff, requireMember } from "@/lib/auth";
import { getRepo } from "@/lib/data/repo";

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const user = await requireMember();
  const { denied } = await searchParams;
  const h = new Date().getHours();
  const greet = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
  const deniedBanner = denied ? <div className="mb-4"><Banner tone="warn"><Icon name="shield" />That page isn&apos;t available for your role.</Banner></div> : null;

  if (!isStaff(user.role)) {
    return (
      <>
        {deniedBanner}
        <div className="mb-4 rounded-2xl bg-gradient-to-br from-brand-900 to-brand p-5 text-white">
          <div className="text-[19px] font-semibold">Good {greet}, {user.name.split(" ")[0]}</div>
          <div className="text-sm text-[#b5d7d1]">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
        </div>
        <div className="card p-6 text-center">
          <Icon name="wrench" className="mx-auto mb-2 size-8 text-brand" />
          <h2 className="font-semibold">Your assigned jobs will show up here</h2>
          <p className="mt-1 text-sm text-muted">Jobs, scope, before photos and the completion flow (photos + notes) arrive in phase 2. You&apos;ll only see jobs you&apos;re assigned to.</p>
        </div>
      </>
    );
  }

  const repo = await getRepo();
  const c = await repo.counts();
  const stat = (n: number | string, label: string, icon: string, href: string, tone: string) => (
    <Link href={href} className="card p-4 hover:border-[#bcc6bb]">
      <div className={`mb-2 grid size-8 place-items-center rounded-lg ${tone}`}><Icon name={icon} /></div>
      <div className="text-[26px] font-bold tracking-tight">{n}</div><div className="text-[12.5px] font-medium text-muted">{label}</div>
    </Link>
  );
  return (
    <>
      {deniedBanner}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-[22px] font-semibold tracking-tight">Good {greet}, {user.name.split(" ")[0]}</h1><div className="text-muted">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div></div>
        <div className="flex gap-2"><Link href="/customers/new" className="btn btn-primary"><Icon name="plus" />Add customer</Link>{user.role === "admin" && <Link href="/team#invite" className="btn"><Icon name="plus" />Invite member</Link>}</div>
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stat(c.customers, "Customers", "users", "/customers", "bg-brand-50 text-brand")}
        {stat(c.team, "Active team members", "hardhat", "/team", "bg-violet-100 text-violet-700")}
        {user.role === "admin" && stat(c.invited, "Invites pending", "send", "/team", "bg-accent-50 text-amber-700")}
        {stat("—", "Jobs today (phase 2)", "calendar", "/", "bg-sky-100 text-sky-700")}
      </div>
      <div className="card p-5">
        <h2 className="font-semibold">What&apos;s live in phase 1</h2>
        <ul className="mt-2 grid gap-1.5 text-sm text-muted sm:grid-cols-2">
          <li>✓ Google and email/password sign-in, invite-only</li><li>✓ Role-based access (Admin, Manager, Field Tech)</li>
          <li>✓ Customers: search, add, edit, contacts</li><li>✓ Team: invite by email, set roles (admin)</li>
          <li className="text-slate-400">○ Projects, before photos (phase 2)</li><li className="text-slate-400">○ Jobs, schedule, dispatch, completion flow (phase 2)</li>
        </ul>
      </div>
    </>
  );
}
