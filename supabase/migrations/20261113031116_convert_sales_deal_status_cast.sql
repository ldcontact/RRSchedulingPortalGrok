-- Fix convert_sales_deal: CASE arms were typed as text, so inserting into
-- projects.status (project_status) failed. Cast both arms. Signature unchanged.
-- Do not apply to production until this branch is reviewed and approved.

create or replace function public.convert_sales_deal(p_deal_id uuid, p_visit_start timestamptz default null, p_visit_end timestamptz default null)
returns uuid
language plpgsql security definer
set search_path = public, private
as $$
declare
  d public.sales_deals%rowtype;
  pid uuid;
  typ public.project_type;
begin
  if not private.can_access_sales() then
    raise exception 'permission denied';
  end if;
  select * into d from public.sales_deals where id = p_deal_id;
  if not found then raise exception 'deal not found'; end if;
  if not private.can_view_deal(d.owner_id) then raise exception 'permission denied'; end if;
  if d.converted_project_id is not null then raise exception 'already converted'; end if;
  if d.customer_id is null then raise exception 'link a customer first'; end if;
  if d.stage_slug not in ('approved_ready', 'project_scheduled') then
    raise exception 'deal is not ready to convert';
  end if;
  typ := case d.pipeline_slug
    when 'single_family_whe' then 'whe_single_family'::public.project_type
    when 'multifamily_whe' then 'whe_multifamily'::public.project_type
    when 'led_lighting' then 'lighting'::public.project_type
    when 'hvac' then 'hvac'::public.project_type
    else 'other'::public.project_type
  end;
  insert into public.projects (customer_id, name, type, status, scope, value, est_rebate)
  values (
    d.customer_id,
    d.title,
    typ,
    case when p_visit_start is not null then 'scheduled'::public.project_status else 'proposed'::public.project_status end,
    coalesce(d.notes, ''),
    d.value,
    d.est_rebate
  )
  returning id into pid;
  if p_visit_start is not null and p_visit_end is not null then
    insert into public.jobs (project_id, title, starts_at, ends_at, status, kind)
    values (pid, 'Install visit', p_visit_start, p_visit_end, 'scheduled', 'install');
  end if;
  update public.sales_deals
    set converted_project_id = pid, stage_slug = 'project_scheduled', scheduled_date = (p_visit_start at time zone 'America/Chicago')::date, updated_at = now()
    where id = p_deal_id;
  return pid;
end;
$$;

grant execute on function public.convert_sales_deal(uuid, timestamp with time zone, timestamp with time zone) to authenticated, service_role;
