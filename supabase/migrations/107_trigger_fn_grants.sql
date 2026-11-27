-- =====================================================================
--  107 · Trigger functions are not API calls: nobody (logged in or not) gets EXECUTE on them.
--   (They could not be run through /rpc anyway — "can only be called as triggers" — this just
--    makes the security scan clean. Triggers still fire: Postgres doesn't check EXECUTE when firing.)
-- =====================================================================
do $do$
declare f record; n int := 0;
begin
  for f in select p.oid::regprocedure sig from pg_proc p
            where p.pronamespace = 'public'::regnamespace and p.prorettype = 'trigger'::regtype loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    n := n + 1;
  end loop;
  raise notice 'trigger functions locked: %', n;
end $do$;
