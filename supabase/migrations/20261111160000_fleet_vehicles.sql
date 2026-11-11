-- Geotab fleet: vehicle ↔ tech mapping, plus a per-user access flag.
-- Admins always have fleet access; everyone else needs profiles.fleet_access.
-- Do not apply this to production until Luke approves.

alter table public.profiles
  add column if not exists fleet_access boolean not null default false;

-- profiles_update_self would otherwise let a member grant themselves access.
create or replace function private.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or private.is_admin() then return new; end if; -- service role / admin
  if new.id <> auth.uid() then raise exception 'not allowed'; end if;
  if new.role is distinct from old.role or new.active is distinct from old.active or new.email is distinct from old.email then
    raise exception 'only admins can change role, active or email';
  end if;
  if new.fleet_access is distinct from old.fleet_access then
    raise exception 'only admins can change fleet access';
  end if;
  return new;
end $$;

-- current_user_role() is already active-and-has-a-role; admins always pass.
create or replace function private.has_fleet_access() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    private.current_user_role() = 'admin'
    or (
      private.current_user_role() is not null
      and exists (select 1 from public.profiles p where p.id = auth.uid() and p.fleet_access)
    ),
    false
  )
$$;

create table if not exists public.fleet_vehicles (
  geotab_device_id text primary key,
  label text,
  profile_id uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists fleet_vehicles_profile_id_idx on public.fleet_vehicles (profile_id);

alter table public.fleet_vehicles enable row level security;

drop policy if exists fleet_vehicles_select on public.fleet_vehicles;
create policy fleet_vehicles_select on public.fleet_vehicles for select to authenticated
  using (
    private.has_fleet_access()
    and (private.is_staff() or profile_id = auth.uid())
  );

drop policy if exists fleet_vehicles_admin on public.fleet_vehicles;
create policy fleet_vehicles_admin on public.fleet_vehicles for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

grant select, insert, update, delete on public.fleet_vehicles to authenticated, service_role;
grant execute on function private.has_fleet_access() to authenticated, service_role;
