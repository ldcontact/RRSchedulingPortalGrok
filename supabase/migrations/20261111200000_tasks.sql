-- Team to-dos. Admins and managers see and manage all tasks. Techs see tasks
-- assigned to them or created by them and may only change status on those.
-- Delete follows private.can_delete() (admin, or manager with profiles.can_delete).
-- Optional links to a project, customer, or service request are cleared if the
-- parent row is deleted. Do not apply this to production until Luke approves.

do $$ begin
  create type public.task_status as enum ('open', 'in_progress', 'done');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.task_priority as enum ('low', 'normal', 'high');
exception when duplicate_object then null;
end $$;

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status public.task_status not null default 'open',
  priority public.task_priority not null default 'normal',
  due_date date,
  assignee_id uuid references public.profiles (id) on delete set null,
  created_by uuid not null references public.profiles (id) on delete restrict,
  project_id uuid references public.projects (id) on delete set null,
  customer_id uuid references public.customers (id) on delete set null,
  service_request_id uuid references public.service_requests (id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_title_nonempty check (char_length(trim(title)) > 0)
);

create index if not exists tasks_assignee_status_idx on public.tasks (assignee_id, status);
create index if not exists tasks_due_date_idx on public.tasks (due_date);
create index if not exists tasks_created_by_idx on public.tasks (created_by);
create index if not exists tasks_project_id_idx on public.tasks (project_id);
create index if not exists tasks_customer_id_idx on public.tasks (customer_id);
create index if not exists tasks_service_request_id_idx on public.tasks (service_request_id);

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at before update on public.tasks
  for each row execute function private.set_updated_at();

create or replace function private.sync_task_completed() returns trigger
language plpgsql as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then
    new.completed_at := coalesce(new.completed_at, now());
  elsif new.status is distinct from 'done' then
    new.completed_at := null;
  end if;
  return new;
end $$;

drop trigger if exists tasks_sync_completed on public.tasks;
create trigger tasks_sync_completed before insert or update on public.tasks
  for each row execute function private.sync_task_completed();

create or replace function private.guard_task_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or private.is_staff() then return new; end if;
  if new.title is distinct from old.title
    or new.description is distinct from old.description
    or new.priority is distinct from old.priority
    or new.due_date is distinct from old.due_date
    or new.assignee_id is distinct from old.assignee_id
    or new.created_by is distinct from old.created_by
    or new.project_id is distinct from old.project_id
    or new.customer_id is distinct from old.customer_id
    or new.service_request_id is distinct from old.service_request_id
  then
    raise exception 'techs can only update task status';
  end if;
  return new;
end $$;

drop trigger if exists tasks_guard_update on public.tasks;
create trigger tasks_guard_update before update on public.tasks
  for each row execute function private.guard_task_update();

alter table public.tasks enable row level security;

drop policy if exists tasks_staff on public.tasks;
create policy tasks_staff on public.tasks for all to authenticated
  using ((select private.is_staff()))
  with check ((select private.is_staff()));

drop policy if exists tasks_tech_select on public.tasks;
create policy tasks_tech_select on public.tasks for select to authenticated
  using (
    (select private.current_user_role()) = 'tech'
    and (assignee_id = (select auth.uid()) or created_by = (select auth.uid()))
  );

drop policy if exists tasks_tech_insert on public.tasks;
create policy tasks_tech_insert on public.tasks for insert to authenticated
  with check (
    (select private.current_user_role()) = 'tech'
    and created_by = (select auth.uid())
  );

drop policy if exists tasks_tech_update on public.tasks;
create policy tasks_tech_update on public.tasks for update to authenticated
  using (
    (select private.current_user_role()) = 'tech'
    and (assignee_id = (select auth.uid()) or created_by = (select auth.uid()))
  )
  with check (
    (select private.current_user_role()) = 'tech'
    and (assignee_id = (select auth.uid()) or created_by = (select auth.uid()))
  );

drop policy if exists tasks_delete_access on public.tasks;
create policy tasks_delete_access on public.tasks
  as restrictive for delete to authenticated
  using ((select private.can_delete()));

grant select, insert, update, delete on public.tasks to authenticated, service_role;
grant usage on type public.task_status to authenticated, service_role;
grant usage on type public.task_priority to authenticated, service_role;
