-- Log staff-sent schedule-notification emails on a ticket's history.
-- Nothing auto-sends; kind 'emailed' is written only after a staff member
-- reviews the compose dialog on the ticket page and clicks Send.
-- The kind check also allows 'price' so this migration is safe before or after
-- the service-request pricing migration (idempotent drop/recreate).

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
      and pg_get_constraintdef(c.oid) ilike '%kind in%'
  loop
    execute format('alter table public.service_request_events drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.service_request_events
  add constraint service_request_events_kind_check
  check (kind in (
    'created', 'note', 'status', 'linked', 'unlinked', 'assigned',
    'billable', 'scheduled', 'converted', 'resolved', 'closed', 'reopened',
    'emailed', 'price'
  ));
