-- Prod hotfix (applied as 20261113020407 hotfix_drop_sales_staff_table_policies).
-- The sales SELECT policies on customers/projects/jobs used private.can_access_sales()
-- (true for admin and manager as well as sales) and were evaluated per row, which
-- made home_counts time out under the authenticated 8s statement_timeout.
-- Staff already have customers_staff / projects_staff / jobs_staff.
-- This file matches the SQL already applied on production. Do not re-apply it there.
drop policy if exists sales_customers_read on public.customers;
drop policy if exists sales_projects_read on public.projects;
drop policy if exists sales_jobs_read on public.jobs;
