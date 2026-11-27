-- =====================================================================
--  106 · Product search fast: quotations' item text gets a trigram index (Quotations page product
--   filter + Customer sales product filter), and Customer sales first keeps only the quotations
--   whose item text has every word, before opening their item lists (was ~1.6 s, opened all of them).
-- =====================================================================
create extension if not exists pg_trgm with schema extensions;
create index if not exists quotations_items_text_trgm on public.quotations using gin (items_text extensions.gin_trgm_ops);

do $do$
declare d text := pg_get_functiondef('public.customer_sales(date, date, text, text, uuid, bigint, int)'::regprocedure);
        a text := E'where q.status in (''sent'', ''won'', ''lost'')\n';
        b text := E'where q.status in (''sent'', ''won'', ''lost'')\n'
               || E'       and (qq is null or q.items_text ilike all (select ''%'' || w || ''%'' from regexp_split_to_table(qq, ''\\s+'') w where w <> ''''))\n';
begin
  if position('q.items_text ilike all' in d) > 0 then return; end if;
  if (length(d) - length(replace(d, a, ''))) / length(a) <> 1 then raise exception 'customer_sales: anchor not found once'; end if;
  execute replace(d, a, b);
end $do$;
