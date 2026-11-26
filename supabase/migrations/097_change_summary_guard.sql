-- =====================================================================
--  097 · Small security tidy-ups found in the bug hunt
--   • change_summary(txid) told anyone about ANY change (company names, values) — with "own data only" on,
--     an employee could read others' changes by guessing numbers. Now: own changes, or Admin / Manager.
--   • 7 helper functions get a fixed search_path (linter warning).
-- =====================================================================
do $do$
declare d text := pg_get_functiondef('public.change_summary'::regproc);
begin
  if position('m.actor is distinct from auth.uid()' in d) = 0 then
    d := replace(d, E'  if not found then return null; end if;\n',
      E'  if not found then return null; end if;\n  if auth.uid() is not null and not public.is_manager() and m.actor is distinct from auth.uid() then return null; end if;   -- only your own changes\n');
    if position('m.actor is distinct from auth.uid()' in d) = 0 then raise exception 'change_summary: anchor not found'; end if;
    execute d;
  end if;
end $do$;

do $do$
declare f text;
begin
  foreach f in array array['generic_domain','site_root','url_host','name_words','hist_field','auto_esc','auto_inr'] loop
    execute (select string_agg(format('alter function %s set search_path = public', p.oid::regprocedure), '; ')
               from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = f);
  end loop;
end $do$;
