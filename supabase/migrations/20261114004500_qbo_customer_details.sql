-- Send-invoice tracking, and hide price (and invoice) history from field techs.
-- Amounts already live in public.service_request_pricing, which techs cannot read
-- (private.can_see_service_price). Price amounts were also written into
-- service_request_events.body. The previous SELECT policy allowed every is_staff()
-- row (admin/manager). This tightens it: techs never see kind=price or kind=invoice,
-- even if they later gain broader event read access. Sales may see price history
-- (they can already see the price) but not invoice events. Admin/manager see all.
-- Do not add RLS policies on customers, projects, or jobs that staff queries evaluate.

alter table public.service_request_invoices
  add column if not exists emailed_at timestamptz,
  add column if not exists emailed_to text;

drop policy if exists service_request_events_select on public.service_request_events;

create policy service_request_events_select on public.service_request_events
  for select to authenticated
  using (
    (
      (select private.is_staff())
      or (select private.can_see_service_price())
    )
    and (kind <> 'price' or (select private.can_see_service_price()))
    and (kind <> 'invoice' or (select private.is_staff()))
  );
