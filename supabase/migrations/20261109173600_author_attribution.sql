-- Force note/message/photo actor columns from auth.uid() so clients can't spoof
-- or omit the logger. Column defaults already use auth.uid(); this trigger is the
-- hard guarantee on every insert when a JWT is present.

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
  end if;
  return new;
end $$;

drop trigger if exists notes_force_actor on public.notes;
create trigger notes_force_actor
  before insert on public.notes
  for each row execute function private.force_row_actor();

drop trigger if exists messages_force_actor on public.messages;
create trigger messages_force_actor
  before insert on public.messages
  for each row execute function private.force_row_actor();

drop trigger if exists photos_force_actor on public.photos;
create trigger photos_force_actor
  before insert on public.photos
  for each row execute function private.force_row_actor();

revoke all on function private.force_row_actor() from public, anon, authenticated;
