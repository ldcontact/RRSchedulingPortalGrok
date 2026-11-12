import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
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
  const repo = await getSalesRepo();
  const [deals, inbox, alerts, owners] = await Promise.all([
    repo.listDeals({ pipeline, q }),
    repo.listInbox(),
    repo.listAlerts(),
    repo.ownerNames(),
  ]);
  const allForDash = await repo.listDeals({ pipeline });
  const dashboard = dashboardStats(allForDash, owners, pipeline);
  const pipeName = PIPELINE_DEFS.find((p) => p.slug === pipeline)?.name ?? "Sales";
  return (
    <>
      <PageHeader
        title="Sales"
        sub={`${deals.length} deal${deals.length === 1 ? "" : "s"} in ${pipeName}. Outgoing customer messages stay as drafts until a rep sends them.`}
      />
      <SalesWorkspace
        view={view}
        pipeline={pipeline}
        deals={deals}
        inbox={inbox}
        alerts={alerts}
        owners={owners}
        dashboard={dashboard}
        canDelete={canDeleteSalesRecord(user)}
        query={q}
      />
    </>
  );
}
