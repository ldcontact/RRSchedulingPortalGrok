-- Visit-level required photos: the same checklist as project_photo_requirements, scoped to one visit.
-- job_id is null for project-level items (they still apply to every install visit on the project);
-- job_id set means the item is specific to that visit.

alter table public.project_photo_requirements
  add column job_id uuid references public.jobs (id) on delete cascade;

create index project_photo_requirements_job_idx
  on public.project_photo_requirements (job_id, sort_order, created_at)
  where job_id is not null;

-- A visit-scoped item must belong to a visit on the same project.
create or replace function private.guard_photo_requirement_parent() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  job_project uuid;
begin
  if new.job_id is null then return new; end if;
  select project_id into job_project from public.jobs where id = new.job_id;
  if job_project is null then raise exception 'unknown visit for required photo item'; end if;
  if job_project <> new.project_id then
    raise exception 'required photo item visit belongs to a different project';
  end if;
  return new;
end $$;

drop trigger if exists project_photo_requirements_parent on public.project_photo_requirements;
create trigger project_photo_requirements_parent
  before insert or update of job_id, project_id on public.project_photo_requirements
  for each row execute function private.guard_photo_requirement_parent();

-- Photos linked to a visit-specific item must be on that same visit.
create or replace function private.guard_photo_requirement() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  req_project uuid;
  req_job uuid;
begin
  if new.requirement_id is null then return new; end if;
  if new.kind <> 'completion' then
    raise exception 'required photo items only apply to completion photos';
  end if;
  if new.job_id is null then
    raise exception 'completion photos for a required item must belong to a visit';
  end if;
  select project_id, job_id into req_project, req_job
    from public.project_photo_requirements where id = new.requirement_id;
  if req_project is null then raise exception 'unknown required photo item'; end if;
  if req_project <> new.project_id then
    raise exception 'required photo item belongs to a different project';
  end if;
  if req_job is not null and req_job <> new.job_id then
    raise exception 'required photo item belongs to a different visit';
  end if;
  return new;
end $$;

-- Techs completing a visit must satisfy project-level items (install visits) plus any
-- visit-specific items. Warranty/service visits skip the project list, but visit items still apply.
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
  if new.status = 'in_progress' and old.status = 'scheduled' then new.started_at := now(); end if;
  return new;
end $$;

-- Staff still have full access (same as the project list, including delete).
-- Techs can read project-level items on projects they can see, and visit items only on
-- visits they are assigned to.
drop policy if exists project_photo_requirements_tech_read on public.project_photo_requirements;
create policy project_photo_requirements_tech_read on public.project_photo_requirements
  for select to authenticated
  using (
    (job_id is null and private.can_see_project(project_id))
    or (job_id is not null and private.is_assigned_to_job(job_id))
  );
