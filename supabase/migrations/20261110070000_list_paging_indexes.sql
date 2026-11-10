-- Indexes for the paged Customers / Projects tabs (server-side range + exact count + search).
-- Additive only; no data or policy changes. NOT applied to production yet.
-- With ~5k customers / ~8k projects Postgres is fast without these, but they keep the
-- ORDER BY ... LIMIT 50 page queries and ilike searches index-backed as the data grows.

-- page ordering (stable tie-break on id)
create index if not exists customers_name_id_idx       on public.customers (name, id);
create index if not exists customers_created_id_idx    on public.customers (created_at desc, id);
create index if not exists projects_updated_id_idx     on public.projects (updated_at desc, id);
create index if not exists projects_status_updated_idx on public.projects (status, updated_at desc, id);
create index if not exists projects_created_id_idx     on public.projects (created_at desc, id);
create index if not exists projects_name_id_idx        on public.projects (name, id);

-- substring search (ilike '%term%') via trigram GIN indexes, when pg_trgm is available
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_trgm') then
    create schema if not exists extensions;
    create extension if not exists pg_trgm with schema extensions;
    execute 'create index if not exists customers_name_trgm  on public.customers using gin (name extensions.gin_trgm_ops)';
    execute 'create index if not exists customers_city_trgm  on public.customers using gin (city extensions.gin_trgm_ops)';
    execute 'create index if not exists customers_email_trgm on public.customers using gin (email extensions.gin_trgm_ops)';
    execute 'create index if not exists customers_phone_trgm on public.customers using gin (phone extensions.gin_trgm_ops)';
    execute 'create index if not exists projects_name_trgm   on public.projects  using gin (name extensions.gin_trgm_ops)';
    execute 'create index if not exists projects_scope_trgm  on public.projects  using gin (scope extensions.gin_trgm_ops)';
  end if;
end $$;
