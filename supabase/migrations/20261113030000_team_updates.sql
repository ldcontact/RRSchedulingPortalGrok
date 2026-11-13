-- Team Updates: Monday-style Q&A threads on deals and projects.
-- Imported Monday item updates land in the same table (idempotent on monday_update_id).
-- Live posts can mention teammates, attach files, and notify involved internal staff.
-- Never adds RLS policies on customers, projects, or jobs.

create table public.team_updates (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references public.sales_deals (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  parent_id uuid references public.team_updates (id) on delete cascade,
  monday_update_id text unique,
  author_id uuid references public.profiles (id) on delete set null,
  author_name text not null,
  author_email text,
  body text not null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  constraint team_updates_body_len check (char_length(body) between 0 and 20000),
  constraint team_updates_has_target check (deal_id is not null or project_id is not null)
);

create index team_updates_deal_idx on public.team_updates (deal_id, created_at desc) where deal_id is not null;
create index team_updates_project_idx on public.team_updates (project_id, created_at desc) where project_id is not null;
create index team_updates_parent_idx on public.team_updates (parent_id, created_at) where parent_id is not null;
create index team_updates_author_idx on public.team_updates (author_id) where author_id is not null;

create table public.team_update_assets (
  id uuid primary key default gen_random_uuid(),
  update_id uuid not null references public.team_updates (id) on delete cascade,
  name text not null,
  mime text,
  size_bytes integer,
  storage_path text,
  url text,
  monday_asset_id text,
  created_at timestamptz not null default now(),
  constraint team_update_assets_name_len check (char_length(name) between 1 and 255)
);
create index team_update_assets_update_idx on public.team_update_assets (update_id);

create table public.team_update_mentions (
  update_id uuid not null references public.team_updates (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  primary key (update_id, profile_id)
);

create table public.team_update_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  update_id uuid not null references public.team_updates (id) on delete cascade,
  kind text not null check (kind in ('mention', 'thread', 'owner', 'assignee')),
  title text not null,
  body text not null default '',
  link text not null,
  read_at timestamptz,
  email_sent_at timestamptz,
  email_skipped text,
  created_at timestamptz not null default now(),
  unique (user_id, update_id)
);
create index team_update_notifications_unread_idx
  on public.team_update_notifications (user_id, created_at desc)
  where read_at is null;
create index team_update_notifications_user_idx
  on public.team_update_notifications (user_id, created_at desc);

-- Visibility: sales staff see deal threads; anyone who can already see the
-- project (staff, or a tech assigned to a visit) sees project threads.
-- SECURITY DEFINER so techs can read converted-deal history without a
-- SELECT policy on sales_deals, customers, projects, or jobs.
create or replace function private.can_view_team_update(p_deal_id uuid, p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    (p_deal_id is not null and private.can_access_sales())
    or (p_project_id is not null and private.can_see_project(p_project_id));
$$;

create or replace function private.can_view_team_update_id(p_update_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.team_updates u
     where u.id = p_update_id
       and private.can_view_team_update(u.deal_id, u.project_id)
  );
$$;

grant execute on function private.can_view_team_update(uuid, uuid) to authenticated, service_role;
grant execute on function private.can_view_team_update_id(uuid) to authenticated, service_role;

create or replace function private.fill_team_update_links()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent public.team_updates%rowtype;
begin
  if new.parent_id is not null then
    select * into parent from public.team_updates where id = new.parent_id;
    if not found then
      raise exception 'parent update not found';
    end if;
    if parent.deleted_at is not null then
      raise exception 'cannot reply to a deleted update';
    end if;
    if parent.parent_id is not null then
      raise exception 'replies cannot be nested more than one level';
    end if;
    new.deal_id := coalesce(new.deal_id, parent.deal_id);
    new.project_id := coalesce(new.project_id, parent.project_id);
  end if;
  if new.deal_id is not null and new.project_id is null then
    select converted_project_id into new.project_id from public.sales_deals where id = new.deal_id;
  elsif new.project_id is not null and new.deal_id is null then
    select id into new.deal_id from public.sales_deals where converted_project_id = new.project_id limit 1;
  end if;
  if new.deal_id is null and new.project_id is null then
    raise exception 'update must belong to a deal or a project';
  end if;
  return new;
end;
$$;

drop trigger if exists team_updates_fill_links on public.team_updates;
create trigger team_updates_fill_links
  before insert on public.team_updates
  for each row execute function private.fill_team_update_links();

create or replace function private.sync_team_updates_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.converted_project_id is not distinct from old.converted_project_id then
    return new;
  end if;
  update public.team_updates
     set project_id = new.converted_project_id
   where deal_id = new.id;
  return new;
end;
$$;

drop trigger if exists sales_deals_sync_team_updates on public.sales_deals;
create trigger sales_deals_sync_team_updates
  after update of converted_project_id on public.sales_deals
  for each row execute function private.sync_team_updates_project();

alter table public.team_updates enable row level security;
alter table public.team_update_assets enable row level security;
alter table public.team_update_mentions enable row level security;
alter table public.team_update_notifications enable row level security;

-- Simple, initplan-wrapped policies. No new policies on customers, projects, or jobs.
create policy team_updates_select on public.team_updates
  for select to authenticated
  using ((select private.can_view_team_update(deal_id, project_id)));

create policy team_updates_insert on public.team_updates
  for insert to authenticated
  with check (
    (select private.can_view_team_update(deal_id, project_id))
    and author_id = (select auth.uid())
  );

-- Edit your own (live) posts. Soft-delete is handled by the RPC so we can
-- also allow admins / managers-with-delete to clear other people's posts.
create policy team_updates_update on public.team_updates
  for update to authenticated
  using (
    (author_id = (select auth.uid()) and deleted_at is null)
    or (select private.can_delete())
  )
  with check (
    author_id is not distinct from (select author_id from public.team_updates x where x.id = team_updates.id)
  );

create policy team_update_assets_select on public.team_update_assets
  for select to authenticated
  using ((select private.can_view_team_update_id(update_id)));

create policy team_update_assets_insert on public.team_update_assets
  for insert to authenticated
  with check ((select private.can_view_team_update_id(update_id)));

create policy team_update_mentions_select on public.team_update_mentions
  for select to authenticated
  using ((select private.can_view_team_update_id(update_id)));

create policy team_update_mentions_insert on public.team_update_mentions
  for insert to authenticated
  with check ((select private.can_view_team_update_id(update_id)));

create policy team_update_notifications_select on public.team_update_notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy team_update_notifications_update on public.team_update_notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update, delete on
  public.team_updates,
  public.team_update_assets,
  public.team_update_mentions,
  public.team_update_notifications
  to authenticated, service_role;

-- Recipients: @mentions, deal owner or project assignees, and everyone who
-- already posted in the thread. Internal portal users only (never customers).
create or replace function private.team_update_recipient_ids(p_update public.team_updates, p_mention_ids uuid[])
returns table (user_id uuid, kind text)
language sql
stable
security definer
set search_path = public
as $$
  with candidates as (
    select m, 'mention'::text as kind
      from unnest(coalesce(p_mention_ids, '{}')) m
    union all
    select u.author_id, 'thread'
      from public.team_updates u
     where u.author_id is not null
       and u.deleted_at is null
       and (
         u.id = p_update.parent_id
         or u.parent_id = coalesce(p_update.parent_id, p_update.id)
         or u.id = p_update.id
       )
    union all
    select d.owner_id, 'owner'
      from public.sales_deals d
     where d.id = p_update.deal_id and d.owner_id is not null
    union all
    select a.profile_id, 'assignee'
      from public.jobs j
      join public.job_assignments a on a.job_id = j.id
     where j.project_id = p_update.project_id
  ),
  ranked as (
    select c.m as user_id, c.kind,
           row_number() over (
             partition by c.m
             order by case c.kind
               when 'mention' then 1
               when 'thread' then 2
               when 'owner' then 3
               else 4
             end
           ) as rn
      from candidates c
      join public.profiles p on p.id = c.m
     where p.role in ('admin', 'manager', 'sales', 'tech')
       and p.deleted_at is null
       and p.active
       and c.m is distinct from p_update.author_id
  )
  select user_id, kind from ranked where rn = 1;
$$;

create or replace function public.post_team_update(
  p_deal_id uuid,
  p_project_id uuid,
  p_parent_id uuid,
  p_body text,
  p_mention_ids uuid[] default '{}'
)
returns public.team_updates
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := (select auth.uid());
  me public.profiles%rowtype;
  rec public.team_updates;
  mentions uuid[] := coalesce(p_mention_ids, '{}');
  rid uuid;
  rkind text;
  ctx_title text;
  link text;
  preview text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into me from public.profiles where id = uid and deleted_at is null;
  if not found then raise exception 'profile not found'; end if;
  if length(trim(coalesce(p_body, ''))) < 1 then raise exception 'body is required'; end if;

  insert into public.team_updates (deal_id, project_id, parent_id, author_id, author_name, author_email, body)
  values (p_deal_id, p_project_id, p_parent_id, uid, me.full_name, me.email, trim(p_body))
  returning * into rec;

  if not private.can_view_team_update(rec.deal_id, rec.project_id) then
    delete from public.team_updates where id = rec.id;
    raise exception 'not allowed to post here';
  end if;

  insert into public.team_update_mentions (update_id, profile_id)
  select rec.id, p.id
    from unnest(mentions) m
    join public.profiles p on p.id = m
   where p.role in ('admin', 'manager', 'sales', 'tech')
     and p.deleted_at is null
  on conflict do nothing;

  if rec.deal_id is not null then
    select title into ctx_title from public.sales_deals where id = rec.deal_id;
  end if;
  if ctx_title is null and rec.project_id is not null then
    select name into ctx_title from public.projects where id = rec.project_id;
  end if;
  ctx_title := coalesce(ctx_title, 'Update');
  if rec.project_id is not null then
    link := '/projects/' || rec.project_id || '#update-' || rec.id;
  else
    link := '/sales/deals/' || rec.deal_id || '#update-' || rec.id;
  end if;
  -- Prefer the deal link for sales-only threads; when both exist, keep the
  -- project link so techs and managers can open it after conversion.
  if rec.deal_id is not null and rec.project_id is null then
    link := '/sales/deals/' || rec.deal_id || '#update-' || rec.id;
  end if;
  preview := left(trim(rec.body), 240);

  for rid, rkind in
    select r.user_id, r.kind from private.team_update_recipient_ids(rec, mentions) r
  loop
    insert into public.team_update_notifications (user_id, update_id, kind, title, body, link)
    values (
      rid,
      rec.id,
      rkind,
      case rkind
        when 'mention' then me.full_name || ' mentioned you on ' || ctx_title
        when 'thread' then me.full_name || ' replied on ' || ctx_title
        else me.full_name || ' posted an update on ' || ctx_title
      end,
      preview,
      case
        when rkind in ('assignee') and rec.project_id is not null
          then '/projects/' || rec.project_id || '#update-' || rec.id
        when rec.deal_id is not null and rkind in ('owner', 'mention', 'thread')
          then case
            when exists (select 1 from public.profiles p where p.id = rid and p.role = 'tech') and rec.project_id is not null
              then '/projects/' || rec.project_id || '#update-' || rec.id
            when rec.deal_id is not null
              then '/sales/deals/' || rec.deal_id || '#update-' || rec.id
            else link
          end
        else link
      end
    )
    on conflict (user_id, update_id) do nothing;
  end loop;

  return rec;
end;
$$;

create or replace function public.edit_team_update(p_id uuid, p_body text, p_mention_ids uuid[] default null)
returns public.team_updates
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := (select auth.uid());
  rec public.team_updates;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if length(trim(coalesce(p_body, ''))) < 1 then raise exception 'body is required'; end if;
  select * into rec from public.team_updates where id = p_id;
  if not found then raise exception 'update not found'; end if;
  if rec.deleted_at is not null then raise exception 'update is deleted'; end if;
  if rec.author_id is distinct from uid then raise exception 'you can only edit your own update'; end if;
  update public.team_updates
     set body = trim(p_body), edited_at = now()
   where id = p_id
   returning * into rec;
  if p_mention_ids is not null then
    delete from public.team_update_mentions where update_id = p_id;
    insert into public.team_update_mentions (update_id, profile_id)
    select p_id, p.id
      from unnest(p_mention_ids) m
      join public.profiles p on p.id = m
     where p.role in ('admin', 'manager', 'sales', 'tech')
       and p.deleted_at is null
    on conflict do nothing;
  end if;
  return rec;
end;
$$;

create or replace function public.delete_team_update(p_id uuid)
returns public.team_updates
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := (select auth.uid());
  rec public.team_updates;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into rec from public.team_updates where id = p_id;
  if not found then raise exception 'update not found'; end if;
  if rec.deleted_at is not null then return rec; end if;
  if rec.author_id is distinct from uid and not private.can_delete() then
    raise exception 'not allowed to delete this update';
  end if;
  update public.team_updates
     set deleted_at = now(), body = rec.body
   where id = p_id
   returning * into rec;
  return rec;
end;
$$;

create or replace function public.mark_team_update_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := (select auth.uid());
  n integer;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  update public.team_update_notifications
     set read_at = now()
   where user_id = uid
     and read_at is null
     and (p_ids is null or id = any (p_ids));
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.attach_team_update_asset(
  p_update_id uuid,
  p_name text,
  p_mime text default null,
  p_size_bytes integer default null,
  p_storage_path text default null,
  p_url text default null,
  p_monday_asset_id text default null
)
returns public.team_update_assets
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := (select auth.uid());
  rec public.team_updates;
  asset public.team_update_assets;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into rec from public.team_updates where id = p_update_id;
  if not found then raise exception 'update not found'; end if;
  if not private.can_view_team_update(rec.deal_id, rec.project_id) then
    raise exception 'not allowed';
  end if;
  if rec.author_id is distinct from uid and rec.monday_update_id is null then
    -- Only the author (or the importer via service_role, which bypasses this RPC) may attach.
    raise exception 'only the author can attach files';
  end if;
  insert into public.team_update_assets (update_id, name, mime, size_bytes, storage_path, url, monday_asset_id)
  values (p_update_id, p_name, p_mime, p_size_bytes, p_storage_path, p_url, p_monday_asset_id)
  returning * into asset;
  return asset;
end;
$$;

grant execute on function public.post_team_update(uuid, uuid, uuid, text, uuid[]) to authenticated;
grant execute on function public.edit_team_update(uuid, text, uuid[]) to authenticated;
grant execute on function public.delete_team_update(uuid) to authenticated;
grant execute on function public.mark_team_update_notifications_read(uuid[]) to authenticated;
grant execute on function public.attach_team_update_asset(uuid, text, text, integer, text, text, text) to authenticated;
-- service role may import without notify via direct inserts
grant execute on function public.post_team_update(uuid, uuid, uuid, text, uuid[]) to service_role;
grant execute on function public.edit_team_update(uuid, text, uuid[]) to service_role;
grant execute on function public.delete_team_update(uuid) to service_role;
grant execute on function public.attach_team_update_asset(uuid, text, text, integer, text, text, text) to service_role;

-- Unread count for the header bell. Keeps existing badge keys.
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
    ),
    'unread_updates', (
      select count(*)::int from public.team_update_notifications n
      where n.user_id = (select auth.uid()) and n.read_at is null
    )
  );
$$;

revoke all on function public.nav_badges() from public, anon;
grant execute on function public.nav_badges() to authenticated;

insert into storage.buckets (id, name, public) values ('team-updates', 'team-updates', false)
  on conflict (id) do nothing;

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit'
  ) then
    update storage.buckets
       set file_size_limit = 26214400,
           allowed_mime_types = array[
             'application/pdf',
             'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
             'application/vnd.ms-excel',
             'application/msword',
             'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
             'text/csv',
             'application/csv',
             'image/jpeg',
             'image/png',
             'image/webp',
             'image/gif',
             'image/heic',
             'image/heif'
           ]
     where id = 'team-updates';
  end if;
end $$;

-- Path: {update_id}/{uuid}-filename. No policies added on customers, projects, or jobs.
drop policy if exists team_updates_obj_read on storage.objects;
create policy team_updates_obj_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'team-updates'
    and private.can_view_team_update_id(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists team_updates_obj_write on storage.objects;
create policy team_updates_obj_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'team-updates'
    and private.can_view_team_update_id(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists team_updates_obj_delete on storage.objects;
create policy team_updates_obj_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'team-updates'
    and (
      (select private.can_delete())
      or private.can_view_team_update_id(((storage.foldername(name))[1])::uuid)
    )
  );

-- Author (or service role) can read who should be emailed for a post they just made.
-- Emails themselves are sent by the app mailer, one per event, staff addresses only.
create or replace function public.team_update_notify_targets(p_update_id uuid)
returns table (email text, kind text, link text)
language sql
stable
security definer
set search_path = public
as $$
  select p.email, n.kind, n.link
    from public.team_update_notifications n
    join public.team_updates u on u.id = n.update_id
    join public.profiles p on p.id = n.user_id
   where n.update_id = p_update_id
     and p.email is not null
     and p.role in ('admin', 'manager', 'sales', 'tech')
     and p.deleted_at is null
     and (
       u.author_id = (select auth.uid())
       or (select auth.uid()) is null
     );
$$;
grant execute on function public.team_update_notify_targets(uuid) to authenticated, service_role;
