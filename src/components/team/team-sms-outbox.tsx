import type { TeamSmsOutboxRow } from "@/lib/team-sms/types";
import type { TeamMember } from "@/lib/types";
import { fmtDateTime } from "@/lib/time";

const STATUS: Record<string, string> = {
  held: "bg-amber-50 text-amber-800",
  queued: "bg-sky-50 text-sky-800",
  sent: "bg-green-100 text-green-800",
  failed: "bg-red-50 text-red-800",
  canceled: "bg-slate-100 text-slate-600",
};

export function TeamSmsOutboxPreview({
  rows,
  team,
}: {
  rows: TeamSmsOutboxRow[];
  team: TeamMember[];
}) {
  const names = new Map(team.filter((m) => m.profile_id).map((m) => [m.profile_id!, m.full_name || m.email]));
  return (
    <section className="card mb-5" data-testid="team-sms-outbox">
      <div className="card-hd">
        <h3 className="font-semibold">Held team texts</h3>
        <span className="text-xs text-muted">TEAM_SMS_ENABLED is off — these would have gone out</span>
      </div>
      <div className="flex flex-col gap-3 p-5">
        <p className="text-sm text-muted">
          Staff only, never customers. Messages batch for 10 minutes, wait until 7 AM CT if they fall in quiet hours (8 PM–7 AM), and stay in this outbox until the A2P campaign is approved and the kill switch is turned on.
        </p>
        {rows.length === 0 ? (
          <p className="text-sm text-muted">No held or queued team texts yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((row) => (
              <li key={row.id} className="rounded-lg border border-line bg-canvas/60 p-3" data-testid="team-sms-outbox-row">
                <div className="mb-1 flex flex-wrap items-center gap-2 text-[12px]">
                  <span className={`pill ${STATUS[row.status] ?? "bg-slate-100 text-slate-600"}`}>{row.status}</span>
                  <span className="font-semibold text-ink">{names.get(row.profile_id) ?? "Team member"}</span>
                  <span className="text-muted">{row.kind.replace("_", " ")}</span>
                  <span className="text-muted">Send after {fmtDateTime(row.send_after)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm">{row.body}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
