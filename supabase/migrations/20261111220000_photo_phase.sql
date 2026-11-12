-- Visit/project photo phase (before / after / required / other).
-- Local only: do not apply to production until Luke approves.
-- public.photos.kind stays before|completion so existing RLS, storage paths,
-- and submit-job guards keep working. phase is the user-facing category.
-- Imported / unrecognized rows default to 'other' (Uncategorized).

do $$ begin
  create type public.photo_phase as enum ('before', 'after', 'required', 'other');
exception when duplicate_object then null;
end $$;

alter table public.photos
  add column if not exists phase public.photo_phase;

update public.photos
   set phase = case
     when requirement_id is not null then 'required'::public.photo_phase
     when kind = 'before' then 'before'::public.photo_phase
     when kind = 'completion' then 'after'::public.photo_phase
     else 'other'::public.photo_phase
   end
 where phase is null;

alter table public.photos alter column phase set default 'other';
alter table public.photos alter column phase set not null;

-- Keep kind in sync with phase; required rows must have a requirement + visit.
create or replace function private.sync_photo_phase() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- If a requirement is cleared, demote required -> after so the shot is not lost.
  if tg_op = 'UPDATE' and old.requirement_id is not null and new.requirement_id is null and new.phase = 'required' then
    new.phase := 'after';
  end if;
  if new.phase = 'before' then
    new.kind := 'before';
    new.requirement_id := null;
  elsif new.phase = 'after' then
    new.kind := 'completion';
    new.requirement_id := null;
    if new.job_id is null then
      raise exception 'after photos belong to a visit';
    end if;
  elsif new.phase = 'required' then
    new.kind := 'completion';
    if new.job_id is null then
      raise exception 'required photos belong to a visit';
    end if;
    if new.requirement_id is null then
      raise exception 'required photos must be linked to a checklist item';
    end if;
  end if;
  -- phase = other: leave kind as provided so imported HCP rows keep their original kind.
  return new;
end $$;

drop trigger if exists photos_sync_phase on public.photos;
drop trigger if exists photos_aa_sync_phase on public.photos;
create trigger photos_aa_sync_phase
  before insert or update of phase, kind, requirement_id, job_id
  on public.photos
  for each row execute function private.sync_photo_phase();


-- Update the existing requirement guard so it also accepts phase = required.
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

-- Techs may upload before + after (and required/completion) on an assigned visit.
drop policy if exists photos_tech_insert on public.photos;
create policy photos_tech_insert on public.photos for insert to authenticated with check (
  job_id is not null
  and private.is_assigned_to_job(job_id)
  and uploaded_by = auth.uid()
  and project_id = (select j.project_id from public.jobs j where j.id = job_id)
  and (
    (phase = 'before' and kind = 'before')
    or (phase in ('after', 'required') and kind = 'completion')
  )
);

drop policy if exists photos_tech_delete_own on public.photos;
create policy photos_tech_delete_own on public.photos for delete to authenticated using (
  uploaded_by = auth.uid()
  and phase in ('before', 'after', 'required')
  and exists (select 1 from public.jobs j where j.id = job_id and j.status = 'in_progress')
);

drop policy if exists photos_tech_update_phase on public.photos;
create policy photos_tech_update_phase on public.photos for update to authenticated
  using (
    job_id is not null
    and private.is_assigned_to_job(job_id)
    and exists (select 1 from public.jobs j where j.id = job_id and j.status = 'in_progress')
  )
  with check (
    job_id is not null
    and private.is_assigned_to_job(job_id)
    and phase in ('before', 'after')
    and requirement_id is null
    and (
      (phase = 'before' and kind = 'before')
      or (phase = 'after' and kind = 'completion')
    )
  );

-- Storage: techs can write/delete before objects as well as completion.
drop policy if exists photos_obj_tech_write on storage.objects;
create policy photos_obj_tech_write on storage.objects for insert to authenticated with check (
  bucket_id = 'photos'
  and (storage.foldername(name))[2] in ('before', 'completion')
  and private.can_see_project(private.storage_project_id(name))
);

drop policy if exists photos_obj_tech_delete_own on storage.objects;
create policy photos_obj_tech_delete_own on storage.objects for delete to authenticated using (
  bucket_id = 'photos'
  and (storage.foldername(name))[2] in ('before', 'completion')
  and private.can_see_project(private.storage_project_id(name))
);

revoke all on function private.sync_photo_phase() from public, anon, authenticated;
