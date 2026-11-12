-- Speed round 1: cheaper exact counts, list indexes, and remaining auth.uid()
-- InitPlan wraps. Visibility is unchanged (SECURITY INVOKER RPCs + same RLS).
-- Do not apply this to production until Luke approves.
--
-- 1) One exact count RPC instead of 7 PostgREST HEAD counts on Projects, plus
--    Home dashboard counts and nav badges (open tickets + my open tasks).
-- 2) Indexes for jobs-by-status, completed-at lists, schedule overlap, and
--    notes.project_id (unindexed FK used by listNotes).
-- 3) Wrap auth.uid() in (select auth.uid()) on the 8 remaining advisor
--    warnings. Does not merge permissive policies.

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists jobs_status_idx
  on public.jobs (status);
create index if not exists jobs_status_completed_at_idx
  on public.jobs (status, completed_at desc);
-- Schedule overlap: ends_at > :from AND starts_at < :to
create index if not exists jobs_starts_ends_idx
  on public.jobs (starts_at, ends_at);
create index if not exists notes_project_idx
  on public.notes (project_id);

-- ---------------------------------------------------------------------------
-- Exact count RPCs (invoker so RLS is identical to the previous table counts)
-- ---------------------------------------------------------------------------
create or replace function public.project_status_counts(
  p_tokens text[] default null,
  p_text text default null,
  p_digits text default null
) returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with filtered as (
    select p.status
    from public.projects p
    where
      case
        when p_digits is not null then
          exists (
            select 1 from public.project_search s
            where s.project_id = p.id
              and (
                s.doc ilike ('%' || coalesce(p_text, '') || '%')
                or s.digits ilike ('%' || p_digits || '%')
              )
          )
        when p_tokens is not null and cardinality(p_tokens) > 0 then
          exists (
            select 1 from public.project_search s
            where s.project_id = p.id
              and not exists (
                select 1 from unnest(p_tokens) t
                where s.doc not ilike ('%' || t || '%')
              )
          )
        else true
      end
  ),
  by_status as (
    select status, count(*)::int as n from filtered group by status
  )
  select jsonb_build_object(
    'active',           coalesce((select sum(n) from by_status where status <> 'cancelled'), 0),
    'proposed',         coalesce((select n from by_status where status = 'proposed'), 0),
    'scheduled',        coalesce((select n from by_status where status = 'scheduled'), 0),
    'in_progress',      coalesce((select n from by_status where status = 'in_progress'), 0),
    'awaiting_review',  coalesce((select n from by_status where status = 'awaiting_review'), 0),
    'complete',         coalesce((select n from by_status where status = 'complete'), 0),
    'cancelled',        coalesce((select n from by_status where status = 'cancelled'), 0)
  );
$$;

create or replace function public.home_counts(
  p_day_start timestamptz,
  p_day_end timestamptz
) returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'customers',        (select count(*)::int from public.customers),
    'team',             (select count(*)::int from public.profiles where role is not null and active),
    'invited',          (select count(*)::int from public.invites where accepted_at is null),
    'active_projects',  (select count(*)::int from public.projects where status in ('scheduled', 'in_progress', 'awaiting_review')),
    'proposed',         (select count(*)::int from public.projects where status = 'proposed'),
    'jobs_today',       (select count(*)::int from public.jobs where status <> 'cancelled' and starts_at >= p_day_start and starts_at < p_day_end),
    'awaiting_review',  (select count(*)::int from public.jobs where status = 'completed')
  );
$$;

create or replace function public.nav_badges()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'open_service_requests', (
      select count(*)::int from public.service_requests
      where status in ('new', 'triaged', 'scheduled')
    ),
    'my_open_tasks', (
      select count(*)::int from public.tasks t
      where t.status in ('open', 'in_progress')
        and exists (
          select 1 from public.task_assignees a
          where a.task_id = t.id and a.profile_id = (select auth.uid())
        )
    )
  );
$$;

revoke all on function public.project_status_counts(text[], text, text) from public, anon;
revoke all on function public.home_counts(timestamptz, timestamptz) from public, anon;
revoke all on function public.nav_badges() from public, anon;
grant execute on function public.project_status_counts(text[], text, text) to authenticated;
grant execute on function public.home_counts(timestamptz, timestamptz) to authenticated;
grant execute on function public.nav_badges() to authenticated;

-- ---------------------------------------------------------------------------
-- auth_rls_initplan: wrap auth.uid() so Postgres evaluates it once per statement
-- ---------------------------------------------------------------------------
alter policy profiles_update_self on public.profiles
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

alter policy profiles_select on public.profiles
  using (
    id = (select auth.uid())
    or (deleted_at is null and private.is_member())
    or private.is_admin()
  );

alter policy project_files_tech_insert on public.project_files
  with check (
    job_id is not null
    and private.is_assigned_to_job(job_id)
    and uploaded_by = (select auth.uid())
    and project_id = (select j.project_id from public.jobs j where j.id = job_id)
  );

alter policy notes_tech_insert on public.notes
  with check (
    job_id is not null and private.is_assigned_to_job(job_id) and author_id = (select auth.uid())
    and customer_id is null and project_id is null
  );

alter policy admin_audit_admin_insert on public.admin_audit
  with check (private.is_admin() and actor_id = (select auth.uid()));

alter policy fleet_vehicles_select on public.fleet_vehicles
  using (
    private.has_fleet_access()
    and (private.is_staff() or profile_id = (select auth.uid()))
  );

alter policy photos_tech_insert on public.photos
  with check (
    job_id is not null
    and private.is_assigned_to_job(job_id)
    and uploaded_by = (select auth.uid())
    and project_id = (select j.project_id from public.jobs j where j.id = job_id)
    and (
      (phase = 'before' and kind = 'before')
      or (phase in ('after', 'required') and kind = 'completion')
    )
  );

alter policy photos_tech_delete_own on public.photos
  using (
    uploaded_by = (select auth.uid())
    and phase in ('before', 'after', 'required')
    and exists (select 1 from public.jobs j where j.id = job_id and j.status = 'in_progress')
  );
