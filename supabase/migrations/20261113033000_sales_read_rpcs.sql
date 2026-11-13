-- Sales reads customers, projects, and jobs through SECURITY DEFINER RPCs
-- instead of extra RLS policies on those tables. The role check lives inside
-- the function, so manager home_counts / nav_badges never evaluate extra
-- per-row policies. Do not apply this on production until a go-live card.

create or replace function private.sales_caller_allowed()
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select coalesce(private.can_access_sales(), false);
$$;

create or replace function public.sales_get_customer(p_id uuid)
returns table (
  id uuid,
  name text,
  phone text,
  email text,
  address text,
  city text,
  state text,
  zip text
)
language sql
stable
security definer
set search_path = public, private
as $$
  select c.id, c.name, c.phone, c.email, c.address, c.city, c.state, c.zip
  from public.customers c
  where c.id = p_id
    and private.sales_caller_allowed()
    and exists (
      select 1
      from public.sales_deals d
      where d.customer_id = c.id
        and private.can_view_deal(d.owner_id)
    );
$$;

create or replace function public.sales_get_project(p_id uuid)
returns table (
  id uuid,
  name text,
  type public.project_type,
  status public.project_status,
  value numeric,
  est_rebate numeric
)
language sql
stable
security definer
set search_path = public, private
as $$
  select p.id, p.name, p.type, p.status, p.value, p.est_rebate
  from public.projects p
  where p.id = p_id
    and private.sales_caller_allowed()
    and exists (
      select 1
      from public.sales_deals d
      where d.converted_project_id = p.id
        and private.can_view_deal(d.owner_id)
    );
$$;

create or replace function public.sales_list_jobs_for_project(p_project_id uuid)
returns table (
  id uuid,
  project_id uuid,
  title text,
  starts_at timestamptz,
  ends_at timestamptz,
  status public.job_status
)
language sql
stable
security definer
set search_path = public, private
as $$
  select j.id, j.project_id, j.title, j.starts_at, j.ends_at, j.status
  from public.jobs j
  where j.project_id = p_project_id
    and private.sales_caller_allowed()
    and exists (
      select 1
      from public.sales_deals d
      where d.converted_project_id = j.project_id
        and private.can_view_deal(d.owner_id)
    )
  order by j.starts_at;
$$;

-- Occupied schedule windows for assessment booking. Authenticated sales/staff
-- may call it; the public /book page uses the service-role admin client.
create or replace function public.sales_occupied_windows(p_from timestamptz, p_to timestamptz)
returns table (
  starts_at timestamptz,
  ends_at timestamptz
)
language sql
stable
security definer
set search_path = public, private
as $$
  select j.starts_at, j.ends_at
  from public.jobs j
  where j.status is distinct from 'cancelled'
    and j.starts_at < p_to
    and j.ends_at > p_from
    and (
      private.sales_caller_allowed()
      or current_setting('role', true) = 'service_role'
      or coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'role' = 'service_role'
    );
$$;

revoke all on function private.sales_caller_allowed() from public, anon, authenticated;
revoke all on function public.sales_get_customer(uuid) from public, anon;
revoke all on function public.sales_get_project(uuid) from public, anon;
revoke all on function public.sales_list_jobs_for_project(uuid) from public, anon;
revoke all on function public.sales_occupied_windows(timestamptz, timestamptz) from public, anon;

grant execute on function public.sales_get_customer(uuid) to authenticated, service_role;
grant execute on function public.sales_get_project(uuid) to authenticated, service_role;
grant execute on function public.sales_list_jobs_for_project(uuid) to authenticated, service_role;
grant execute on function public.sales_occupied_windows(timestamptz, timestamptz) to authenticated, service_role;
