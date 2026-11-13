import type { Metadata } from "next";
import Link from "next/link";
import { Banner, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { QboMark } from "@/components/qbo/qbo-mark";
import { requireRole } from "@/lib/auth";
import { MOCK_MODE } from "@/lib/env";
import { redirect } from "next/navigation";
import {
  MOCK_QBO_COMPANY, MOCK_QBO_CONNECTED_BY, MOCK_QBO_ITEM, MOCK_QBO_TAX, MOCK_QBO_TERMS,
  formatQboSync, mockQboLastSyncIso,
} from "@/lib/qbo-mock";

export const metadata: Metadata = { title: "Integrations" };

export default async function IntegrationsPage({ searchParams }: PageProps<"/settings/integrations">) {
  const user = await requireRole("admin", "manager");
  if (!MOCK_MODE) redirect("/account");
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");
  const connected = str("qbo") === "1" || str("qbo") === "connected";
  const disconnecting = connected && str("disconnect") === "1";
  const admin = user.role === "admin";
  const ok = str("ok");
  const base = "/settings/integrations";
  const connectedHref = `${base}?qbo=1`;

  return (
    <>
      <PageHeader
        back={{ href: "/account", label: "Account" }}
        title="Settings"
        sub="Integrations · admins and managers. Field techs never see this screen."
      />
      <div className="mb-4 flex flex-col gap-2">
        <Banner tone="warn"><Icon name="alert" />DEV MOCK MODE — design only. This does not connect to Intuit or QuickBooks, and nothing is sent to a customer.</Banner>
        {ok && <Banner tone="ok"><Icon name="check" />{ok}</Banner>}
      </div>

      <h2 className="mb-3 text-sm font-bold tracking-wide text-muted uppercase">Integrations</h2>

      <div className="card" data-testid="qbo-settings-card">
        <div className="card-hd">
          <div className="flex min-w-0 items-center gap-3">
            <QboMark />
            <div className="min-w-0">
              <h3 className="font-semibold">QuickBooks Online</h3>
              <div className="text-[12.5px] text-muted">{connected ? MOCK_QBO_COMPANY : "Not connected"}</div>
            </div>
          </div>
          <span className={`pill ${connected ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"}`} data-testid="qbo-connection-pill">
            <span className="size-1.5 rounded-full bg-current" />
            {connected ? "Connected" : "Not connected"}
          </span>
        </div>

        {connected ? (
          <div className="flex flex-col gap-4 p-5">
            <div className="text-sm">
              <div className="font-semibold">{MOCK_QBO_COMPANY}</div>
              <div className="text-muted">Connected by {MOCK_QBO_CONNECTED_BY} · Last sync {formatQboSync(mockQboLastSyncIso())}</div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="label">Default income item
                <select className="input" defaultValue={MOCK_QBO_ITEM} aria-label="Default income item">
                  <option>Service call</option>
                  <option>Labor</option>
                  <option>Materials</option>
                </select>
              </label>
              <label className="label">Default terms
                <select className="input" defaultValue={MOCK_QBO_TERMS} aria-label="Default terms">
                  <option>Due on receipt</option>
                  <option>Net 15</option>
                  <option>Net 30</option>
                  <option>Net 60</option>
                </select>
              </label>
              <label className="label">Tax default
                <select className="input" defaultValue={MOCK_QBO_TAX} aria-label="Tax default">
                  <option>Non-taxable</option>
                  <option>Illinois sales tax (10.25%)</option>
                </select>
              </label>
            </div>
            <p className="text-[11.5px] text-muted">These defaults fill in on a new invoice from a service ticket. This mock does not save them to QuickBooks.</p>
            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
              {admin ? (
                <Link href={`${connectedHref}&disconnect=1`} scroll={false} className="btn btn-danger" data-testid="qbo-disconnect">Disconnect</Link>
              ) : (
                <p className="text-sm text-muted">Only an admin can disconnect QuickBooks.</p>
              )}
              <p className="text-[11.5px] text-muted sm:ml-auto">Managers can create invoices once connected. Field techs never see invoices or service prices.</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 p-5">
            <p className="text-sm">
              Connect once to create draft invoices from a service ticket without leaving RR Scheduler.
              Customers are matched to QuickBooks so nothing is duplicated. Invoices are saved as drafts —
              nothing is emailed to the customer. Only admins can connect or disconnect. Field techs never see this integration, invoices, or service prices.
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
              <li>You sign in to your QuickBooks Online company one time.</li>
              <li>The connection stays until an admin disconnects.</li>
              <li>This mock does not open Intuit, register an app, or use API keys.</li>
            </ul>
            {admin ? (
              <div>
                <Link href={connectedHref} className="btn btn-primary" data-testid="qbo-connect">Connect QuickBooks</Link>
              </div>
            ) : (
              <p className="text-sm text-muted">Only an admin can connect QuickBooks. Ask Luke if this company should be linked.</p>
            )}
          </div>
        )}
      </div>

      {disconnecting && (
        <Modal title="Disconnect QuickBooks?" sub="This stops new invoices until an admin connects again." closeHref={connectedHref}>
          <form action={connectedHref.replace("?qbo=1", "")} className="flex flex-col gap-4 p-5" data-testid="qbo-disconnect-confirm">
            <p className="text-sm">Disconnect <span className="font-semibold">{MOCK_QBO_COMPANY}</span> from RR Scheduler?</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
              <li>The portal will no longer create invoices from service tickets</li>
              <li>Existing invoices in QuickBooks are not deleted or voided</li>
              <li>Nothing is emailed to a customer</li>
              <li>This is a design mock — no real connection is changed</li>
            </ul>
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <Link href={connectedHref} scroll={false} className="btn">Cancel</Link>
              <Link href={`${base}?ok=${encodeURIComponent("QuickBooks was disconnected (mock).")}`} className="btn btn-danger" data-testid="qbo-disconnect-confirm-btn">Disconnect</Link>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
