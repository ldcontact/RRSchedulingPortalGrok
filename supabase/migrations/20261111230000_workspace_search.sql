-- Quick Find / workspace search.
-- Customers and projects already have side-table docs + pg_trgm GIN indexes
-- (see 20261110230000_search_fields.sql). This migration only:
--   * guarantees projects.hcp_job_number exists (Housecall Pro job number;
--     some databases already have it from the import), then refreshes project_search
--     so typing "367" matches job #367 and numbers that contain it;
--   * adds trigram indexes on profiles.full_name and profiles.email for people search.
-- Additive; no existing rows or policies change. Do not run against production
-- from this branch unless Luke approves a later go-live.

alter table public.projects add column if not exists hcp_job_number text;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_trgm') then
    create schema if not exists extensions;
    create extension if not exists pg_trgm with schema extensions;
    execute 'create index if not exists profiles_full_name_trgm on public.profiles using gin (full_name extensions.gin_trgm_ops)';
    execute 'create index if not exists profiles_email_trgm     on public.profiles using gin (email extensions.gin_trgm_ops)';
  end if;
end $$;

-- Re-fill project_search so a newly added hcp_job_number lands in doc.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'refresh_project_search' and pronamespace = 'private'::regnamespace) then
    perform private.refresh_project_search(array(select id from public.projects));
    analyze public.project_search;
  end if;
end $$;
