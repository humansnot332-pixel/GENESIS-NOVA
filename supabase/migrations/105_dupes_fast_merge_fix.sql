-- =====================================================================
--  105 · Duplicate cleaner: fast + merge keeps everything
--   1. dup_groups(): the groups AND the leads in them, in one call (was 3 calls, ~1 s).
--      Every lead's keys (GSTIN / email / company name) are worked out once, not three times.
--   2. merge_leads: also moves OBFs, proformas, vendor POs, queued mails, automation log,
--      lock history and web-found candidates to the kept lead (before: their link was lost),
--      fills category too, and a team Manager can merge only his team's / pool leads.
--   3. customer_sales product filter: every word must be in the item, in any order
--      ("civil 3d autodesk" finds "Autodesk Civil 3D").
-- =====================================================================

-- ---------------------------------------------------------------- 1. groups + leads in one go
create or replace function public.dup_groups() returns jsonb
language sql stable security invoker set search_path = public as $$
  with l as materialized (
    select id, upper(gstin) g, lower(email) e, public.norm_company(company) n from leads),
  g as (
    select 'gst:' || g key, 'Same GSTIN' reason, array_agg(id order by id) ids from l where length(g) >= 10 group by g having count(*) > 1
    union all
    select 'mail:' || e, 'Same email', array_agg(id order by id) from l where e is not null group by e having count(*) > 1
    union all
    select 'name:' || n, 'Same company name', array_agg(id order by id) from l where length(n) >= 4 group by n having count(*) > 1),
  f as (
    select g.* from g
     where public.is_manager() and not exists (select 1 from duplicate_ignores d where d.key = g.key)
     order by cardinality(g.ids) desc, g.key limit 300)
  select jsonb_build_object(
    'groups', coalesce((select jsonb_agg(jsonb_build_object('key', key, 'reason', reason, 'ids', ids) order by cardinality(ids) desc, key) from f), '[]'::jsonb),
    'leads', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'company', x.company, 'contact_name', x.contact_name, 'phone', x.phone,
                 'email', x.email, 'city', x.city, 'gstin', x.gstin, 'status', x.status, 'owner_id', x.owner_id, 'call_count', x.call_count,
                 'created_at', x.created_at, 'score', x.score, 'source', x.source))
               from leads x where x.id in (select unnest(ids) from f)), '[]'::jsonb))
$$;
revoke all on function public.dup_groups() from public, anon;
grant execute on function public.dup_groups() to authenticated;

-- the old one, same speed-up (kept for anything still calling it)
create or replace function public.find_duplicates() returns table(key text, reason text, ids bigint[])
language sql stable security invoker set search_path = public as $$
  with l as materialized (select id, upper(gstin) g, lower(email) e, public.norm_company(company) n from leads),
  g as (
    select 'gst:' || g key, 'Same GSTIN' reason, array_agg(id order by id) ids from l where length(g) >= 10 group by g having count(*) > 1
    union all
    select 'mail:' || e, 'Same email', array_agg(id order by id) from l where e is not null group by e having count(*) > 1
    union all
    select 'name:' || n, 'Same company name', array_agg(id order by id) from l where length(n) >= 4 group by n having count(*) > 1)
  select g.key, g.reason, g.ids from g
  where public.is_manager() and not exists (select 1 from duplicate_ignores d where d.key = g.key)
  order by cardinality(g.ids) desc, g.key limit 300
$$;

-- ---------------------------------------------------------------- 2. merge moves everything
create or replace function public.merge_leads(p_primary bigint, p_others bigint[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o leads; p leads; n int := 0; phones text[];
begin
  if not public.is_manager() then raise exception 'Permission denied'; end if;
  p_others := array(select distinct x from unnest(p_others) x where x is not null and x <> p_primary);
  if cardinality(p_others) = 0 then return jsonb_build_object('ok', true, 'merged', 0); end if;
  -- a team Manager: only his team's leads / the team's free pool
  if not public.sees_all() and exists (
       select 1 from leads l where l.id = any(p_others || p_primary)
          and not (coalesce(l.owner_id = any(public.my_people()), false)
                   or (l.owner_id is null and (public.my_cats() is null or l.category is null or l.category = any(public.my_cats()))))) then
    raise exception 'In mein se kuch leads aapki team ke nahi hain';
  end if;
  select * into p from leads where id = p_primary for update;
  if not found then raise exception 'Primary lead not found'; end if;
  perform set_config('crm.sys', 'on', true);
  for o in select * from leads where id = any(p_others) order by id for update loop
    update activities      set lead_id = p_primary where lead_id = o.id;
    update tasks           set lead_id = p_primary where lead_id = o.id;
    update rfqs            set lead_id = p_primary where lead_id = o.id;
    update quotations      set lead_id = p_primary where lead_id = o.id;
    update obfs            set lead_id = p_primary where lead_id = o.id;
    update proformas       set lead_id = p_primary where lead_id = o.id;
    update purchase_orders set lead_id = p_primary where lead_id = o.id;
    update email_messages  set lead_id = p_primary where lead_id = o.id;
    update email_outbox    set lead_id = p_primary where lead_id = o.id;
    update automation_log  set lead_id = p_primary where lead_id = o.id;
    update renewals        set lead_id = p_primary where lead_id = o.id;
    update orders          set lead_id = p_primary where lead_id = o.id;
    update invoices        set lead_id = p_primary where lead_id = o.id;
    update tickets         set lead_id = p_primary where lead_id = o.id;
    update visits          set lead_id = p_primary where lead_id = o.id;
    update lead_candidates set lead_id = p_primary where lead_id = o.id;
    update lock_requests   set entity_id = p_primary where entity = 'lead' and entity_id = o.id;
    update lock_history    set entity_id = p_primary where entity = 'lead' and entity_id = o.id;
    phones := array(select distinct x from unnest(p.alt_phones || o.alt_phones || array[o.phone]) x where x is not null and x <> coalesce(p.phone, ''));
    delete from leads where id = o.id;          -- frees the phone number before it moves to alt_phones
    update leads set
      contact_name = coalesce(contact_name, o.contact_name), designation = coalesce(designation, o.designation),
      email = coalesce(email, o.email), website = coalesce(website, o.website), area = coalesce(area, o.area),
      city = coalesce(city, o.city), industry = coalesce(industry, o.industry), category = coalesce(category, o.category),
      gstin = coalesce(gstin, o.gstin), pan = coalesce(pan, o.pan), address = coalesce(address, o.address), state = coalesce(state, o.state),
      pincode = coalesce(pincode, o.pincode), deal_value = coalesce(deal_value, o.deal_value),
      phone = coalesce(phone, o.phone),
      alt_phones = phones[1:5],
      products = array(select distinct x from unnest(products || o.products) x),
      tags = array(select distinct x from unnest(tags || o.tags) x),
      notes = left(concat_ws(E'\n— merged —\n', notes, o.notes), 5000),
      call_count = call_count + o.call_count, email_count = email_count + o.email_count, reply_count = reply_count + o.reply_count,
      last_contacted = greatest(last_contacted, o.last_contacted), last_emailed_at = greatest(last_emailed_at, o.last_emailed_at),
      last_reply_at = greatest(last_reply_at, o.last_reply_at),
      next_follow_up = coalesce(next_follow_up, o.next_follow_up),
      hidden = hidden and o.hidden            -- a real (visible) customer stays visible
    where id = p_primary;
    select * into p from leads where id = p_primary;
    n := n + 1;
  end loop;
  perform set_config('crm.sys', 'off', true);
  insert into activities(lead_id, user_id, kind, body) values (p_primary, auth.uid(), 'system', '🔗 ' || n || ' duplicate lead(s) merge kiye');
  return jsonb_build_object('ok', true, 'merged', n);
end $$;
revoke execute on function public.merge_leads(bigint, bigint[]) from public, anon;
grant execute on function public.merge_leads(bigint, bigint[]) to authenticated;

-- ---------------------------------------------------------------- 3. sales product filter: all words, any order
do $do$
declare d text := pg_get_functiondef('public.customer_sales(date, date, text, text, uuid, bigint, int)'::regprocedure);
        a text := $a$(qq is null or lower(x->>'desc') like '%' || qq || '%')$a$;
        b text := $b$(qq is null or not exists (select 1 from regexp_split_to_table(qq, '\s+') w where w <> '' and strpos(lower(x->>'desc'), w) = 0))$b$;
begin
  if position(a in d) > 0 then execute replace(d, a, b);
  elsif position('regexp_split_to_table(qq' in d) = 0 then raise exception 'customer_sales: anchor not found'; end if;
end $do$;
