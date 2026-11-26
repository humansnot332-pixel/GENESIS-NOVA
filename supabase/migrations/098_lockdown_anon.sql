-- =====================================================================
--  098 · Lock-down: nobody without a login touches a table.
--   • The anon role (anyone on the internet with the public anon key) had table grants on 12 newer tables
--     (proformas, obfs, vendors, email_outbox, crm_files …). Row-level security still blocked them, but one
--     wrong policy would have opened them. Now anon has NO table / sequence rights at all — the public pages
--     use only the quote_public() / public_branding() functions and the inbound-rfq edge function.
--   • 12 policies were written "to public" (= anon too): now "to authenticated" only.
--   • Quotations / renewals / proformas policies also require an active employee (a disabled account's
--     still-valid token reads nothing), and the ERP-sharing switch can never open data to a logged-out visitor.
-- =====================================================================
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;

do $do$
declare p record; q text; c text;
begin
  for p in select tablename, policyname, cmd, qual, with_check from pg_policies
            where schemaname = 'public' and roles::text ~ 'public' loop
    q := p.qual; c := p.with_check;
    -- the ones without an "active employee" check get it
    if q is not null and q !~ 'is_active\(\)' then q := '(( select public.is_active()) and (' || q || '))'; end if;
    if c is not null and c !~ 'is_active\(\)' then c := '(( select public.is_active()) and (' || c || '))'; end if;
    execute format('alter policy %I on public.%I to authenticated%s%s', p.policyname, p.tablename,
                   case when q is not null then ' using (' || q || ')' else '' end,
                   case when c is not null then ' with check (' || c || ')' else '' end);
  end loop;
end $do$;
