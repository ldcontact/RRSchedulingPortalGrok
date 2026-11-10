-- Admin user lifecycle: soft-delete marker + audit log.
-- Suspend uses existing profiles.active=false (and auth ban via service-role API).
-- Soft-delete keeps the profile row (and FK history) but clears PII and strips access.

alter table public.profiles
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles (id) on delete set null;

-- Soft-deleted users never get a role from invite sync / confirmation.
create or replace function private.current_user_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles
   where id = auth.uid() and active and deleted_at is null
$$;

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
         end
   where email = new.email
     and deleted_at is null
     and exists (select 1 from auth.users u where u.id = profiles.id and u.email_confirmed_at is not null);
  if found then
    update public.invites set accepted_at = coalesce(accepted_at, now()) where email = new.email and accepted_at is null;
  end if;
  return new;
end $$;

-- Do not grant roles to soft-deleted profiles on confirm / new user.
create or replace function private.handle_user_confirmed() returns trigger
language plpgsql security definer set search_path = public as $$
declare inv public.invites;
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    select * into inv from public.invites where email = lower(new.email);
    if inv.email is not null then
      update public.profiles set role = inv.role
       where id = new.id and role is null and deleted_at is null;
      update public.invites set accepted_at = coalesce(accepted_at, now()) where email = inv.email;
    end if;
  end if;
  return new;
end $$;

create table public.admin_audit (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles (id) on delete set null,
  action      text not null check (length(trim(action)) > 0 and length(action) <= 64),
  target_email text,
  target_profile_id uuid,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index admin_audit_created_idx on public.admin_audit (created_at desc);
create index admin_audit_actor_idx on public.admin_audit (actor_id, created_at desc);

alter table public.admin_audit enable row level security;
grant select, insert on public.admin_audit to authenticated;
revoke all on public.admin_audit from anon;
revoke update, delete on public.admin_audit from authenticated;

create policy admin_audit_admin_select on public.admin_audit
  for select to authenticated using (private.is_admin());
create policy admin_audit_admin_insert on public.admin_audit
  for insert to authenticated with check (private.is_admin() and actor_id = auth.uid());

-- Soft-deleted profiles stay visible to admins only (team cleanup), not the whole team.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or (deleted_at is null and private.is_member())
    or private.is_admin()
  );
