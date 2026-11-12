-- Sales role. Kept in its own migration so later statements can use the new enum value.
alter type public.user_role add value if not exists 'sales';
