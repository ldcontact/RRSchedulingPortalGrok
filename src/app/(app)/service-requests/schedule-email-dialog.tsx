"use client";
import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { SubmitButton } from "@/components/submit-button";
import { parseEmailList, isValidEmail, type ScheduleEmailDraft } from "@/lib/service-request-email";
import { sendScheduleEmail } from "./actions";

export function SendScheduleEmailButton({
  requestId,
  ticketNo,
  enabled,
  disabledReason,
  lastSentLabel,
  draft,
}: {
  requestId: string;
  ticketNo: string;
  enabled: boolean;
  disabledReason: string | null;
  lastSentLabel: string | null;
  draft: ScheduleEmailDraft;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        className="btn btn-primary"
        data-testid="send-schedule-email"
        disabled={!enabled}
        title={disabledReason ?? "Compose a schedule notification for the customer"}
        onClick={() => enabled && setOpen(true)}
      >
        <Icon name="mail" />Send schedule email
      </button>
      {disabledReason && <p className="text-center text-xs text-muted" data-testid="send-schedule-email-hint">{disabledReason}</p>}
      {lastSentLabel && <p className="text-center text-xs text-muted" data-testid="last-schedule-email">Last sent {lastSentLabel}</p>}
      {open && (
        <ScheduleEmailDialog
          requestId={requestId}
          ticketNo={ticketNo}
          draft={draft}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function ScheduleEmailDialog({
  requestId,
  ticketNo,
  draft,
  onClose,
}: {
  requestId: string;
  ticketNo: string;
  draft: ScheduleEmailDraft;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"compose" | "confirm">("compose");
  const [to, setTo] = useState(draft.to);
  const [ccs, setCcs] = useState<string[]>(draft.cc);
  const [ccDraft, setCcDraft] = useState("");
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const addCc = (raw = ccDraft) => {
    const next = parseEmailList(raw);
    const bad = next.filter((e) => !isValidEmail(e));
    if (bad.length) {
      setError(`Not a valid email: ${bad.join(", ")}`);
      return;
    }
    if (!next.length) return;
    setCcs((prev) => {
      const seen = new Set(prev);
      return [...prev, ...next.filter((e) => !seen.has(e) && e !== to.trim().toLowerCase())];
    });
    setCcDraft("");
    setError(null);
  };

  const goConfirm = (e: FormEvent) => {
    e.preventDefault();
    const toAddr = to.trim().toLowerCase();
    if (!isValidEmail(toAddr)) {
      setError("Enter a valid customer email in To.");
      return;
    }
    if (!subject.trim()) {
      setError("Add a subject.");
      return;
    }
    if (!body.trim()) {
      setError("Add a message body.");
      return;
    }
    if (ccDraft.trim()) {
      const next = parseEmailList(ccDraft);
      const bad = next.filter((email) => !isValidEmail(email));
      if (bad.length) {
        setError(`Not a valid email: ${bad.join(", ")}`);
        return;
      }
      setCcs((prev) => {
        const seen = new Set(prev);
        return [...prev, ...next.filter((email) => !seen.has(email) && email !== toAddr)];
      });
      setCcDraft("");
    }
    setTo(toAddr);
    setError(null);
    setStep("confirm");
  };

  return (
    <Modal
      title={step === "compose" ? "Send schedule email" : "Send this email?"}
      sub={`${ticketNo} · The customer is emailed only if you confirm`}
      onClose={onClose}
      wide
    >
      {step === "compose" ? (
        <form className="flex flex-col gap-3 p-5" onSubmit={goConfirm} data-testid="schedule-email-dialog">
          <label className="label">To
            <input
              className="input"
              type="email"
              name="to"
              autoComplete="email"
              required
              value={to}
              onChange={(e) => setTo(e.target.value)}
              aria-label="To"
              data-testid="schedule-email-to"
            />
          </label>
          <fieldset>
            <legend className="mb-1.5 text-[12.5px] font-semibold text-[#3d4744]">CC</legend>
            <div className="flex flex-wrap gap-1.5" data-testid="schedule-email-cc-list">
              {ccs.map((email) => (
                <span key={email} className="inline-flex max-w-full items-center gap-1 rounded-full border border-line bg-canvas py-1 pr-1.5 pl-2.5 text-[13px]">
                  <span className="truncate">{email}</span>
                  <button
                    type="button"
                    className="grid size-6 shrink-0 place-items-center rounded-full hover:bg-white"
                    aria-label={`Remove ${email}`}
                    onClick={() => setCcs((prev) => prev.filter((c) => c !== email))}
                  >
                    <Icon name="x" className="size-3.5" />
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                className="input"
                type="email"
                value={ccDraft}
                onChange={(e) => setCcDraft(e.target.value)}
                onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addCc();
                  }
                }}
                placeholder="Add another CC"
                aria-label="Add CC"
                data-testid="schedule-email-cc-input"
              />
              <button type="button" className="btn shrink-0" onClick={() => addCc()}>Add</button>
            </div>
            <p className="mt-1 text-[11.5px] text-muted">The ticket creator is copied by default. You can remove them or add more people.</p>
          </fieldset>
          <label className="label">Subject
            <textarea className="input min-h-0 resize-y font-normal" name="subject" rows={2} required value={subject} onChange={(e) => setSubject(e.target.value)} data-testid="schedule-email-subject" />
          </label>
          <label className="label">Message
            <textarea
              className="input min-h-40 font-normal leading-relaxed"
              name="body"
              required
              value={body}
              onChange={(e) => setBody(e.target.value)}
              data-testid="schedule-email-body"
            />
          </label>
          {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
          <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" data-testid="schedule-email-review">
              <Icon name="mail" />Review &amp; send
            </button>
          </div>
        </form>
      ) : (
        <form action={sendScheduleEmail} className="flex flex-col gap-4 p-5" data-testid="schedule-email-confirm">
          <input type="hidden" name="request_id" value={requestId} />
          <input type="hidden" name="to" value={to} />
          <input type="hidden" name="cc" value={ccs.join(",")} />
          <input type="hidden" name="subject" value={subject} />
          <input type="hidden" name="body" value={body} />
          <p className="text-sm">This will email the customer. Nothing else is sent automatically.</p>
          <dl className="grid gap-2 text-sm">
            <div><dt className="text-xs font-semibold text-muted">To</dt><dd className="break-all font-medium">{to}</dd></div>
            <div>
              <dt className="text-xs font-semibold text-muted">CC</dt>
              <dd className="break-all">{ccs.length ? ccs.join(", ") : <span className="text-muted">None</span>}</dd>
            </div>
            <div><dt className="text-xs font-semibold text-muted">Subject</dt><dd>{subject}</dd></div>
          </dl>
          <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
            <button type="button" className="btn" onClick={() => setStep("compose")}>Back</button>
            <SubmitButton className="btn btn-primary" pendingText="Sending…" data-testid="schedule-email-send">
              <Icon name="send" />Send email
            </SubmitButton>
          </div>
        </form>
      )}
    </Modal>
  );
}
