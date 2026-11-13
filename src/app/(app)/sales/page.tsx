import type { Metadata } from "next";
import { requireSales } from "@/lib/auth";
import { PIPELINE_DEFS } from "@/lib/sales/catalog";
import { dashboardStats } from "@/lib/sales/dashboard";
import { canDeleteSalesRecord } from "@/lib/sales/permissions";
import { getSalesRepo } from "@/lib/sales/repo";
import { SalesWorkspace, type SalesView } from "./sales-workspace";

export const metadata: Metadata = { title: "Sales" };

const VIEWS: SalesView[] = ["table", "kanban", "calendar", "aging", "map", "inbox", "dashboard"];

export default async function SalesPage({ searchParams }: PageProps<"/sales">) {
  const user = await requireSales();
  const sp = await searchParams;
  const view = (typeof sp.view === "string" && VIEWS.includes(sp.view as SalesView) ? sp.view : "table") as SalesView;
  const pipeline = typeof sp.pipeline === "string" && PIPELINE_DEFS.some((p) => p.slug === sp.pipeline) ? sp.pipeline : "single_family_whe";
  const q = typeof sp.q === "string" ? sp.q : "";
  const ownerFilter = typeof sp.owner === "string" ? sp.owner : "";
  const priorityFilter = typeof sp.priority === "string" ? sp.priority : "";
  const repo = await getSalesRepo();
  const [allDeals, inbox, alerts, directory] = await Promise.all([
    repo.listDeals({ q }),
    repo.listInbox(),
    repo.listAlerts(),
    repo.ownerDirectory(),
  ]);
  const owners = Object.fromEntries(Object.entries(directory).map(([id, o]) => [id, o.name]));
  const ownerColors = Object.fromEntries(Object.entries(directory).map(([id, o]) => [id, o.color]));
  const ownerAvatars = Object.fromEntries(Object.entries(directory).map(([id, o]) => [id, o.avatar_url]));
  const deals = allDeals.filter((d) => d.pipeline_slug === pipeline);
  const dashboard = dashboardStats(deals, owners, pipeline);
  return (
    <SalesWorkspace
      view={view}
      pipeline={pipeline}
      deals={deals}
      allDeals={allDeals}
      inbox={inbox}
      alerts={alerts}
      owners={owners}
      ownerColors={ownerColors}
      ownerAvatars={ownerAvatars}
      dashboard={dashboard}
      canDelete={canDeleteSalesRecord(user)}
      query={q}
      ownerFilter={ownerFilter}
      priorityFilter={priorityFilter}
    />
  );
}
