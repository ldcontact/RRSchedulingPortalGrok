import { JOB_KIND_LABEL, JOB_STATUS_LABEL, PROJECT_STATUS_LABEL, PROJECT_TYPE_LABEL, SR_CHANNEL_LABEL, SR_PRIORITY_LABEL, SR_STATUS_LABEL, WARRANTY_LABEL,
  type JobKind, type JobStatus, type Person, type ProjectStatus, type ProjectType, type SRChannel, type SRPriority, type SRStatus, type WarrantyState } from "@/lib/types";
import { Avatar } from "./ui";
import { Icon } from "./icons";

const PROJECT_TONE: Record<ProjectStatus, string> = {
  proposed: "bg-slate-100 text-slate-700", scheduled: "bg-sky-100 text-sky-800", in_progress: "bg-accent-50 text-amber-800",
  awaiting_review: "bg-violet-100 text-violet-800", complete: "bg-green-100 text-green-800", cancelled: "bg-red-50 text-red-700",
};
const JOB_TONE: Record<JobStatus, string> = {
  scheduled: "bg-sky-100 text-sky-800", in_progress: "bg-accent-50 text-amber-800", completed: "bg-violet-100 text-violet-800",
  approved: "bg-green-100 text-green-800", cancelled: "bg-red-50 text-red-700",
};
/** Left-border colour for job chips on the schedule. */
export const JOB_BAR: Record<JobStatus, string> = {
  scheduled: "border-l-sky-500", in_progress: "border-l-amber-500", completed: "border-l-violet-500", approved: "border-l-green-600", cancelled: "border-l-red-400",
};

export const ProjectStatusPill = ({ status }: { status: ProjectStatus }) => <span className={`pill ${PROJECT_TONE[status]}`}>{PROJECT_STATUS_LABEL[status]}</span>;
export const JobStatusPill = ({ status }: { status: JobStatus }) => <span className={`pill ${JOB_TONE[status]}`}>{JOB_STATUS_LABEL[status]}</span>;
export const TypeTag = ({ type }: { type: ProjectType }) => <span className="tag">{PROJECT_TYPE_LABEL[type]}</span>;

export function AvatarStack({ people, max = 4 }: { people: Person[]; max?: number }) {
  if (!people.length) return <span className="text-xs text-muted">Unassigned</span>;
  return (
    <span className="flex -space-x-1.5">
      {people.slice(0, max).map((p) => <span key={p.id} className="rounded-full ring-2 ring-white"><Avatar name={p.full_name} color={p.color} size="sm" src={p.avatar_url} /></span>)}
      {people.length > max && <span className="grid size-6 place-items-center rounded-full bg-slate-200 text-[10px] font-bold ring-2 ring-white">+{people.length - max}</span>}
    </span>
  );
}

// ---------------------------------------------------------------- service requests / visit kinds
/** Gold "Warranty" / "Service" tag for follow-up visits (nothing for regular install visits). */
export function JobKindBadge({ kind, size = "md" }: { kind: JobKind | null | undefined; size?: "sm" | "md" }) {
  if (!kind || kind === "install") return null;
  const tone = kind === "warranty" ? "bg-amber-50 text-amber-800 ring-amber-300" : "bg-orange-50 text-orange-800 ring-orange-300";
  return (
    <span className={`inline-flex items-center gap-1 rounded-md font-semibold whitespace-nowrap ring-1 ${tone} ${size === "sm" ? "px-1.5 py-px text-[10.5px]" : "px-2 py-0.5 text-xs"}`} data-testid="job-kind">
      <Icon name={kind === "warranty" ? "shield" : "wrench"} className={size === "sm" ? "size-3" : "size-3.5"} />{JOB_KIND_LABEL[kind]}
    </span>
  );
}
/** Left border + tint for warranty/service chips on the schedule (overrides the status colour). */
export const KIND_BAR: Record<JobKind, string> = { install: "", warranty: "border-l-amber-600! bg-amber-50!", service: "border-l-orange-600! bg-orange-50!" };

const SR_TONE: Record<SRStatus, string> = {
  new: "bg-sky-100 text-sky-800", triaged: "bg-violet-100 text-violet-800", scheduled: "bg-teal-100 text-teal-800",
  resolved: "bg-green-100 text-green-800", closed: "bg-slate-100 text-slate-700", converted: "bg-indigo-100 text-indigo-800",
};
export const SRStatusPill = ({ status }: { status: SRStatus }) => <span className={`pill ${SR_TONE[status]}`}><span className="size-1.5 rounded-full bg-current" />{SR_STATUS_LABEL[status]}</span>;
export const PriorityPill = ({ priority }: { priority: SRPriority }) =>
  priority === "normal" ? null : <span className={`pill ${priority === "high" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"}`}>{SR_PRIORITY_LABEL[priority]} priority</span>;
const W_TONE: Record<WarrantyState, string> = { in: "bg-amber-50 text-amber-800", out: "bg-red-50 text-red-700", unknown: "bg-slate-100 text-slate-600" };
export const WarrantyPill = ({ state }: { state: WarrantyState }) => <span className={`pill ${W_TONE[state]}`} data-testid="warranty-pill"><span className="size-1.5 rounded-full bg-current" />{WARRANTY_LABEL[state]}</span>;
export function ChannelIcon({ channel }: { channel: SRChannel }) {
  const tone = channel === "email" ? "bg-violet-100 text-violet-700" : channel === "call" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600";
  return <span className={`grid size-6 shrink-0 place-items-center rounded-full ${tone}`} title={SR_CHANNEL_LABEL[channel]}><Icon name={channel === "email" ? "mail" : channel === "call" ? "phone" : "note"} className="size-3.5" /></span>;
}
