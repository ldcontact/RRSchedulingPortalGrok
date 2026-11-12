-- Sales CRM tables, RLS, and helper functions.
-- This file is in the repo only. Do not apply it to production until go-live.

create or replace function private.can_access_sales() returns boolean
language sql stable security definer
set search_path = public, private
as $$
  select coalesce(private.current_user_role() in ('admin', 'manager', 'sales'), false);
$$;

create or replace function private.can_see_all_deals() returns boolean
language sql stable security definer
set search_path = public, private
as $$
  select private.is_staff();
$$;

grant execute on function private.can_access_sales() to authenticated;
grant execute on function private.can_see_all_deals() to authenticated;

create table if not exists public.sales_pipelines (
  slug text primary key,
  name text not null,
  sort int not null default 0
);

create table if not exists public.sales_stages (
  pipeline_slug text not null references public.sales_pipelines(slug) on delete cascade,
  slug text not null,
  name text not null,
  sort int not null default 0,
  color text not null default '#8a9390',
  bg text not null default '#e8eae8',
  is_terminal boolean not null default false,
  primary key (pipeline_slug, slug)
);

insert into public.sales_pipelines (slug, name, sort) values
  ('single_family_whe', 'Single Family WHE', 0),
  ('multifamily_whe', 'Multifamily WHE', 1),
  ('led_lighting', 'LED Lighting', 2),
  ('hvac', 'HVAC', 3)
on conflict (slug) do nothing;

-- Stages are seeded to match src/lib/sales/catalog.ts (Project, not Job, in labels).
insert into public.sales_stages (pipeline_slug, slug, name, sort, color, bg, is_terminal) values
  ('single_family_whe', 'potential_lead', 'Potential Lead', 0, '#8a9390', '#e8eae8', false),
  ('single_family_whe', 'contacted_comed', 'Contacted ComEd Verification', 1, '#c2410c', '#ffedd5', false),
  ('single_family_whe', 'declined', 'Declined By Projects', 2, '#be185d', '#fce7f3', true),
  ('single_family_whe', 'ready_for_assessment', 'Ready For Assessment', 3, '#1d4ed8', '#dbeafe', false),
  ('single_family_whe', 'assessment_scheduled', 'Assessment Scheduled', 4, '#9f1239', '#ffe4e6', false),
  ('single_family_whe', 'assessment_completed', 'Assessment Completed', 5, '#047857', '#d1fae5', false),
  ('single_family_whe', 'rise_data_entered', 'RISE - Project Assessment Data Entered', 6, '#6d28d9', '#ede9fe', false),
  ('single_family_whe', 'approved_ready', 'Approved - Ready to Schedule', 7, '#0369a1', '#e0f2fe', false),
  ('single_family_whe', 'project_scheduled', 'Project Scheduled', 8, '#1e40af', '#dbeafe', false),
  ('single_family_whe', 'project_completed', 'Project Completed', 9, '#115e59', '#ccfbf1', false),
  ('single_family_whe', 'permit_pending', 'City Permit Final Pending', 10, '#a16207', '#fef3c7', false),
  ('single_family_whe', 'permit_final', 'City Permit Final Completed', 11, '#1f2937', '#e5e7eb', true),
  ('multifamily_whe', 'potential_lead', 'Potential Lead', 0, '#8a9390', '#e8eae8', false),
  ('multifamily_whe', 'contacted_comed', 'Contacted ComEd Verification', 1, '#c2410c', '#ffedd5', false),
  ('multifamily_whe', 'ready_for_assessment', 'Ready For Assessment', 2, '#1d4ed8', '#dbeafe', false),
  ('multifamily_whe', 'assessment_scheduled', 'Assessment Scheduled', 3, '#9f1239', '#ffe4e6', false),
  ('multifamily_whe', 'assessment_completed', 'Assessment Completed', 4, '#047857', '#d1fae5', false),
  ('multifamily_whe', 'rise_data_entered', 'RISE - Project Assessment Data Entered', 5, '#6d28d9', '#ede9fe', false),
  ('multifamily_whe', 'approved_ready', 'Approved - Ready to Schedule', 6, '#0369a1', '#e0f2fe', false),
  ('multifamily_whe', 'project_scheduled', 'Project Scheduled', 7, '#1e40af', '#dbeafe', false),
  ('multifamily_whe', 'project_completed', 'Project Completed', 8, '#115e59', '#ccfbf1', false),
  ('multifamily_whe', 'not_feasible', 'Project Not Feasible', 9, '#be185d', '#fce7f3', true),
  ('led_lighting', 'potential_lead', 'Potential Lead', 0, '#8a9390', '#e8eae8', false),
  ('led_lighting', 'contacted', 'Contacted', 1, '#c2410c', '#ffedd5', false),
  ('led_lighting', 'assessment_scheduled', 'Assessment Scheduled', 2, '#9f1239', '#ffe4e6', false),
  ('led_lighting', 'assessment_completed', 'Assessment Completed', 3, '#047857', '#d1fae5', false),
  ('led_lighting', 'proposal_sent', 'Proposal Sent', 4, '#6d28d9', '#ede9fe', false),
  ('led_lighting', 'approved_ready', 'Approved - Ready to Schedule', 5, '#0369a1', '#e0f2fe', false),
  ('led_lighting', 'project_scheduled', 'Project Scheduled', 6, '#1e40af', '#dbeafe', false),
  ('led_lighting', 'project_completed', 'Project Completed', 7, '#115e59', '#ccfbf1', true),
  ('hvac', 'potential_lead', 'Potential Lead', 0, '#8a9390', '#e8eae8', false),
  ('hvac', 'contacted', 'Contacted', 1, '#c2410c', '#ffedd5', false),
  ('hvac', 'assessment_scheduled', 'Assessment Scheduled', 2, '#9f1239', '#ffe4e6', false),
  ('hvac', 'assessment_completed', 'Assessment Completed', 3, '#047857', '#d1fae5', false),
  ('hvac', 'proposal_sent', 'Proposal Sent', 4, '#6d28d9', '#ede9fe', false),
  ('hvac', 'approved_ready', 'Approved - Ready to Schedule', 5, '#0369a1', '#e0f2fe', false),
  ('hvac', 'project_scheduled', 'Project Scheduled', 6, '#1e40af', '#dbeafe', false),
  ('hvac', 'project_completed', 'Project Completed', 7, '#115e59', '#ccfbf1', true)
on conflict do nothing;

create table if not exists public.sales_deals (
  id uuid primary key default gen_random_uuid(),
  pipeline_slug text not null references public.sales_pipelines(slug),
  stage_slug text not null,
  title text not null,
  customer_id uuid references public.customers(id) on delete set null,
  owner_id uuid references public.profiles(id) on delete set null,
  contact_name text,
  contact_phone text,
  contact_email text,
  address text,
  city text,
  state text,
  zip text,
  lat double precision,
  lng double precision,
  priority text not null default 'Medium' check (priority in ('High', 'Medium', 'Low')),
  source text not null default 'manual',
  assessment_date date,
  assessment_starts_at timestamptz,
  assessment_ends_at timestamptz,
  scheduled_date date,
  close_date date,
  opened_at timestamptz not null default now(),
  value numeric not null default 0,
  est_rebate numeric not null default 0,
  converted_project_id uuid references public.projects(id) on delete set null,
  monday_item_id text,
  monday_board_id text,
  notes text,
  booking_token text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (monday_board_id, monday_item_id),
  foreign key (pipeline_slug, stage_slug) references public.sales_stages(pipeline_slug, slug)
);

create index if not exists sales_deals_pipeline_stage_idx on public.sales_deals (pipeline_slug, stage_slug);
create index if not exists sales_deals_owner_idx on public.sales_deals (owner_id);
create index if not exists sales_deals_customer_idx on public.sales_deals (customer_id);

create table if not exists public.sales_inbox (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  name text not null,
  phone text,
  email text,
  address text,
  city text,
  state text,
  zip text,
  pipeline_slug text not null default 'single_family_whe' references public.sales_pipelines(slug),
  message text,
  raw jsonb,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'dismissed')),
  accepted_deal_id uuid references public.sales_deals(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.sales_activities (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references public.sales_deals(id) on delete cascade,
  inbox_id uuid references public.sales_inbox(id) on delete set null,
  kind text not null check (kind in ('note', 'sms', 'email', 'call', 'system', 'automation')),
  direction text not null check (direction in ('inbound', 'outbound', 'internal')),
  status text not null check (status in ('draft', 'queued', 'sent', 'received', 'failed', 'logged')),
  subject text,
  body text not null default '',
  to_address text,
  from_address text,
  author_id uuid references public.profiles(id) on delete set null,
  meta jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists sales_activities_deal_idx on public.sales_activities (deal_id, created_at desc);

create table if not exists public.sales_automations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  enabled boolean not null default true,
  pipeline_slug text references public.sales_pipelines(slug) on delete cascade,
  trigger text not null check (trigger in ('stage_entered', 'stuck_in_stage')),
  stage_slug text,
  stuck_after_days int,
  actions jsonb not null default '[]'::jsonb,
  auto_send_customer boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  deal_id uuid references public.sales_deals(id) on delete cascade,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.sales_proposals (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.sales_deals(id) on delete cascade,
  title text not null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'signed', 'void')),
  notes text,
  net numeric not null default 0,
  public_token text unique,
  sent_at timestamptz,
  signed_at timestamptz,
  signer_name text,
  signer_consent boolean not null default false,
  signer_method text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_proposal_items (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.sales_proposals(id) on delete cascade,
  label text not null,
  amount numeric not null default 0,
  sort int not null default 0
);

create table if not exists public.sales_proposal_events (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.sales_proposals(id) on delete cascade,
  event text not null,
  actor_name text,
  meta jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.sales_import_batches (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  board_name text,
  item_count int not null default 0,
  skipped_count int not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

alter table public.sales_pipelines enable row level security;
alter table public.sales_stages enable row level security;
alter table public.sales_deals enable row level security;
alter table public.sales_inbox enable row level security;
alter table public.sales_activities enable row level security;
alter table public.sales_automations enable row level security;
alter table public.sales_alerts enable row level security;
alter table public.sales_proposals enable row level security;
alter table public.sales_proposal_items enable row level security;
alter table public.sales_proposal_events enable row level security;
alter table public.sales_import_batches enable row level security;

create or replace function private.can_view_deal(owner uuid) returns boolean
language sql stable security definer
set search_path = public, private
as $$
  select private.can_access_sales() and (private.can_see_all_deals() or owner is null or owner = auth.uid());
$$;

grant execute on function private.can_view_deal(uuid) to authenticated;

create policy sales_pipelines_read on public.sales_pipelines for select to authenticated using (private.can_access_sales());
create policy sales_stages_read on public.sales_stages for select to authenticated using (private.can_access_sales());

create policy sales_deals_select on public.sales_deals for select to authenticated
  using (private.can_view_deal(owner_id));
create policy sales_deals_insert on public.sales_deals for insert to authenticated
  with check (private.can_access_sales() and (private.can_see_all_deals() or owner_id is null or owner_id = auth.uid()));
create policy sales_deals_update on public.sales_deals for update to authenticated
  using (private.can_view_deal(owner_id))
  with check (private.can_access_sales());
create policy sales_deals_delete on public.sales_deals for delete to authenticated
  using (private.can_delete());

create policy sales_inbox_select on public.sales_inbox for select to authenticated using (private.can_access_sales());
create policy sales_inbox_write on public.sales_inbox for all to authenticated using (private.can_access_sales()) with check (private.can_access_sales());

create policy sales_activities_select on public.sales_activities for select to authenticated
  using (
    private.can_access_sales() and (
      deal_id is null or exists (select 1 from public.sales_deals d where d.id = deal_id and private.can_view_deal(d.owner_id))
    )
  );
create policy sales_activities_write on public.sales_activities for insert to authenticated
  with check (private.can_access_sales());
create policy sales_activities_update on public.sales_activities for update to authenticated
  using (private.can_access_sales()) with check (private.can_access_sales());

create policy sales_automations_select on public.sales_automations for select to authenticated using (private.can_access_sales());
create policy sales_automations_write on public.sales_automations for all to authenticated
  using (private.can_access_sales()) with check (private.can_access_sales());

create policy sales_alerts_select on public.sales_alerts for select to authenticated using (user_id = auth.uid() or private.is_staff());
create policy sales_alerts_update on public.sales_alerts for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy sales_proposals_select on public.sales_proposals for select to authenticated
  using (exists (select 1 from public.sales_deals d where d.id = deal_id and private.can_view_deal(d.owner_id)));
create policy sales_proposals_write on public.sales_proposals for all to authenticated
  using (private.can_access_sales()) with check (private.can_access_sales());
create policy sales_proposal_items_select on public.sales_proposal_items for select to authenticated
  using (exists (select 1 from public.sales_proposals p join public.sales_deals d on d.id = p.deal_id where p.id = proposal_id and private.can_view_deal(d.owner_id)));
create policy sales_proposal_items_write on public.sales_proposal_items for all to authenticated
  using (private.can_access_sales()) with check (private.can_access_sales());
create policy sales_proposal_events_select on public.sales_proposal_events for select to authenticated
  using (exists (select 1 from public.sales_proposals p join public.sales_deals d on d.id = p.deal_id where p.id = proposal_id and private.can_view_deal(d.owner_id)));
create policy sales_proposal_events_write on public.sales_proposal_events for insert to authenticated
  with check (private.can_access_sales());

create policy sales_import_select on public.sales_import_batches for select to authenticated using (private.is_staff());
create policy sales_import_write on public.sales_import_batches for insert to authenticated with check (private.is_staff());

-- Sales may read customers and projects linked to deals they can see (not the whole book).
create policy sales_customers_read on public.customers for select to authenticated
  using (
    private.can_access_sales() and exists (
      select 1 from public.sales_deals d
      where d.customer_id = customers.id and private.can_view_deal(d.owner_id)
    )
  );

create policy sales_projects_read on public.projects for select to authenticated
  using (
    private.can_access_sales() and exists (
      select 1 from public.sales_deals d
      where d.converted_project_id = projects.id and private.can_view_deal(d.owner_id)
    )
  );

create policy sales_jobs_read on public.jobs for select to authenticated
  using (private.can_access_sales()); -- schedule availability for assessment booking

-- Public lead ingest (web form, xAgent webhook, inbound email). Called by the app server
-- or granted to anon through a narrow RPC — never writes to Monday.
create or replace function public.ingest_sales_lead(
  p_source text,
  p_name text,
  p_phone text default null,
  p_email text default null,
  p_address text default null,
  p_city text default null,
  p_state text default null,
  p_zip text default null,
  p_pipeline text default 'single_family_whe',
  p_message text default null,
  p_raw jsonb default null
) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'name is required';
  end if;
  if p_source not in ('web_form', 'xagent', 'email', 'manual', 'monday') then
    raise exception 'invalid source';
  end if;
  insert into public.sales_inbox (source, name, phone, email, address, city, state, zip, pipeline_slug, message, raw)
  values (p_source, trim(p_name), p_phone, p_email, p_address, p_city, p_state, p_zip, coalesce(p_pipeline, 'single_family_whe'), p_message, p_raw)
  returning id into new_id;
  return new_id;
end;
$$;

-- Not granted to anon/authenticated by default. The Next.js route uses the service-role
-- client when configured. Public form traffic never talks to this function as a browser RPC.

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
  values (d.customer_id, d.title, typ, case when p_visit_start is not null then 'scheduled' else 'proposed' end, coalesce(d.notes, ''), d.value, d.est_rebate)
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

grant execute on function public.convert_sales_deal(uuid, timestamptz, timestamptz) to authenticated;

-- Public proposal signing by token (no login). Narrow: only marks the proposal signed
-- and moves the deal to Approved - Ready to Schedule when it is not already further along.
create or replace function public.sign_sales_proposal(
  p_token text,
  p_signer_name text,
  p_consent boolean,
  p_method text
) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  pr public.sales_proposals%rowtype;
begin
  if p_token is null or p_signer_name is null or length(trim(p_signer_name)) = 0 then
    raise exception 'Type your name to sign.';
  end if;
  if not coalesce(p_consent, false) then
    raise exception 'Agree that this is your electronic signature.';
  end if;
  if p_method not in ('typed', 'drawn') then
    raise exception 'invalid signature method';
  end if;
  select * into pr from public.sales_proposals where public_token = p_token;
  if not found then raise exception 'proposal not found'; end if;
  if pr.status = 'signed' then raise exception 'This proposal is already signed.'; end if;
  if pr.status = 'void' then raise exception 'This proposal is void.'; end if;
  update public.sales_proposals
    set status = 'signed', signed_at = now(), signer_name = trim(p_signer_name), signer_consent = true, signer_method = p_method, updated_at = now()
    where id = pr.id;
  insert into public.sales_proposal_events (proposal_id, event, actor_name, meta)
  values (pr.id, 'signed', trim(p_signer_name), jsonb_build_object('method', p_method, 'consent', true));
  update public.sales_deals
    set stage_slug = 'approved_ready', updated_at = now()
    where id = pr.deal_id and stage_slug not in ('approved_ready', 'project_scheduled', 'project_completed', 'permit_pending', 'permit_final', 'declined', 'not_feasible');
  return pr.id;
end;
$$;

-- Called by the public /sign/[token] route via the service role (or a future limited grant).
