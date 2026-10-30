-- Phase 2: completion evidence rule + automatic project status.

-- Techs must attach at least one completion photo and one note before submitting a job for review.
create or replace function public.guard_job_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_staff() then return new; end if;
  if not public.is_assigned_to_job(old.id) then raise exception 'not assigned to this job'; end if;
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
    if not exists (select 1 from public.photos where job_id = new.id and kind = 'completion')
       or not exists (select 1 from public.notes where job_id = new.id) then
      raise exception 'add at least one completion photo and a note before submitting';
    end if;
    new.completed_at := now(); new.completed_by := auth.uid();
  end if;
  if new.status = 'in_progress' and old.status = 'scheduled' then new.started_at := now(); end if;
  return new;
end $$;

-- Project status follows its visits (unless the project was cancelled):
-- any submitted visit -> awaiting_review, any started -> in_progress, any scheduled -> scheduled,
-- all approved -> complete.
create or replace function public.sync_project_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  pid uuid := coalesce(new.project_id, old.project_id);
  cur public.project_status;
  nxt public.project_status;
begin
  select status into cur from public.projects where id = pid;
  if cur is null or cur = 'cancelled' then return null; end if;
  select case
           when bool_or(status = 'completed')   then 'awaiting_review'
           when bool_or(status = 'in_progress') then 'in_progress'
           when bool_or(status = 'scheduled')   then 'scheduled'
           when bool_or(status = 'approved')    then 'complete'
         end::public.project_status
    into nxt from public.jobs where project_id = pid and status <> 'cancelled';
  if nxt is not null and nxt <> cur then
    update public.projects set status = nxt, updated_at = now() where id = pid;
  end if;
  return null;
end $$;
create trigger jobs_sync_project after insert or delete or update of status, project_id on public.jobs
  for each row execute function public.sync_project_status();

create index if not exists messages_customer_idx on public.messages (customer_id, created_at desc);
create index if not exists notes_job_idx on public.notes (job_id);
grant execute on all functions in schema public to authenticated;
