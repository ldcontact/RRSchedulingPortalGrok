-- Required completion photo checklist (project-level).
-- Admin/manager defines labeled items on a project; techs upload one completion
-- photo per item on a visit. Submitting a job for review is blocked until every
-- item has a linked completion photo on that job (plus the existing note rule).

create table public.project_photo_requirements (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  label       text not null check (length(trim(label)) > 0 and length(label) <= 120),
  note        text check (note is null or length(note) <= 500),
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create index project_photo_requirements_project_idx
  on public.project_photo_requirements (project_id, sort_order, created_at);

alter table public.photos
  add column requirement_id uuid references public.project_photo_requirements (id) on delete set null;
create index photos_requirement_idx on public.photos (requirement_id)
  where requirement_id is not null;

-- A linked requirement must belong to the same project and only apply to completion photos.
create or replace function private.guard_photo_requirement() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  req_project uuid;
begin
  if new.requirement_id is null then return new; end if;
  if new.kind <> 'completion' then
    raise exception 'required photo items only apply to completion photos';
  end if;
  if new.job_id is null then
    raise exception 'completion photos for a required item must belong to a visit';
  end if;
  select project_id into req_project from public.project_photo_requirements where id = new.requirement_id;
  if req_project is null then raise exception 'unknown required photo item'; end if;
  if req_project <> new.project_id then
    raise exception 'required photo item belongs to a different project';
  end if;
  return new;
end $$;
create trigger photos_guard_requirement before insert or update of requirement_id, kind, project_id, job_id
  on public.photos for each row execute function private.guard_photo_requirement();

-- Extend completion evidence: note always required; if the project has a
-- checklist, every item needs ≥1 linked completion photo on this job; otherwise
-- keep the original “at least one completion photo” rule.
create or replace function private.guard_job_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  missing text;
begin
  if auth.uid() is null or private.is_staff() then return new; end if;
  if not private.is_assigned_to_job(old.id) then raise exception 'not assigned to this job'; end if;
  if new.project_id <> old.project_id or new.title <> old.title or new.starts_at <> old.starts_at
     or new.ends_at <> old.ends_at or new.instructions is distinct from old.instructions
     or new.approved_at is distinct from old.approved_at or new.approved_by is distinct from old.approved_by
     or new.review_note is distinct from old.review_note then
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
    if exists (select 1 from public.project_photo_requirements where project_id = new.project_id) then
      select string_agg(r.label, ', ' order by r.sort_order, r.created_at)
        into missing
        from public.project_photo_requirements r
       where r.project_id = new.project_id
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

alter table public.project_photo_requirements enable row level security;
grant select, insert, update, delete on public.project_photo_requirements to authenticated;
revoke all on public.project_photo_requirements from anon;


create policy project_photo_requirements_staff on public.project_photo_requirements
  for all to authenticated
  using (private.is_staff()) with check (private.is_staff());

create policy project_photo_requirements_tech_read on public.project_photo_requirements
  for select to authenticated
  using (private.can_see_project(project_id));

revoke all on function private.guard_photo_requirement() from public, anon, authenticated;
revoke all on function private.guard_job_update() from public, anon, authenticated;

-- Techs may remove their own completion objects while the visit is still in progress
-- (mirrors photos_tech_delete_own on the photos table).
create policy photos_obj_tech_delete_own on storage.objects for delete to authenticated using (
  bucket_id = 'photos'
  and (storage.foldername(name))[2] = 'completion'
  and private.can_see_project(private.storage_project_id(name))
);
