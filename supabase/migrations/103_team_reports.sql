-- =====================================================================
--  103 · Reports for teams.
--   • daily_report: a team Manager's list = his team (not every employee with 0 calls).
--   • day_summary(day, team): the 5:50 summary for one team (null = the whole company).
--     A team Manager calling it always gets his own team; Admin / Director / IT Head / team-less Manager: everything.
--   • send_day_summary(): each Admin / team-less Manager gets the company summary, each team Manager his team's.
--   (Dashboard / calls / email reports run with the caller's rights → the team rules of 102 already scope them.)
-- =====================================================================
do $do$
declare d text := pg_get_functiondef('public.daily_report'::regproc);
begin
  if position('my_people()' in d) = 0 then
    d := replace(d, 'where p.active and (mgr or p.id = me)', 'where p.active and ((mgr and (public.sees_all() or p.id = any(public.my_people()))) or p.id = me)');
    if position('my_people()' in d) = 0 then raise exception 'daily_report: anchor not found'; end if;
    execute d;
  end if;
end $do$;

drop function if exists public.day_summary(date);
create or replace function public.day_summary(p_day date default null, p_team bigint default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  dd date := coalesce(p_day, (now() at time zone 'Asia/Kolkata')::date);
  ra timestamptz := dd::timestamp at time zone 'Asia/Kolkata';
  rb timestamptz := (dd + 1)::timestamp at time zone 'Asia/Kolkata';
  at_ timestamptz := least(now(), rb);
  nd date := dd + case when extract(isodow from dd + 1) = 7 then 2 else 1 end;
  open_st text[] := array['new','contacted','interested','quote_sent','demo','negotiation'];
  tm uuid[]; cats text[]; tname text; people jsonb; won jsonb; res jsonb;
begin
  if auth.uid() is not null then
    if not public.is_manager() then raise exception 'Permission denied'; end if;
    if public.team_mgr() then p_team := public.my_team();                 -- a team Manager: always his own team
    elsif not public.sees_all() then raise exception 'Permission denied'; end if;
  end if;
  if p_team is not null then
    select coalesce(array_agg(p.id), '{}') into tm from profiles p where p.team_id = p_team;
    select nullif(t.categories, '{}'), t.name into cats, tname from teams t where t.id = p_team;
  end if;

  with u as (
    select p.id, p.full_name, p.role, coalesce(p.daily_target, 0) target from profiles p
     where p.active and (tm is null or p.id = any(tm))),
  r as (
    select u.*,
      (select count(distinct x.lead_id) from activities x where x.user_id = u.id and x.kind = 'call' and x.created_at >= ra and x.created_at < rb) calls,
      (select count(distinct x.lead_id) from activities x where x.user_id = u.id and x.kind = 'call' and x.outcome in ('interested','quote','demo','won') and x.created_at >= ra and x.created_at < rb) positive,
      (select count(*) from quotations x where x.owner_id = u.id and x.created_at >= ra and x.created_at < rb and x.import_batch is null and x.status <> 'draft') quotes,
      (select coalesce(sum(x.grand_total), 0) from quotations x where x.owner_id = u.id and x.created_at >= ra and x.created_at < rb and x.import_batch is null and x.status <> 'draft') quote_value,
      (select count(*) from activities x where x.user_id = u.id and (x.outcome = 'won' or x.body = 'Status → Won') and x.created_at >= ra and x.created_at < rb) won,
      (select count(*) from leads l where l.owner_id = u.id and l.status::text = any(open_st) and l.next_follow_up < at_) overdue,
      (select count(*) from leads l where l.owner_id = u.id and l.status::text = any(open_st) and l.lock_until > at_
          and coalesce(l.last_contacted, l.locked_at) < at_ - interval '3 days') stale,
      a.first_seen, a.last_seen, coalesce(a.active_min, 0) active_min
    from u left join attendance a on a.user_id = u.id and a.day = dd)
  select coalesce(jsonb_agg(to_jsonb(r) order by r.calls desc, r.full_name), '[]'::jsonb) into people
    from r where r.role <> 'admin' or r.target > 0 or r.calls > 0 or r.quotes > 0 or r.overdue > 0 or r.stale > 0;

  select coalesce(jsonb_agg(jsonb_build_object('company', l.company, 'value', l.deal_value, 'by', x.user_id) order by l.deal_value desc nulls last), '[]'::jsonb)
    into won
    from (select distinct on (lead_id) lead_id, user_id from activities
           where (outcome = 'won' or body = 'Status → Won') and created_at >= ra and created_at < rb and (tm is null or user_id = any(tm))
           order by lead_id, created_at) x
    join leads l on l.id = x.lead_id;

  res := jsonb_build_object(
    'day', dd, 'as_of', at_, 'next_day', nd, 'team', tname,
    'people', people,
    'totals', jsonb_build_object(
      'calls', (select coalesce(sum((p->>'calls')::int), 0) from jsonb_array_elements(people) p),
      'target', (select coalesce(sum((p->>'target')::int), 0) from jsonb_array_elements(people) p where (p->>'role') <> 'admin' or (p->>'target')::int > 0),
      'quotes', (select coalesce(sum((p->>'quotes')::int), 0) from jsonb_array_elements(people) p),
      'quote_value', (select coalesce(sum((p->>'quote_value')::numeric), 0) from jsonb_array_elements(people) p),
      'won', jsonb_array_length(won),
      'won_value', (select coalesce(sum((w->>'value')::numeric), 0) from jsonb_array_elements(won) w),
      'paid', (select coalesce(sum(y.amount), 0) from payments y left join invoices i on i.id = y.invoice_id
                where y.created_at >= ra and y.created_at < rb and (tm is null or i.owner_id = any(tm))),
      'paid_n', (select count(*) from payments y left join invoices i on i.id = y.invoice_id
                where y.created_at >= ra and y.created_at < rb and (tm is null or i.owner_id = any(tm))),
      'overdue', (select coalesce(sum((p->>'overdue')::int), 0) from jsonb_array_elements(people) p),
      'absent', (select coalesce(jsonb_agg(p.full_name), '[]'::jsonb) from profiles p where p.active and p.role in ('telecaller','sales','presales')
                  and (tm is null or p.id = any(tm))
                  and not exists (select 1 from attendance t where t.user_id = p.id and t.day = dd))),
    'won_list', won,
    'alerts', jsonb_build_object(
      'replies', (select coalesce(jsonb_agg(z), '[]'::jsonb) from (
          select coalesce(l.company, e.counterpart_name, e.counterpart) who, e.created_at at, e.user_id
            from email_messages e left join leads l on l.id = e.lead_id
           where e.direction = 'in' and not e.archived and coalesce(e.intent, 'other') not in ('auto_reply', 'bounce')
             and (tm is null or e.user_id = any(tm))
             and e.created_at < at_ - interval '24 hours' and e.created_at > at_ - interval '14 days'
             and not exists (select 1 from email_messages o where o.direction = 'out' and o.counterpart = e.counterpart and o.created_at > e.created_at)
           order by e.created_at limit 20) z),
      'rfqs_untouched', (select count(*) from rfqs r where r.status = 'new' and r.touched_at is null and r.created_at < at_ - interval '2 hours'
                           and (tm is null or r.owner_id = any(tm)
                                or (r.owner_id is null and (cats is null or public.lead_cat(r.lead_id) is null or public.lead_cat(r.lead_id) = any(cats))))),
      'stale', (select coalesce(sum((p->>'stale')::int), 0) from jsonb_array_elements(people) p),
      'inv_overdue_n', (select count(*) from invoice_balances where not cancelled and balance > 0.5 and due_date < dd and (tm is null or owner_id = any(tm))),
      'inv_overdue', (select coalesce(sum(balance), 0) from invoice_balances where not cancelled and balance > 0.5 and due_date < dd and (tm is null or owner_id = any(tm)))),
    'tomorrow', jsonb_build_object(
      'followups', (select count(*) from leads where status::text = any(open_st) and (tm is null or owner_id = any(tm))
                      and next_follow_up >= nd::timestamp at time zone 'Asia/Kolkata' and next_follow_up < (nd + 1)::timestamp at time zone 'Asia/Kolkata'),
      'renewals_n', (select count(*) from renewals r where r.status = 'active' and r.end_date between dd and dd + 7
                       and (tm is null or r.owner_id = any(tm) or r.lead_id in (select id from leads where owner_id = any(tm)))),
      'renewals_amt', (select coalesce(sum(r.amount), 0) from renewals r where r.status = 'active' and r.end_date between dd and dd + 7
                       and (tm is null or r.owner_id = any(tm) or r.lead_id in (select id from leads where owner_id = any(tm)))),
      'quotes_expiring', (select count(*) from quotations where status = 'sent' and quote_date is not null and (tm is null or owner_id = any(tm))
                            and quote_date + coalesce(validity_days, 30) between dd and dd + 3),
      'pay_due', (select coalesce(sum(balance), 0) from invoice_balances where not cancelled and balance > 0.5 and due_date = nd and (tm is null or owner_id = any(tm)))),
    'hot', jsonb_build_object(
      'quotes', (select coalesce(jsonb_agg(z), '[]'::jsonb) from (
          select q.id, q.quote_no, q.to_party->>'name' who, q.view_count views from quotations q
           where q.last_viewed_at >= ra and q.last_viewed_at < rb and (tm is null or q.owner_id = any(tm))
           order by q.view_count desc, q.last_viewed_at desc limit 5) z),
      'mails', (select coalesce(jsonb_agg(z), '[]'::jsonb) from (
          select coalesce(l.company, e.counterpart_name, e.counterpart) who, e.subject, e.open_count opens from email_messages e left join leads l on l.id = e.lead_id
           where e.direction = 'out' and e.last_open_at >= ra and e.last_open_at < rb and (tm is null or e.user_id = any(tm))
           order by e.last_open_at desc limit 5) z)));
  return res;
end $$;
revoke all on function public.day_summary(date, bigint) from public, anon;
grant execute on function public.day_summary(date, bigint) to authenticated;

-- 5:50: the company summary for Admins / team-less Managers, a team summary for each team Manager
create or replace function public.send_day_summary() returns int
language plpgsql security definer set search_path = public as $$
declare m record; n int := 0; s jsonb; t jsonb; body text; pct int; cache jsonb := '{}'::jsonb; k text;
begin
  for m in select p.id, case when p.role = 'manager' then p.team_id end as team_id from profiles p where p.active and p.role in ('admin', 'manager') loop
    k := coalesce(m.team_id::text, 'all');
    if cache ? k then s := cache->k; else s := public.day_summary(null, m.team_id); cache := cache || jsonb_build_object(k, s); end if;
    t := s->'totals';
    pct := case when (t->>'target')::int > 0 then round(100.0 * (t->>'calls')::int / (t->>'target')::int) end;
    body := coalesce((s->>'team') || ' · ', '')
         || (t->>'calls') || ' calls' || coalesce(' (' || pct || '%)', '')
         || ' · ' || (t->>'quotes') || ' quotations ' || public.inr_short((t->>'quote_value')::numeric)
         || ' · ' || (t->>'won') || ' won'
         || case when (t->>'paid')::numeric > 0 then ' · ' || public.inr_short((t->>'paid')::numeric) || ' aaya' else '' end
         || case when (t->>'overdue')::int > 0 then ' · ⚠️ ' || (t->>'overdue') || ' follow-ups baaki' else '' end
         || case when jsonb_array_length(s->'alerts'->'replies') > 0 then ' · ' || jsonb_array_length(s->'alerts'->'replies') || ' replies bina jawab' else '' end;
    perform public.notify(m.id, 'digest', '📊 Aaj ka din · ' || to_char((s->>'day')::date, 'DD Mon'), body, '#/daily', null);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.send_day_summary() from public, anon, authenticated;

-- lock powers of a team Manager stay inside his team (force-release, approve requests, reset chances, handover)
do $do$
declare f text; d text; a text; b text;
  fixes text[][] := array[
    array['decide_request', 'if me is distinct from v_owner and not public.is_manager() then',
          'if me is distinct from v_owner and not (public.sees_all() or (public.is_manager() and v_owner = any(public.my_people()))) then'],
    array['release', 'if v_owner <> me and not public.is_manager() then',
          'if v_owner <> me and not (public.sees_all() or (public.is_manager() and v_owner = any(public.my_people()))) then'],
    array['pardon_lock', 'if p_user is null then raise exception ''user?''; end if;',
          'if p_user is null then raise exception ''user?''; end if; if not public.sees_all() and not (p_user = any(public.my_people())) then raise exception ''Sirf apni team''; end if;'],
    array['handover_locks', 'if p_from is null or p_from = p_to then raise exception ''Alag-alag log chuno''; end if;',
          'if p_from is null or p_from = p_to then raise exception ''Alag-alag log chuno''; end if; if not public.sees_all() and (not (p_from = any(public.my_people())) or (p_to is not null and not (p_to = any(public.my_people())))) then raise exception ''Sirf apni team ke andar handover''; end if;'],
    array['release_bulk', 'if v_tbl is null then raise exception ''bad entity''; end if;',
          'if v_tbl is null then raise exception ''bad entity''; end if; if not public.sees_all() then execute format(''select count(*) from public.%I where id = any($1) and owner_id is not null and not (owner_id = any($2))'', v_tbl) into n using p_ids, public.my_people(); if n > 0 then raise exception ''Kuch locks aapki team ke nahi''; end if; end if;']];
  i int;
begin
  for i in 1 .. array_length(fixes, 1) loop
    f := fixes[i][1]; a := fixes[i][2]; b := fixes[i][3];
    d := pg_get_functiondef(('public.' || f)::regproc);
    if position('my_people()' in d) > 0 then continue; end if;          -- already done
    if position(a in d) = 0 then raise exception '%: anchor not found', f; end if;
    execute replace(d, a, b);
  end loop;
end $do$;
