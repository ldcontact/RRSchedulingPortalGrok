-- Staff-recorded SMS consent on sales deals.
-- Do NOT apply this on production until Luke approves a go-live card.
-- Texting stays off; these columns only store consent. Nothing is sent automatically.

alter table public.sales_deals
  add column if not exists sms_consent boolean not null default false,
  add column if not exists sms_consent_at timestamptz,
  add column if not exists sms_consent_by uuid references public.profiles (id) on delete set null;

comment on column public.sales_deals.sms_consent is
  'True when the deal phone is a cell and the contact has consented to SMS. Does not send messages.';
comment on column public.sales_deals.sms_consent_at is
  'When sms_consent was last changed (granted or withdrawn).';
comment on column public.sales_deals.sms_consent_by is
  'Profile who last changed sms_consent.';

create index if not exists sales_deals_sms_consent_idx
  on public.sales_deals (sms_consent)
  where sms_consent;
