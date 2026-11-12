-- Project and visit documents (PDF, Excel/CSV, images). Stored as-is (no JPEG resize).
-- job_id null = project-level; set = a file on that visit. Techs can add visit files
-- when they can already upload photos there, but they can never delete documents.

create table public.project_files (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  job_id        uuid references public.jobs (id) on delete cascade,
  filename      text not null,
  mime          text not null,
  size_bytes    integer not null,
  storage_path  text not null unique,
  uploaded_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  check (char_length(filename) between 1 and 255),
  check (size_bytes >= 0),
  check (job_id is null or job_id is not null)
);
create index project_files_project_idx on public.project_files (project_id);
create index project_files_job_idx on public.project_files (job_id);

create or replace function private.guard_project_file() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.job_id is not null and not exists (
    select 1 from public.jobs j where j.id = new.job_id and j.project_id = new.project_id
  ) then
    raise exception 'visit does not belong to this project';
  end if;
  return new;
end $$;

drop trigger if exists project_files_guard on public.project_files;
create trigger project_files_guard
  before insert or update on public.project_files
  for each row execute function private.guard_project_file();

-- Stamp uploaded_by from the JWT, same as photos.
create or replace function private.force_row_actor() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if tg_table_name = 'notes' then
    new.author_id := auth.uid();
  elsif tg_table_name = 'messages' then
    new.sent_by := auth.uid();
  elsif tg_table_name = 'photos' then
    new.uploaded_by := auth.uid();
  elsif tg_table_name = 'project_files' then
    new.uploaded_by := auth.uid();
  elsif tg_table_name = 'service_request_events' then
    new.actor_id := auth.uid();
  elsif tg_table_name = 'service_requests' then
    new.created_by := auth.uid();
  elsif tg_table_name = 'task_comments' then
    new.author_id := auth.uid();
  end if;
  return new;
end $$;

drop trigger if exists project_files_force_actor on public.project_files;
create trigger project_files_force_actor
  before insert on public.project_files
  for each row execute function private.force_row_actor();

alter table public.project_files enable row level security;

-- Staff and techs assigned to a visit on the project can read project + visit files.
create policy project_files_select on public.project_files
  for select to authenticated
  using (private.can_see_project(project_id));

-- Admins and managers can attach project-level or visit-level documents.
create policy project_files_staff_insert on public.project_files
  for insert to authenticated
  with check (private.is_staff());

-- Techs may add files to a visit they are assigned to (app layer also requires in-progress, like photos).
create policy project_files_tech_insert on public.project_files
  for insert to authenticated
  with check (
    job_id is not null
    and private.is_assigned_to_job(job_id)
    and uploaded_by = auth.uid()
    and project_id = (select j.project_id from public.jobs j where j.id = job_id)
  );

-- Admins always; managers only with profiles.can_delete; techs never.
create policy project_files_delete on public.project_files
  for delete to authenticated
  using ((select private.can_delete()));

grant select, insert, delete on public.project_files to authenticated, service_role;
revoke all on function private.guard_project_file() from public, anon, authenticated;

-- ---------------------------------------------------------------- storage: private "project-files" bucket
-- Paths:
--   {project_id}/project/{uuid}.ext
--   {project_id}/visit/{job_id}/{uuid}.ext
insert into storage.buckets (id, name, public) values ('project-files', 'project-files', false)
  on conflict (id) do nothing;

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit'
  ) then
    update storage.buckets
       set file_size_limit = 26214400,
           allowed_mime_types = array[
             'application/pdf',
             'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
             'application/vnd.ms-excel',
             'text/csv',
             'application/csv',
             'image/jpeg',
             'image/png',
             'image/webp',
             'image/heic',
             'image/heif'
           ]
     where id = 'project-files';
  end if;
end $$;

create policy project_files_obj_read on storage.objects for select to authenticated using (
  bucket_id = 'project-files' and private.can_see_project(private.storage_project_id(name))
);

create policy project_files_obj_staff_write on storage.objects for insert to authenticated with check (
  bucket_id = 'project-files' and private.is_staff()
);

create policy project_files_obj_tech_write on storage.objects for insert to authenticated with check (
  bucket_id = 'project-files'
  and (storage.foldername(name))[2] = 'visit'
  and private.is_assigned_to_job(((storage.foldername(name))[3])::uuid)
  and private.can_see_project(private.storage_project_id(name))
);

create policy project_files_obj_delete on storage.objects for delete to authenticated using (
  bucket_id = 'project-files' and (select private.can_delete())
);
