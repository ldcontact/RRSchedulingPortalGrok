-- Permission toggles on invites, copied onto the profile at first sign-in.
-- Admins can set fleet_access / can_delete before the person has an auth account.
-- Do not apply this to production until it is approved for go-live.

alter table public.invites
  add column if not exists fleet_access boolean not null default false,
  add column if not exists can_delete boolean not null default false;

-- Current handle_new_user is from 20261109170000_profile_avatars (avatars + role).
-- Also copy invite permission flags when the email is already confirmed.
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
    fleet_access, can_delete
  )
  values (
    new.id,
    lower(new.email),
    coalesce(nullif(inv.full_name, ''), new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    inv.phone, inv.title, coalesce(inv.color, '#0f766e'),
    case when confirmed then inv.role end,
    src, path, google_url,
    case when confirmed then coalesce(inv.fleet_access, false) else false end,
    case when confirmed then coalesce(inv.can_delete, false) else false end
  )
  on conflict (id) do nothing;
  if inv.email is not null and confirmed then
    update public.invites set accepted_at = coalesce(accepted_at, now()) where email = inv.email;
  end if;
  return new;
end $$;

-- Current handle_user_confirmed / sync_invite_to_profile are from
-- 20261109170100_admin_user_lifecycle (deleted_at + avatars). Add permission flags.
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
             can_delete = coalesce(inv.can_delete, false)
       where id = new.id and role is null and deleted_at is null;
      update public.invites set accepted_at = coalesce(accepted_at, now()) where email = inv.email;
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
         can_delete = new.can_delete
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
  after insert or update of role, full_name, phone, title, color, avatar_source, avatar_path, fleet_access, can_delete
  or delete on public.invites
  for each row execute function private.sync_invite_to_profile();
