-- =====================================================================
--  102 · Teams (product lines). A team = name + its product categories + its Manager + members.
--   Who sees what (enforced here, in the database — not in the browser):
--   • Admin / Director / IT Head (role admin) → everything.
--   • Manager WITHOUT a team → everything (as before; nothing changes until teams are made).
--   • Team Manager → the data of his team's people + the free pool / new RFQs of the team's categories.
--   • Team member → his own data + the free pool / new RFQs of the team's categories.
--   • Employee without a team → as before (privacy switch decides).
--  Done by: helper functions + a mechanical rewrite of the data tables' policies:
--     is_manager()  → sees_all()          ("see everything" only for Admins / team-less Managers)
--     = auth.uid()  → = ANY(my_people())  (a team Manager's "mine" = his whole team; everyone else: just me)
--     own_only()    → scoped()            (people in a team are always "own data")
--     free pool     → only the team's categories (my_cats())
-- =====================================================================

create table if not exists public.teams (
  id          bigserial primary key,
  name        text not null unique check (length(btrim(name)) between 1 and 60),
  categories  text[] not null default '{}',
  manager_id  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
alter table public.teams enable row level security;
drop policy if exists teams_select on public.teams;
drop policy if exists teams_write on public.teams;
create policy teams_select on public.teams for select to authenticated using ((select public.is_active()));
create policy teams_write  on public.teams for all    to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
grant select, insert, update, delete on public.teams to authenticated;
grant usage, select on sequence public.teams_id_seq to authenticated;
revoke all on public.teams from anon;
do $$ begin
  if to_regproc('public.audit') is not null and not exists (select 1 from pg_trigger where tgname = 'audit_teams') then
    create trigger audit_teams after insert or update or delete on public.teams for each row execute function public.audit();
  end if;
end $$;

alter table public.profiles add column if not exists team_id bigint references public.teams(id) on delete set null;
grant select (team_id) on public.profiles to authenticated;            -- profiles columns are granted one by one
create index if not exists profiles_team_idx on public.profiles(team_id) where team_id is not null;

-- ---------------------------------------------------------------- helpers (used inside the policies, once per query)
create or replace function public.my_team() returns bigint
language sql stable security definer set search_path = public as $$
  select team_id from public.profiles where id = auth.uid() and active
$$;
create or replace function public.sees_all() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or (public.is_manager() and public.my_team() is null)
$$;
create or replace function public.team_mgr() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_manager() and not public.is_admin() and public.my_team() is not null
$$;
create or replace function public.scoped() returns boolean
language sql stable security definer set search_path = public as $$
  select public.own_only() or public.my_team() is not null
$$;
-- whose rows count as "mine": a team Manager → everyone in his team; anybody else → just me
create or replace function public.my_people() returns uuid[]
language sql stable security definer set search_path = public as $$
  select case when public.team_mgr()
              then coalesce((select array_agg(p.id) from public.profiles p where p.team_id = public.my_team()), '{}') || auth.uid()
              else array[auth.uid()] end
$$;
-- the free pool a person may see: null = everything; else the team's product categories
create or replace function public.my_cats() returns text[]
language sql stable security definer set search_path = public as $$
  select case when public.is_admin() then null
              else (select nullif(t.categories, '{}') from public.teams t where t.id = public.my_team()) end
$$;
create or replace function public.lead_cat(p_lead bigint) returns text
language sql stable security definer set search_path = public as $$
  select category from public.leads where id = p_lead
$$;
revoke all on function public.my_team(), public.sees_all(), public.team_mgr(), public.scoped(), public.my_people(), public.my_cats(), public.lead_cat(bigint) from public, anon;
grant execute on function public.my_team(), public.sees_all(), public.team_mgr(), public.scoped(), public.my_people(), public.my_cats(), public.lead_cat(bigint) to authenticated;

-- ---------------------------------------------------------------- the data tables' policies
do $do$
declare p record; q text; c text; n int := 0;
  tbls text[] := array['leads','rfqs','activities','lock_history','quotations','renewals','tickets','ticket_comments','obfs','orders',
                       'invoices','proformas','purchase_orders','tasks','visits','attendance','email_messages','email_outbox',
                       'automation_log','mail_enquiry_log','lock_requests','payments'];
  -- policies where "= auth.uid()" means "written by me" (never someone else in my team)
  keep text[] := array['email_update','eo_cancel','eo_insert','tc_insert','vis_insert','ib_insert','tpl_insert'];
  pool_lead text := '((owner_id IS NULL) AND ((( SELECT my_cats() AS my_cats) IS NULL) OR (category IS NULL) OR (category = ANY ((( SELECT my_cats() AS my_cats))::text[]))))';
  pool_rfq  text := '((owner_id IS NULL) AND ((( SELECT my_cats() AS my_cats) IS NULL) OR (lead_cat(lead_id) IS NULL) OR (lead_cat(lead_id) = ANY ((( SELECT my_cats() AS my_cats))::text[]))))';
begin
  for p in select tablename, policyname, cmd, qual, with_check from pg_policies
            where schemaname = 'public' and tablename = any(tbls) and not (policyname = any(keep)) loop
    q := p.qual; c := p.with_check;
    q := replace(q, '( SELECT is_manager() AS is_manager)', '( SELECT sees_all() AS sees_all)');
    c := replace(c, '( SELECT is_manager() AS is_manager)', '( SELECT sees_all() AS sees_all)');
    q := replace(q, '= ( SELECT auth.uid() AS uid)', '= ANY ((( SELECT my_people() AS my_people))::uuid[])');
    c := replace(c, '= ( SELECT auth.uid() AS uid)', '= ANY ((( SELECT my_people() AS my_people))::uuid[])');
    q := replace(q, '( SELECT own_only() AS own_only)', '( SELECT scoped() AS scoped)');
    c := replace(c, '( SELECT own_only() AS own_only)', '( SELECT scoped() AS scoped)');
    if p.policyname = 'leads_select' then q := replace(q, '(owner_id IS NULL)', pool_lead); end if;
    if p.policyname = 'rfq_select'   then q := replace(q, '(owner_id IS NULL)', pool_rfq);  end if;
    if q is not distinct from p.qual and c is not distinct from p.with_check then continue; end if;
    execute format('alter policy %I on public.%I%s%s', p.policyname, p.tablename,
                   case when q is not null then ' using (' || q || ')' else '' end,
                   case when c is not null then ' with check (' || c || ')' else '' end);
    n := n + 1;
  end loop;
  raise notice 'team-aware policies: %', n;
end $do$;

-- ---------------------------------------------------------------- functions that bypass the policies
-- working on a lead: Admins / team-less Managers any; a team Manager his team's; others their own
create or replace function public.can_work_lead(p_lead bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select public.sees_all() or exists (select 1 from public.leads where id = p_lead and owner_id = any(public.my_people()))
$$;

-- assigning leads: a team Manager only to his own people, only leads of his team / its pool
do $do$
declare d text := pg_get_functiondef('public.assign_leads'::regproc);
begin
  if position('Sirf apni team' in d) = 0 then
    d := replace(d, E'  if not public.is_manager() then raise exception ''Permission denied''; end if;\n',
      E'  if not public.is_manager() then raise exception ''Permission denied''; end if;\n'
      || E'  if not public.sees_all() then\n'
      || E'    if owner is not null and not (owner = any(public.my_people())) then raise exception ''Sirf apni team ke logon ko assign kar sakte ho''; end if;\n'
      || E'    if exists (select 1 from leads l where l.id = any(ids) and not (coalesce(l.owner_id = any(public.my_people()), false)\n'
      || E'               or (l.owner_id is null and (public.my_cats() is null or l.category is null or l.category = any(public.my_cats()))))) then\n'
      || E'      raise exception ''In mein se kuch leads aapki team ke nahi hain''; end if;\n'
      || E'  end if;\n');
    if position('Sirf apni team' in d) = 0 then raise exception 'assign_leads: anchor not found'; end if;
    execute d;
  end if;
end $do$;

-- locking: a team person can only take free leads / RFQs of the team's categories
do $do$
declare d text := pg_get_functiondef('public.claim'::regproc);
begin
  if position('''reason'', ''team''' in d) = 0 then
    d := replace(d, E'  if not found then return jsonb_build_object(''ok'', false, ''reason'', ''not_found''); end if;\n',
      E'  if not found then return jsonb_build_object(''ok'', false, ''reason'', ''not_found''); end if;\n'
      || E'  if v_owner is distinct from me and public.my_cats() is not null then\n'
      || E'    v_key := public.lead_cat(case when p_entity = ''lead'' then p_id else (select lead_id from rfqs where id = p_id) end);\n'
      || E'    if v_key is not null and not (v_key = any(public.my_cats())) then\n'
      || E'      return jsonb_build_object(''ok'', false, ''reason'', ''team'', ''category'', v_key);\n'
      || E'    end if;\n'
      || E'    v_key := null;\n'
      || E'  end if;\n');
    if position('''reason'', ''team''' in d) = 0 then raise exception 'claim: anchor not found'; end if;
    execute d;
  end if;
end $do$;
