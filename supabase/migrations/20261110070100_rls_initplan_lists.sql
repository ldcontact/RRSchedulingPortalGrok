-- Speed up RLS on the list/paging queries WITHOUT changing who can see what.
-- NOT applied to production yet.
--
-- Problem: policies call private.is_staff() / private.can_see_*() per row. They are
-- SECURITY DEFINER (not inlinable), so a count over ~8k projects ran is_staff() and
-- can_see_project() ~16k times (~400 ms per count query locally; the Projects tab
-- runs 7 counts + 1 page).
-- Fix (Supabase-recommended pattern): wrap the role check in a scalar sub-select so
-- Postgres evaluates it once per statement (InitPlan), and put it first in the
-- tech-read policies so staff short-circuit before the per-row lookup. Visibility is
-- identical: staff already see every row via *_staff; techs still need the per-row check.
-- Locally: count(*) on projects 390 ms -> 5 ms, customers 220 ms -> 1.4 ms.

alter policy customers_staff     on public.customers       using ((select private.is_staff())) with check ((select private.is_staff()));
alter policy customers_tech_read on public.customers       using ((select private.is_staff()) or private.can_see_customer(id));
alter policy contacts_staff      on public.contacts        using ((select private.is_staff())) with check ((select private.is_staff()));
alter policy contacts_tech_read  on public.contacts        using ((select private.is_staff()) or private.can_see_customer(customer_id));
alter policy projects_staff      on public.projects        using ((select private.is_staff())) with check ((select private.is_staff()));
alter policy projects_tech_read  on public.projects        using ((select private.is_staff()) or private.can_see_project(id));
alter policy milestones_staff    on public.milestones      using ((select private.is_staff())) with check ((select private.is_staff()));
alter policy milestones_tech_read on public.milestones     using ((select private.is_staff()) or private.can_see_project(project_id));
alter policy jobs_staff          on public.jobs            using ((select private.is_staff())) with check ((select private.is_staff()));
alter policy jobs_tech_read      on public.jobs            using ((select private.is_staff()) or private.is_assigned_to_job(id));
alter policy assign_staff        on public.job_assignments using ((select private.is_staff())) with check ((select private.is_staff()));
alter policy assign_tech_read    on public.job_assignments using ((select private.is_staff()) or private.is_assigned_to_job(job_id));
