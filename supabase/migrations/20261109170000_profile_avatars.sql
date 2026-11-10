-- Profile avatars: admin-managed uploads + optional Google profile photo.
-- Private "avatars" bucket (signed URLs). Invite rows can hold an upload before
-- first sign-in; handle_new_user / sync_invite_to_profile carry it onto profiles.

create type public.avatar_source as enum ('none', 'upload', 'google');

alter table public.profiles
  add column avatar_source public.avatar_source not null default 'none',
  add column avatar_path text
    check (avatar_path is null or length(trim(avatar_path)) > 0),
  add column google_avatar_url text
    check (google_avatar_url is null or google_avatar_url ~ '^https://');

alter table public.invites
  add column avatar_source public.avatar_source not null default 'none',
  add column avatar_path text
    check (avatar_path is null or length(trim(avatar_path)) > 0);

-- New auth user: copy invite avatar (if any) and capture Google picture metadata.
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  inv public.invites;
  google_url text;
  src public.avatar_source;
  path text;
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
  insert into public.profiles (
    id, email, full_name, phone, title, color, role,
    avatar_source, avatar_path, google_avatar_url
  )
  values (
    new.id,
    lower(new.email),
    coalesce(nullif(inv.full_name, ''), new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    inv.phone, inv.title, coalesce(inv.color, '#0f766e'),
    case when new.email_confirmed_at is not null then inv.role end,
    src, path, google_url
  )
  on conflict (id) do nothing;
  if inv.email is not null and new.email_confirmed_at is not null then
    update public.invites set accepted_at = coalesce(accepted_at, now()) where email = inv.email;
  end if;
  return new;
end $$;

-- Keep google_avatar_url fresh when Google metadata changes (re-login / token refresh).
create or replace function private.sync_google_avatar_from_auth() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  google_url text;
begin
  google_url := nullif(coalesce(
    new.raw_user_meta_data ->> 'avatar_url',
    new.raw_user_meta_data ->> 'picture'
  ), '');
  if google_url is distinct from coalesce(
       old.raw_user_meta_data ->> 'avatar_url',
       old.raw_user_meta_data ->> 'picture'
     ) then
    update public.profiles
       set google_avatar_url = google_url
     where id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists on_auth_user_meta_avatar on auth.users;
create trigger on_auth_user_meta_avatar
  after update of raw_user_meta_data on auth.users
  for each row execute function private.sync_google_avatar_from_auth();

-- Admin invite edits also sync avatar choice/path onto an existing profile.
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
         color = new.color,
         avatar_source = new.avatar_source,
         avatar_path = case
           when new.avatar_source = 'upload' then new.avatar_path
           when new.avatar_source = 'none' then null
           else avatar_path
         end
   where email = new.email
     and exists (select 1 from auth.users u where u.id = profiles.id and u.email_confirmed_at is not null);
  if found then
    update public.invites set accepted_at = coalesce(accepted_at, now()) where email = new.email and accepted_at is null;
  end if;
  return new;
end $$;

drop trigger if exists invites_sync on public.invites;
create trigger invites_sync
  after insert or update of role, full_name, phone, title, color, avatar_source, avatar_path
  or delete on public.invites
  for each row execute function private.sync_invite_to_profile();

-- Self may edit avatar fields; only admins may change role/active/email (unchanged).
create or replace function private.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or private.is_admin() then return new; end if;
  if new.id <> auth.uid() then raise exception 'not allowed'; end if;
  if new.role is distinct from old.role or new.active is distinct from old.active or new.email is distinct from old.email then
    raise exception 'only admins can change role, active or email';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- storage: private avatars bucket
-- Object paths:
--   {profile_id}/{uuid}.jpg          — owned by that profile (self or admin upload)
--   pending/{email}/{uuid}.jpg       — invite upload before first sign-in (admin only)
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', false)
  on conflict (id) do nothing;
-- Enforce size/MIME on real Supabase when those bucket columns exist (no-op on test stubs).
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit'
  ) then
    update storage.buckets
       set file_size_limit = 5242880,
           allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
     where id = 'avatars';
  end if;
end $$;

create or replace function private.can_write_avatar(p_name text) returns boolean
language plpgsql stable security definer set search_path = public, storage as $$
declare
  parts text[];
begin
  if private.is_admin() then return true; end if;
  parts := storage.foldername(p_name);
  if parts is null or array_length(parts, 1) < 1 then return false; end if;
  -- self-owned folder = auth.uid()
  return parts[1] = auth.uid()::text;
end $$;

create policy avatars_obj_read on storage.objects for select to authenticated using (
  bucket_id = 'avatars' and private.is_member()
);
create policy avatars_obj_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'avatars' and private.can_write_avatar(name)
);
-- upsert needs UPDATE + SELECT + INSERT
create policy avatars_obj_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and private.can_write_avatar(name))
  with check (bucket_id = 'avatars' and private.can_write_avatar(name));
create policy avatars_obj_delete on storage.objects for delete to authenticated using (
  bucket_id = 'avatars' and private.can_write_avatar(name)
);

grant execute on function private.can_write_avatar(text) to authenticated, service_role;
revoke all on function private.sync_google_avatar_from_auth() from public, anon, authenticated;
