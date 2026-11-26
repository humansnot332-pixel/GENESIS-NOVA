-- =====================================================================
--  100 · First-login guide: remember (per person, every device) that the tour was seen.
--   Everyone who already uses the CRM is marked as done, so only NEW employees get it by itself;
--   anybody can replay it from "Mera profile → 🧭 Guide dobara dekho".
-- =====================================================================
alter table public.profiles add column if not exists tour_done_at timestamptz;
update public.profiles set tour_done_at = now() where tour_done_at is null;
-- profiles columns are granted one by one (secret ones like mail_token_hash stay hidden) → the new one must be granted, or the app can't load anyone's profile
grant select (tour_done_at) on public.profiles to authenticated;
