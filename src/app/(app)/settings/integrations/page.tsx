import type { Metadata } from "next";
import Link from "next/link";
import { Banner, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { SubmitButton } from "@/components/submit-button";
import { QboMark } from "@/components/qbo/qbo-mark";
import { requireRole } from "@/lib/auth";
import { fmtDateTime } from "@/lib/time";
import type { QboPick, QboTaxOption, QboTerm } from "@/lib/qbo/api";
import { qboSetupIssues } from "@/lib/qbo/config";
import { QboError } from "@/lib/qbo/errors";
import { canManageQboConnection } from "@/lib/qbo/permissions";
import { getQboApi, getQboState } from "@/lib/qbo/service";
import { disconnectQboAction, saveQboDefaultsAction } from "./actions";

export const metadata: Metadata = { title: "Integrations" };

export default async function IntegrationsPage({ searchParams }: PageProps<"/settings/integrations">) {
  const user = await requireRole("admin", "manager");
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");
  const admin = canManageQboConnection(user.role);
  const ok = str("ok"), error = str("error");
  const base = "/settings/integrations";
  let loadError = "";
  const state = await getQboState();
  if (state.kind === "error") loadError = state.message;
  const connected = state.kind === "connected";
  const disconnecting = connected && admin && str("disconnect") === "1";
  let items: QboPick[] = [], terms: QboTerm[] = [], taxes: QboTaxOption[] = [];
  if (connected) {
    try {
      const c = await getQboApi();
      if (c) [items, terms, taxes] = await Promise.all([c.api.listItems(), c.api.listTerms(), c.api.listTaxOptions()]);
    } catch (e) {
      loadError = e instanceof QboError ? e.message : "Couldn't load lists from QuickBooks.";
    }
  }
  const conn = state.kind === "connected" ? state.connection : null;
  const serviceCall = items.find((i) => i.name.toLowerCase() === "service call");
  const sandbox = state.kind !== "not_configured" && state.config.environment === "sandbox";
  const fake = state.kind !== "not_configured" && state.config.fake;
  const pill = connected ? { tone: "bg-green-100 text-green-800", label: "Connected" }
    : state.kind === "disconnected" ? { tone: "bg-slate-100 text-slate-600", label: "Not connected" }
    : state.kind === "error" ? { tone: "bg-red-100 text-red-800", label: "Can't load" }
    : { tone: "bg-accent-50 text-[#78350f]", label: "Not configured" };
  const setupIssues = state.kind === "not_configured" ? qboSetupIssues() : state.kind === "error" ? [state.message] : [];

  return (
    <>
      <PageHeader
        back={{ href: "/account", label: "Account" }}
        title="Settings"
        sub="Integrations · admins and managers. Field techs never see this screen."
      />
      <div className="mb-4 flex flex-col gap-2 empty:hidden">
        {fake && <Banner tone="warn"><Icon name="alert" />DEV MOCK MODE — using a local fake QuickBooks sandbox. Nothing is sent to Intuit or to a customer.</Banner>}
        {ok && <Banner tone="ok"><Icon name="check" />{ok}</Banner>}
        {error && <Banner tone="error"><Icon name="alert" />{error}</Banner>}
        {loadError && <Banner tone="error"><Icon name="alert" />{loadError}</Banner>}
      </div>

      <h2 className="mb-3 text-sm font-bold tracking-wide text-muted uppercase">Integrations</h2>

      <div className="card" data-testid="qbo-settings-card">
        <div className="card-hd">
          <div className="flex min-w-0 items-center gap-3">
            <QboMark />
            <div className="min-w-0">
              <h3 className="font-semibold">QuickBooks Online{sandbox ? <span className="ml-2 pill bg-sky-100 text-sky-800 align-middle">Sandbox</span> : null}</h3>
              <div className="text-[12.5px] text-muted">{conn ? conn.company_name : pill.label}</div>
            </div>
          </div>
          <span className={`pill ${pill.tone}`} data-testid="qbo-connection-pill">
            <span className="size-1.5 rounded-full bg-current" />
            {pill.label}
          </span>
        </div>

        {conn ? (
          <form action={saveQboDefaultsAction} className="flex flex-col gap-4 p-5">
            <div className="text-sm">
              <div className="font-semibold">{conn.company_name}</div>
              <div className="text-muted">Connected by {conn.connected_by_name ?? "an admin"} · Last sync {fmtDateTime(conn.last_sync_at ?? conn.connected_at)} CT</div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="label">Default income item
                <select className="input" name="item" defaultValue={conn.default_item_id ?? serviceCall?.id ?? "__create__"} aria-label="Default income item">
                  {!serviceCall && <option value="__create__">Create “Service call” item</option>}
                  {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </label>
              <label className="label">Default terms
                <select className="input" name="term" defaultValue={conn.default_term_id ?? ""} aria-label="Default terms">
                  <option value="">None</option>
                  {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
              <label className="label">Tax default
                <select className="input" name="tax" defaultValue={conn.default_tax_code_id ?? "NON"} aria-label="Tax default">
                  {taxes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SubmitButton className="btn btn-primary" pendingText="Saving…">Save defaults</SubmitButton>
              <p className="text-[11.5px] text-muted">These defaults fill in on a new invoice from a service ticket.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
              {admin ? (
                <Link href={`${base}?disconnect=1`} scroll={false} className="btn btn-danger" data-testid="qbo-disconnect">Disconnect</Link>
              ) : (
                <p className="text-sm text-muted">Only an admin can disconnect QuickBooks.</p>
              )}
              <p className="text-[11.5px] text-muted sm:ml-auto">Managers can create invoices once connected. Field techs never see invoices or service prices.</p>
            </div>
          </form>
        ) : state.kind === "error" ? (
          <div className="flex flex-col gap-3 p-5" data-testid="qbo-load-error">
            <p className="text-sm">The QuickBooks keys are present, but RR Scheduler couldn&apos;t read the connection. Invoicing stays off until this is fixed.</p>
            {admin && (
              <>
                <p className="text-sm text-muted">What&apos;s wrong:</p>
                <ul className="list-disc space-y-1 pl-5 font-mono text-[12.5px] text-muted">
                  {setupIssues.map((k) => <li key={k}>{k}</li>)}
                </ul>
                <p className="text-[11.5px] text-muted">Step-by-step guide: docs/quickbooks-setup.md in the repository.</p>
              </>
            )}
          </div>
        ) : state.kind === "disconnected" ? (
          <div className="flex flex-col gap-4 p-5">
            <p className="text-sm">
              Connect once to create draft invoices from a service ticket without leaving RR Scheduler.
              Customers are matched to QuickBooks so nothing is duplicated. Invoices are saved as drafts —
              nothing is emailed to the customer. Only admins can connect or disconnect. Field techs never see this integration, invoices, or service prices.
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
              <li>You sign in to your QuickBooks Online company one time{sandbox ? " (sandbox test company for now)" : ""}.</li>
              <li>The connection stays until an admin disconnects.</li>
              <li>The QuickBooks sign-in is stored encrypted on the server and never shown in the browser.</li>
            </ul>
            {admin ? (
              <div>
                {/* Plain link: /api/qbo/connect sets a CSRF state cookie and redirects to Intuit. */}
                <a href="/api/qbo/connect" className="btn btn-primary" data-testid="qbo-connect">Connect QuickBooks</a>
              </div>
            ) : (
              <p className="text-sm text-muted">Only an admin can connect QuickBooks. Ask Luke if this company should be linked.</p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3 p-5" data-testid="qbo-not-configured">
            <p className="text-sm">QuickBooks isn&apos;t set up on the server yet, so invoicing is turned off. Nothing is connected and no invoices can be created.</p>
            {admin && (
              <>
                <p className="text-sm text-muted">An admin adds the Intuit app keys in Vercel (Production environment), then redeploys. What&apos;s wrong:</p>
                {setupIssues.length > 0 && (
                  <ul className="list-disc space-y-1 pl-5 font-mono text-[12.5px] text-muted">
                    {setupIssues.map((k) => <li key={k}>{k}</li>)}
                  </ul>
                )}
                <p className="text-[11.5px] text-muted">Step-by-step guide: docs/quickbooks-setup.md in the repository.</p>
              </>
            )}
          </div>
        )}
      </div>

      {disconnecting && conn && (
        <Modal title="Disconnect QuickBooks?" sub="This stops new invoices until an admin connects again." closeHref={base}>
          <form action={disconnectQboAction} className="flex flex-col gap-4 p-5" data-testid="qbo-disconnect-confirm">
            <input type="hidden" name="confirm" value="1" />
            <p className="text-sm">Disconnect <span className="font-semibold">{conn.company_name}</span> from RR Scheduler?</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
              <li>The portal will no longer create invoices from service tickets</li>
              <li>The QuickBooks sign-in is revoked and deleted from RR Scheduler</li>
              <li>Existing invoices in QuickBooks are not deleted or voided</li>
              <li>Nothing is emailed to a customer</li>
            </ul>
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <Link href={base} scroll={false} className="btn">Cancel</Link>
              <SubmitButton className="btn btn-danger" pendingText="Disconnecting…" data-testid="qbo-disconnect-confirm-btn">Disconnect</SubmitButton>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
