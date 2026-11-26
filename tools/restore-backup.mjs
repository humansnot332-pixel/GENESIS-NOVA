#!/usr/bin/env node
// =====================================================================
//  Genesis Nova — restore a backup file (…json.gz from Admin → Backup)
//  into a database that already has the CRM schema (all migrations run),
//  e.g. a NEW Supabase project in a disaster, or a test database.
//
//    node tools/restore-backup.mjs <backup.json.gz> "<postgres connection string>" [--wipe] [--create-logins]
//
//  • --wipe empties the target's CRM tables first (never use it on the live CRM!).
//  • --create-logins makes the login accounts again from the file's "_auth_users" list (same ids,
//    no passwords) — for a brand-new project. Run it BEFORE people log in there.
//  Disaster steps: new Supabase project → run supabase/migrations in order → this tool with
//  --create-logins → deploy the edge functions + set their secrets → point config.js at it.
//  • Rows go in table by table in 1000s; generated columns are skipped.
//  • Foreign keys: pass 1 inserts every row with its OPTIONAL links left empty
//    (so the order of tables and loops like quotation ⇄ renewal don't matter),
//    pass 2 fills those links in. Required links are loaded parents-first.
//  • Our own triggers are switched off while loading (no "new lead" alerts,
//    no audit rows, values kept exactly as they were), then switched on.
//  • Sequences (lead / quotation numbers …) are moved past the highest id.
//  • Login accounts are NOT in the file (passwords can't be exported): create
//    the users again (same emails) before restoring "profiles" — the file's
//    "_auth_users" list (if present) gives their ids + emails.
//  Needs: npm i pg   (Node 18+)
// =====================================================================
import fs from "node:fs";
import zlib from "node:zlib";
import pg from "pg";

const [file, url, ...flags] = process.argv.slice(2);
if (!file || !url) { console.error("usage: node restore-backup.mjs <backup.json.gz> <postgres-url> [--wipe]"); process.exit(1); }
const wipe = flags.includes("--wipe");
const raw = fs.readFileSync(file);
// numbers are kept exactly as written in the file ("710000.00" stays 710000.00, long ids keep every digit)
const exact = typeof JSON.rawJSON === "function" ? (k, v, c) => (typeof v === "number" && c?.source ? JSON.rawJSON(c.source) : v) : undefined;
if (!exact) console.log("⚠ Node 22+ keeps numbers exactly (e.g. 710000.00); this Node may write 710000 — same value");
const bk = JSON.parse((file.endsWith(".gz") ? zlib.gunzipSync(raw) : raw).toString("utf8"), exact);
if (!bk?.data || typeof bk.data !== "object") throw new Error("not a Genesis Nova backup file");
console.log(`📦 ${file} · taken ${bk.taken_at} · by ${bk.by} · ${Object.keys(bk.data).length} tables`);

const db = new pg.Client({ connectionString: url });
await db.connect();
const q = (s, p) => db.query(s, p);
const id = (s) => '"' + String(s).replace(/"/g, '""') + '"';

// what the target has: tables, columns (minus generated), foreign keys
const tables = (await q(`select c.relname t from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p')`)).rows.map((r) => r.t);
const have = new Set(tables);
const names = Object.keys(bk.data).filter((t) => !t.startsWith("_"));
const skipped = names.filter((t) => !have.has(t));
if (skipped.length) console.log("⚠ not in the target (skipped):", skipped.join(", "));
const load = names.filter((t) => have.has(t));
const cols = {};
for (const t of load) cols[t] = (await q(`select a.attname n, a.attnotnull nn from pg_attribute a where a.attrelid = ('public.' || quote_ident($1))::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''`, [t])).rows;
const fks = (await q(`select c.conrelid::regclass::text t, c.confrelid::regclass::text p, array_agg(a.attname::text) cols, bool_and(a.attnotnull) req
  from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
  where c.contype = 'f' and c.connamespace = 'public'::regnamespace group by c.oid, c.conrelid, c.confrelid`)).rows
  .map((r) => ({ ...r, t: r.t.replace(/^public\./, ""), p: r.p.replace(/^public\./, "") }));

// parents first (every link); a link that loops back (quotation ⇄ renewal) or points at its own table is
// left empty in pass 1 and filled in pass 2 — only those, so CHECK rules like "a file belongs to a ticket or a mail" hold
const order = [], seen = new Set(), busy = new Set(), defer = Object.fromEntries(load.map((t) => [t, new Set()]));
const visit = (t) => {
  if (seen.has(t)) return; busy.add(t);
  for (const f of fks.filter((f) => f.t === t && load.includes(f.p))) {
    if (f.p === t || busy.has(f.p)) { if (f.req) throw new Error(`required loop ${t} → ${f.p}`); f.cols.forEach((c) => defer[t].add(c)); continue; }
    visit(f.p);
  }
  busy.delete(t); seen.add(t); order.push(t);
};
load.forEach(visit);
const optional = Object.fromEntries(load.map((t) => [t, [...defer[t]]]));
// primary keys: rows that already exist (e.g. the profile a new login makes by itself) are overwritten with the backup's copy
const pks = {};
for (const t of load) pks[t] = (await q(`select coalesce(array_agg(a.attname::text), '{}') k from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey) where i.indrelid = ('public.' || quote_ident($1))::regclass and i.indisprimary`, [t])).rows[0].k;

await q("begin");
try {
  // --create-logins: bring the login accounts back with the SAME ids (no passwords — everyone uses "Forgot password")
  if (flags.includes("--create-logins") && Array.isArray(bk.data._auth_users)) {
    const ac = new Set((await q(`select column_name c from information_schema.columns where table_schema = 'auth' and table_name = 'users'`)).rows.map((r) => r.c));
    const hasId = (await q(`select to_regclass('auth.identities') is not null ok`)).rows[0].ok;
    let made = 0;
    for (const u of bk.data._auth_users) {
      const cols = ["id", "email"], vals = [u.id, u.email];
      const add = (c, v) => { if (ac.has(c)) { cols.push(c); vals.push(v); } };
      add("aud", "authenticated"); add("role", "authenticated"); add("email_confirmed_at", new Date().toISOString());
      add("raw_app_meta_data", JSON.stringify({ provider: "email", providers: ["email"] })); add("raw_user_meta_data", JSON.stringify({ full_name: u.name || "" }));
      add("created_at", u.created_at || new Date().toISOString()); add("updated_at", new Date().toISOString());
      add("instance_id", "00000000-0000-0000-0000-000000000000");
      const r = await q(`insert into auth.users (${cols.map(id).join(", ")}) values (${cols.map((_, i) => "$" + (i + 1)).join(", ")}) on conflict do nothing`, vals);
      if (r.rowCount && hasId) await q(`insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at)
        values (gen_random_uuid(), $1, 'email', $1::text, jsonb_build_object('sub', $1::text, 'email', $2::text, 'email_verified', true), now(), now()) on conflict do nothing`, [u.id, u.email]);
      made += r.rowCount;
    }
    console.log(`👤 logins: ${made} created (same ids), ${bk.data._auth_users.length - made} already there — each person sets a password with "Forgot password"`);
  }
  for (const t of load) await q(`alter table public.${id(t)} disable trigger user`);
  if (wipe) { await q(`truncate ${load.map((t) => "public." + id(t)).join(", ")} cascade`); console.log("🧹 target tables emptied"); }
  // pass 1: rows in, optional links empty
  for (const t of order) {
    const rows = bk.data[t] || []; if (!rows.length) continue;
    const cs = cols[t].map((c) => c.n), opt = new Set(optional[t]);
    const list = cs.map(id).join(", "), pick = cs.map((c) => (opt.has(c) ? "null" : "r." + id(c))).join(", ");
    const pk = pks[t], rest = cs.filter((c) => !pk.includes(c));
    const upsert = !pk.length ? "" : rest.length ? ` on conflict (${pk.map(id).join(", ")}) do update set ${rest.map((c) => `${id(c)} = excluded.${id(c)}`).join(", ")}` : ` on conflict (${pk.map(id).join(", ")}) do nothing`;
    for (let i = 0; i < rows.length; i += 1000) {
      await q(`insert into public.${id(t)} (${list}) select ${pick} from jsonb_populate_recordset(null::public.${id(t)}, $1::jsonb) r${upsert}`, [JSON.stringify(rows.slice(i, i + 1000))]);
    }
    console.log(`  ✔ ${t}: ${rows.length}`);
  }
  // pass 2: optional links back in (matched on the primary key)
  for (const t of load) {
    const opt = optional[t], rows = bk.data[t] || []; if (!opt.length || !rows.length) continue;
    const pk = (await q(`select array_agg(a.attname::text) k from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey) where i.indrelid = ('public.' || quote_ident($1))::regclass and i.indisprimary`, [t])).rows[0].k || [];
    if (!pk.length) continue;
    for (let i = 0; i < rows.length; i += 1000) {
      await q(`update public.${id(t)} x set ${opt.map((c) => `${id(c)} = r.${id(c)}`).join(", ")}
               from jsonb_populate_recordset(null::public.${id(t)}, $1::jsonb) r where ${pk.map((k) => `x.${id(k)} = r.${id(k)}`).join(" and ")}
                 and (${opt.map((c) => `r.${id(c)} is not null`).join(" or ")})`, [JSON.stringify(rows.slice(i, i + 1000))]);
    }
  }
  // sequences past the highest id
  const seqs = (await q(`select s.relname seq, t.relname tbl, a.attname col from pg_class s join pg_depend d on d.objid = s.oid and d.deptype in ('a','i')
     join pg_class t on t.oid = d.refobjid join pg_attribute a on a.attrelid = t.oid and a.attnum = d.refobjsubid where s.relkind = 'S' and s.relnamespace = 'public'::regnamespace`)).rows;
  for (const s of seqs) if (load.includes(s.tbl)) await q(`select setval('public.${s.seq}', greatest(coalesce((select max(${id(s.col)}) from public.${id(s.tbl)}), 0), 1))`);
  for (const t of load) await q(`alter table public.${id(t)} enable trigger user`);
  await q("commit");
} catch (e) { await q("rollback"); console.error("❌ restore failed — nothing was changed:", e.message); process.exit(1); }

// check: every table's row count = the file's
let bad = 0;
for (const t of load) {
  const n = +(await q(`select count(*) n from public.${id(t)}`)).rows[0].n, want = (bk.data[t] || []).length;
  if (n !== want) { bad++; console.log(`❌ ${t}: ${n} rows, file has ${want}`); }
}
console.log(bad ? `❌ ${bad} table(s) differ` : `✅ restored ${load.length} tables, every row count matches the backup`);
await db.end();
