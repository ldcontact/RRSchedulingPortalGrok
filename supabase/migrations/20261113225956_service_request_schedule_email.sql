-- Log staff-sent schedule-notification emails on a ticket's history.
-- Nothing auto-sends; kind 'emailed' is written only after a staff member
-- reviews the compose dialog on the ticket page and clicks Send.
-- The kind check also allows 'price' so this migration is safe before or after
-- the service-request pricing migration (idempotent drop/recreate).
-- Prod may store the membership check as `kind = ANY (ARRAY[...])` rather than
-- `kind in (...)`, so drop by constraint name as well as either definition form.

do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'service_request_events'
      and c.contype = 'c'
      and (
        c.conname = 'service_request_events_kind_check'
        or pg_get_constraintdef(c.oid) ilike '%kind in%'
        or pg_get_constraintdef(c.oid) ilike '%kind = any%'
      )
  loop
    execute format('alter table public.service_request_events drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.service_request_events
  drop constraint if exists service_request_events_kind_check;

alter table public.service_request_events
  add constraint service_request_events_kind_check
  check (kind in (
    'created', 'note', 'status', 'linked', 'unlinked', 'assigned',
    'billable', 'scheduled', 'converted', 'resolved', 'closed', 'reopened',
    'emailed', 'price'
  ));
