// =====================================================================
//  💰 Customer sales — how much business each customer has given us
//   Sales = WON quotations (the ERP history + everything won in the CRM, e.g. when an OBF is approved),
//   without GST, line by line — so a product / category filter counts only those lines.
//   Filters: period (FY / 12 months / month / all / custom dates), product text, category, salesperson.
//   A salesperson sees their own customers (database rules); Admin / Manager see everyone.
//   Click a customer → year-wise sales, what they buy, their won quotations, open the lead.
// =====================================================================
import { sb, S, h, inr, inrShort, num, toast, fail, modal, closeModal, busy, isMgr, download, toCSV, userName } from "./core.js";
import { L } from "./i18n.js";

const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const day = (d) => d ? new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fyStart = (y) => `${y}-04-01`, fyEnd = (y) => `${y + 1}-03-31`;
function periods() {
  const now = new Date(), y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1, ago = new Date(now); ago.setFullYear(now.getFullYear() - 1); ago.setDate(ago.getDate() + 1);
  const fy = (n) => `FY ${String(n).slice(2)}-${String(n + 1).slice(2)}`;
  return [
    ["fy", fy(y), fyStart(y), iso(now)],
    ["lfy", fy(y - 1), fyStart(y - 1), fyEnd(y - 1)],
    ["12m", L("12 mahine", "12 months"), iso(ago), iso(now)],
    ["m", L("Is mahine", "This month"), iso(new Date(now.getFullYear(), now.getMonth(), 1)), iso(now)],
    ["all", L("Sab time", "All time"), "", ""],
  ];
}
const F = { p: "all", from: "", to: "", q: "", cat: "", owner: "", find: "" };   // remembered while the CRM is open
let CATS = null;

export async function viewSales(el, { barChart, openLead }) {
  const mgr = isMgr();
  if (!CATS) { const { data } = await sb.from("products").select("category").not("category", "is", null).limit(5000); CATS = [...new Set((data || []).map((x) => x.category))].sort(); }
  const P = periods(), cur = P.find((x) => x[0] === F.p);
  const from = cur ? cur[2] : F.from, to = cur ? cur[3] : F.to;
  const { data: r, error } = await sb.rpc("customer_sales", { p_from: from || null, p_to: to || null, p_q: F.q || null, p_cat: F.cat || null, p_owner: F.owner || null, p_lead: null, p_limit: 2000 });
  if (error) throw error;
  const T = r?.total || {}, all = r?.customers || [], find = F.find.toLowerCase().trim();
  const rows = all.filter((c) => !find || [c.company, c.cname, c.city, c.top_item].join(" ").toLowerCase().includes(find));
  const top10 = all.slice(0, 10).reduce((s, c) => s + (+c.won_amt || 0), 0);
  const winRate = T.quoted_n ? Math.round((T.won_n / T.quoted_n) * 100) : 0;
  const months = (r?.by_month || []).slice(-24).map((x) => ({ l: new Date(x.m + "-01T00:00:00").toLocaleDateString("en-IN", { month: "short", year: "2-digit" }), v: Math.round(+x.amt || 0), t: new Date(x.m + "-01T00:00:00").toLocaleDateString("en-IN", { month: "long", year: "numeric" }) }));
  const max = Math.max(1, ...rows.map((c) => +c.won_amt || 0));
  const team = mgr ? (S.team || []).filter((u) => u.active) : [];
  el.innerHTML = `<div class="toolbar sl-bar">
      <div class="chips">${P.map(([k, l]) => `<button class="chip ${F.p === k ? "on" : ""}" data-sp="${k}">${h(l)}</button>`).join("")}<button class="chip ${F.p === "custom" ? "on" : ""}" data-sp="custom">📅 ${L("Dates", "Dates")}</button></div>
      ${F.p === "custom" ? `<input class="input" type="date" id="slFrom" value="${h(F.from)}" aria-label="From" style="width:150px"><span class="mu">→</span><input class="input" type="date" id="slTo" value="${h(F.to)}" aria-label="To" style="width:150px">` : ""}
    </div>
    <div class="toolbar sl-bar">
      <input class="input" id="slQ" placeholder="${h(L("Product filter — jaise autocad, laptop, firewall…", "Product filter — e.g. autocad, laptop, firewall…"))}" value="${h(F.q)}" style="max-width:280px">
      <select class="input" id="slCat" style="max-width:230px" aria-label="Category"><option value="">${L("Sab categories", "All categories")}</option>${(CATS || []).map((c) => `<option ${c === F.cat ? "selected" : ""}>${h(c)}</option>`).join("")}</select>
      ${mgr ? `<select class="input" id="slOwn" style="max-width:200px" aria-label="Salesperson"><option value="">${L("Sab salespeople", "All salespeople")}</option>${team.map((u) => `<option value="${u.id}" ${u.id === F.owner ? "selected" : ""}>${h(u.full_name)}</option>`).join("")}</select>` : ""}
      <input class="input" id="slFind" placeholder="${h(L("Customer dhoondo…", "Find a customer…"))}" value="${h(F.find)}" style="max-width:220px">
      <span class="sp" style="flex:1"></span><button class="btn" id="slCsv">⬇️ Export</button>
    </div>
    <div class="kpis sl-kpis">
      <div class="kpi"><div class="l">${L("Kul sales (GST ke bina)", "Total sales (without GST)")}</div><div class="v">${h(inrShort(+T.won || 0))}</div><div class="s">${num(+T.won_n || 0)} ${+T.won_n === 1 ? "order / won quotation" : "orders / won quotations"}</div></div>
      <div class="kpi"><div class="l">${L("Customers jinhone kharida", "Customers who bought")}</div><div class="v">${num(+T.customers || 0)}</div><div class="s">${L("avg", "avg")} ${h(inrShort(T.customers ? (+T.won || 0) / T.customers : 0))} ${L("har customer", "per customer")}</div></div>
      <div class="kpi"><div class="l">${L("Win rate", "Win rate")}</div><div class="v">${winRate}%</div><div class="s">${num(+T.won_n || 0)} / ${num(+T.quoted_n || 0)} ${L("quotations", "quotations")} · ${L("quote kiya", "quoted")} ${h(inrShort(+T.quoted || 0))}</div></div>
      <div class="kpi"><div class="l">${L("Top 10 customers ka hissa", "Top 10 customers' share")}</div><div class="v">${T.won ? Math.round((top10 / T.won) * 100) : 0}%</div><div class="s">${h(inrShort(top10))}</div></div>
    </div>
    ${months.length > 1 ? `<div class="card"><div class="card-h"><h3>📈 ${L("Mahine-wise sales", "Sales by month")}</h3><span class="mu" style="font-size:12px">${L("GST ke bina", "without GST")}</span></div><div class="card-b">${barChart(months, { height: 200, fmt: (v) => inrShort(v), label: "Sales by month" })}</div></div>` : ""}
    <div class="card"><div class="card-h"><h3>💰 ${L("Customer-wise sales", "Sales by customer")}</h3><span class="mu" style="font-size:12px">${num(rows.length)} ${L("customers", "customers")}${!mgr ? " · " + L("sirf aapke customers", "your customers only") : ""}</span></div>
    <div class="tbl-wrap">${!rows.length ? `<div class="empty"><b>${L("Is filter mein koi sale nahi", "No sales for these filters")}</b>${L("Period ya product filter badal ke dekho.", "Try another period or product filter.")}</div>` : `<table class="tbl sl-tbl"><thead><tr><th>#</th><th>${L("Customer", "Customer")}</th><th class="num">${L("Sales", "Sales")}</th><th style="width:22%"></th><th class="num">${L("Orders", "Orders")}</th><th class="num">${L("Win rate", "Win rate")}</th><th>${L("Last order", "Last order")}</th><th>${L("Sabse zyada liya", "Buys most")}</th></tr></thead><tbody>
      ${rows.slice(0, 500).map((c, i) => { const wr = c.quoted_n ? Math.round((c.won_n / c.quoted_n) * 100) : 0;
        return `<tr data-sc="${i}"><td class="mu">${i + 1}</td><td><div class="co">${h(c.company || c.cname)}</div><div class="sub">${h([c.city, c.lead_status ? String(c.lead_status).replace(/_/g, " ") : ""].filter(Boolean).join(" · "))}</div></td>
          <td class="num"><b>${h(inr(Math.round(+c.won_amt || 0)))}</b><div class="sub">${T.won ? ((+c.won_amt / T.won) * 100).toFixed(1) : 0}%</div></td>
          <td><span class="sl-trk"><i style="width:${((+c.won_amt || 0) / max) * 100}%"></i></span></td>
          <td class="num">${num(c.won_n)}<div class="sub">${L("of", "of")} ${num(c.quoted_n)}</div></td>
          <td class="num"><span class="badge ${wr >= 50 ? "good" : wr >= 20 ? "warn" : ""}">${wr}%</span></td>
          <td class="sub">${h(day(c.last_won))}</td><td class="sub sl-top">${h(String(c.top_item || "").slice(0, 70))}</td></tr>`; }).join("")}
    </tbody></table>${rows.length > 500 ? `<p class="mu" style="padding:10px 14px;margin:0">${L("Pehle 500 dikhaye — Export mein sab hain", "Showing the first 500 — Export has all")}</p>` : ""}`}</div></div>
    <p class="mu" style="font-size:12.5px">💡 ${L("Sales = jeeti hui quotations (ERP history + CRM mein jo bhi won ho — OBF approve hote hi), GST ke bina. Product / category filter lagane pe sirf wahi items gine jaate hain. Naya data apne aap judta rehta hai.",
      "Sales = won quotations (ERP history + anything won in the CRM — e.g. when its OBF is approved), without GST. With a product / category filter only those items count. New sales are added automatically.")}</p>`;

  const again = () => viewSales(el, { barChart, openLead }).catch(fail);
  $$("[data-sp]", el).forEach((b) => b.onclick = () => { F.p = b.dataset.sp; if (F.p === "custom" && !F.from) { const c = periods()[0]; F.from = c[2]; F.to = c[3]; } again(); });
  $("#slFrom", el)?.addEventListener("change", (e) => { F.from = e.target.value; again(); });
  $("#slTo", el)?.addEventListener("change", (e) => { F.to = e.target.value; again(); });
  let t; const keep = (id) => () => { const n = $(id, el); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } };
  $("#slQ", el).oninput = (e) => { clearTimeout(t); t = setTimeout(() => { F.q = e.target.value.trim(); viewSales(el, { barChart, openLead }).then(keep("#slQ"), fail); }, 450); };
  $("#slFind", el).oninput = (e) => { clearTimeout(t); t = setTimeout(() => { F.find = e.target.value; viewSales(el, { barChart, openLead }).then(keep("#slFind"), fail); }, 250); };
  $("#slCat", el).onchange = (e) => { F.cat = e.target.value; again(); };
  $("#slOwn", el)?.addEventListener("change", (e) => { F.owner = e.target.value; again(); });
  $("#slCsv", el).onclick = () => download(`customer-sales-${F.p === "custom" ? `${F.from}_${F.to}` : F.p}.csv`, toCSV(rows.map((c, i) => ({ rank: i + 1, customer: c.company || c.cname, city: c.city || "",
    sales: Math.round(+c.won_amt || 0), orders: c.won_n, quoted: c.quoted_n, quoted_value: Math.round(+c.quoted_amt || 0), first: c.first_won, last: c.last_won, top: c.top_item || "" })),
    [["rank", "#"], ["customer", "Customer"], ["city", "City"], ["sales", "Sales (without GST)"], ["orders", "Orders"], ["quoted", "Quotations"], ["quoted_value", "Quoted value"], ["first", "First order"], ["last", "Last order"], ["top", "Buys most"]]));
  $$("[data-sc]", el).forEach((tr) => tr.onclick = () => customerCard(rows[+tr.dataset.sc], { openLead, from, to }));
}

// one customer: year-wise sales, what they buy, their won quotations
async function customerCard(c, { openLead, from, to }) {
  const m = modal({ title: "💰 " + (c.company || c.cname), wide: true, body: `<div class="empty">Loading…</div>`,
    foot: `${c.lead_id ? `<button class="btn primary" id="scLead">${L("Lead kholo", "Open the lead")}</button>` : ""}<span class="sp" style="flex:1"></span><button class="btn" data-close>${L("Band karo", "Close")}</button>` });
  $("#scLead", m)?.addEventListener("click", () => { closeModal(); openLead(c.lead_id); });
  try {
    let q = sb.from("quotations").select("id, quote_no, quote_date, created_at, subtotal, grand_total, items, owner_id").eq("status", "won").order("quote_date", { ascending: false }).limit(1000);
    q = c.lead_id ? q.eq("lead_id", c.lead_id) : q.eq("to_party->>name", c.cname);
    const { data, error } = await q; if (error) throw error;
    const yr = {}, prod = {};
    (data || []).forEach((x) => {
      const d = x.quote_date || String(x.created_at).slice(0, 10), y = new Date(d + "T00:00:00"), fy = y.getMonth() >= 3 ? y.getFullYear() : y.getFullYear() - 1;
      (x.items || []).filter((it) => !it.opt).forEach((it) => { const a = (+it.qty || 0) * (+it.price || 0); yr[fy] = (yr[fy] || 0) + a; const k = String(it.desc || "—").trim().slice(0, 90); prod[k] = (prod[k] || 0) + a; });
    });
    const yrs = Object.keys(yr).sort(), total = Object.values(yr).reduce((s, v) => s + v, 0), ym = Math.max(1, ...Object.values(yr)), pr = Object.entries(prod).sort((a, b) => b[1] - a[1]).slice(0, 12), pm = Math.max(1, ...pr.map((x) => x[1]));
    $(".modal-b", m).innerHTML = `<div class="kpis sl-kpis">
        <div class="kpi"><div class="l">${L("Kul sales (lifetime, GST ke bina)", "Lifetime sales (without GST)")}</div><div class="v">${h(inr(Math.round(total)))}</div><div class="s">${num((data || []).length)} ${(data || []).length === 1 ? "order" : "orders"}</div></div>
        <div class="kpi"><div class="l">${L("Pehla order", "First order")}</div><div class="v sm">${h(day(c.first_won))}</div><div class="s">${L("Last", "Last")}: ${h(day(c.last_won))}</div></div>
        <div class="kpi"><div class="l">${L("Is filter mein", "In this filter")}</div><div class="v sm">${h(inr(Math.round(+c.won_amt || 0)))}</div><div class="s">${from || to ? `${h(day(from))} → ${h(day(to))}` : L("sab time", "all time")}</div></div></div>
      <div class="grid2 sl-grid"><div class="card"><div class="card-h"><h3>📅 ${L("Saal-wise (FY)", "By financial year")}</h3></div><div class="card-b">${yrs.map((y) => `<div class="hbar"><span>FY ${String(y).slice(2)}-${String(+y + 1).slice(2)}</span><span class="trk"><i style="width:${(yr[y] / ym) * 100}%"></i></span><span class="n">${h(inrShort(yr[y]))}</span></div>`).join("") || `<div class="empty">—</div>`}</div></div>
        <div class="card"><div class="card-h"><h3>📦 ${L("Kya kharidte hain", "What they buy")}</h3></div><div class="card-b">${pr.map(([k, v]) => `<div class="hbar" title="${h(k)}"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h(k)}</span><span class="trk"><i style="width:${(v / pm) * 100}%"></i></span><span class="n">${h(inrShort(v))}</span></div>`).join("") || `<div class="empty">—</div>`}</div></div></div>
      <div class="card"><div class="card-h"><h3>🧾 ${L("Jeeti hui quotations", "Won quotations")}</h3></div><div class="tbl-wrap" style="max-height:320px"><table class="tbl"><thead><tr><th>${L("No.", "No.")}</th><th>${L("Date", "Date")}</th><th>${L("Items", "Items")}</th><th class="num">${L("GST ke bina", "Without GST")}</th><th>${L("Kisne", "By")}</th></tr></thead><tbody>
        ${(data || []).slice(0, 200).map((x) => `<tr data-sq="${x.id}"><td class="mono">${h(x.quote_no || "")}</td><td class="sub">${h(day(x.quote_date || String(x.created_at).slice(0, 10)))}</td><td class="sub">${h((x.items || []).filter((it) => !it.opt).map((it) => it.desc).join(", ").slice(0, 110))}</td><td class="num">${h(inr(Math.round(+x.subtotal || 0)))}</td><td class="sub">${h(x.owner_id ? userName(x.owner_id) : "ERP")}</td></tr>`).join("")}
      </tbody></table></div></div>`;
    $$("[data-sq]", m).forEach((r) => r.onclick = () => { closeModal(); location.hash = "#/quotes/" + r.dataset.sq; });
  } catch (e) { $(".modal-b", m).innerHTML = `<div class="empty">—</div>`; fail(e); }
}

// the lead drawer's "💰 lifetime sales" line
export async function leadSalesLine(box, leadId) {
  if (!box || !leadId) return;
  const { data } = await sb.rpc("customer_sales", { p_from: null, p_to: null, p_q: null, p_cat: null, p_owner: null, p_lead: leadId, p_limit: 1 });
  const c = data?.customers?.[0];
  if (!c || !(+c.won_amt > 0)) { box.remove(); return; }
  box.innerHTML = `💰 <b>${h(inr(Math.round(+c.won_amt)))}</b> ${L("ki sales ab tak", "of sales so far")} <span class="mu">· ${num(c.won_n)} ${+c.won_n === 1 ? "order" : "orders"} · ${L("last", "last")} ${h(day(c.last_won))}${c.top_item ? " · " + h(String(c.top_item).slice(0, 50)) : ""}</span>`;
  box.hidden = false;
}
