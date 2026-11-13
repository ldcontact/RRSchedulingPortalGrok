-- Sales reps see the whole pipeline, not only their own deals.
-- This replaces private.can_see_all_deals(), which previously returned only private.is_staff().
create or replace function private.can_see_all_deals() returns boolean
language sql stable security definer
set search_path = public, private
as $$
  select private.can_access_sales();
$$;
