-- Add the current RR Scheduler project types to public.project_type.
-- Existing rows keep their type (no rewrite).
--
-- Prod already has weatherization and audit in addition to the four values
-- from 20261030000001_init.sql; IF NOT EXISTS makes this safe on both.
-- ALTER TYPE ... ADD VALUE cannot use a new enum value in the same transaction,
-- so the ADD VALUE statements below never reference the new labels as enum
-- literals. The search-doc update compares p.type::text only.

alter type public.project_type add value if not exists 'whe_single_family';
alter type public.project_type add value if not exists 'whe_multifamily';
alter type public.project_type add value if not exists 'ac';
alter type public.project_type add value if not exists 'ptac_to_hpac';
alter type public.project_type add value if not exists 'weatherization';
alter type public.project_type add value if not exists 'steam_traps';
alter type public.project_type add value if not exists 'boiler_tune_up';
alter type public.project_type add value if not exists 'hot_water_controllers';
alter type public.project_type add value if not exists 'audit';

-- Include the display label and slug in project_search.doc (mock repo already does).
-- Safe in this transaction: case compares type::text, not a new enum literal.
do $body$
begin
  if not exists (
    select 1 from pg_proc
    where proname = 'refresh_project_search' and pronamespace = 'private'::regnamespace
  ) then
    return;
  end if;

  execute $fn$
    create or replace function private.refresh_project_search(p_ids uuid[]) returns void
    language plpgsql security definer set search_path = '' as $f$
    begin
      if p_ids is null or cardinality(p_ids) = 0 then return; end if;
      insert into public.project_search as t (project_id, customer_id, doc, digits)
      select p.id, p.customer_id,
             private.search_norm(concat_ws(' ', p.name, j->>'hcp_job_number', j->>'site_address', j->>'site_city', j->>'site_state', j->>'site_zip',
                                           case p.type::text
                                             when 'lighting' then 'led lighting lighting'
                                             when 'hvac' then 'hvac'
                                             when 'lighting_hvac' then 'lighting + hvac lighting hvac'
                                             when 'whe_single_family' then 'whole home electric single family whe single family'
                                             when 'whe_multifamily' then 'whole home electric multifamily whe multifamily'
                                             when 'ac' then 'ac'
                                             when 'ptac_to_hpac' then 'ptac to hpac'
                                             when 'weatherization' then 'weatherization'
                                             when 'steam_traps' then 'steam traps'
                                             when 'boiler_tune_up' then 'boiler tune up'
                                             when 'hot_water_controllers' then 'hot water controllers'
                                             when 'audit' then 'audit'
                                             when 'other' then 'other'
                                             else replace(p.type::text, '_', ' ')
                                           end,
                                           cs.doc, p.scope)),
             coalesce(cs.digits, '')
        from public.projects p
        cross join lateral (select to_jsonb(p) as j) x
        left join public.customer_search cs on cs.customer_id = p.customer_id
       where p.id = any (p_ids)
      on conflict (project_id) do update set customer_id = excluded.customer_id, doc = excluded.doc, digits = excluded.digits
       where (t.customer_id, t.doc, t.digits)
             is distinct from (excluded.customer_id, excluded.doc, excluded.digits);
    end $f$;
  $fn$;

  perform private.refresh_project_search(array(select id from public.projects));
  execute 'analyze public.project_search';
end
$body$;
