-- QuickBooks Online invoicing (sandbox first). Server-only tables:
-- RLS is enabled with NO policies and all client grants are revoked, so the browser
-- (anon/authenticated) can never read tokens, customer links, or invoice amounts.
-- Only server code using the service role reads/writes them, after an admin/manager check.
-- Tokens are additionally encrypted at rest by the app (AES-256-GCM, QBO_TOKEN_ENC_KEY).
-- Do not add RLS policies on customers, projects, or jobs that staff queries evaluate.

-- One connected QuickBooks company (singleton row).
create table public.qbo_connections (
  id                    boolean primary key default true check (id),
  realm_id              text not null,
  environment           text not null default 'sandbox' check (environment in ('sandbox', 'production')),
  company_name          text not null default '',
  access_token_enc      text not null,
  refresh_token_enc     text not null,
  access_expires_at     timestamptz not null,
  refresh_expires_at    timestamptz not null,
  connected_by          uuid references public.profiles (id) on delete set null,
  connected_by_name     text,
  connected_at          timestamptz not null default now(),
  last_sync_at          timestamptz,
  default_item_id       text,
  default_item_name     text,
  default_term_id       text,
  default_term_name     text,
  default_tax_code_id   text,
  default_tax_code_name text,
  updated_at            timestamptz not null default now()
);

create trigger qbo_connections_updated before update on public.qbo_connections
  for each row execute function private.set_updated_at();

-- Portal customer -> QuickBooks Customer.Id, per company (realm). Prevents duplicate customers.
create table public.qbo_customer_links (
  customer_id       uuid not null references public.customers (id) on delete cascade,
  realm_id          text not null,
  qbo_customer_id   text not null,
  qbo_display_name  text not null default '',
  linked_by         uuid references public.profiles (id) on delete set null,
  linked_at         timestamptz not null default now(),
  primary key (customer_id, realm_id)
);

-- Invoice created from a service request. At most one non-voided invoice per ticket.
create table public.service_request_invoices (
  id                  uuid primary key default gen_random_uuid(),
  service_request_id  uuid not null references public.service_requests (id) on delete cascade,
  realm_id            text not null,
  environment         text not null default 'sandbox' check (environment in ('sandbox', 'production')),
  qbo_invoice_id      text not null,
  doc_number          text,
  total               numeric(12,2) not null default 0,
  balance             numeric(12,2) not null default 0,
  email_status        text,
  due_date            date,
  txn_date            date,
  status              text not null default 'draft' check (status in ('draft', 'sent', 'paid', 'overdue', 'voided')),
  voided_at           timestamptz,
  voided_by           uuid references public.profiles (id) on delete set null,
  created_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  synced_at           timestamptz not null default now(),
  unique (realm_id, qbo_invoice_id)
);

create unique index service_request_invoices_one_active
  on public.service_request_invoices (service_request_id) where voided_at is null;

alter table public.qbo_connections enable row level security;
alter table public.qbo_customer_links enable row level security;
alter table public.service_request_invoices enable row level security;

revoke all on public.qbo_connections from anon, authenticated;
revoke all on public.qbo_customer_links from anon, authenticated;
revoke all on public.service_request_invoices from anon, authenticated;
grant select, insert, update, delete on public.qbo_connections to service_role;
grant select, insert, update, delete on public.qbo_customer_links to service_role;
grant select, insert, update, delete on public.service_request_invoices to service_role;

-- History kind 'invoice' (created / voided). service_request_events is already staff-only by RLS.
do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.service_request_events'::regclass
      and c.contype = 'c'
      and (
        c.conname = 'service_request_events_kind_check'
        or pg_get_constraintdef(c.oid) ilike '%kind in%'
        or pg_get_constraintdef(c.oid) ilike '%kind = any%'
      )
  loop
    execute format('alter table public.service_request_events drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.service_request_events
  add constraint service_request_events_kind_check
  check (kind in (
    'created', 'note', 'status', 'linked', 'unlinked', 'assigned',
    'billable', 'scheduled', 'converted', 'resolved', 'closed', 'reopened',
    'emailed', 'price', 'invoice'
  ));
