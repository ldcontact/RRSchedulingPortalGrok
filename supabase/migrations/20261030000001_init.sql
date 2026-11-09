-- RR Scheduler: initial schema, RLS, and storage
-- Roles: admin (everything), manager (all business data, no user/role admin),
--        tech (only jobs assigned to them + those projects' scope/before photos).
-- Access is invite-only: anyone can authenticate (Google or email/password, any
-- email domain), but only emails on public.invites get a role. Everyone else gets
-- a profile with role = null and sees the "not invited yet" screen.


-- ---------------------------------------------------------------- enums
-- Privileged helpers live in a non-API schema so PostgREST cannot expose them as RPCs.
-- Tables/enums stay in public (app contract unchanged). RLS policies still call these via SQL.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to postgres, authenticated, service_role;

create type public.user_role    as enum ('admin', 'manager', 'tech');
create type public.project_type as enum ('lighting', 'hvac', 'lighting_hvac', 'other');
create type public.project_status as enum ('proposed', 'scheduled', 'in_progress', 'awaiting_review', 'complete', 'cancelled');
create type public.job_status   as enum ('scheduled', 'in_progress', 'completed', 'approved', 'cancelled');
create type public.photo_kind   as enum ('before', 'completion');
create type public.message_channel as enum ('call', 'text', 'email', 'timeline', 'note');

-- ---------------------------------------------------------------- helpers
create or replace function private.set_updated_at() returns trigger
language plpgsql set search_path = public as $$ begin new.updated_at = now(); return new; end $$;

-- ---------------------------------------------------------------- team
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null unique check (email = lower(email)),
  full_name   text not null default '',
  phone       text,
  title       text,
  color       text not null default '#0f766e',
  role        public.user_role,            -- null = signed in but not invited
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger profiles_updated before update on public.profiles for each row execute function private.set_updated_at();

-- Team list maintained by admins. Email is the key; any domain is allowed.
create table public.invites (
  email       text primary key check (email = lower(email) and position('@' in email) > 1),
  role        public.user_role not null default 'tech',
  full_name   text not null default '',
  phone       text,
  title       text,
  color       text not null default '#0f766e',
  invited_by  uuid references public.profiles (id) on delete set null,
  invited_at  timestamptz not null default now(),
  accepted_at timestamptz
);

-- Role lookups used by policies. SECURITY DEFINER avoids RLS recursion on profiles.
create or replace function private.current_user_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;
create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(private.current_user_role() = 'admin', false)
$$;
create or replace function private.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(private.current_user_role() in ('admin', 'manager'), false)
$$;
create or replace function private.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select private.current_user_role() is not null
$$;

-- New auth user (Google or email/password or admin invite) -> profile.
-- Role comes from the invite list; no invite = no role.
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare inv public.invites;
begin
  select * into inv from public.invites where email = lower(new.email);
  insert into public.profiles (id, email, full_name, phone, title, color, role)
  values (
    new.id,
    lower(new.email),
    coalesce(nullif(inv.full_name, ''), new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    inv.phone, inv.title, coalesce(inv.color, '#0f766e'),
    -- roles only apply to confirmed emails (Google sign-ins arrive confirmed;
    -- invite / magic-link users are confirmed when they click the email link)
    case when new.email_confirmed_at is not null then inv.role end
  )
  on conflict (id) do nothing;
  if inv.email is not null and new.email_confirmed_at is not null then
    update public.invites set accepted_at = coalesce(accepted_at, now()) where email = inv.email;
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- Email confirmed later (invite link, magic link, signup confirmation) -> apply invite.
create or replace function private.handle_user_confirmed() returns trigger
language plpgsql security definer set search_path = public as $$
declare inv public.invites;
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    select * into inv from public.invites where email = lower(new.email);
    if inv.email is not null then
      update public.profiles set role = inv.role where id = new.id and role is null;
      update public.invites set accepted_at = coalesce(accepted_at, now()) where email = inv.email;
    end if;
  end if;
  return new;
end $$;
create trigger on_auth_user_confirmed after update of email_confirmed_at on auth.users
  for each row execute function private.handle_user_confirmed();

-- Admin adds/changes an invite after the person already signed in -> sync role.
create or replace function private.sync_invite_to_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    update public.profiles set role = null where email = old.email;
    return old;
  end if;
  update public.profiles
     set role = new.role,
         full_name = coalesce(nullif(new.full_name, ''), full_name),
         phone = coalesce(new.phone, phone),
         title = coalesce(new.title, title),
         color = new.color
   where email = new.email
     and exists (select 1 from auth.users u where u.id = profiles.id and u.email_confirmed_at is not null);
  if found then
    update public.invites set accepted_at = coalesce(accepted_at, now()) where email = new.email and accepted_at is null;
  end if;
  return new;
end $$;
create trigger invites_sync after insert or update of role, full_name, phone, title, color or delete on public.invites
  for each row execute function private.sync_invite_to_profile();

-- Only admins may change role/active/email; users may edit their own name/phone.
create or replace function private.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or private.is_admin() then return new; end if; -- service role / admin
  if new.id <> auth.uid() then raise exception 'not allowed'; end if;
  if new.role is distinct from old.role or new.active is distinct from old.active or new.email is distinct from old.email then
    raise exception 'only admins can change role, active or email';
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles for each row execute function private.guard_profile_update();

-- ---------------------------------------------------------------- customers
create table public.customers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  phone       text,
  email       text,
  address     text,
  city        text,
  state       text default 'IL',
  zip         text,
  notes       text,
  tags        text[] not null default '{}',
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index customers_name_idx on public.customers (lower(name));
create trigger customers_updated before update on public.customers for each row execute function private.set_updated_at();

create table public.contacts (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  name        text not null,
  title       text,
  phone       text,
  email       text,
  is_primary  boolean not null default false,
  created_at  timestamptz not null default now()
);
create index contacts_customer_idx on public.contacts (customer_id);
create unique index contacts_one_primary on public.contacts (customer_id) where is_primary;

-- ---------------------------------------------------------------- projects
create table public.projects (
  id                   uuid primary key default gen_random_uuid(),
  customer_id          uuid not null references public.customers (id) on delete restrict,
  name                 text not null,
  type                 public.project_type not null default 'lighting',
  status               public.project_status not null default 'proposed',
  scope                text not null default '',
  value                numeric(12,2) not null default 0,
  est_rebate           numeric(12,2) not null default 0,
  timeline_sent_at     timestamptz,
  timeline_sent_via    public.message_channel,
  timeline_approved_at timestamptz,
  created_by           uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index projects_customer_idx on public.projects (customer_id);
create trigger projects_updated before update on public.projects for each row execute function private.set_updated_at();

create table public.milestones (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  name        text not null,
  due_date    date,
  done        boolean not null default false,
  sort_order  int not null default 0
);
create index milestones_project_idx on public.milestones (project_id);

-- ---------------------------------------------------------------- jobs / visits
create table public.jobs (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  title         text not null,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  status        public.job_status not null default 'scheduled',
  instructions  text,
  started_at    timestamptz,
  completed_at  timestamptz,
  completed_by  uuid references public.profiles (id) on delete set null,
  approved_at   timestamptz,
  approved_by   uuid references public.profiles (id) on delete set null,
  review_note   text,
  created_by    uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index jobs_project_idx on public.jobs (project_id);
create index jobs_starts_idx on public.jobs (starts_at);
create trigger jobs_updated before update on public.jobs for each row execute function private.set_updated_at();

create table public.job_assignments (
  job_id      uuid not null references public.jobs (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (job_id, profile_id)
);
create index job_assignments_profile_idx on public.job_assignments (profile_id);

create or replace function private.is_assigned_to_job(p_job uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.job_assignments where job_id = p_job and profile_id = auth.uid())
$$;
create or replace function private.can_see_project(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select private.is_staff() or exists (
    select 1 from public.jobs j join public.job_assignments a on a.job_id = j.id
     where j.project_id = p_project and a.profile_id = auth.uid())
$$;
create or replace function private.can_see_customer(p_customer uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select private.is_staff() or exists (
    select 1 from public.projects p join public.jobs j on j.project_id = p.id
      join public.job_assignments a on a.job_id = j.id
     where p.customer_id = p_customer and a.profile_id = auth.uid())
$$;

-- Techs may only move their job forward (scheduled -> in_progress -> completed)
-- and cannot touch schedule, assignment, approval or project fields.
create or replace function private.guard_job_update() returns trigger
language plpgsql security definer set search_path = public as $$
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
    new.completed_at := now(); new.completed_by := auth.uid();
  end if;
  if new.status = 'in_progress' and old.status = 'scheduled' then new.started_at := now(); end if;
  return new;
end $$;
create trigger jobs_guard before update on public.jobs for each row execute function private.guard_job_update();

-- ---------------------------------------------------------------- photos / notes / messages
create table public.photos (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  job_id        uuid references public.jobs (id) on delete cascade,
  kind          public.photo_kind not null,
  storage_path  text not null unique,      -- {project_id}/{kind}/{uuid}.jpg in bucket "photos"
  caption       text,
  uploaded_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  check (kind = 'before' or job_id is not null)
);
create index photos_project_idx on public.photos (project_id);
create index photos_job_idx on public.photos (job_id);

create table public.notes (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers (id) on delete cascade,
  project_id  uuid references public.projects (id) on delete cascade,
  job_id      uuid references public.jobs (id) on delete cascade,
  body        text not null check (length(trim(body)) > 0),
  author_id   uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  check (num_nonnulls(customer_id, project_id, job_id) >= 1)
);
create index notes_job_idx on public.notes (job_id);

create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  project_id  uuid references public.projects (id) on delete set null,
  channel     public.message_channel not null,
  direction   text not null default 'outbound' check (direction in ('outbound', 'inbound')),
  subject     text,
  body        text not null default '',
  sent_by     uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);
create index messages_customer_idx on public.messages (customer_id, created_at desc);

-- ---------------------------------------------------------------- RLS
alter table public.profiles        enable row level security;
alter table public.invites         enable row level security;
alter table public.customers       enable row level security;
alter table public.contacts        enable row level security;
alter table public.projects        enable row level security;
alter table public.milestones      enable row level security;
alter table public.jobs            enable row level security;
alter table public.job_assignments enable row level security;
alter table public.photos          enable row level security;
alter table public.notes           enable row level security;
alter table public.messages        enable row level security;

-- profiles: members see the team; you always see yourself; admin manages.
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or private.is_member());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin on public.profiles for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

-- invites: admin only (managers cannot administer users or roles).
create policy invites_admin on public.invites for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

-- business data: staff (admin + manager) full access.
create policy customers_staff  on public.customers  for all to authenticated using (private.is_staff()) with check (private.is_staff());
create policy contacts_staff   on public.contacts   for all to authenticated using (private.is_staff()) with check (private.is_staff());
create policy projects_staff   on public.projects   for all to authenticated using (private.is_staff()) with check (private.is_staff());
create policy milestones_staff on public.milestones for all to authenticated using (private.is_staff()) with check (private.is_staff());
create policy jobs_staff       on public.jobs       for all to authenticated using (private.is_staff()) with check (private.is_staff());
create policy assign_staff     on public.job_assignments for all to authenticated using (private.is_staff()) with check (private.is_staff());
create policy photos_staff     on public.photos     for all to authenticated using (private.is_staff()) with check (private.is_staff());
create policy notes_staff      on public.notes      for all to authenticated using (private.is_staff()) with check (private.is_staff());
create policy messages_staff   on public.messages   for all to authenticated using (private.is_staff()) with check (private.is_staff());

-- tech: read-only site info for customers/projects of their assigned jobs.
create policy customers_tech_read on public.customers for select to authenticated using (private.can_see_customer(id));
create policy contacts_tech_read  on public.contacts  for select to authenticated using (private.can_see_customer(customer_id));
create policy projects_tech_read  on public.projects  for select to authenticated using (private.can_see_project(id));
create policy milestones_tech_read on public.milestones for select to authenticated using (private.can_see_project(project_id));

-- tech: their jobs (read + progress update guarded by trigger).
create policy jobs_tech_read   on public.jobs for select to authenticated using (private.is_assigned_to_job(id));
create policy jobs_tech_update on public.jobs for update to authenticated
  using (private.is_assigned_to_job(id)) with check (private.is_assigned_to_job(id));
create policy assign_tech_read on public.job_assignments for select to authenticated using (private.is_assigned_to_job(job_id));

-- tech photos: before photos of visible projects, completion photos of their jobs.
create policy photos_tech_read on public.photos for select to authenticated using (
  (kind = 'before' and private.can_see_project(project_id))
  or (job_id is not null and private.is_assigned_to_job(job_id)));
create policy photos_tech_insert on public.photos for insert to authenticated with check (
  kind = 'completion' and job_id is not null and private.is_assigned_to_job(job_id)
  and uploaded_by = auth.uid()
  and project_id = (select j.project_id from public.jobs j where j.id = job_id));
create policy photos_tech_delete_own on public.photos for delete to authenticated using (
  kind = 'completion' and uploaded_by = auth.uid()
  and exists (select 1 from public.jobs j where j.id = job_id and j.status = 'in_progress'));

-- tech notes: read notes on their jobs; add notes to their jobs.
create policy notes_tech_read on public.notes for select to authenticated using (job_id is not null and private.is_assigned_to_job(job_id));
create policy notes_tech_insert on public.notes for insert to authenticated with check (
  job_id is not null and private.is_assigned_to_job(job_id) and author_id = auth.uid()
  and customer_id is null and project_id is null);

-- ---------------------------------------------------------------- storage
insert into storage.buckets (id, name, public) values ('photos', 'photos', false)
  on conflict (id) do nothing;

-- Object paths: {project_id}/{before|completion}/{file}
create or replace function private.storage_project_id(p_name text) returns uuid
language plpgsql immutable set search_path = public, storage as $$
begin return (storage.foldername(p_name))[1]::uuid; exception when others then return null; end $$;

create policy photos_obj_read on storage.objects for select to authenticated using (
  bucket_id = 'photos' and private.can_see_project(private.storage_project_id(name)));
create policy photos_obj_staff_write on storage.objects for insert to authenticated with check (
  bucket_id = 'photos' and private.is_staff());
create policy photos_obj_tech_write on storage.objects for insert to authenticated with check (
  bucket_id = 'photos' and (storage.foldername(name))[2] = 'completion'
  and private.can_see_project(private.storage_project_id(name)));
create policy photos_obj_staff_delete on storage.objects for delete to authenticated using (
  bucket_id = 'photos' and private.is_staff());

-- ---------------------------------------------------------------- grants
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;

-- RLS helpers must be executable by authenticated (policies evaluate as the caller).
-- Trigger-only functions are NOT granted to app roles.
revoke all on all functions in schema private from public;
revoke all on all functions in schema private from anon, authenticated;
grant execute on function private.current_user_role() to authenticated, service_role;
grant execute on function private.is_admin() to authenticated, service_role;
grant execute on function private.is_staff() to authenticated, service_role;
grant execute on function private.is_member() to authenticated, service_role;
grant execute on function private.is_assigned_to_job(uuid) to authenticated, service_role;
grant execute on function private.can_see_project(uuid) to authenticated, service_role;
grant execute on function private.can_see_customer(uuid) to authenticated, service_role;
grant execute on function private.storage_project_id(text) to authenticated, service_role;
-- Trigger functions stay callable only by the table owner / postgres (default owner).

revoke all on function private.set_updated_at() from public, anon, authenticated;
revoke all on function private.handle_new_user() from public, anon, authenticated;
revoke all on function private.handle_user_confirmed() from public, anon, authenticated;
revoke all on function private.sync_invite_to_profile() from public, anon, authenticated;
revoke all on function private.guard_profile_update() from public, anon, authenticated;
revoke all on function private.guard_job_update() from public, anon, authenticated;
