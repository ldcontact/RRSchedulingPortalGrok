import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requireSales } from "@/lib/auth";
import { getSalesRepo } from "@/lib/sales/repo";
import { toggleAutomationAction } from "../actions";

export const metadata: Metadata = { title: "Sales automations" };

export default async function AutomationsPage() {
  await requireSales();
  const rules = await (await getSalesRepo()).listAutomations();
  return (
    <>
      <PageHeader back={{ href: "/sales", label: "Sales" }} title="Stage automations" sub="Rules run when a deal changes stage or sits too long. Customer texts and emails are queued as drafts — they are not sent until a rep sends them, unless Luke later turns on auto-send." />
      <div className="flex flex-col gap-3">
        {rules.map((r) => (
          <div key={r.id} className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-semibold">{r.name}</div>
                <div className="mt-1 text-sm text-muted">
                  {r.trigger === "stage_entered" ? `When a deal enters ${r.stage_slug ?? "a stage"}` : `When a deal is stuck more than ${r.stuck_after_days ?? 14} days`}
                  {r.pipeline_slug ? ` · ${r.pipeline_slug}` : " · all pipelines"}
                </div>
                <ul className="mt-2 list-disc pl-5 text-sm text-muted">
                  {r.actions.map((a, i) => <li key={i}>{a.type.replaceAll("_", " ")}</li>)}
                </ul>
                <div className="mt-2 text-xs text-amber-800">auto_send_customer is {r.auto_send_customer ? "on for this rule, but the global allowAutoSend flag is still off" : "off"}.</div>
              </div>
              <form action={toggleAutomationAction.bind(null, r.id, !r.enabled)}>
                <button className="btn">{r.enabled ? "Turn off" : "Turn on"}</button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
