import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Banner } from "@/components/ui";
import { Icon } from "@/components/icons";
import { RequiredPhotosScreen } from "@/components/required-photos";
import { isStaff, requireMember } from "@/lib/auth";
import { getRepo } from "@/lib/data/repo";
import { applicablePhotoRequirements } from "@/lib/photo-requirements";
import { dayKey, fmtDay, fmtRange } from "@/lib/time";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Required photos" };
}

export default async function RequiredPhotosPage({ params, searchParams }: PageProps<"/jobs/[id]/required-photos">) {
  const user = await requireMember();
  const { id } = await params;
  const sp = await searchParams;
  const repo = await getRepo();
  const job = await repo.getJob(id);
  if (!job) notFound();
  const requirements = applicablePhotoRequirements(job.kind, await repo.listPhotoRequirements(job.project_id, id));
  if (!requirements.length) redirect(`/jobs/${id}`);
  const staff = isStaff(user.role);
  const mine = job.assignees.some((a) => a.id === user.id);
  const [photos, notes] = await Promise.all([
    repo.listPhotos({ jobId: id, kind: "completion" }),
    repo.listNotes({ jobId: id }),
  ]);
  const canEdit = (mine || staff) && job.status === "in_progress";
  const canDelete = staff || canEdit;
  const visitWhen = `${fmtDay(dayKey(job.starts_at), { weekday: "short", month: "short", day: "numeric" })} · ${fmtRange(job.starts_at, job.ends_at)}`;
  const ok = typeof sp.ok === "string" ? sp.ok : null;
  const error = typeof sp.error === "string" ? sp.error : null;

  return (
    <>
      <div className="mb-3 flex flex-col gap-2 empty:hidden">
        {ok && <Banner tone="ok"><Icon name="check" />{ok}</Banner>}
        {error && <Banner tone="error"><Icon name="alert" />{error}</Banner>}
      </div>
      <RequiredPhotosScreen
        jobId={id}
        projectId={job.project_id}
        projectName={job.project_name}
        jobTitle={job.title}
        visitWhen={visitWhen}
        requirements={requirements}
        photos={photos}
        noteCount={notes.length}
        canEdit={canEdit}
        canDelete={canDelete}
      />
    </>
  );
}
