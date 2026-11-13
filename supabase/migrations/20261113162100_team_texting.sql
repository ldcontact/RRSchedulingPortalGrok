-- Staff team-texting: per-person opt-in, outbox, and copy-from-invite at sign-in.
-- Do NOT apply this on production until Luke approves a go-live card.
-- Texting stays off until TEAM_SMS_ENABLED=1. These objects only store prefs and held/queued messages.
-- Do not add RLS policies on customers, projects, or jobs.

alter table public.profiles
  add column if not exists sms_notify_assignment boolean not null default false,
  add column if not exists sms_notify_same_day boolean not null default false,
  add column if not exists sms_notify_morning boolean not null default false,
  add column if not exists sms_stopped_at timestamptz;

alter table public.invites
  add column if not exists sms_notify_assignment boolean not null default false,
  add column if not exists sms_notify_same_day boolean not null default false,
  add column if not exists sms_notify_morning boolean not null default false;

comment on column public.profiles.sms_notify_assignment is
  'Staff opted in to a text when a visit, service request, or task is assigned to them.';
comment on column public.profiles.sms_notify_same_day is
  'Staff opted in to a text when a visit today or tomorrow is moved, cancelled, or reassigned.';
comment on column public.profiles.sms_notify_morning is
  'Staff opted in to one morning text around 7 AM CT listing today''s visits.';
comment on column public.profiles.sms_stopped_at is
  'When the staff member texted STOP. All sms_notify_* flags are cleared.';

-- Copy invite texting prefs onto the profile at first sign-in / confirm.
-- Base: 20261113151129_invite_permission_toggles (fleet_access, can_delete, vehicle mapping).
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  inv public.invites;
  google_url text;
  src public.avatar_source;
  path text;
  confirmed boolean;
begin
  select * into inv from public.invites where email = lower(new.email);
  google_url := nullif(coalesce(
    new.raw_user_meta_data ->> 'avatar_url',
    new.raw_user_meta_data ->> 'picture'
  ), '');
  src := coalesce(inv.avatar_source, 'none');
  path := inv.avatar_path;
  if src = 'upload' and path is null then
    src := 'none';
  end if;
  if src = 'none' and google_url is not null then
    src := 'google';
  end if;
  confirmed := new.email_confirmed_at is not null;
  insert into public.profiles (
    id, email, full_name, phone, title, color, role,
    avatar_source, avatar_path, google_avatar_url,
    fleet_access, can_delete,
    sms_notify_assignment, sms_notify_same_day, sms_notify_morning
  )
  values (
    new.id,
    lower(new.email),
    coalesce(nullif(inv.full_name, ''), new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    inv.phone, inv.title, coalesce(inv.color, '#0f766e'),
    case when confirmed then inv.role end,
    src, path, google_url,
    case when confirmed then coalesce(inv.fleet_access, false) else false end,
    case when confirmed then coalesce(inv.can_delete, false) else false end,
    case when confirmed then coalesce(inv.sms_notify_assignment, false) else false end,
    case when confirmed then coalesce(inv.sms_notify_same_day, false) else false end,
    case when confirmed then coalesce(inv.sms_notify_morning, false) else false end
  )
  on conflict (id) do nothing;
  if inv.email is not null and confirmed then
    update public.invites set accepted_at = coalesce(accepted_at, now()) where email = inv.email;
    perform private.apply_invite_fleet_assignments(inv.email, new.id);
  end if;
  return new;
end $$;

create or replace function private.handle_user_confirmed() returns trigger
language plpgsql security definer set search_path = public as $$
declare inv public.invites;
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    select * into inv from public.invites where email = lower(new.email);
    if inv.email is not null then
      update public.profiles
         set role = inv.role,
             fleet_access = coalesce(inv.fleet_access, false),
             can_delete = coalesce(inv.can_delete, false),
             sms_notify_assignment = coalesce(inv.sms_notify_assignment, false),
             sms_notify_same_day = coalesce(inv.sms_notify_same_day, false),
             sms_notify_morning = coalesce(inv.sms_notify_morning, false)
       where id = new.id and role is null and deleted_at is null;
      update public.invites set accepted_at = coalesce(accepted_at, now()) where email = inv.email;
      perform private.apply_invite_fleet_assignments(inv.email, new.id);
    end if;
  end if;
  return new;
end $$;

create or replace function private.sync_invite_to_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    update public.profiles set role = null where email = old.email and deleted_at is null;
    return old;
  end if;
  update public.profiles
     set role = new.role,
         full_name = coalesce(nullif(new.full_name, ''), full_name),
         phone = coalesce(new.phone, phone),
         title = coalesce(new.title, title),
         color = new.color,
         avatar_source = coalesce(new.avatar_source, avatar_source),
         avatar_path = case
           when new.avatar_source = 'upload' then new.avatar_path
           when new.avatar_source = 'none' then null
           else avatar_path
         end,
         fleet_access = new.fleet_access,
         can_delete = new.can_delete,
         sms_notify_assignment = new.sms_notify_assignment,
         sms_notify_same_day = new.sms_notify_same_day,
         sms_notify_morning = new.sms_notify_morning
   where email = new.email
     and deleted_at is null
     and exists (select 1 from auth.users u where u.id = profiles.id and u.email_confirmed_at is not null);
  if found then
    update public.invites set accepted_at = coalesce(accepted_at, now()) where email = new.email and accepted_at is null;
  end if;
  return new;
end $$;

drop trigger if exists invites_sync on public.invites;
create trigger invites_sync
  after insert or update of role, full_name, phone, title, color, avatar_source, avatar_path,
    fleet_access, can_delete,
    sms_notify_assignment, sms_notify_same_day, sms_notify_morning
  or delete on public.invites
  for each row execute function private.sync_invite_to_profile();

create table if not exists public.team_sms_outbox (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  to_phone     text not null,
  kind         text not null check (kind in ('assignment', 'same_day', 'morning', 'batch')),
  body         text not null,
  link         text,
  payload      jsonb not null default '{}'::jsonb,
  status       text not null check (status in ('queued', 'held', 'sent', 'failed', 'canceled')),
  send_after   timestamptz not null,
  sent_at      timestamptz,
  provider     text,
  provider_id  text,
  error        text,
  created_at   timestamptz not null default now()
);

create index if not exists team_sms_outbox_due_idx
  on public.team_sms_outbox (send_after, status);
create index if not exists team_sms_outbox_profile_idx
  on public.team_sms_outbox (profile_id, created_at desc);
create unique index if not exists team_sms_outbox_morning_uniq
  on public.team_sms_outbox (profile_id, (payload->>'morning_for'))
  where kind = 'morning';

create table if not exists public.team_sms_events (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  kind         text not null check (kind in ('assignment', 'same_day')),
  entity_type  text not null check (entity_type in ('visit', 'service_request', 'task')),
  entity_id    uuid not null,
  summary      text not null,
  link         text not null,
  payload      jsonb not null default '{}'::jsonb,
  outbox_id    uuid references public.team_sms_outbox (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists team_sms_events_outbox_idx on public.team_sms_events (outbox_id);
create index if not exists team_sms_events_profile_idx on public.team_sms_events (profile_id, created_at desc);

alter table public.team_sms_outbox enable row level security;
alter table public.team_sms_events enable row level security;

grant select, insert on public.team_sms_outbox to authenticated;
grant select, insert on public.team_sms_events to authenticated;
revoke all on public.team_sms_outbox from anon;
revoke all on public.team_sms_events from anon;
revoke update, delete on public.team_sms_outbox from authenticated;
revoke update, delete on public.team_sms_events from authenticated;
-- Flush / cron uses the service role, which bypasses RLS.

drop policy if exists team_sms_outbox_select on public.team_sms_outbox;
create policy team_sms_outbox_select on public.team_sms_outbox
  for select to authenticated
  using (private.is_admin() or profile_id = auth.uid());

drop policy if exists team_sms_outbox_insert on public.team_sms_outbox;
create policy team_sms_outbox_insert on public.team_sms_outbox
  for insert to authenticated
  with check (private.is_admin() or private.current_user_role() in ('admin', 'manager'));

drop policy if exists team_sms_events_select on public.team_sms_events;
create policy team_sms_events_select on public.team_sms_events
  for select to authenticated
  using (private.is_admin() or profile_id = auth.uid());

drop policy if exists team_sms_events_insert on public.team_sms_events;
create policy team_sms_events_insert on public.team_sms_events
  for insert to authenticated
  with check (private.is_admin() or private.current_user_role() in ('admin', 'manager'));
