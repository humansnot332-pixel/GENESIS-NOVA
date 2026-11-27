-- =====================================================================
--  104 · A renewal's "🔁 Renewal: … — company" call task goes away with the renewal.
--   The daily renewal job (9:15) makes one task per renewal ending within 30 days. When a renewal was
--   deleted / replaced (e.g. the renewal-sheet import swapped old ERP guesses for real dates) or got
--   renewed / lost, its task stayed open and showed "Overdue" for a renewal that no longer exists.
--   Now: delete → its open task is removed; renewed / lost / cancelled, or product changed → closed (done).
--   + the open renewal tasks that already have no live renewal are removed once.
-- =====================================================================
create or replace function public.renewal_task_close() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_title text;
begin
  select left('🔁 Renewal: ' || old.product || ' — ' || l.company, 200) into v_title from leads l where l.id = old.lead_id;
  if v_title is null then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then
    delete from tasks where lead_id = old.lead_id and not done and title = v_title;
  elsif new.status not in ('active', 'unconfirmed') or new.product is distinct from old.product or new.lead_id is distinct from old.lead_id then
    update tasks set done = true, done_at = now() where lead_id = old.lead_id and not done and title = v_title;
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists renewal_task_close on public.renewals;
create trigger renewal_task_close after delete or update of status, product, lead_id on public.renewals
  for each row execute function public.renewal_task_close();

-- once: open renewal tasks whose renewal is gone
delete from public.tasks t using public.leads l
 where l.id = t.lead_id and not t.done and t.title like '🔁 Renewal:%'
   and not exists (select 1 from public.renewals r where r.lead_id = t.lead_id and r.status in ('active', 'unconfirmed')
                   and t.title = left('🔁 Renewal: ' || r.product || ' — ' || l.company, 200));
