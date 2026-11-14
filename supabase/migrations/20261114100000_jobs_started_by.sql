-- Who started a visit, matching jobs.completed_by.
-- Set by private.guard_job_update() on scheduled -> in_progress, via auth.uid().
-- Nullable so older visits stay blank. Do not add RLS on customers, projects, or jobs.

alter table public.jobs
  add column if not exists started_by uuid references public.profiles (id) on delete set null;

create or replace function private.guard_job_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  missing text;
  has_reqs boolean;
begin
  if auth.uid() is null or private.is_staff() then return new; end if;
  if not private.is_assigned_to_job(old.id) then raise exception 'not assigned to this job'; end if;
  if new.project_id <> old.project_id or new.title <> old.title or new.starts_at <> old.starts_at
     or new.ends_at <> old.ends_at or new.instructions is distinct from old.instructions
     or new.approved_at is distinct from old.approved_at or new.approved_by is distinct from old.approved_by
     or new.review_note is distinct from old.review_note
     or new.kind <> old.kind or new.service_request_id is distinct from old.service_request_id then
    raise exception 'techs can only update job progress';
  end if;
  if new.status <> old.status and not (
       (old.status = 'scheduled' and new.status = 'in_progress') or
       (old.status = 'in_progress' and new.status = 'completed')) then
    raise exception 'invalid status change for tech: % -> %', old.status, new.status;
  end if;
  if new.status = 'completed' and old.status <> 'completed' then
    if not exists (select 1 from public.notes where job_id = new.id) then
      raise exception 'add at least one completion photo and a note before submitting';
    end if;
    select exists (
      select 1 from public.project_photo_requirements r
       where r.job_id = new.id
          or (new.kind = 'install' and r.project_id = new.project_id and r.job_id is null)
    ) into has_reqs;
    if has_reqs then
      select string_agg(r.label, ', ' order by r.job_id nulls first, r.sort_order, r.created_at)
        into missing
        from public.project_photo_requirements r
       where (r.job_id = new.id
              or (new.kind = 'install' and r.project_id = new.project_id and r.job_id is null))
         and not exists (
           select 1 from public.photos p
            where p.job_id = new.id and p.kind = 'completion' and p.requirement_id = r.id
         );
      if missing is not null then
        raise exception 'missing required photos: %', missing;
      end if;
    elsif not exists (select 1 from public.photos where job_id = new.id and kind = 'completion') then
      raise exception 'add at least one completion photo and a note before submitting';
    end if;
    new.completed_at := now(); new.completed_by := auth.uid();
  end if;
  if new.status = 'in_progress' and old.status = 'scheduled' then
    new.started_at := now();
    new.started_by := auth.uid();
  end if;
  return new;
end $$;
