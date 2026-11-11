-- Geocode columns for the tables that hold a service address.
-- Visit and project sites use the customer address (projects have no address of their own).
-- Service requests can have a different site address, so they get the same columns.
-- Do not apply this to production until Luke approves.

alter table public.customers
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists geocoded_at timestamptz,
  add column if not exists geocode_status text;

alter table public.customers
  drop constraint if exists customers_geocode_status_check;
alter table public.customers
  add constraint customers_geocode_status_check
    check (geocode_status is null or geocode_status in ('matched', 'no_match', 'tie', 'error'));

alter table public.service_requests
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists geocoded_at timestamptz,
  add column if not exists geocode_status text;

alter table public.service_requests
  drop constraint if exists service_requests_geocode_status_check;
alter table public.service_requests
  add constraint service_requests_geocode_status_check
    check (geocode_status is null or geocode_status in ('matched', 'no_match', 'tie', 'error'));

create index if not exists customers_geocode_pending_idx
  on public.customers (id)
  where coalesce(trim(address), '') <> ''
    and lat is null
    and (geocode_status is null or geocode_status = 'error');

create index if not exists service_requests_geocode_pending_idx
  on public.service_requests (id)
  where coalesce(trim(site_address), '') <> ''
    and lat is null
    and (geocode_status is null or geocode_status = 'error');
