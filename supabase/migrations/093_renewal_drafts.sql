-- =====================================================================
--  093 · Quotations → "⚡ Renewal drafts" section.
--   A draft the CRM made for a renewal (renewal_id set, still draft) lives in its own tab,
--   not in the main list. Once it is sent / won / lost it joins the main list.
-- =====================================================================
alter table public.quotations add column if not exists ren_draft boolean
  generated always as (renewal_id is not null and status::text = 'draft') stored;
create index if not exists quotations_ren_draft_idx on public.quotations (created_at desc) where ren_draft;
