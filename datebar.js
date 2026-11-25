// =====================================================================
//  datebar.js — one date filter for every list. Folded into a single calendar button that shows the
//  current choice; pressing it opens all choices (Today · This week · This month · Last month · this FY ·
//  last FY · All · own dates) in an animated panel. Each page remembers its own choice (this device).
//  Dates are India dates; a timestamp column is filtered from 00:00 to 23:59 IST.
// =====================================================================
import { h, ic } from "./core.js";
import { L } from "./i18n.js";

const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const fy2 = (y) => String(y).slice(2);
const short = (v) => new Date(v + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });

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

/** the folded bar (one button); wire it with wireDateBar() */
export function dateBarHtml(key, st) {
  const { label } = dateRange(st), on = dateActive(st);
  const hint = (f, t) => !f ? L("shuru se", "everything") : f === t ? short(f) : `${short(f)} – ${short(t)}`;
  return `<div class="datebar" id="db-${key}">
    <button type="button" class="db-btn ${on ? "on" : ""}" aria-haspopup="dialog" aria-expanded="false" title="${h(L("Date chuno", "Pick dates"))}">
      <span class="db-ic">${ic("calendar")}</span><span class="db-cur">${h(label)}</span><span class="db-car" aria-hidden="true">▾</span></button>
    ${on ? `<button type="button" class="db-x" title="${h(L("Date hatao", "Clear dates"))}" aria-label="${h(L("Date hatao", "Clear dates"))}">✕</button>` : ""}
    <div class="db-pop" role="dialog" aria-label="${h(L("Date chuno", "Pick dates"))}" hidden>
      <div class="db-grid">${presets().map(([k, l, f, t], i) => `<button type="button" class="db-opt ${st.p === k ? "on" : ""}" data-dbp="${k}" aria-pressed="${st.p === k}" style="--i:${i}"><b>${h(l)}</b><small>${h(hint(f, t))}</small></button>`).join("")}
        <button type="button" class="db-opt ${st.p === "custom" ? "on" : ""}" data-dbp="custom" aria-pressed="${st.p === "custom"}" style="--i:7"><b>${L("Apni dates", "Own dates")}</b><small>${L("se → tak", "from → to")}</small></button></div>
      <div class="db-own" ${st.p === "custom" ? "" : "hidden"}>
        <label><span>${L("Se", "From")}</span><input class="input" type="date" data-dbf="from" value="${h(st.from || "")}"></label>
        <label><span>${L("Tak", "To")}</span><input class="input" type="date" data-dbf="to" value="${h(st.to || "")}"></label>
        <button type="button" class="btn primary sm" data-dbgo>${L("Lagao", "Apply")}</button>
      </div>
    </div>
  </div>`;
}

let closeOpen = null;   // only one panel open at a time
export function wireDateBar(root, key, st, onChange) {
  const bar = root.querySelector("#db-" + key); if (!bar) return;
  const btn = bar.querySelector(".db-btn"), pop = bar.querySelector(".db-pop"), own = bar.querySelector(".db-own");
  const redraw = () => { bar.outerHTML = dateBarHtml(key, st); wireDateBar(root, key, st, onChange); };
  const outside = (e) => { if (!bar.contains(e.target)) close(); };
  const esc = (e) => { if (e.key === "Escape") { close(); btn.focus(); } };
  function close() {
    if (pop.hidden) return;
    document.removeEventListener("pointerdown", outside, true); document.removeEventListener("keydown", esc, true);
    btn.setAttribute("aria-expanded", "false"); bar.classList.remove("open");
    pop.classList.add("out"); setTimeout(() => { pop.hidden = true; pop.classList.remove("out"); }, 160);
    if (closeOpen === close) closeOpen = null;
  }
  function open() {
    closeOpen?.(); closeOpen = close;
    pop.hidden = false; bar.classList.add("open"); btn.setAttribute("aria-expanded", "true");
    // keep the panel on screen (phones / a button near the right edge)
    pop.style.left = "0px";
    const r = pop.getBoundingClientRect();
    if (r.right > innerWidth - 8) pop.style.left = Math.min(0, innerWidth - 8 - r.right) + "px";
    document.addEventListener("pointerdown", outside, true); document.addEventListener("keydown", esc, true);
    (bar.querySelector(".db-opt.on") || bar.querySelector(".db-opt"))?.focus({ preventScroll: true });
  }
  btn.onclick = () => (pop.hidden ? open() : close());
  const apply = () => { save(key, st); close(); setTimeout(() => { redraw(); onChange(st); }, 120); };
  bar.querySelector(".db-x")?.addEventListener("click", () => { st.p = "all"; save(key, st); redraw(); onChange(st); });
  bar.querySelectorAll("[data-dbp]").forEach((b) => b.onclick = () => {
    if (b.dataset.dbp === "custom") {
      bar.querySelectorAll(".db-opt").forEach((o) => { o.classList.toggle("on", o === b); o.setAttribute("aria-pressed", String(o === b)); });
      if (!st.from && !st.to) { const r = presets()[2]; bar.querySelector('[data-dbf="from"]').value = r[2]; bar.querySelector('[data-dbf="to"]').value = r[3]; }
      own.hidden = false; own.querySelector("input").focus();
      return;
    }
    st.p = b.dataset.dbp; apply();
  });
  bar.querySelector("[data-dbgo]").onclick = () => {
    const f = bar.querySelector('[data-dbf="from"]').value, t = bar.querySelector('[data-dbf="to"]').value;
    st.p = "custom"; st.from = f && t && f > t ? t : f; st.to = f && t && f > t ? f : t; apply();
  };
  own.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); bar.querySelector("[data-dbgo]").click(); } });
}
