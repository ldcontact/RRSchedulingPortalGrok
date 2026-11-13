-- Service price on a ticket, stored separately so field techs can never read it.
-- public.service_requests stays readable to the assigned tech; this table does not.
-- Do not add RLS policies on customers, projects, or jobs that staff queries evaluate.

create or replace function private.can_see_service_price() returns boolean
language sql stable security definer
set search_path = public, private
as $$
  select coalesce(private.current_user_role() in ('admin', 'manager', 'sales'), false);
$$;

revoke all on function private.can_see_service_price() from public, anon;
grant execute on function private.can_see_service_price() to authenticated, service_role;

create table public.service_request_pricing (
  service_request_id uuid primary key references public.service_requests (id) on delete cascade,
  amount             numeric(10,2) not null check (amount >= 0),
  currency           text not null default 'USD' check (currency = 'USD'),
  updated_by         uuid references public.profiles (id) on delete set null,
  updated_at         timestamptz not null default now()
);

create trigger service_request_pricing_updated before update on public.service_request_pricing
  for each row execute function private.set_updated_at();

alter table public.service_request_pricing enable row level security;

create policy service_request_pricing_office on public.service_request_pricing
  for all to authenticated
  using ((select private.can_see_service_price()))
  with check ((select private.can_see_service_price()));

grant select, insert, update, delete on public.service_request_pricing to authenticated;
revoke all on public.service_request_pricing from anon;

-- History kind 'price' (and 'emailed' if the schedule-email migration lands in either order).
alter table public.service_request_events drop constraint if exists service_request_events_kind_check;
alter table public.service_request_events
  add constraint service_request_events_kind_check
  check (kind in (
    'created', 'note', 'status', 'linked', 'unlinked', 'assigned',
    'billable', 'scheduled', 'converted', 'resolved', 'closed', 'reopened',
    'price', 'emailed'
  ));
