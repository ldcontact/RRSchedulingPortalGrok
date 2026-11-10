-- Service requests (tickets): follow-up calls/emails about past work, e.g. a lamp that
-- failed 18 months after a retrofit. Kept separate from projects (the sold retrofit work).
--
--  * service_requests: one ticket per call/email (SR-#### numbers), optional link to the
--    ORIGINAL project, triage status, billable flag, office assignee, conversion target.
--  * service_request_events: internal notes + history timeline (staff only).
--  * jobs.kind (install | warranty | service) + jobs.service_request_id: a ticket's visit is a
--    normal job on the original project, tagged so it never changes that project's status,
--    dates or required-photo checklist.
--  * projects.warranty_months (default 24): warranty window from the project's completion.
--  * Auto-resolve: when a ticket's visit is completed/approved the ticket becomes Resolved;
--    if that visit is sent back/reopened the ticket returns to Scheduled; if the only live
--    visit is cancelled the ticket returns to Triaged.
-- Techs never see the inbox; they can read only the ticket behind a visit assigned to them.
-- Nothing in this feature sends email/texts.

-- ---------------------------------------------------------------- enums
create type public.job_kind as enum ('install', 'warranty', 'service');
create type public.sr_status as enum ('new', 'triaged', 'scheduled', 'resolved', 'closed', 'converted');
create type public.sr_channel as enum ('call', 'email', 'other');
create type public.sr_priority as enum ('low', 'normal', 'high');

-- ---------------------------------------------------------------- projects: warranty window
alter table public.projects
  add column warranty_months int not null default 24 check (warranty_months between 0 and 600);

-- ---------------------------------------------------------------- service_requests
create sequence public.service_request_number_seq start with 1001;

create table public.service_requests (
  id                    uuid primary key default gen_random_uuid(),
  number                int not null unique default nextval('public.service_request_number_seq'),
  customer_id           uuid not null references public.customers (id) on delete restrict,
  project_id            uuid references public.projects (id) on delete set null,   -- original project
  site_address          text,
  site_city             text,
  site_state            text,
  site_zip              text,
  contact_name          text,
  contact_phone         text,
  contact_email         text,
  channel               public.sr_channel not null default 'call',
  received_at           timestamptz not null default now(),
  summary               text not null check (length(trim(summary)) between 1 and 200),
  description           text not null default '' check (length(description) <= 5000),
  priority              public.sr_priority not null default 'normal',
  status                public.sr_status not null default 'new',
  billable              boolean not null default false,
  assignee_id           uuid references public.profiles (id) on delete set null,
  converted_project_id  uuid references public.projects (id) on delete set null,
  resolved_at           timestamptz,
  resolved_by           uuid references public.profiles (id) on delete set null,
  resolved_job_id       uuid,                                   -- visit that auto-resolved it
  created_by            uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
alter sequence public.service_request_number_seq owned by public.service_requests.number;
create index service_requests_status_received_idx on public.service_requests (status, received_at desc, id);
create index service_requests_received_idx on public.service_requests (received_at desc, id);
create index service_requests_customer_idx on public.service_requests (customer_id);
create index service_requests_project_idx on public.service_requests (project_id) where project_id is not null;
create index service_requests_assignee_idx on public.service_requests (assignee_id) where assignee_id is not null;
create trigger service_requests_updated before update on public.service_requests
  for each row execute function private.set_updated_at();

create table public.service_request_events (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.service_requests (id) on delete cascade,
  kind        text not null check (kind in ('created', 'note', 'status', 'linked', 'unlinked', 'assigned',
                                             'billable', 'scheduled', 'converted', 'resolved', 'closed', 'reopened')),
  body        text not null default '' check (length(body) <= 5000),
  actor_id    uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  check (kind <> 'note' or length(trim(body)) > 0)
);
create index service_request_events_request_idx on public.service_request_events (request_id, created_at);

-- ---------------------------------------------------------------- jobs: visit kind + ticket link
alter table public.jobs
  add column kind public.job_kind not null default 'install',
  add column service_request_id uuid references public.service_requests (id) on delete set null,
  add constraint jobs_ticket_visit_kind check (service_request_id is null or kind <> 'install');
create index jobs_service_request_idx on public.jobs (service_request_id) where service_request_id is not null;
alter table public.service_requests
  add constraint service_requests_resolved_job_fk foreign key (resolved_job_id) references public.jobs (id) on delete set null;

-- ---------------------------------------------------------------- project status ignores warranty/service visits
create or replace function private.sync_project_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  pid uuid := coalesce(new.project_id, old.project_id);
  cur public.project_status;
  nxt public.project_status;
begin
  select status into cur from public.projects where id = pid;
  if cur is null or cur = 'cancelled' then return null; end if;
  -- only the original install visits drive the project; warranty/service visits never
  -- reopen a Complete project or move it back into the active lists
  select case
           when bool_or(status = 'completed')   then 'awaiting_review'
           when bool_or(status = 'in_progress') then 'in_progress'
           when bool_or(status = 'scheduled')   then 'scheduled'
           when bool_or(status = 'approved')    then 'complete'
         end::public.project_status
    into nxt from public.jobs where project_id = pid and status <> 'cancelled' and kind = 'install';
  if nxt is not null and nxt <> cur then
    update public.projects set status = nxt, updated_at = now() where id = pid;
  end if;
  return null;
end $$;
drop trigger if exists jobs_sync_project on public.jobs;
create trigger jobs_sync_project after insert or delete or update of status, project_id, kind on public.jobs
  for each row execute function private.sync_project_status();

-- ---------------------------------------------------------------- job guard: techs can't retag a visit;
-- warranty/service visits skip the project's install checklist (photo + note still required)
create or replace function private.guard_job_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  missing text;
begin
  if auth.uid() is null or private.is_staff() then return new; end if;
  if not private.is_assigned_to_job(old.id) then raise exception 'not assigned to this job'; end if;
  if new.project_id <> old.project_id or new.title <> old.title or new.starts_at <> old.starts_at
     or new.ends_at <> old.ends_at or new.instructions is distinct from old.instructions
     or new.approved_at is distinct from old.approved_at or new.approved_by is distinct from old.approved_by
     or new.review_note is distinct from old.review_note
     or new.kind <> old.kind or new.service_request_id is distinct from old.service_request_id then
    raise exception 'techs can only update job progress';
  end if;
  if new.status <> old.status and not (
       (old.status = 'scheduled' and new.status = 'in_progress') or
       (old.status = 'in_progress' and new.status = 'completed')) then
    raise exception 'invalid status change for tech: % -> %', old.status, new.status;
  end if;
  if new.status = 'completed' and old.status <> 'completed' then
    if not exists (select 1 from public.notes where job_id = new.id) then
      raise exception 'add at least one completion photo and a note before submitting';
    end if;
    if new.kind = 'install' and exists (select 1 from public.project_photo_requirements where project_id = new.project_id) then
      select string_agg(r.label, ', ' order by r.sort_order, r.created_at)
        into missing
        from public.project_photo_requirements r
       where r.project_id = new.project_id
         and not exists (
           select 1 from public.photos p
            where p.job_id = new.id and p.kind = 'completion' and p.requirement_id = r.id
         );
      if missing is not null then
        raise exception 'missing required photos: %', missing;
      end if;
    elsif not exists (select 1 from public.photos where job_id = new.id and kind = 'completion') then
      raise exception 'add at least one completion photo and a note before submitting';
    end if;
    new.completed_at := now(); new.completed_by := auth.uid();
  end if;
  if new.status = 'in_progress' and old.status = 'scheduled' then new.started_at := now(); end if;
  return new;
end $$;

-- ---------------------------------------------------------------- actor columns can't be spoofed
create or replace function private.force_row_actor() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new; -- seed / service-role paths may set actor explicitly
  end if;
  if tg_table_name = 'notes' then
    new.author_id := auth.uid();
  elsif tg_table_name = 'messages' then
    new.sent_by := auth.uid();
  elsif tg_table_name = 'photos' then
    new.uploaded_by := auth.uid();
  elsif tg_table_name = 'service_request_events' then
    new.actor_id := auth.uid();
  elsif tg_table_name = 'service_requests' then
    new.created_by := auth.uid();
  end if;
  return new;
end $$;
create trigger service_request_events_force_actor before insert on public.service_request_events
  for each row execute function private.force_row_actor();
create trigger service_requests_force_actor before insert on public.service_requests
  for each row execute function private.force_row_actor();

-- ---------------------------------------------------------------- auto-resolve from the visit
create or replace function private.sync_service_request() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  sr public.service_requests;
begin
  if new.service_request_id is null then return null; end if;
  if tg_op = 'UPDATE' and new.status = old.status and new.service_request_id is not distinct from old.service_request_id then
    return null;
  end if;
  select * into sr from public.service_requests where id = new.service_request_id;
  if sr.id is null then return null; end if;
  if new.status in ('completed', 'approved') and sr.status in ('new', 'triaged', 'scheduled') then
    update public.service_requests
       set status = 'resolved', resolved_at = now(), resolved_by = auth.uid(), resolved_job_id = new.id
     where id = sr.id;
    insert into public.service_request_events (request_id, kind, body, actor_id)
    values (sr.id, 'resolved', format('Resolved automatically: visit “%s” was %s.', new.title,
            case when new.status = 'approved' then 'approved' else 'completed' end), auth.uid());
  elsif new.status in ('scheduled', 'in_progress') and sr.status = 'resolved' and sr.resolved_job_id = new.id then
    update public.service_requests
       set status = 'scheduled', resolved_at = null, resolved_by = null, resolved_job_id = null
     where id = sr.id;
    insert into public.service_request_events (request_id, kind, body, actor_id)
    values (sr.id, 'reopened', format('Visit “%s” was sent back or reopened, so the ticket is Scheduled again.', new.title), auth.uid());
  elsif new.status = 'cancelled' and sr.status = 'scheduled' and not exists (
          select 1 from public.jobs j where j.service_request_id = sr.id and j.id <> new.id and j.status <> 'cancelled') then
    update public.service_requests set status = 'triaged' where id = sr.id;
    insert into public.service_request_events (request_id, kind, body, actor_id)
    values (sr.id, 'status', format('Visit “%s” was cancelled, so the ticket is back to Triaged.', new.title), auth.uid());
  end if;
  return null;
end $$;
create trigger jobs_sync_service_request after insert or update of status, service_request_id on public.jobs
  for each row execute function private.sync_service_request();

-- ---------------------------------------------------------------- inbox view
-- security_invoker: the caller's RLS on every underlying table still applies.
-- Warranty is judged on the date the customer reported the issue (received_at):
-- completion = latest install visit completion once every live install visit is done.
create view public.service_request_list with (security_invoker = true) as
select
  sr.*,
  c.name                 as customer_name,
  p.name                 as project_name,
  p.type                 as project_type,
  p.status               as project_status,
  p.warranty_months      as warranty_months,
  pd.completed_at        as project_completed_at,
  case when pd.completed_at is not null
       then pd.completed_at + make_interval(months => p.warranty_months) end as warranty_expires_at,
  case when pd.completed_at is null then 'unknown'
       when sr.received_at <= pd.completed_at + make_interval(months => p.warranty_months) then 'in'
       else 'out' end    as warranty_state,
  a.full_name            as assignee_name,
  a.color                as assignee_color
from public.service_requests sr
join public.customers c on c.id = sr.customer_id
left join public.projects p on p.id = sr.project_id
left join lateral (
  select case when count(*) > 0 and bool_and(j.status in ('completed', 'approved'))
              then max(coalesce(j.completed_at, j.ends_at)) end as completed_at
    from public.jobs j
   where j.project_id = p.id and j.kind = 'install' and j.status <> 'cancelled'
) pd on true
left join public.profiles a on a.id = sr.assignee_id;

-- ---------------------------------------------------------------- RLS
create or replace function private.can_see_service_request(p_request uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select private.is_staff() or exists (
    select 1 from public.jobs j join public.job_assignments a on a.job_id = j.id
     where j.service_request_id = p_request and a.profile_id = auth.uid())
$$;

alter table public.service_requests       enable row level security;
alter table public.service_request_events enable row level security;

create policy service_requests_staff on public.service_requests for all to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));
-- techs: read-only, and only the ticket behind a visit assigned to them
create policy service_requests_tech_read on public.service_requests for select to authenticated
  using ((select private.is_staff()) or private.can_see_service_request(id));
create policy service_request_events_staff on public.service_request_events for all to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));

grant select, insert, update, delete on public.service_requests, public.service_request_events to authenticated;
grant select on public.service_request_list to authenticated;
grant usage, select on sequence public.service_request_number_seq to authenticated;
revoke all on public.service_requests, public.service_request_events, public.service_request_list from anon;
revoke all on sequence public.service_request_number_seq from anon;

revoke all on function private.can_see_service_request(uuid) from public, anon;
grant execute on function private.can_see_service_request(uuid) to authenticated, service_role;
revoke all on function private.sync_service_request() from public, anon, authenticated;
revoke all on function private.sync_project_status() from public, anon, authenticated;
revoke all on function private.guard_job_update() from public, anon, authenticated;
revoke all on function private.force_row_actor() from public, anon, authenticated;
