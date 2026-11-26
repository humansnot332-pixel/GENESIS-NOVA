-- =====================================================================
--  096 · A quotation that went to the customer is "sent".
--   Making its link / mail / PDF stamped sent_at but left status "draft" until somebody pressed Save
--   (PR/26/19078 was mailed 8 times and still said draft) → Inbox, reports and the lock all saw a draft.
-- =====================================================================
create or replace function public.quote_sent_stamp() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.share_token is null and new.share_token is not null then
    new.sent_at := coalesce(new.sent_at, now());                                -- online link made = sent
    if new.status::text = 'draft' then new.status := 'sent'; end if;
  end if;
  if new.sent_at is null and new.status::text = 'sent' then new.sent_at := now(); end if;
  return new;
end $$;

-- the ones that already went out but still say draft
update public.quotations set status = 'sent' where status::text = 'draft' and sent_at is not null and share_token is not null;
