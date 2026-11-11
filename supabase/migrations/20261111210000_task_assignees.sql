-- Multiple assignees per task. Copies any existing tasks.assignee_id rows into
-- public.task_assignees, then drops the single-assignee column. Techs can see
-- tasks they created or are assigned to; only staff (or the task creator, when
-- inserting) can change the assignee list. Delete access is unchanged.

create table if not exists public.task_assignees (
  task_id uuid not null references public.tasks (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (task_id, profile_id)
);

create index if not exists task_assignees_profile_idx on public.task_assignees (profile_id);

-- Safe even when there are no rows, and if this migration is re-run after the column is gone.
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tasks' and column_name = 'assignee_id'
  ) then
    insert into public.task_assignees (task_id, profile_id)
    select id, assignee_id from public.tasks
    where assignee_id is not null
    on conflict do nothing;
  end if;
end $$;

create or replace function private.is_task_assignee(p_task uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.task_assignees
    where task_id = p_task and profile_id = auth.uid()
  )
$$;

grant execute on function private.is_task_assignee(uuid) to authenticated, service_role;

-- Recreate tech task policies against the join table before dropping the column.
drop policy if exists tasks_tech_select on public.tasks;
create policy tasks_tech_select on public.tasks for select to authenticated
  using (
    (select private.current_user_role()) = 'tech'
    and (created_by = (select auth.uid()) or (select private.is_task_assignee(id)))
  );

drop policy if exists tasks_tech_update on public.tasks;
create policy tasks_tech_update on public.tasks for update to authenticated
  using (
    (select private.current_user_role()) = 'tech'
    and (created_by = (select auth.uid()) or (select private.is_task_assignee(id)))
  )
  with check (
    (select private.current_user_role()) = 'tech'
    and (created_by = (select auth.uid()) or (select private.is_task_assignee(id)))
  );

-- The column is going away; the join table is the source of assignment.
create or replace function private.guard_task_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or private.is_staff() then return new; end if;
  if new.title is distinct from old.title
    or new.description is distinct from old.description
    or new.priority is distinct from old.priority
    or new.due_date is distinct from old.due_date
    or new.created_by is distinct from old.created_by
    or new.project_id is distinct from old.project_id
    or new.customer_id is distinct from old.customer_id
    or new.service_request_id is distinct from old.service_request_id
  then
    raise exception 'techs can only update task status';
  end if;
  return new;
end $$;

alter table public.task_assignees enable row level security;

drop policy if exists task_assignees_staff on public.task_assignees;
create policy task_assignees_staff on public.task_assignees for all to authenticated
  using ((select private.is_staff()))
  with check ((select private.is_staff()));

drop policy if exists task_assignees_tech_select on public.task_assignees;
create policy task_assignees_tech_select on public.task_assignees for select to authenticated
  using (
    (select private.current_user_role()) = 'tech'
    and (
      profile_id = (select auth.uid())
      or (select private.is_task_assignee(task_id))
      or exists (
        select 1 from public.tasks t
        where t.id = task_id and t.created_by = (select auth.uid())
      )
    )
  );

-- A tech who created a task may set its assignees (same as the old single-column insert).
drop policy if exists task_assignees_tech_write on public.task_assignees;
create policy task_assignees_tech_write on public.task_assignees for insert to authenticated
  with check (
    (select private.current_user_role()) = 'tech'
    and exists (
      select 1 from public.tasks t
      where t.id = task_id and t.created_by = (select auth.uid())
    )
  );

drop policy if exists task_assignees_tech_delete on public.task_assignees;
create policy task_assignees_tech_delete on public.task_assignees for delete to authenticated
  using (
    (select private.current_user_role()) = 'tech'
    and exists (
      select 1 from public.tasks t
      where t.id = task_id and t.created_by = (select auth.uid())
    )
  );

grant select, insert, update, delete on public.task_assignees to authenticated, service_role;

-- Drop the single-assignee column only after the data has been copied.
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tasks' and column_name = 'assignee_id'
  ) then
    alter table public.tasks drop column assignee_id;
  end if;
end $$;

-- Root RFC Message-ID for the task's notification thread (Gmail threading).
alter table public.tasks add column if not exists email_message_id text;

-- Comments / notes on a task. Anyone who can see the task can read and add.
create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null default auth.uid(),
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists task_comments_task_idx on public.task_comments (task_id, created_at);

create or replace function private.can_view_task(p_task uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select
    private.is_staff()
    or exists (
      select 1 from public.tasks t
      where t.id = p_task and t.created_by = auth.uid()
    )
    or private.is_task_assignee(p_task)
$$;

grant execute on function private.can_view_task(uuid) to authenticated, service_role;

alter table public.task_comments enable row level security;

drop policy if exists task_comments_staff on public.task_comments;
create policy task_comments_staff on public.task_comments for all to authenticated
  using ((select private.is_staff()))
  with check ((select private.is_staff()));

drop policy if exists task_comments_tech_select on public.task_comments;
create policy task_comments_tech_select on public.task_comments for select to authenticated
  using (
    (select private.current_user_role()) = 'tech'
    and (select private.can_view_task(task_id))
  );

drop policy if exists task_comments_tech_insert on public.task_comments;
create policy task_comments_tech_insert on public.task_comments for insert to authenticated
  with check (
    (select private.current_user_role()) = 'tech'
    and (select private.can_view_task(task_id))
  );

grant select, insert, update, delete on public.task_comments to authenticated, service_role;

-- Force author_id from auth.uid() (same guarantee as notes / messages / photos).
create or replace function private.force_row_actor() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if tg_table_name = 'notes' then
    new.author_id := auth.uid();
  elsif tg_table_name = 'messages' then
    new.sent_by := auth.uid();
  elsif tg_table_name = 'photos' then
    new.uploaded_by := auth.uid();
  elsif tg_table_name = 'task_comments' then
    new.author_id := auth.uid();
  end if;
  return new;
end $$;

drop trigger if exists task_comments_force_actor on public.task_comments;
create trigger task_comments_force_actor
  before insert on public.task_comments
  for each row execute function private.force_row_actor();
