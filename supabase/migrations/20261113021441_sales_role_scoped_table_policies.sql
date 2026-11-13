-- Prod version 20261113021441 (name sales_role_scoped_table_policies).
-- The apply originally created sales-scoped SELECT policies on customers,
-- projects, and jobs, then those policies were dropped immediately because
-- manager home_counts took ~2.2s (over the 200ms safety gate). This file is
-- the net production state: no sales table policies, and the RPC EXECUTE
-- grants that remain in effect. Do not re-apply the dropped policies.
-- Do not run this against production; it is already applied (net).
drop policy if exists sales_customers_read on public.customers;
drop policy if exists sales_projects_read on public.projects;
drop policy if exists sales_jobs_read on public.jobs;

revoke all on function public.ingest_sales_lead(text, text, text, text, text, text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.sign_sales_proposal(text, text, boolean, text) from public, anon, authenticated;
revoke all on function public.convert_sales_deal(uuid, timestamp with time zone, timestamp with time zone) from public, anon;

grant execute on function public.ingest_sales_lead(text, text, text, text, text, text, text, text, text, text, jsonb) to service_role;
grant execute on function public.sign_sales_proposal(text, text, boolean, text) to service_role;
grant execute on function public.convert_sales_deal(uuid, timestamp with time zone, timestamp with time zone) to authenticated, service_role;
