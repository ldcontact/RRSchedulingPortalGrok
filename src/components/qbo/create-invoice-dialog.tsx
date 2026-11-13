"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { invoiceHref, money, searchQboCustomers, type QboCustomer } from "@/lib/qbo-mock";
import { addDays, fmtDay, todayKey } from "@/lib/time";

type Line = { id: string; item: string; description: string; qty: string; rate: string };

type Step = "compose" | "confirm" | "match";

function num(v: string) {
  const n = Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function CreateInvoiceDialog({
  base,
  ticketNo,
  customerName,
  issueSummary,
  issueDescription,
  servicePrice,
  terms,
  itemName,
  taxLabel,
  invoiceNumber,
  initialMatch,
  initialStep = "compose",
  unmatched = false,
}: {
  base: string;
  ticketNo: string;
  customerName: string;
  issueSummary: string;
  issueDescription: string;
  servicePrice: number | null;
  terms: string;
  itemName: string;
  taxLabel: string;
  invoiceNumber: number;
  initialMatch: QboCustomer | null;
  initialStep?: Step;
  unmatched?: boolean;
}) {
  const router = useRouter();
  const closeHref = invoiceHref(base, { invoice: "none" });
  const [step, setStep] = useState<Step>(initialStep);
  const [match, setMatch] = useState<QboCustomer | null>(unmatched ? null : initialMatch);
  const [query, setQuery] = useState(unmatched ? customerName : "");
  const [date, setDate] = useState(todayKey());
  const [due, setDue] = useState(addDays(todayKey(), 30));
  const [term, setTerm] = useState(terms);
  const [tax, setTax] = useState(taxLabel);
  const [memo, setMemo] = useState(issueDescription);
  const [warrantyNote, setWarrantyNote] = useState("");
  const [lines, setLines] = useState<Line[]>([{
    id: "line-1",
    item: itemName,
    description: issueSummary,
    qty: "1",
    rate: servicePrice != null ? servicePrice.toFixed(2) : "",
  }]);

  const results = useMemo(() => searchQboCustomers(query), [query]);
  const subtotal = lines.reduce((sum, l) => sum + num(l.qty) * num(l.rate), 0);
  const taxRate = tax.startsWith("Illinois") ? 0.1025 : 0;
  const taxAmount = Math.round(subtotal * taxRate * 100) / 100;
  const total = Math.round((subtotal + taxAmount) * 100) / 100;

  const close = () => router.push(closeHref, { scroll: false });
  const createdHref = invoiceHref(base, {
    invoice: "draft",
    ok: `Invoice #${invoiceNumber} created as a draft in QuickBooks. Nothing was emailed to the customer.`,
  });

  const setLine = (id: string, patch: Partial<Line>) =>
    setLines((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const title = step === "match" ? "Match QuickBooks customer" : step === "confirm" ? "Create this draft?" : "Create invoice";
  const sub = step === "match"
    ? "Search QuickBooks customers, or create a new one. Nothing is duplicated until you confirm."
    : `${ticketNo} · ${customerName}`;

  return (
    <Modal title={title} sub={sub} onClose={close} wide>
      {step === "match" ? (
        <div className="flex flex-col gap-4 p-5" data-testid="customer-match">
          <div className="flex items-center gap-2 rounded-lg border border-line bg-white px-3">
            <Icon name="search" className="size-4 text-muted" />
            <input
              className="w-full bg-transparent py-2 text-sm outline-none"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search QuickBooks customers…"
              aria-label="Search QuickBooks customers"
              data-testid="qbo-customer-search"
              autoFocus
            />
          </div>
          <div className="divide-y divide-line rounded-lg border border-line" data-testid="qbo-customer-results">
            {results.length === 0 && <div className="p-4 text-sm text-muted">No QuickBooks customers match “{query}”.</div>}
            {results.map((c) => (
              <button
                key={c.id}
                type="button"
                className="flex w-full flex-col items-start gap-0.5 px-4 py-3 text-left hover:bg-[#fafbf9]"
                onClick={() => { setMatch(c); setStep("compose"); }}
              >
                <div className="font-semibold">{c.name}</div>
                <div className="text-[12.5px] text-muted">{c.email}</div>
                <div className="text-[12.5px] text-muted">{c.address}</div>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn"
            data-testid="create-qbo-customer"
            onClick={() => {
              setMatch({
                id: "qbo-new",
                name: customerName,
                email: initialMatch?.email || "",
                address: initialMatch?.address || "New QuickBooks customer",
              });
              setStep("compose");
            }}
          >
            <Icon name="plus" />Create new customer in QuickBooks
          </button>
          <p className="text-[11.5px] text-muted">Design mock — no customer is created in QuickBooks.</p>
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <button type="button" className="btn" onClick={() => setStep("compose")}>Back</button>
          </div>
        </div>
      ) : step === "confirm" ? (
        <div className="flex flex-col gap-4 p-5" data-testid="create-invoice-confirm">
          <p className="text-sm">
            Create draft invoice <span className="font-semibold tabular-nums">#{invoiceNumber}</span> for{" "}
            <span className="font-semibold">{match?.name ?? customerName}</span> at{" "}
            <span className="font-semibold">{money(total)}</span>?
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            <li>Terms {term} · due {fmtDay(due, { month: "short", day: "numeric", year: "numeric" })}</li>
            <li>Creates a draft in QuickBooks. Nothing is emailed to the customer.</li>
            <li>Field techs never see this invoice or the service price.</li>
            <li>This is a design mock — no draft is created in a real company.</li>
          </ul>
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <button type="button" className="btn" onClick={() => setStep("compose")}>Back</button>
            <button type="button" className="btn btn-primary" data-testid="confirm-create-invoice" onClick={() => router.push(createdHref, { scroll: false })}>
              Confirm and create draft
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
                  <div className="truncate text-[12.5px] text-muted">{match.email} · {match.address}</div>
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
              <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="label">Due date
              <input className="input" type="date" value={due} onChange={(e) => { setDue(e.target.value); }} />
            </label>
            <label className="label">Terms
              <select className="input" value={term} onChange={(e) => {
                setTerm(e.target.value);
                const days = e.target.value === "Due on receipt" ? 0 : e.target.value === "Net 15" ? 15 : e.target.value === "Net 60" ? 60 : 30;
                setDue(addDays(date || todayKey(), days));
              }}>
                <option>Due on receipt</option>
                <option>Net 15</option>
                <option>Net 30</option>
                <option>Net 60</option>
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
                    <input className="input" value={l.item} onChange={(e) => setLine(l.id, { item: e.target.value })} aria-label="Item" />
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
                      <td className="px-2 py-1.5"><input className="input min-w-0" value={l.item} onChange={(e) => setLine(l.id, { item: e.target.value })} aria-label="Item" /></td>
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
              onClick={() => setLines((rows) => [...rows, { id: `line-${rows.length + 1}-${Date.now()}`, item: "", description: "", qty: "1", rate: "" }])}
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
                <select className="input py-1" value={tax} onChange={(e) => setTax(e.target.value)} aria-label="Tax">
                  <option>Non-taxable</option>
                  <option>Illinois sales tax (10.25%)</option>
                </select>
              </label>
              <span className="tabular-nums">{money(taxAmount)}</span>
            </div>
            <div className="flex justify-between border-t border-line py-2 text-base font-semibold"><span>Total</span><span className="tabular-nums" data-testid="invoice-total">{money(total)}</span></div>
          </div>

          <label className="label">Memo / message to customer
            <textarea className="input min-h-[6.5rem]" value={memo} onChange={(e) => setMemo(e.target.value)} aria-label="Memo or message to customer" />
          </label>
          <p className="text-[12.5px] text-muted">Creates a draft. Nothing is emailed to the customer.</p>

          <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
            <button type="button" className="btn" onClick={close}>Cancel</button>
            <button
              type="button"
              className="btn btn-primary"
              data-testid="create-draft"
              disabled={!match || total <= 0}
              title={!match ? "Match or create a QuickBooks customer first" : undefined}
              onClick={() => setStep("confirm")}
            >
              Create draft in QuickBooks
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
