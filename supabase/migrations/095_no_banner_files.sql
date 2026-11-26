-- =====================================================================
--  095 · Our team banner is not a customer attachment.
--   Every reply quotes our signature, and with it the banner picture (geninfo-banner / cid gnbanner).
--   Mail sync stored it as the reply's "attachment" → the reply showed 📎 + the banner.
--   Now: such a row is never stored (the uploaded copy becomes an orphan the sync cleans up),
--   and the ones already stored are removed + the mails' file counts fixed.
-- =====================================================================
create or replace function public.crm_files_skip_banner() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.email_id is not null and new.name ~* '^(geninfo-banner|gnbanner)' then return null; end if;
  return new;
end $$;
drop trigger if exists crm_files_skip_banner on public.crm_files;
create trigger crm_files_skip_banner before insert on public.crm_files for each row execute function public.crm_files_skip_banner();

with gone as (
  delete from public.crm_files where email_id is not null and name ~* '^(geninfo-banner|gnbanner)' returning email_id)
update public.email_messages e set files = (select count(*) from public.crm_files f where f.email_id = e.id)
 where e.id in (select email_id from gone);
