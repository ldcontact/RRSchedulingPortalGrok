import { JOB_STATUS_LABEL, PROJECT_STATUS_LABEL, PROJECT_TYPE_LABEL, type JobStatus, type Person, type ProjectStatus, type ProjectType } from "@/lib/types";
import { Avatar } from "./ui";

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
      {people.slice(0, max).map((p) => <span key={p.id} className="rounded-full ring-2 ring-white"><Avatar name={p.full_name} color={p.color} size="sm" /></span>)}
      {people.length > max && <span className="grid size-6 place-items-center rounded-full bg-slate-200 text-[10px] font-bold ring-2 ring-white">+{people.length - max}</span>}
    </span>
  );
}
