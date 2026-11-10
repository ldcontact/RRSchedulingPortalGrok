-- Customers / Projects search: name, contact first/last name, address, phone (digits-only).
-- Additive only: two side tables kept in sync by triggers. No existing rows or policies change,
-- and customers/projects rows are never touched (so projects.updated_at ordering is unaffected).
--
--   customer_search(customer_id, doc, digits)
--   project_search(project_id, customer_id, doc, digits)
--
-- doc    = lower-cased text: customer name, company, email, phone, address/city/state/zip, tags,
--          HCP first/last/display name + extra emails/phones + additional addresses, and every
--          contact's name/email/phone. project_search.doc adds the project name, scope, HCP job
--          number and job-site address in front of its customer's doc.
-- digits = every phone number reduced to digits (US leading 1 dropped), space separated, so
--          '(847) 555-0174', '847-555-0174' and '8475550174' all match "digits ilike '%8475550174%'"
--          and a partial run never spans two numbers.
-- The app filters with an inner embed: customers?select=...,customer_search!inner()&customer_search.doc=ilike.*term*
-- RLS on the side tables mirrors the parents (staff see all; techs only what they can already see),
-- and the parent table's own RLS still applies to every query.
-- Columns from the HCP import migration (company, extra, hcp_job_number, site_*) are read through
-- to_jsonb(row) so this migration also applies to a database without them.

-- ---------------------------------------------------------------- helpers
create or replace function private.search_norm(t text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select coalesce(lower(regexp_replace(trim(t), '\s+', ' ', 'g')), '')
$$;

create or replace function private.phone_digits(t text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select case when d = '' then null
              when length(d) = 11 and left(d, 1) = '1' then substr(d, 2)
              else d end
  from (select regexp_replace(coalesce(t, ''), '\D', '', 'g') as d) x
$$;

-- ---------------------------------------------------------------- tables
create table public.customer_search (
  customer_id uuid primary key references public.customers (id) on delete cascade,
  doc         text not null default '',
  digits      text not null default ''
);
create table public.project_search (
  project_id  uuid primary key references public.projects (id) on delete cascade,
  customer_id uuid not null,
  doc         text not null default '',
  digits      text not null default ''
);
create index project_search_customer_idx on public.project_search (customer_id);

alter table public.customer_search enable row level security;
alter table public.project_search  enable row level security;
-- Same visibility as can_see_customer()/can_see_project(), but computed once per statement
-- (hashed sub-select) instead of once per row, so a tech's search adds no per-row RLS cost.
create or replace function private.my_customer_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct p.customer_id from public.projects p
    join public.jobs j on j.project_id = p.id
    join public.job_assignments a on a.job_id = j.id
   where a.profile_id = auth.uid()
$$;
create or replace function private.my_project_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct j.project_id from public.jobs j
    join public.job_assignments a on a.job_id = j.id
   where a.profile_id = auth.uid()
$$;
revoke all on function private.my_customer_ids() from public, anon;
revoke all on function private.my_project_ids() from public, anon;
grant execute on function private.my_customer_ids(), private.my_project_ids() to authenticated, service_role;

create policy customer_search_read on public.customer_search for select to authenticated
  using ((select private.is_staff()) or customer_id in (select private.my_customer_ids()));
create policy project_search_read on public.project_search for select to authenticated
  using ((select private.is_staff()) or project_id in (select private.my_project_ids()));
-- read-only for app users; only the sync triggers (table owner) write
revoke all on public.customer_search, public.project_search from anon, authenticated;
grant select on public.customer_search, public.project_search to authenticated;
grant all on public.customer_search, public.project_search to service_role;

-- ---------------------------------------------------------------- builders
create or replace function private.refresh_customer_search(p_ids uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_ids is null or cardinality(p_ids) = 0 then return; end if;
  insert into public.customer_search as t (customer_id, doc, digits)
  select c.id,
         private.search_norm(concat_ws(' ',
           c.name, j->>'company', c.email, c.phone, c.address, c.city, c.state, c.zip, array_to_string(c.tags, ' '),
           j#>>'{extra,hcp,First Name}', j#>>'{extra,hcp,Last Name}', j#>>'{extra,hcp,Display Name}',
           j#>>'{extra,hcp,Additional Emails}', j#>>'{extra,hcp,Mobile Number}', j#>>'{extra,hcp,Home Number}', j#>>'{extra,hcp,Work Number}',
           (select string_agg(v #>> '{}', ' ') from jsonb_path_query(coalesce(j#>'{extra,additional_addresses}', '[]'::jsonb), 'strict $.**') v
             where jsonb_typeof(v) = 'string'),
           k.names)),
         concat_ws(' ', private.phone_digits(c.phone), private.phone_digits(j#>>'{extra,hcp,Mobile Number}'),
           private.phone_digits(j#>>'{extra,hcp,Home Number}'), private.phone_digits(j#>>'{extra,hcp,Work Number}'), k.digits)
    from public.customers c
    cross join lateral (select to_jsonb(c) as j) x
    left join lateral (
      select string_agg(concat_ws(' ', ct.name, ct.email, ct.phone), ' ') as names,
             string_agg(private.phone_digits(ct.phone), ' ') as digits
        from public.contacts ct where ct.customer_id = c.id) k on true
   where c.id = any (p_ids)
  on conflict (customer_id) do update set doc = excluded.doc, digits = excluded.digits
   where (t.doc, t.digits) is distinct from (excluded.doc, excluded.digits);

  perform private.refresh_project_search(array(select p.id from public.projects p where p.customer_id = any (p_ids)));
end $$;

create or replace function private.refresh_project_search(p_ids uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_ids is null or cardinality(p_ids) = 0 then return; end if;
  insert into public.project_search as t (project_id, customer_id, doc, digits)
  select p.id, p.customer_id,
         private.search_norm(concat_ws(' ', p.name, j->>'hcp_job_number', j->>'site_address', j->>'site_city', j->>'site_state', j->>'site_zip',
                                       cs.doc, p.scope)),
         coalesce(cs.digits, '')
    from public.projects p
    cross join lateral (select to_jsonb(p) as j) x
    left join public.customer_search cs on cs.customer_id = p.customer_id
   where p.id = any (p_ids)
  on conflict (project_id) do update set customer_id = excluded.customer_id, doc = excluded.doc, digits = excluded.digits
   where (t.customer_id, t.doc, t.digits)
         is distinct from (excluded.customer_id, excluded.doc, excluded.digits);
end $$;

-- ---------------------------------------------------------------- sync triggers (statement level, set based)
create or replace function private.customer_search_sync() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.refresh_customer_search(array(select id from new_rows));
  return null;
end $$;

create or replace function private.contact_search_sync() returns trigger
language plpgsql security definer set search_path = '' as $$
declare ids uuid[];
begin
  if tg_op = 'INSERT' then ids := array(select distinct customer_id from new_rows);
  elsif tg_op = 'DELETE' then ids := array(select distinct customer_id from old_rows);
  else ids := array(select customer_id from new_rows union select customer_id from old_rows);
  end if;
  -- a contact deleted by a customer cascade has no customer left: refresh skips it
  perform private.refresh_customer_search(ids);
  return null;
end $$;

create or replace function private.project_search_sync() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.refresh_project_search(array(select id from new_rows));
  return null;
end $$;

create trigger customers_search_ins after insert on public.customers referencing new table as new_rows
  for each statement execute function private.customer_search_sync();
create trigger customers_search_upd after update on public.customers referencing new table as new_rows
  for each statement execute function private.customer_search_sync();
create trigger contacts_search_ins after insert on public.contacts referencing new table as new_rows
  for each statement execute function private.contact_search_sync();
create trigger contacts_search_upd after update on public.contacts referencing old table as old_rows new table as new_rows
  for each statement execute function private.contact_search_sync();
create trigger contacts_search_del after delete on public.contacts referencing old table as old_rows
  for each statement execute function private.contact_search_sync();
create trigger projects_search_ins after insert on public.projects referencing new table as new_rows
  for each statement execute function private.project_search_sync();
create trigger projects_search_upd after update on public.projects referencing new table as new_rows
  for each statement execute function private.project_search_sync();

revoke all on function private.refresh_customer_search(uuid[]) from public, anon, authenticated;
revoke all on function private.refresh_project_search(uuid[]) from public, anon, authenticated;
revoke all on function private.customer_search_sync() from public, anon, authenticated;
revoke all on function private.contact_search_sync() from public, anon, authenticated;
revoke all on function private.project_search_sync() from public, anon, authenticated;
grant execute on function private.search_norm(text), private.phone_digits(text) to authenticated, service_role;

-- ---------------------------------------------------------------- backfill (reads only; writes only the new tables)
do $$ begin perform private.refresh_customer_search(array(select id from public.customers)); end $$;
-- projects whose customer had no row yet are covered above; this catches any stragglers
do $$ begin
  perform private.refresh_project_search(array(select p.id from public.projects p
    where not exists (select 1 from public.project_search s where s.project_id = p.id)));
end $$;

-- ---------------------------------------------------------------- trigram indexes (ilike '%term%')
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_trgm') then
    create schema if not exists extensions;
    create extension if not exists pg_trgm with schema extensions;
    execute 'create index if not exists customer_search_doc_trgm    on public.customer_search using gin (doc extensions.gin_trgm_ops)';
    execute 'create index if not exists customer_search_digits_trgm on public.customer_search using gin (digits extensions.gin_trgm_ops)';
    execute 'create index if not exists project_search_doc_trgm     on public.project_search  using gin (doc extensions.gin_trgm_ops)';
    execute 'create index if not exists project_search_digits_trgm  on public.project_search  using gin (digits extensions.gin_trgm_ops)';
  end if;
end $$;
analyze public.customer_search;
analyze public.project_search;
