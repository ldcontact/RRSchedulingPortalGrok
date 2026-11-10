import { Icon } from "./icons";
import { Avatar } from "./ui";
import { SubmitButton } from "./submit-button";
import { fmtDateTime } from "@/lib/time";
import { CHANNEL_LABEL, type Channel, type Message } from "@/lib/types";
import { logCustomerMessage } from "@/app/(app)/customers/actions";

const CH_ICON: Record<Channel, string> = { call: "phone", text: "text", email: "mail", timeline: "calendar", note: "note" };

function messageAttribution(m: Message) {
  if (m.direction === "inbound") {
    return `from customer · logged by ${m.sender_name}`;
  }
  return `by ${m.sender_name}`;
}

export function MessageLog({ messages, customerId, projectId = null }: { messages: Message[]; customerId: string; projectId?: string | null }) {
  return (
    <div className="card">
      <div className="card-hd"><h3 className="font-semibold">Customer log</h3><span className="text-xs text-muted">Calls, texts, emails, timelines</span></div>
      <form action={logCustomerMessage.bind(null, customerId, projectId)} className="grid grid-cols-2 gap-2 border-b border-line p-4" data-testid="log-message">
        <select name="channel" className="input" aria-label="Channel" defaultValue="call">
          <option value="call">Call</option><option value="text">Text</option><option value="email">Email</option><option value="note">Note</option>
        </select>
        <select name="direction" className="input" aria-label="Direction" defaultValue="outbound"><option value="outbound">Outgoing</option><option value="inbound">Incoming</option></select>
        <input name="subject" className="input col-span-2" placeholder="Subject (optional)" />
        <textarea name="body" required className="input col-span-2 min-h-16" placeholder="What was said / sent…" />
        <div className="col-span-2 flex items-center justify-between gap-2">
          <span className="text-[11.5px] text-muted">Log only. Nothing is sent to the customer yet.</span>
          <SubmitButton className="btn btn-sm btn-primary">Add to log</SubmitButton>
        </div>
      </form>
      <ol className="divide-y divide-line">
        {messages.length === 0 && <li className="p-5 text-center text-sm text-muted">Nothing logged yet.</li>}
        {messages.map((m) => (
          <li key={m.id} className="flex gap-3 px-4 py-3">
            <span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full ${m.direction === "inbound" ? "bg-sky-100 text-sky-700" : "bg-brand-50 text-brand"}`}><Icon name={CH_ICON[m.channel]} className="size-3.5" /></span>
            <div className="min-w-0 flex-1 text-sm">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-semibold">{CHANNEL_LABEL[m.channel]}</span>
                <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                  <Avatar name={m.sender_name} color={m.sender_color} size="sm" />
                  {messageAttribution(m)} · {fmtDateTime(m.created_at)}
                </span>
              </div>
              {m.subject && <div className="font-medium">{m.subject}</div>}
              <div className="whitespace-pre-wrap text-muted">{m.body}</div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
