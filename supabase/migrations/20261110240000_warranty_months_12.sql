-- Default warranty is 12 months (was 24). Existing projects that still have the
-- previous default of 24 are updated to 12; any customized length is left alone.
--
-- public.projects has a BEFORE UPDATE trigger (projects_updated) that stamps
-- updated_at = now(). The Projects list is ordered by updated_at, so that trigger
-- is disabled for the backfill. projects_search_upd would also fire, but
-- warranty_months is not part of project_search.doc, so a refresh would be a
-- no-op rewrite of every search row — it is disabled for the same update and
-- re-enabled afterward.

alter table public.projects alter column warranty_months set default 12;

alter table public.projects disable trigger projects_updated;
alter table public.projects disable trigger projects_search_upd;

update public.projects
set warranty_months = 12
where warranty_months = 24;

alter table public.projects enable trigger projects_updated;
alter table public.projects enable trigger projects_search_upd;
