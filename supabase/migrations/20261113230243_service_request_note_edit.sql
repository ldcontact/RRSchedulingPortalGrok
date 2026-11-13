-- Note edit/delete on service_request_events.
-- edited_at is stamped when a note body changes. History events stay append-only.

alter table public.service_request_events
  add column if not exists edited_at timestamptz;

drop policy if exists service_request_events_staff on public.service_request_events;

create policy service_request_events_select on public.service_request_events
  for select to authenticated
  using ((select private.is_staff()));

create policy service_request_events_insert on public.service_request_events
  for insert to authenticated
  with check ((select private.is_staff()));

-- Author or admin may edit a note. Kind/actor cannot be changed (trigger + with check).
create policy service_request_events_update on public.service_request_events
  for update to authenticated
  using (
    kind = 'note'
    and (select private.is_staff())
    and (
      actor_id = (select auth.uid())
      or (select private.is_admin())
    )
  )
  with check (
    kind = 'note'
    and actor_id is not distinct from (select actor_id from public.service_request_events x where x.id = service_request_events.id)
  );

-- Author always; others only if admin, or a manager with the Delete access toggle.
create policy service_request_events_delete on public.service_request_events
  for delete to authenticated
  using (
    kind = 'note'
    and (select private.is_staff())
    and (
      actor_id = (select auth.uid())
      or (select private.can_delete())
    )
  );

create or replace function private.guard_service_request_event_update()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.request_id is distinct from old.request_id
     or new.kind is distinct from old.kind
     or new.actor_id is distinct from old.actor_id
     or new.created_at is distinct from old.created_at then
    raise exception 'service request history cannot change its identity';
  end if;
  if old.kind is distinct from 'note' then
    raise exception 'only notes can be edited';
  end if;
  if new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists service_request_events_guard_update on public.service_request_events;
create trigger service_request_events_guard_update
  before update on public.service_request_events
  for each row execute function private.guard_service_request_event_update();

revoke all on function private.guard_service_request_event_update() from public, anon, authenticated;
