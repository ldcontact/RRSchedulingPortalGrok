"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { formatServicePrice as money } from "@/lib/service-request-price";
import { addDays, fmtDay, todayKey } from "@/lib/time";
import type { QboCustomer, QboPick, QboTaxOption, QboTerm } from "@/lib/qbo/api";
import { estimateTotals } from "@/lib/qbo/invoice";
import { createInvoiceAction, createQboCustomerAction, searchQboCustomersAction } from "@/app/(app)/service-requests/invoice-actions";

type Line = { id: string; itemId: string; description: string; qty: string; rate: string };

type Step = "compose" | "confirm" | "match";

function num(v: string) {
  const n = Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function CreateInvoiceDialog({
  requestId,
  base,
  ticketNo,
  customerName,
  issueSummary,
  issueDescription,
  servicePrice,
  items,
  terms,
  taxOptions,
  defaults,
  initialMatch,
  sandbox,
}: {
  requestId: string;
  base: string;
  ticketNo: string;
  customerName: string;
  issueSummary: string;
  issueDescription: string;
  servicePrice: number | null;
  items: QboPick[];
  terms: QboTerm[];
  taxOptions: QboTaxOption[];
  defaults: { itemId: string | null; termId: string | null; taxId: string | null };
  initialMatch: QboCustomer | null;
  sandbox: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [step, setStep] = useState<Step>("compose");
  const [match, setMatch] = useState<QboCustomer | null>(initialMatch);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ q: string; list: QboCustomer[] } | null>(null);
  const defaultItemId = (defaults.itemId && items.some((i) => i.id === defaults.itemId) ? defaults.itemId : items.find((i) => i.name.toLowerCase() === "service call")?.id) ?? items[0]?.id ?? "";
  const defaultTerm = terms.find((t) => t.id === defaults.termId) ?? terms.find((t) => t.name === "Net 30") ?? null;
  const [date, setDate] = useState(todayKey());
  const [termId, setTermId] = useState(defaultTerm?.id ?? "");
  const [due, setDue] = useState(addDays(todayKey(), defaultTerm?.dueDays ?? 30));
  const [taxId, setTaxId] = useState(taxOptions.some((t) => t.id === defaults.taxId) ? defaults.taxId! : taxOptions[0]?.id ?? "NON");
  const [memo, setMemo] = useState(issueDescription);
  const [warrantyNote, setWarrantyNote] = useState("");
  const [lines, setLines] = useState<Line[]>([{
    id: "line-1",
    itemId: defaultItemId,
    description: issueSummary,
    qty: "1",
    rate: servicePrice != null ? servicePrice.toFixed(2) : "",
  }]);

  // Debounced live search of QuickBooks customers (server action; admin/manager checked on the server).
  useEffect(() => {
    if (step !== "match") return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const r = await searchQboCustomersAction(query);
      if (cancelled) return;
      if ("error" in r) { setError(r.error); setFound({ q: query, list: [] }); } else { setError(""); setFound({ q: query, list: r.customers }); }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, step]);

  const results = found?.list ?? null;
  const searching = found?.q !== query;
  const tax = taxOptions.find((t) => t.id === taxId) ?? null;
  const parsed = lines.map((l) => ({ qty: num(l.qty), rate: num(l.rate) }));
  const { subtotal, tax: taxAmount, total } = estimateTotals(parsed, tax?.rate ?? 0);
  const taxByQbo = tax?.rate == null;

  const close = () => router.push(base, { scroll: false });
  const itemOptions = items.length
    ? items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)
    : <option value="">No items in QuickBooks</option>;

  const setLine = (id: string, patch: Partial<Line>) =>
    setLines((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const termName = terms.find((t) => t.id === termId)?.name ?? "None";

  const submit = () => start(async () => {
    setError("");
    const r = await createInvoiceAction(requestId, {
      customerId: match?.id ?? "", txnDate: date, dueDate: due, termId, taxCodeId: taxId,
      lines: lines.map((l) => ({ itemId: l.itemId, itemName: items.find((i) => i.id === l.itemId)?.name ?? "", description: l.description, qty: l.qty, rate: l.rate })),
      customerMemo: memo, warrantyNote,
    });
    if ("error" in r) { setError(r.error); setStep("compose"); return; }
    router.push(`${base}?ok=${encodeURIComponent(r.ok)}`, { scroll: false });
    router.refresh();
  });

  const createCustomer = () => start(async () => {
    setError("");
    const r = await createQboCustomerAction(requestId);
    if ("error" in r) { setError(r.error); return; }
    setMatch(r.customer);
    setStep("compose");
  });

  const title = step === "match" ? "Match QuickBooks customer" : step === "confirm" ? "Create this draft?" : "Create invoice";
  const sub = step === "match"
    ? "Search QuickBooks customers, or create a new one. Nothing is duplicated."
    : `${ticketNo} · ${customerName}${sandbox ? " · QuickBooks sandbox" : ""}`;

  return (
    <Modal title={title} sub={sub} onClose={close} wide>
      {error && <div className="mx-5 mt-4 flex items-start gap-2 rounded-lg bg-red-50 px-3.5 py-3 text-[13.5px] text-red-800" role="alert" data-testid="invoice-error"><Icon name="alert" />{error}</div>}
      {step === "match" ? (
        <div className="flex flex-col gap-4 p-5" data-testid="customer-match">
          <div className="flex items-center gap-2 rounded-lg border border-line bg-white px-3">
            <Icon name="search" className="size-4 text-muted" />
            <input
              className="w-full bg-transparent py-2 text-sm outline-none"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search QuickBooks customers by name or email…"
              aria-label="Search QuickBooks customers"
              data-testid="qbo-customer-search"
              autoFocus
            />
          </div>
          <div className="divide-y divide-line rounded-lg border border-line" data-testid="qbo-customer-results">
            {results === null || (searching && !results.length) ? <div className="p-4 text-sm text-muted">Searching QuickBooks…</div>
              : results.length === 0 ? <div className="p-4 text-sm text-muted">No QuickBooks customers match “{query}”.</div>
              : results.map((c) => (
              <button
                key={c.id}
                type="button"
                className="flex w-full flex-col items-start gap-0.5 px-4 py-3 text-left hover:bg-[#fafbf9]"
                onClick={() => { setMatch(c); setStep("compose"); }}
              >
                <div className="font-semibold">{c.name}</div>
                {c.email && <div className="text-[12.5px] text-muted">{c.email}</div>}
                {c.address && <div className="text-[12.5px] text-muted">{c.address}</div>}
              </button>
            ))}
          </div>
          <button type="button" className="btn" data-testid="create-qbo-customer" disabled={pending} onClick={createCustomer}>
            <Icon name="plus" />{pending ? "Creating…" : `Create “${customerName}” in QuickBooks`}
          </button>
          <p className="text-[11.5px] text-muted">If QuickBooks already has a customer with this exact name, it is linked instead of duplicated.</p>
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <button type="button" className="btn" onClick={() => setStep("compose")}>Back</button>
          </div>
        </div>
      ) : step === "confirm" ? (
        <div className="flex flex-col gap-4 p-5" data-testid="create-invoice-confirm">
          <p className="text-sm">
            Create a draft invoice for{" "}
            <span className="font-semibold">{match?.name ?? customerName}</span> at{" "}
            <span className="font-semibold">{taxByQbo ? `${money(subtotal)} + tax` : money(total)}</span>?
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            <li>Terms {termName} · due {fmtDay(due, { month: "short", day: "numeric", year: "numeric" })}</li>
            <li>Creates a draft in QuickBooks{sandbox ? " (sandbox company)" : ""}. Nothing is emailed to the customer.</li>
            <li>QuickBooks assigns the invoice number and calculates the final tax.</li>
            <li>Field techs never see this invoice or the service price.</li>
          </ul>
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <button type="button" className="btn" onClick={() => setStep("compose")} disabled={pending}>Back</button>
            <button type="button" className="btn btn-primary" data-testid="confirm-create-invoice" disabled={pending} onClick={submit}>
              {pending ? "Creating…" : "Confirm and create draft"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-5 p-5" data-testid="create-invoice-dialog">
          <div>
            <div className="mb-1.5 text-[12.5px] font-semibold text-[#3d4744]">QuickBooks customer</div>
            {match ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-[#fafbf9] px-3 py-2" data-testid="qbo-customer-matched">
                <span className="pill bg-green-100 text-green-800"><Icon name="check" className="size-3" />Matched</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{match.name}</div>
                  <div className="truncate text-[12.5px] text-muted">{[match.email, match.address].filter(Boolean).join(" · ") || "QuickBooks customer"}</div>
                </div>
                <button type="button" className="btn btn-sm" onClick={() => { setQuery(match.name); setStep("match"); }}>Change</button>
              </div>
            ) : (
              <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-accent-50 px-3 py-3" data-testid="qbo-customer-unmatched">
                <div className="font-semibold text-[#78350f]">No match — pick or create</div>
                <p className="text-[12.5px] text-[#78350f]">“{customerName}” is not linked to a QuickBooks customer yet.</p>
                <button type="button" className="btn btn-sm self-start" onClick={() => { setQuery(customerName); setStep("match"); }}>
                  <Icon name="search" className="size-4" />Search QuickBooks customers
                </button>
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="label">Invoice date
              <input className="input" type="date" value={date} onChange={(e) => {
                setDate(e.target.value);
                const d = terms.find((t) => t.id === termId)?.dueDays;
                if (d != null && e.target.value) setDue(addDays(e.target.value, d));
              }} />
            </label>
            <label className="label">Due date
              <input className="input" type="date" value={due} onChange={(e) => { setDue(e.target.value); }} />
            </label>
            <label className="label">Terms
              <select className="input" value={termId} onChange={(e) => {
                setTermId(e.target.value);
                const d = terms.find((t) => t.id === e.target.value)?.dueDays;
                if (d != null) setDue(addDays(date || todayKey(), d));
              }}>
                <option value="">None</option>
                {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
          </div>

          <div>
            <div className="mb-1.5 text-[12.5px] font-semibold text-[#3d4744]">Line items</div>
            <div className="flex flex-col gap-3 sm:hidden">
              {lines.map((l, i) => (
                <div key={l.id} className="flex flex-col gap-2 rounded-lg border border-line p-3">
                  <div className="flex items-center justify-between text-[11.5px] font-semibold text-muted">
                    <span>Line {i + 1}</span>
                    {lines.length > 1 && (
                      <button type="button" className="text-red-700" aria-label="Remove line" onClick={() => setLines((rows) => rows.filter((r) => r.id !== l.id))}>Remove</button>
                    )}
                  </div>
                  <label className="label">Item
                    <select className="input" value={l.itemId} onChange={(e) => setLine(l.id, { itemId: e.target.value })} aria-label="Item">{itemOptions}</select>
                  </label>
                  <label className="label">Description
                    <input className="input" value={l.description} onChange={(e) => setLine(l.id, { description: e.target.value })} aria-label="Description" />
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <label className="label">Qty
                      <input className="input text-right tabular-nums" value={l.qty} onChange={(e) => setLine(l.id, { qty: e.target.value })} aria-label="Qty" />
                    </label>
                    <label className="label">Rate
                      <input className="input text-right tabular-nums" value={l.rate} onChange={(e) => setLine(l.id, { rate: e.target.value })} aria-label="Rate" />
                    </label>
                    <div className="label">Amount
                      <div className="input border-transparent bg-[#fafbf9] text-right font-semibold tabular-nums">{money(num(l.qty) * num(l.rate))}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden overflow-x-auto rounded-lg border border-line sm:block">
              <table className="w-full table-fixed text-left text-[13px]">
                <colgroup>
                  <col className="w-[22%]" />
                  <col className="w-[40%]" />
                  <col className="w-[10%]" />
                  <col className="w-[14%]" />
                  <col className="w-[14%]" />
                </colgroup>
                <thead className="bg-[#fafbf9] text-[11.5px] font-semibold text-muted">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Item</th>
                    <th className="px-3 py-2 font-semibold">Description</th>
                    <th className="px-3 py-2 text-right font-semibold">Qty</th>
                    <th className="px-3 py-2 text-right font-semibold">Rate</th>
                    <th className="px-3 py-2 text-right font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.id} className="border-t border-line">
                      <td className="px-2 py-1.5"><select className="input min-w-0" value={l.itemId} onChange={(e) => setLine(l.id, { itemId: e.target.value })} aria-label="Item">{itemOptions}</select></td>
                      <td className="px-2 py-1.5"><input className="input min-w-0" value={l.description} onChange={(e) => setLine(l.id, { description: e.target.value })} aria-label="Description" /></td>
                      <td className="px-2 py-1.5"><input className="input min-w-0 text-right tabular-nums" value={l.qty} onChange={(e) => setLine(l.id, { qty: e.target.value })} aria-label="Qty" /></td>
                      <td className="px-2 py-1.5"><input className="input min-w-0 text-right tabular-nums" value={l.rate} onChange={(e) => setLine(l.id, { rate: e.target.value })} aria-label="Rate" /></td>
                      <td className="px-3 py-1.5 text-right font-semibold tabular-nums">
                        <span className="align-middle">{money(num(l.qty) * num(l.rate))}</span>
                        {lines.length > 1 && (
                          <button type="button" className="ml-1 inline-grid size-7 place-items-center rounded-lg text-muted hover:bg-red-50 hover:text-red-700" aria-label="Remove line" onClick={() => setLines((rows) => rows.filter((r) => r.id !== l.id))}>
                            <Icon name="x" className="size-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              className="btn btn-sm mt-2"
              onClick={() => setLines((rows) => [...rows, { id: `line-${rows.length + 1}-${Date.now()}`, itemId: defaultItemId, description: "", qty: "1", rate: "" }])}
            >
              <Icon name="plus" className="size-4" />Add line
            </button>
          </div>

          <label className="label">Warranty note <span className="font-medium text-muted">(optional)</span>
            <textarea className="input min-h-[4.5rem]" value={warrantyNote} onChange={(e) => setWarrantyNote(e.target.value)} placeholder="e.g. Labor covered under the 12-month warranty; this invoice is for the service call only." />
          </label>

          <div className="ml-auto w-full max-w-xs text-sm">
            <div className="flex justify-between py-1"><span className="text-muted">Subtotal</span><span className="tabular-nums">{money(subtotal)}</span></div>
            <div className="flex items-center justify-between gap-3 py-1">
              <label className="flex min-w-0 items-center gap-2 text-muted">Tax
                <select className="input py-1" value={taxId} onChange={(e) => setTaxId(e.target.value)} aria-label="Tax">
                  {taxOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
              <span className="tabular-nums">{taxByQbo ? "By QuickBooks" : money(taxAmount)}</span>
            </div>
            <div className="flex justify-between border-t border-line py-2 text-base font-semibold"><span>Total{taxByQbo || taxAmount > 0 ? " (est.)" : ""}</span><span className="tabular-nums" data-testid="invoice-total">{money(total)}</span></div>
          </div>

          <label className="label">Memo / message to customer
            <textarea className="input min-h-[6.5rem]" value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={1000} aria-label="Memo or message to customer" />
          </label>
          <p className="text-[12.5px] text-muted">Creates a draft. Nothing is emailed to the customer.</p>

          <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
            <button type="button" className="btn" onClick={close}>Cancel</button>
            <button
              type="button"
              className="btn btn-primary"
              data-testid="create-draft"
              disabled={!match || subtotal <= 0 || lines.some((l) => !l.itemId)}
              title={!match ? "Match or create a QuickBooks customer first" : undefined}
              onClick={() => { setError(""); setStep("confirm"); }}
            >
              Create draft in QuickBooks
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
