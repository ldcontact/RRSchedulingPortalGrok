-- Per-user delete access: admins always can delete customers, projects, visits,
-- and service requests. Managers can only when an admin turns on profiles.can_delete.
-- Techs and everyone else never can, even if the flag is set.
-- Tightens existing staff FOR ALL policies (which currently allow manager DELETE).
-- Do not apply this to production until Luke approves.

alter table public.profiles
  add column if not exists can_delete boolean not null default false;

-- profiles_update_self would otherwise let a member grant themselves delete access.
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
  if new.can_delete is distinct from old.can_delete then
    raise exception 'only admins can change delete access';
  end if;
  return new;
end $$;

-- current_user_role() already requires an active, invited role.
create or replace function private.can_delete() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    private.current_user_role() = 'admin'
    or (
      private.current_user_role() = 'manager'
      and exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.can_delete and p.deleted_at is null
      )
    ),
    false
  )
$$;

-- Restrictive policies AND with existing permissive staff FOR ALL policies.
-- Do not attach these to photos: techs must still be able to delete their own photos.
drop policy if exists customers_delete_access on public.customers;
create policy customers_delete_access on public.customers
  as restrictive for delete to authenticated
  using ((select private.can_delete()));

drop policy if exists projects_delete_access on public.projects;
create policy projects_delete_access on public.projects
  as restrictive for delete to authenticated
  using ((select private.can_delete()));

drop policy if exists jobs_delete_access on public.jobs;
create policy jobs_delete_access on public.jobs
  as restrictive for delete to authenticated
  using ((select private.can_delete()));

drop policy if exists service_requests_delete_access on public.service_requests;
create policy service_requests_delete_access on public.service_requests
  as restrictive for delete to authenticated
  using ((select private.can_delete()));

grant execute on function private.can_delete() to authenticated, service_role;
