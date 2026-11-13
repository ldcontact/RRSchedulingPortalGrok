"use client";

import { SubmitButton } from "@/components/submit-button";
import { fmtDateTime } from "@/lib/time";
import { anyTeamSmsPrefOn } from "@/lib/team-sms/prefs";
import type { TeamMember } from "@/lib/types";

const SWITCHES = [
  { key: "sms_notify_assignment" as const, label: "New assignment", help: "A visit, service request, or task is assigned to them." },
  { key: "sms_notify_same_day" as const, label: "Same-day change", help: "A visit today or tomorrow is moved, cancelled, or reassigned." },
  { key: "sms_notify_morning" as const, label: "Morning summary", help: "One text around 7 AM CT listing today’s visits in order." },
];

export function TeamSmsSwitches({
  member,
  action,
  self,
}: {
  member: Pick<TeamMember, "sms_notify_assignment" | "sms_notify_same_day" | "sms_notify_morning" | "sms_stopped_at" | "phone" | "email">;
  action: (formData: FormData) => void | Promise<void>;
  self?: boolean;
}) {
  const missingPhone = anyTeamSmsPrefOn(member) && !member.phone?.trim();
  const who = self ? "you" : "them";
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-white p-3" data-testid="team-sms-prefs">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">Text me when…</div>
      <p className="text-[12.5px] text-muted">
        Staff texts only, to {self ? "your" : "this person’s"} profile phone. Texting stays off overall until it is enabled for the team; checking a switch records the preference and does not send anything on its own.
      </p>
      {member.sms_stopped_at && (
        <p className="rounded-md bg-amber-50 px-2 py-1.5 text-[12.5px] text-amber-900" data-testid="team-sms-stopped">
          Texting is off — {self ? "you replied" : "they replied"} STOP on {fmtDateTime(member.sms_stopped_at)}. Turning a switch back on is a new opt-in.
        </p>
      )}
      {missingPhone && (
        <p className="rounded-md bg-amber-50 px-2 py-1.5 text-[12.5px] text-amber-900" data-testid="team-sms-missing-phone">
          A switch is on, but there is no phone on this profile. Add a cell number before texts can be held or sent.
        </p>
      )}
      {SWITCHES.map((s) => {
        const on = !!member[s.key];
        return (
          <form key={s.key} action={action} className="flex items-start justify-between gap-3 border-t border-line pt-2" data-testid={`team-sms-${s.key}`}>
            <input type="hidden" name="email" value={member.email} />
            <input type="hidden" name="flag" value={s.key} />
            <input type="hidden" name="value" value={on ? "off" : "on"} />
            <div className="min-w-0">
              <div className="text-sm font-semibold">{s.label}</div>
              <div className="text-[12.5px] text-muted">{s.help.replace("them", who).replace("their", self ? "your" : "their")}</div>
            </div>
            <SubmitButton className="btn btn-sm shrink-0" pendingText="Saving…">{on ? "On" : "Off"}</SubmitButton>
          </form>
        );
      })}
    </div>
  );
}
