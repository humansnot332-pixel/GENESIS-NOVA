-- =====================================================================
--  099 · The nightly backup also lists the login accounts (id + email + name, NO passwords).
--   Found in the restore drill: every CRM row points at a login id (owner, created by …). After a
--   disaster the logins must come back with the SAME ids, or the data is orphaned. Passwords can't
--   (and shouldn't) be exported — people set a new one with "Forgot password".
--   _auth_users is readable ONLY by the backup (service role): no grant to anon / authenticated.
-- =====================================================================
create or replace view public._auth_users as
  select u.id, u.email, u.created_at, u.raw_user_meta_data->>'full_name' as name
    from auth.users u;
revoke all on public._auth_users from public, anon, authenticated;
grant select on public._auth_users to service_role;

create or replace function public.backup_tables()
returns table(name text, pk text[]) language sql stable security definer set search_path = public as $$
  select c.relname::text,
         coalesce((select array_agg(a.attname::text order by array_position(i.indkey::int2[], a.attnum))
                     from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
                    where i.indrelid = c.oid and i.indisprimary), '{}')
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
     and c.relname not in ('push_subs', 'undo_state')
  union all select '_auth_users', array['id']
   order by 1
$$;
