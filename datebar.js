// =====================================================================
//  datebar.js — one date filter for every list: Today · This week · This month · Last month ·
//  this FY · last FY · All · 📅 own dates. Each page remembers its own choice (this device).
//  Dates are India dates; a timestamp column is filtered from 00:00 to 23:59 IST.
// =====================================================================
import { h } from "./core.js";
import { L } from "./i18n.js";

const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const fy2 = (y) => String(y).slice(2);

function presets() {
  const n = new Date(), y = n.getFullYear(), m = n.getMonth(), fy = m >= 3 ? y : y - 1;
  const mon = new Date(n); mon.setDate(n.getDate() - ((n.getDay() + 6) % 7));
  return [
    ["today", L("Aaj", "Today"), iso(n), iso(n)],
    ["week", L("Is hafte", "This week"), iso(mon), iso(n)],
    ["month", L("Is mahine", "This month"), iso(new Date(y, m, 1)), iso(n)],
    ["lastmonth", L("Pichla mahina", "Last month"), iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))],
    ["fy", `FY ${fy2(fy)}-${fy2(fy + 1)}`, `${fy}-04-01`, `${fy + 1}-03-31`],
    ["lastfy", `FY ${fy2(fy - 1)}-${fy2(fy)}`, `${fy - 1}-04-01`, `${fy}-03-31`],
    ["all", L("Sab", "All time"), null, null],
  ];
}

/** the saved choice of one page: { p, from, to } */
export function dateState(key, def = "all") {
  let st = null;
  try { st = JSON.parse(localStorage.getItem("crm_dr_" + key) || "null"); } catch { /* storage blocked */ }
  return st && st.p ? st : { p: def, from: "", to: "" };
}
function save(key, st) { try { localStorage.setItem("crm_dr_" + key, JSON.stringify(st)); } catch { /* ignore */ } }

/** { from, to, label } — from / to are YYYY-MM-DD or null (open end) */
export function dateRange(st) {
  if (st.p === "custom") {
    const from = st.from || null, to = st.to || null;
    const f = (v) => new Date(v + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    return { from, to, label: from || to ? `${from ? f(from) : "…"} – ${to ? f(to) : L("aaj", "today")}` : L("Sab", "All time") };
  }
  const r = presets().find((x) => x[0] === st.p) || presets().at(-1);
  return { from: r[2], to: r[3], label: r[1] };
}
export const dateActive = (st) => !!(dateRange(st).from || dateRange(st).to);

/** filter a Supabase query on `col` (a date column, or a timestamp column with ts = true) */
export function applyDates(q, col, st, ts = false) {
  const { from, to } = dateRange(st);
  if (from) q = q.gte(col, ts ? from + "T00:00:00+05:30" : from);
  if (to) q = q.lte(col, ts ? to + "T23:59:59.999+05:30" : to);
  return q;
}

/** the bar; wire it with wireDateBar() */
export function dateBarHtml(key, st) {
  return `<div class="datebar" id="db-${key}" role="group" aria-label="${h(L("Date", "Date"))}">
    <span class="db-l">📅</span>
    <div class="chips">${presets().map(([k, l]) => `<button type="button" class="chip ${st.p === k ? "on" : ""}" data-dbp="${k}" aria-pressed="${st.p === k}">${h(l)}</button>`).join("")}
      <button type="button" class="chip ${st.p === "custom" ? "on" : ""}" data-dbp="custom" aria-pressed="${st.p === "custom"}">${L("Apni dates", "Dates")}</button></div>
    ${st.p === "custom" ? `<span class="db-own"><input class="input" type="date" data-dbf="from" value="${h(st.from || "")}" aria-label="From"><span class="mu">→</span><input class="input" type="date" data-dbf="to" value="${h(st.to || "")}" aria-label="To"></span>` : ""}
  </div>`;
}
export function wireDateBar(root, key, st, onChange) {
  const bar = root.querySelector("#db-" + key); if (!bar) return;
  const redraw = () => { bar.outerHTML = dateBarHtml(key, st); wireDateBar(root, key, st, onChange); };
  bar.querySelectorAll("[data-dbp]").forEach((b) => b.onclick = () => {
    st.p = b.dataset.dbp;
    if (st.p === "custom" && !st.from && !st.to) { const r = presets()[2]; st.from = r[2]; st.to = r[3]; }   // start from "this month"
    save(key, st); redraw(); onChange(st);
  });
  bar.querySelectorAll("[data-dbf]").forEach((i) => i.onchange = () => { st[i.dataset.dbf] = i.value; save(key, st); onChange(st); });
}
