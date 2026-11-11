// =====================================================================
//  Genesis CRM — business suite
//  Products & vendor prices · Renewals (AMC) · Orders → Invoices →
//  Payments · Support tickets · Daily report & attendance · Duplicate
//  cleaner · Visit check-in · lead-drawer panel · quotation helpers.
// =====================================================================
import {
  sb, S, h, ic, inr, inrShort, num, dt, dOnly, ago, toast, fail, modal, closeModal, confirmBox, busy, formData,
  isMgr, isAdmin, userName, assignable, toCSV, download, parseCSV, HOOK, canWork, statusBadge, online,
} from "./core.js";
import { openComposer, ensureWork } from "./comms.js";
import { L, isEn } from "./i18n.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const addDays = (d, n) => { const x = new Date(d + "T00:00:00"); x.setDate(x.getDate() + n); return x.toLocaleDateString("en-CA"); };
const daysTo = (d) => Math.round((new Date(d + "T00:00:00") - new Date(today() + "T00:00:00")) / 864e5);
const r2 = (n) => Math.round((+n + Number.EPSILON) * 100) / 100;
const opt = (list, sel) => list.map(([v, l]) => `<option value="${h(v)}" ${String(v) === String(sel ?? "") ? "selected" : ""}>${h(l)}</option>`).join("");
const empty = (hi, en) => `<div class="empty"><b>${h(L(hi, en))}</b></div>`;
async function leadsById(ids) {
  ids = [...new Set(ids.filter(Boolean))];
  if (!ids.length) return new Map();
  const { data } = await sb.from("leads").select("id, company, contact_name, email, phone, alt_phones, owner_id, lock_until, locked_at, status, city, address, state, gstin, products, email_count, reply_count, last_emailed_at, next_follow_up, category").in("id", ids);
  return new Map((data || []).map((l) => [l.id, l]));
}
async function fullLead(id) { const { data } = await sb.from("leads").select("*").eq("id", id).single(); return data; }

// ---------- lead picker (type company → choose) ----------
function leadPickerHtml(id, lead) {
  return `<input class="input" id="${id}" list="${id}L" autocomplete="off" placeholder="${h(L("Company ka naam likho…", "Type company name…"))}" value="${lead ? h(lead.company + " #" + lead.id) : ""}"><datalist id="${id}L"></datalist>`;
}
function wireLeadPicker(m, id) {
  const inp = $("#" + id, m), dl = $("#" + id + "L", m); let t;
  inp.addEventListener("input", () => {
    clearTimeout(t); const v = inp.value.trim(); if (v.length < 2 || /#\d+$/.test(v)) return;
    t = setTimeout(async () => {
      const { data } = await sb.from("leads").select("id, company, city").ilike("company", `%${v.replace(/[%_,()]/g, " ")}%`).limit(15);
      dl.innerHTML = (data || []).map((l) => `<option value="${h(l.company + " #" + l.id)}">${h(l.city || "")}</option>`).join("");
    }, 220);
  });
  return () => { const x = inp.value.match(/#(\d+)\s*$/); return x ? +x[1] : null; };
}

// =====================================================================
//  PRODUCTS & VENDOR PRICES
// =====================================================================
let PROD = null, COSTS = null;
export async function loadProducts(force = false) {
  if (PROD && !force) return PROD;
  const { data } = await sb.from("products").select("id, brand, name, model, category, hsn, gst_rate, unit, sell_price, active, notes").order("brand").order("name").limit(5000);
  PROD = data || [];
  if (isMgr()) { const { data: c } = await sb.rpc("product_costs"); COSTS = new Map((c || []).map((x) => [x.id, x])); }
  return PROD;
}
export const prodLabel = (p) => [p.brand, p.name, p.model].filter(Boolean).join(" ");
export const costOf = (p) => { const c = COSTS?.get(p.id); return c ? (c.best_price != null && (c.cost_price == null || +c.best_price < +c.cost_price) ? +c.best_price : c.cost_price != null ? +c.cost_price : null) : null; };
export function findProduct(desc) {
  const d = String(desc || "").trim().toLowerCase(); if (!d || !PROD) return null;
  return PROD.find((p) => prodLabel(p).toLowerCase() === d) || PROD.find((p) => d.startsWith(prodLabel(p).toLowerCase())) || null;
}
export function productDatalist() {
  return `<datalist id="prodDL">${(PROD || []).filter((p) => p.active).map((p) => `<option value="${h(prodLabel(p))}">${p.sell_price ? h(inr(p.sell_price)) : ""}</option>`).join("")}</datalist>`;
}
export function marginHtml(items) {
  if (!isMgr() || !COSTS) return "";
  let rev = 0, cost = 0, known = 0;
  (items || []).forEach((it) => { const p = findProduct(it.desc); const c = p ? costOf(p) : null; const amt = (+it.qty || 0) * (+it.price || 0); if (c != null) { known++; rev += amt; cost += c * (+it.qty || 0); } });
  if (!known) return `<p class="mu" style="font-size:12px">🔒 ${h(L("Margin: product list se item chuno toh margin dikhega (sirf Manager ko)", "Margin: pick items from the product list to see margin (managers only)"))}</p>`;
  const mg = rev - cost, pct = rev ? (mg / rev) * 100 : 0;
  return `<div class="margin ${pct < 5 ? "bad" : pct < 10 ? "warn" : "good"}">🔒 ${h(L("Margin (sirf Manager)", "Margin (managers only)"))}: <b>${inr(mg)}</b> · ${pct.toFixed(1)}%${known < items.length ? ` <span class="mu">(${known}/${items.length} items)</span>` : ""}</div>`;
}

export async function viewProducts(el) {
  await loadProducts(true);
  const mgr = isMgr(), q = (el.dataset.pq || "").toLowerCase();
  const rows = PROD.filter((p) => !q || (prodLabel(p) + " " + (p.category || "")).toLowerCase().includes(q));
  el.innerHTML = `<div class="toolbar"><input class="input" id="pq" placeholder="${h(L("Product / brand / model search…", "Search product / brand / model…"))}" value="${h(el.dataset.pq || "")}" style="max-width:320px">
    <span class="mu">${num(rows.length)} ${L("products", "products")}</span><span class="sp" style="flex:1"></span>
    ${mgr ? `<button class="btn" id="pimp">${ic("upload")} CSV import</button><button class="btn" id="pexp">${ic("download")} Export</button><button class="btn primary" id="padd">${ic("plus")} Product</button>` : ""}</div>
  <div class="card"><div class="tbl-wrap">${!rows.length ? empty("Abhi koi product nahi — Manager products add kar sakte hain", "No products yet — managers can add them") : `<table class="tbl"><thead><tr><th>Product</th><th>Category</th><th>HSN</th><th class="num">GST</th><th class="num">${L("Selling price", "Selling price")}</th>
    ${mgr ? `<th class="num">🔒 Cost</th><th class="num">🔒 Margin</th><th>🔒 ${L("Best vendor", "Best vendor")}</th>` : ""}</tr></thead><tbody>
    ${rows.map((p) => { const c = costOf(p), b = COSTS?.get(p.id), mg = c != null && p.sell_price ? ((p.sell_price - c) / p.sell_price) * 100 : null;
      return `<tr data-pid="${p.id}" ${mgr ? "" : 'style="cursor:default"'}><td><div class="co">${h(prodLabel(p))}</div>${p.active ? "" : `<span class="badge bad">${L("Band", "Inactive")}</span>`}${p.notes ? `<div class="sub">${h(p.notes)}</div>` : ""}</td><td>${h(p.category || "—")}</td><td class="mono">${h(p.hsn || "")}</td><td class="num">${h(p.gst_rate)}%</td><td class="num">${p.sell_price != null ? inr(p.sell_price) : "—"}</td>
      ${mgr ? `<td class="num">${c != null ? inr(c) : "—"}</td><td class="num">${mg != null ? `<span class="badge ${mg < 5 ? "bad" : mg < 10 ? "warn" : "good"}">${mg.toFixed(1)}%</span>` : "—"}</td><td class="sub">${b?.best_vendor ? `${h(b.best_vendor)} · ${inr(b.best_price)} · ${h(ago(b.best_at))}` : "—"}</td>` : ""}</tr>`; }).join("")}
    </tbody></table>`}</div></div>
  ${mgr ? `<p class="mu" style="font-size:12.5px">🔒 ${h(L("Cost, margin aur vendor prices sirf Admin/Manager ko dikhte hain. Sales team ko sirf selling price.", "Cost, margin and vendor prices are visible to Admin/Manager only. The sales team sees only the selling price."))}</p>` : ""}`;
  const pq = $("#pq", el); let t;
  pq.oninput = () => { clearTimeout(t); t = setTimeout(() => { el.dataset.pq = pq.value; viewProducts(el).then(() => { const n = $("#pq", el); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }); }, 250); };
  if (!mgr) return;
  $("#padd", el).onclick = () => productForm({}, () => viewProducts(el));
  $$("[data-pid]", el).forEach((r) => r.onclick = () => productForm(PROD.find((p) => p.id === +r.dataset.pid), () => viewProducts(el)));
  $("#pexp", el).onclick = () => download("products.csv", toCSV(PROD.map((p) => ({ ...p, cost_price: COSTS?.get(p.id)?.cost_price })), [["brand", "brand"], ["name", "name"], ["model", "model"], ["category", "category"], ["hsn", "hsn"], ["gst_rate", "gst_rate"], ["unit", "unit"], ["cost_price", "cost_price"], ["sell_price", "sell_price"]]));
  $("#pimp", el).onclick = () => importProducts(() => viewProducts(el));
}

async function productForm(p, done) {
  let vps = [];
  if (p.id) { const { data } = await sb.from("vendor_prices").select("*").eq("product_id", p.id).order("price"); vps = data || []; }
  const c = p.id ? COSTS?.get(p.id) : null;
  const m = modal({
    title: p.id ? prodLabel(p) : L("Naya product", "New product"), wide: true,
    body: `<div class="grid3">
      <div><label class="f">Brand</label><input class="input" name="brand" value="${h(p.brand || "")}" maxlength="60"></div>
      <div><label class="f">${L("Product naam", "Product name")} *</label><input class="input" name="name" value="${h(p.name || "")}" maxlength="200" required></div>
      <div><label class="f">Model</label><input class="input" name="model" value="${h(p.model || "")}" maxlength="120"></div>
      <div><label class="f">Category</label><input class="input" name="category" value="${h(p.category || "")}" maxlength="60"></div>
      <div><label class="f">HSN/SAC</label><input class="input" name="hsn" value="${h(p.hsn || "")}" maxlength="12"></div>
      <div><label class="f">GST %</label><select class="input" name="gst_rate">${opt([[0, "0"], [5, "5"], [12, "12"], [18, "18"], [28, "28"]], p.gst_rate ?? 18)}</select></div>
      <div><label class="f">Unit</label><input class="input" name="unit" value="${h(p.unit || "Nos")}" maxlength="20"></div>
      <div><label class="f">🔒 Cost price ₹</label><input class="input" type="number" min="0" step="0.01" name="cost_price" value="${h(c?.cost_price ?? "")}"></div>
      <div><label class="f">${L("Selling price", "Selling price")} ₹</label><input class="input" type="number" min="0" step="0.01" name="sell_price" value="${h(p.sell_price ?? "")}"></div></div>
      <label class="f">Notes</label><input class="input" name="notes" value="${h(p.notes || "")}" maxlength="1000">
      <label class="row check" style="margin-top:10px"><input type="checkbox" name="active" ${p.active === false ? "" : "checked"}> ${L("Active (quotation mein dikhega)", "Active (shown in quotations)")}</label>
      ${p.id ? `<div class="sec"><div class="sec-t">🔒 ${L("Vendor / distributor prices — sabse sasta upar", "Vendor / distributor prices — cheapest first")}</div>
        <table class="tbl"><thead><tr><th>Vendor</th><th class="num">Price</th><th>${L("Valid till", "Valid till")}</th><th>${L("Update", "Updated")}</th><th></th></tr></thead><tbody>
        ${vps.map((v, i) => `<tr style="cursor:default"><td>${i === 0 ? "🏆 " : ""}${h(v.vendor)}${v.notes ? `<div class="sub">${h(v.notes)}</div>` : ""}</td><td class="num">${inr(v.price)}${i > 0 ? `<div class="sub">+${inr(v.price - vps[0].price)}</div>` : ""}</td><td class="sub">${v.valid_till ? h(dOnly(v.valid_till)) + (v.valid_till < today() ? " ⚠️" : "") : "—"}</td><td class="sub">${h(userName(v.updated_by))} · ${h(ago(v.updated_at))}</td><td><button class="btn ghost icon sm" data-vdel="${v.id}" aria-label="Delete">${ic("x")}</button></td></tr>`).join("") || `<tr><td colspan="5" class="mu">${L("Abhi koi vendor price nahi", "No vendor prices yet")}</td></tr>`}</tbody></table>
        <div class="row" style="margin-top:8px"><input class="input" id="vN" placeholder="Vendor (Ingram, Redington…)" maxlength="120" style="flex:2"><input class="input" id="vP" type="number" min="0" placeholder="₹ price" style="flex:1"><input class="input" id="vD" type="date" style="flex:1" title="Valid till"><button class="btn" id="vAdd">${ic("plus")} Add</button></div></div>` : ""}`,
    foot: `${p.id ? `<button class="btn danger" id="pdel">${ic("trash")} Delete</button>` : ""}<span style="flex:1"></span><button class="btn" data-close>Cancel</button><button class="btn primary" id="psave">Save</button>`,
  });
  $("#psave", m).onclick = (e) => busy(e.target, async () => {
    const f = formData(m); if (!f.name) return toast(L("Product naam daalo", "Enter product name"), true);
    const row = { brand: f.brand, name: f.name, model: f.model, category: f.category, hsn: f.hsn, gst_rate: +f.gst_rate, unit: f.unit || "Nos", sell_price: f.sell_price == null ? null : +f.sell_price, notes: f.notes, active: !!f.active };
    const r = p.id ? await sb.from("products").update(row).eq("id", p.id).select("id").single() : await sb.from("products").insert(row).select("id").single();
    if (r.error) throw r.error;
    const c2 = await sb.from("product_cost").upsert({ product_id: r.data.id, cost_price: f.cost_price == null ? null : +f.cost_price, updated_at: new Date().toISOString() });
    if (c2.error) throw c2.error;
    toast(L("Product saved ✔", "Product saved ✔")); closeModal(); PROD = null; done?.();
  });
  $("#pdel", m)?.addEventListener("click", async () => {
    if (!(await confirmBox(L(`"${prodLabel(p)}" delete karna hai?`, `Delete "${prodLabel(p)}"?`), "Delete"))) return;
    const { error } = await sb.from("products").delete().eq("id", p.id); if (error) return fail(error);
    PROD = null; toast("Deleted"); done?.();
  });
  $("#vAdd", m)?.addEventListener("click", (e) => busy(e.target, async () => {
    const vendor = $("#vN", m).value.trim(), price = +$("#vP", m).value;
    if (!vendor || !(price > 0)) return toast(L("Vendor aur price daalo", "Enter vendor and price"), true);
    const { error } = await sb.from("vendor_prices").insert({ product_id: p.id, vendor, price, valid_till: $("#vD", m).value || null });
    if (error) throw error;
    await loadProducts(true); productForm(PROD.find((x) => x.id === p.id) || p, done);
  }));
  $$("[data-vdel]", m).forEach((b) => b.onclick = () => busy(b, async () => {
    await sb.from("vendor_prices").delete().eq("id", +b.dataset.vdel); await loadProducts(true); productForm(PROD.find((x) => x.id === p.id) || p, done);
  }));
}

function importProducts(done) {
  const m = modal({
    title: L("Products CSV import", "Import products (CSV)"),
    body: `<p class="mu">${h(L("Columns: brand, name, model, category, hsn, gst_rate, unit, cost_price, sell_price — pehli row headings. Same brand+name+model pehle se ho toh price update hoga.", "Columns: brand, name, model, category, hsn, gst_rate, unit, cost_price, sell_price — first row is headings. Existing brand+name+model gets its prices updated."))}</p>
      <input type="file" class="input" id="pf" accept=".csv,text/csv"><div id="pinfo" class="mu" style="margin-top:8px"></div>`,
    foot: `<button class="btn" id="psample">${ic("download")} Sample</button><span style="flex:1"></span><button class="btn" data-close>Cancel</button><button class="btn primary" id="pgo" disabled>Import</button>`,
  });
  let rows = [];
  $("#psample", m).onclick = () => download("products-sample.csv", "brand,name,model,category,hsn,gst_rate,unit,cost_price,sell_price\nHP,Z2 G9 Tower Workstation,i7-13700/32GB/1TB,Workstation,8471,18,Nos,118000,142000\nAutodesk,AutoCAD LT,1 year subscription,Software,997331,18,Nos,44000,52000\n");
  $("#pf", m).onchange = async (e) => {
    const t = await e.target.files[0]?.text(); if (!t) return;
    const all = parseCSV(t); const hd = (all.shift() || []).map((x) => String(x).trim().toLowerCase().replace(/[^a-z_]/g, "_"));
    const ix = (k) => hd.indexOf(k), money = (v) => { const n = Number(String(v ?? "").replace(/[^\d.]/g, "")); return String(v ?? "").trim() === "" || isNaN(n) ? null : n; };
    rows = all.filter((r) => r.some((x) => String(x).trim())).map((r) => ({
      brand: r[ix("brand")]?.trim() || null, name: (r[ix("name")] || r[ix("product")] || "").trim(), model: r[ix("model")]?.trim() || null,
      category: r[ix("category")]?.trim() || null, hsn: r[ix("hsn")]?.trim() || null,
      gst_rate: [0, 5, 12, 18, 28].includes(+money(r[ix("gst_rate")])) ? +money(r[ix("gst_rate")]) : 18, unit: r[ix("unit")]?.trim() || "Nos",
      cost_price: money(r[ix("cost_price")]), sell_price: money(r[ix("sell_price")]),
    })).filter((r) => r.name);
    $("#pinfo", m).textContent = L(`${rows.length} products mile`, `${rows.length} products found`); $("#pgo", m).disabled = !rows.length;
  };
  $("#pgo", m).onclick = (e) => busy(e.target, async () => {
    await loadProducts(true);
    const key = (p) => [p.brand, p.name, p.model].map((x) => String(x || "").trim().toLowerCase()).join("|");
    const have = new Map(PROD.map((p) => [key(p), p.id])); let ins = 0, upd = 0;
    const fresh = rows.filter((r) => !have.has(key(r))), costs = [];
    for (let i = 0; i < fresh.length; i += 200) {
      const part = fresh.slice(i, i + 200);
      const { data, error } = await sb.from("products").insert(part.map(({ cost_price, ...x }) => x)).select("id, brand, name, model"); if (error) throw error;
      ins += part.length; data.forEach((d) => have.set(key(d), d.id));
    }
    for (const r of rows) {
      const id = have.get(key(r)); if (r.cost_price != null && id) costs.push({ product_id: id, cost_price: r.cost_price });
      if (fresh.includes(r)) continue;
      const u = {}; ["category", "hsn", "unit"].forEach((k) => r[k] && (u[k] = r[k])); if (r.sell_price != null) u.sell_price = r.sell_price; u.gst_rate = r.gst_rate;
      const { error } = await sb.from("products").update(u).eq("id", id); if (!error) upd++;
    }
    if (costs.length) { const { error } = await sb.from("product_cost").upsert(costs); if (error) throw error; }
    toast(L(`✔ ${ins} naye, ${upd} update`, `✔ ${ins} new, ${upd} updated`)); closeModal(); PROD = null; done?.();
  });
}

// =====================================================================
//  RENEWALS (AMC / subscriptions / licences / warranties)
// =====================================================================
const RKIND = [["subscription", "Subscription"], ["amc", "AMC"], ["licence", "Licence"], ["warranty", "Warranty"], ["domain", "Domain / hosting"], ["other", "Other"]];
const renBadge = (r) => {
  if (r.status !== "active") return `<span class="badge ${r.status === "renewed" ? "good" : "bad"}">${h(r.status)}</span>`;
  const d = daysTo(r.end_date);
  return d < 0 ? `<span class="badge bad">${L(`${-d} din overdue`, `${-d}d overdue`)}</span>` : d === 0 ? `<span class="badge bad">${L("Aaj", "Today")}</span>`
    : d <= 7 ? `<span class="badge bad">${L(`${d} din`, `${d} days`)}</span>` : d <= 30 ? `<span class="badge warn">${L(`${d} din`, `${d} days`)}</span>` : `<span class="badge">${L(`${d} din`, `${d} days`)}</span>`;
};
export async function viewRenewals(el) {
  const f = el.dataset.rf || "due";
  let q = sb.from("renewals").select("*").order("end_date").limit(1000);
  if (f === "due") q = q.eq("status", "active").lte("end_date", addDays(today(), 30));
  else if (f === "90") q = q.eq("status", "active").lte("end_date", addDays(today(), 90));
  else if (f === "mine") q = q.eq("status", "active").eq("owner_id", S.me.id);
  else if (f === "closed") q = q.in("status", ["renewed", "lost", "cancelled"]);
  const { data, error } = await q; if (error) throw error;
  const leads = await leadsById(data.map((r) => r.lead_id));
  const { data: stats } = await sb.from("renewals").select("end_date, amount").eq("status", "active").lte("end_date", addDays(today(), 30));
  const ov = (stats || []).filter((r) => r.end_date < today()), wk = (stats || []).filter((r) => r.end_date >= today() && r.end_date <= addDays(today(), 7));
  el.innerHTML = `<div class="kpis">
      <div class="card kpi"><div class="l">${L("Overdue", "Overdue")}</div><div class="v" style="color:var(--bad)">${ov.length}</div><div class="s">${inrShort(ov.reduce((a, r) => a + +(r.amount || 0), 0))}</div></div>
      <div class="card kpi"><div class="l">${L("Is hafte", "This week")}</div><div class="v">${wk.length}</div><div class="s">${inrShort(wk.reduce((a, r) => a + +(r.amount || 0), 0))}</div></div>
      <div class="card kpi"><div class="l">${L("30 din mein", "Next 30 days")}</div><div class="v">${(stats || []).length}</div><div class="s">${inrShort((stats || []).reduce((a, r) => a + +(r.amount || 0), 0))} ${L("renewal value", "renewal value")}</div></div></div>
    <div class="toolbar"><div class="chips">${[["due", L("30 din / overdue", "30 days / overdue")], ["90", L("90 din", "90 days")], ["mine", L("Mere", "Mine")], ["all", L("Sab", "All")], ["closed", L("Renewed / lost", "Renewed / lost")]].map(([k, l]) => `<button class="chip ${f === k ? "on" : ""}" data-rf="${k}">${h(l)}</button>`).join("")}</div>
      <span class="sp" style="flex:1"></span><button class="btn primary" id="radd">${ic("plus")} Renewal</button></div>
    <div class="card"><div class="tbl-wrap">${!data.length ? empty("Is filter mein koi renewal nahi", "No renewals in this filter") : `<table class="tbl"><thead><tr><th>${L("Company", "Company")}</th><th>Product</th><th>${L("Type", "Type")}</th><th>${L("Expiry", "Expiry")}</th><th class="num">${L("Amount", "Amount")}</th><th>Owner</th><th></th></tr></thead><tbody>
    ${data.map((r) => { const l = leads.get(r.lead_id) || {}; return `<tr data-rid="${r.id}"><td class="co">${h(l.company || "#" + r.lead_id)}</td><td>${h(r.product)}${r.qty > 1 ? ` <span class="mu">× ${h(+r.qty)}</span>` : ""}${r.vendor ? `<div class="sub">${h(r.vendor)}</div>` : ""}</td><td>${h(RKIND.find((k) => k[0] === r.kind)?.[1] || r.kind)}</td>
      <td>${h(dOnly(r.end_date))}<div>${renBadge(r)}</div></td><td class="num">${r.amount != null ? inr(r.amount) : "—"}</td><td>${h(userName(r.owner_id))}</td>
      <td style="white-space:nowrap">${r.status === "active" ? `<button class="btn sm" data-rmail="${r.id}" title="Email reminder">${ic("mail")}</button> <button class="btn sm" data-rwa="${r.id}" title="WhatsApp">${ic("wa")}</button> <button class="btn sm primary" data-rdone="${r.id}">✔ ${L("Renewed", "Renewed")}</button>` : ""}</td></tr>`; }).join("")}</tbody></table>`}</div></div>
    <p class="mu" style="font-size:12.5px">🔔 ${h(L("Expiry se 30, 15, 7 din pehle aur expiry ke din owner ko notification + task apne aap. Renewed dabao toh agla term (1 saal) apne aap ban jata hai.", "Owners get a notification + task 30, 15 and 7 days before expiry and on the day. Mark Renewed to create the next 1-year term automatically."))}</p>`;
  $$("[data-rf]", el).forEach((b) => b.onclick = () => { el.dataset.rf = b.dataset.rf; viewRenewals(el); });
  $("#radd", el).onclick = () => renewalForm({}, () => viewRenewals(el));
  const byId = (id) => data.find((r) => r.id === +id);
  el.onclick = async (e) => {
    const b = e.target.closest("[data-rmail],[data-rwa],[data-rdone]");
    if (b) {
      e.stopPropagation();
      const r = byId(b.dataset.rmail || b.dataset.rwa || b.dataset.rdone);
      if (b.dataset.rdone) return markRenewed(r, () => viewRenewals(el));
      return renewalOutreach(r, b.dataset.rmail ? "email" : "whatsapp");
    }
    const tr = e.target.closest("[data-rid]"); if (tr) renewalForm(byId(tr.dataset.rid), () => viewRenewals(el));
  };
}
async function renewalOutreach(r, channel) {
  const lead = await fullLead(r.lead_id); if (!lead) return toast(L("Lead nahi mila", "Lead not found"), true);
  if (!(await ensureWork("lead", lead))) return;
  openComposer({ channel, lead, stage: "renewal", vars: { product: r.product, due_date: dOnly(r.end_date) } });
}
async function markRenewed(r, done) {
  const m = modal({
    title: L("Renewal ho gaya ✔", "Mark as renewed ✔"),
    body: `<p>${h(r.product)}</p><div class="grid2"><div><label class="f">${L("Naya expiry", "New expiry")}</label><input class="input" type="date" id="nEnd" value="${h(addDays(r.end_date, 365))}"></div>
      <div><label class="f">${L("Amount", "Amount")} ₹</label><input class="input" type="number" min="0" id="nAmt" value="${h(r.amount ?? "")}"></div></div>`,
    foot: `<button class="btn danger" id="nLost">${L("Lost (renew nahi kiya)", "Lost (not renewed)")}</button><span style="flex:1"></span><button class="btn" data-close>Cancel</button><button class="btn primary" id="nOk">Save</button>`,
  });
  $("#nOk", m).onclick = (e) => busy(e.target, async () => {
    const { data: n, error } = await sb.from("renewals").insert({ lead_id: r.lead_id, product: r.product, kind: r.kind, qty: r.qty, start_date: addDays(r.end_date, 1), end_date: $("#nEnd", m).value, amount: +$("#nAmt", m).value || null, vendor: r.vendor, notes: r.notes, owner_id: r.owner_id || S.me.id }).select("id").single();
    if (error) throw error;
    const u = await sb.from("renewals").update({ status: "renewed", renewed_to: n.id }).eq("id", r.id); if (u.error) throw u.error;
    await sb.from("activities").insert({ lead_id: r.lead_id, kind: "system", body: `🔁 Renewed: ${r.product} → ${dOnly($("#nEnd", m).value)}` }).then(() => {}, () => {});
    toast(L("✔ Renewed — agla term ban gaya", "✔ Renewed — next term created")); closeModal(); done?.();
  });
  $("#nLost", m).onclick = (e) => busy(e.target, async () => {
    const u = await sb.from("renewals").update({ status: "lost" }).eq("id", r.id); if (u.error) throw u.error;
    toast(L("Lost mark kiya", "Marked lost")); closeModal(); done?.();
  });
}
export async function renewalForm(r, done) {
  const lead = r.lead_id ? (await leadsById([r.lead_id])).get(r.lead_id) : null;
  const m = modal({
    title: r.id ? `🔁 ${r.product}` : L("Naya renewal / AMC", "New renewal / AMC"), wide: true,
    body: `<label class="f">${L("Company", "Company")} *</label>${leadPickerHtml("rLead", lead)}
      <div class="grid3 sec"><div><label class="f">Product *</label><input class="input" name="product" value="${h(r.product || "")}" maxlength="200" placeholder="Microsoft 365 Business Std, AMC – 20 PCs…"></div>
      <div><label class="f">${L("Type", "Type")}</label><select class="input" name="kind">${opt(RKIND, r.kind || "subscription")}</select></div>
      <div><label class="f">Qty</label><input class="input" type="number" min="0" name="qty" value="${h(r.qty ?? 1)}"></div>
      <div><label class="f">${L("Start", "Start")}</label><input class="input" type="date" name="start_date" value="${h(r.start_date || "")}"></div>
      <div><label class="f">${L("Expiry", "Expiry")} *</label><input class="input" type="date" name="end_date" value="${h(r.end_date || addDays(today(), 365))}"></div>
      <div><label class="f">${L("Amount", "Amount")} ₹</label><input class="input" type="number" min="0" name="amount" value="${h(r.amount ?? "")}"></div>
      <div><label class="f">Vendor</label><input class="input" name="vendor" value="${h(r.vendor || "")}" maxlength="120"></div>
      <div><label class="f">Owner</label><select class="input" name="owner_id">${opt(assignable().map((u) => [u.id, u.full_name]), r.owner_id || S.me.id)}</select></div>
      ${r.id ? `<div><label class="f">Status</label><select class="input" name="status">${opt([["active", "Active"], ["renewed", "Renewed"], ["lost", "Lost"], ["cancelled", "Cancelled"]], r.status)}</select></div>` : ""}</div>
      <label class="f">Notes</label><textarea class="input" name="notes" maxlength="1000">${h(r.notes || "")}</textarea>`,
    foot: `${r.id ? `<button class="btn danger" id="rdel">${ic("trash")} Delete</button>` : ""}<span style="flex:1"></span><button class="btn" data-close>Cancel</button><button class="btn primary" id="rsave">Save</button>`,
  });
  const pick = wireLeadPicker(m, "rLead");
  $("#rsave", m).onclick = (e) => busy(e.target, async () => {
    const f = formData(m), lead_id = pick();
    if (!lead_id) return toast(L("List se company chuno", "Pick a company from the list"), true);
    if (!f.product || !f.end_date) return toast(L("Product aur expiry date zaroori", "Product and expiry date are required"), true);
    const row = { lead_id, product: f.product, kind: f.kind, qty: +f.qty || 1, start_date: f.start_date, end_date: f.end_date, amount: f.amount == null ? null : +f.amount, vendor: f.vendor, owner_id: f.owner_id, notes: f.notes };
    if (r.id) { row.status = f.status; if (f.end_date !== r.end_date) row.reminder_stage = 999; }
    const res = r.id ? await sb.from("renewals").update(row).eq("id", r.id).select("id") : await sb.from("renewals").insert(row).select("id");
    if (res.error) throw res.error;
    if (r.id && !res.data?.length) return toast(L("Save nahi hua — permission nahi", "Not saved — no permission"), true);
    toast(L("Renewal saved ✔", "Renewal saved ✔")); closeModal(); done?.();
  });
  $("#rdel", m)?.addEventListener("click", async () => {
    if (!(await confirmBox(L("Ye renewal delete karna hai?", "Delete this renewal?"), "Delete"))) return;
    const { error } = await sb.from("renewals").delete().eq("id", r.id); if (error) return fail(error); closeModal(); done?.();
  });
}

// =====================================================================
//  ORDERS → INVOICES → PAYMENTS
// =====================================================================
const PAYB = { paid: "good", partial: "info", unpaid: "", overdue: "bad", cancelled: "" };
const ORDST = [["open", "Open"], ["delivered", "Delivered"], ["invoiced", "Invoiced"], ["closed", "Closed"], ["cancelled", "Cancelled"]];
export async function viewOrders(el) {
  const tab = el.dataset.otab || "due";
  const [{ data: inv, error }, { data: ords }] = await Promise.all([
    sb.from("invoice_balances").select("*").order("invoice_date", { ascending: false }).limit(2000),
    sb.from("orders").select("*").order("created_at", { ascending: false }).limit(1000),
  ]);
  if (error) throw error;
  const leads = await leadsById([...inv.map((i) => i.lead_id), ...ords.map((o) => o.lead_id)]);
  const live = inv.filter((i) => !i.cancelled && +i.balance > 0.5);
  const age = (i) => i.due_date ? -daysTo(i.due_date) : 0;
  const bucket = [["0–30", (a) => a <= 30], ["31–60", (a) => a > 30 && a <= 60], ["61–90", (a) => a > 60 && a <= 90], ["90+", (a) => a > 90]];
  const od = live.filter((i) => i.pay_status === "overdue");
  const name = (x) => leads.get(x.lead_id)?.company || x.to_party?.name || "—";
  el.innerHTML = `<div class="kpis">
      <div class="card kpi"><div class="l">${L("Total baaki", "Total outstanding")}</div><div class="v">${inrShort(live.reduce((a, i) => a + +i.balance, 0))}</div><div class="s">${live.length} invoices</div></div>
      <div class="card kpi"><div class="l">Overdue</div><div class="v" style="color:var(--bad)">${inrShort(od.reduce((a, i) => a + +i.balance, 0))}</div><div class="s">${od.length} invoices</div></div>
      ${bucket.map(([l, f]) => { const xs = od.filter((i) => f(age(i))); return `<div class="card kpi"><div class="l">${L("Overdue", "Overdue")} ${l} ${L("din", "days")}</div><div class="v">${inrShort(xs.reduce((a, i) => a + +i.balance, 0))}</div><div class="s">${xs.length}</div></div>`; }).join("")}
      <div class="card kpi"><div class="l">${L("Open orders", "Open orders")}</div><div class="v">${ords.filter((o) => ["open", "delivered"].includes(o.status)).length}</div><div class="s">${inrShort(ords.filter((o) => ["open", "delivered"].includes(o.status)).reduce((a, o) => a + +o.amount, 0))}</div></div></div>
    <div class="toolbar"><div class="chips">${[["due", L("Payment baaki", "Payment due")], ["inv", L("Saare invoices", "All invoices")], ["ord", "Orders"]].map(([k, l]) => `<button class="chip ${tab === k ? "on" : ""}" data-tab="${k}">${h(l)}</button>`).join("")}</div>
      <span class="sp" style="flex:1"></span><button class="btn" id="oexp">${ic("download")} Export</button><button class="btn" id="iadd">${ic("plus")} Invoice</button><button class="btn primary" id="oadd">${ic("plus")} Order</button></div>
    <div class="card"><div class="tbl-wrap">${tab === "ord"
      ? (!ords.length ? empty("Abhi koi order nahi — quotation kholo aur “Order banao” dabao", "No orders yet — open a quotation and click “Create order”") : `<table class="tbl"><thead><tr><th>Order</th><th>${L("Company", "Company")}</th><th>PO</th><th class="num">${L("Amount", "Amount")}</th><th>Status</th><th>${L("Delivery", "Delivery")}</th><th>Owner</th></tr></thead><tbody>
        ${ords.map((o) => `<tr data-oid="${o.id}"><td class="mono">${h(o.order_no)}</td><td class="co">${h(name(o))}</td><td class="sub">${h(o.po_number || "—")}${o.po_date ? " · " + h(dOnly(o.po_date)) : ""}</td><td class="num">${inr(o.amount)}</td><td><span class="badge ${o.status === "closed" || o.status === "invoiced" ? "good" : o.status === "cancelled" ? "bad" : "info"}">${h(o.status)}</span></td><td class="sub">${o.delivered_at ? "✔ " + h(dOnly(o.delivered_at)) : o.expected_delivery ? h(dOnly(o.expected_delivery)) + (o.expected_delivery < today() ? " ⚠️" : "") : "—"}</td><td>${h(userName(o.owner_id))}</td></tr>`).join("")}</tbody></table>`)
      : (() => { const rows = tab === "due" ? live.sort((a, b) => (a.due_date || "9") < (b.due_date || "9") ? -1 : 1) : inv;
        return !rows.length ? empty(tab === "due" ? "Koi payment baaki nahi 🎉" : "Abhi koi invoice nahi", tab === "due" ? "Nothing outstanding 🎉" : "No invoices yet") : `<table class="tbl"><thead><tr><th>Invoice</th><th>${L("Company", "Company")}</th><th>${L("Date", "Date")}</th><th>Due</th><th class="num">${L("Amount", "Amount")}</th><th class="num">${L("Mila", "Received")}</th><th class="num">${L("Baaki", "Balance")}</th><th>Status</th><th></th></tr></thead><tbody>
        ${rows.map((i) => `<tr data-iid="${i.id}"><td class="mono">${h(i.invoice_no)}${i.source === "tally" ? ` <span class="badge">Tally</span>` : ""}</td><td class="co">${h(name(i))}</td><td class="sub">${h(dOnly(i.invoice_date))}</td><td class="sub">${i.due_date ? h(dOnly(i.due_date)) + (i.pay_status === "overdue" ? `<div style="color:var(--bad)">${age(i)} ${L("din late", "days late")}</div>` : "") : "—"}</td><td class="num">${inr(i.amount)}</td><td class="num">${inr(i.paid)}</td><td class="num"><b>${inr(Math.max(0, i.balance))}</b></td><td><span class="badge ${PAYB[i.pay_status]}">${h(i.pay_status)}</span></td>
          <td style="white-space:nowrap">${i.pay_status !== "paid" && !i.cancelled ? `<button class="btn sm primary" data-pay="${i.id}">₹ ${L("Payment", "Payment")}</button> <button class="btn sm" data-iwa="${i.id}" title="WhatsApp reminder">${ic("wa")}</button> <button class="btn sm" data-imail="${i.id}" title="Email reminder">${ic("mail")}</button>` : ""}</td></tr>`).join("")}</tbody></table>`; })()}
    </div></div>
    <p class="mu" style="font-size:12.5px">💡 ${h(L("Invoice Tally mein banate ho toh “Invoice” mein Tally ka number daal do — CRM sirf payment track karega. Warna CRM khud INV number dega. Due date nikalte hi owner ko 💰 notification jata hai.", "If you raise invoices in Tally, enter the Tally number in “Invoice” — the CRM only tracks payment. Otherwise the CRM assigns its own INV number. Owners get a 💰 notification the day after the due date."))}</p>`;
  $$("[data-tab]", el).forEach((b) => b.onclick = () => { el.dataset.otab = b.dataset.tab; viewOrders(el); });
  const reload = () => viewOrders(el);
  $("#oadd", el).onclick = () => orderForm({}, reload);
  $("#iadd", el).onclick = () => invoiceForm({}, reload);
  $("#oexp", el).onclick = () => tab === "ord"
    ? download("orders.csv", toCSV(ords.map((o) => ({ ...o, company: name(o), owner: userName(o.owner_id) })), [["order_no", "Order"], ["company", "Company"], ["po_number", "PO"], ["po_date", "PO date"], ["amount", "Amount"], ["status", "Status"], ["expected_delivery", "Expected delivery"], ["delivered_at", "Delivered"], ["owner", "Owner"]]))
    : download("invoices.csv", toCSV(inv.map((i) => ({ ...i, company: name(i), owner: userName(i.owner_id) })), [["invoice_no", "Invoice"], ["source", "Source"], ["company", "Company"], ["invoice_date", "Date"], ["due_date", "Due"], ["amount", "Amount"], ["paid", "Paid"], ["balance", "Balance"], ["pay_status", "Status"], ["owner", "Owner"]]));
  el.onclick = (e) => {
    const b = e.target.closest("[data-pay],[data-iwa],[data-imail]");
    if (b) { e.stopPropagation(); const i = inv.find((x) => x.id === +(b.dataset.pay || b.dataset.iwa || b.dataset.imail));
      if (b.dataset.pay) return paymentForm(i, reload);
      return paymentReminder(i, b.dataset.iwa ? "whatsapp" : "email"); }
    const o = e.target.closest("[data-oid]"); if (o) return orderForm(ords.find((x) => x.id === +o.dataset.oid), reload);
    const r = e.target.closest("[data-iid]"); if (r) return invoiceView(+r.dataset.iid, reload);
  };
}
async function paymentReminder(i, channel) {
  if (!i.lead_id) return toast(L("Is invoice se koi company linked nahi", "This invoice isn't linked to a company"), true);
  const lead = await fullLead(i.lead_id); if (!lead) return;
  if (!(await ensureWork("lead", lead))) return;
  openComposer({ channel, lead, stage: "payment", vars: { invoice_no: i.invoice_no, amount_due: inr(i.balance), due_date: i.due_date ? dOnly(i.due_date) : "" } });
}
export async function orderForm(o, done) {
  const lead = o.lead_id ? (await leadsById([o.lead_id])).get(o.lead_id) : null;
  let invs = [];
  if (o.id) { const { data } = await sb.from("invoice_balances").select("*").eq("order_id", o.id); invs = data || []; }
  const m = modal({
    title: o.id ? `📦 ${o.order_no}` : L("Naya order", "New order"), wide: true,
    body: `<label class="f">${L("Company", "Company")} *</label>${leadPickerHtml("oLead", lead)}
      <div class="grid3 sec"><div><label class="f">${L("Customer PO no.", "Customer PO no.")}</label><input class="input" name="po_number" value="${h(o.po_number || "")}" maxlength="80"></div>
      <div><label class="f">PO date</label><input class="input" type="date" name="po_date" value="${h(o.po_date || today())}"></div>
      <div><label class="f">${L("Amount (GST ke saath)", "Amount (incl. GST)")} ₹ *</label><input class="input" type="number" min="0" name="amount" value="${h(o.amount ?? "")}"></div>
      <div><label class="f">${L("Expected delivery", "Expected delivery")}</label><input class="input" type="date" name="expected_delivery" value="${h(o.expected_delivery || "")}"></div>
      <div><label class="f">${L("Delivered on", "Delivered on")}</label><input class="input" type="date" name="delivered_at" value="${h(o.delivered_at || "")}"></div>
      <div><label class="f">Status</label><select class="input" name="status">${opt(ORDST, o.status || "open")}</select></div></div>
      <label class="f">Notes</label><textarea class="input" name="notes" maxlength="2000">${h(o.notes || "")}</textarea>
      ${o.id ? `<div class="sec"><div class="sec-t">Invoices</div>${invs.map((i) => `<div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)"><span class="mono">${h(i.invoice_no)}</span><span>${inr(i.amount)}</span><span class="badge ${PAYB[i.pay_status]}">${h(i.pay_status)}</span><span class="mu">${L("baaki", "balance")} ${inr(Math.max(0, i.balance))}</span></div>`).join("") || `<div class="mu">${L("Abhi invoice nahi bana", "No invoice yet")}</div>`}</div>` : ""}`,
    foot: `${o.id && isMgr() ? `<button class="btn danger" id="odel">${ic("trash")}</button>` : ""}${o.id ? `<button class="btn" id="oinv">🧾 ${L("Invoice banao", "Create invoice")}</button>` : ""}<span style="flex:1"></span><button class="btn" data-close>Cancel</button><button class="btn primary" id="osave">Save</button>`,
  });
  const pick = wireLeadPicker(m, "oLead");
  const save = async () => {
    const f = formData(m), lead_id = pick();
    if (!lead_id) throw new Error(L("List se company chuno", "Pick a company from the list"));
    const row = { lead_id, po_number: f.po_number, po_date: f.po_date, amount: +f.amount || 0, expected_delivery: f.expected_delivery, delivered_at: f.delivered_at, status: f.delivered_at && f.status === "open" ? "delivered" : f.status, notes: f.notes, quotation_id: o.quotation_id || null };
    const res = o.id ? await sb.from("orders").update(row).eq("id", o.id).select("*").single() : await sb.from("orders").insert(row).select("*").single();
    if (res.error) throw res.error;
    if (!o.id) await sb.from("activities").insert({ lead_id, kind: "system", body: `📦 Order ${res.data.order_no} — ${inr(row.amount)}${row.po_number ? " · PO " + row.po_number : ""}` }).then(() => {}, () => {});
    return res.data;
  };
  $("#osave", m).onclick = (e) => busy(e.target, async () => { const d = await save(); toast(L(`Order ${d.order_no} saved ✔`, `Order ${d.order_no} saved ✔`)); closeModal(); done?.(); });
  $("#oinv", m)?.addEventListener("click", (e) => busy(e.target, async () => { const d = await save(); closeModal(); invoiceForm({ order_id: d.id, lead_id: d.lead_id, amount: d.amount, quotation_id: d.quotation_id }, done); }));
  $("#odel", m)?.addEventListener("click", async () => { if (!(await confirmBox(L("Order delete karna hai?", "Delete this order?"), "Delete"))) return; const { error } = await sb.from("orders").delete().eq("id", o.id); if (error) return fail(error); closeModal(); done?.(); });
}
export async function invoiceForm(i, done) {
  const lead = i.lead_id ? await fullLead(i.lead_id) : null;
  let q = null;
  if (i.quotation_id) { const { data } = await sb.from("quotations").select("to_party, items, subtotal, tax_total, grand_total").eq("id", i.quotation_id).single(); q = data; }
  const terms = +(S.settings.payment_terms_days ?? 30);
  const m = modal({
    title: i.id ? `🧾 ${i.invoice_no}` : L("Naya invoice", "New invoice"),
    body: `<label class="f">${L("Company", "Company")} *</label>${leadPickerHtml("iLead", lead)}
      <div class="grid2 sec"><div><label class="f">${L("Invoice kahan bana?", "Where was the invoice raised?")}</label><select class="input" name="source" id="iSrc">${opt([["crm", L("CRM (auto number)", "CRM (auto number)")], ["tally", "Tally"], ["other", L("Dusra software", "Other software")]], i.source || "crm")}</select></div>
      <div id="iNoW" ${(i.source || "crm") === "crm" ? "hidden" : ""}><label class="f">Invoice no. *</label><input class="input" name="invoice_no" value="${h(i.source !== "crm" ? i.invoice_no || "" : "")}" maxlength="60" placeholder="GIPL/25-26/0142"></div>
      <div><label class="f">${L("Invoice date", "Invoice date")}</label><input class="input" type="date" name="invoice_date" value="${h(i.invoice_date || today())}"></div>
      <div><label class="f">${L("Due date", "Due date")}</label><input class="input" type="date" name="due_date" value="${h(i.due_date || addDays(today(), terms))}"></div>
      <div><label class="f">${L("Amount (GST ke saath)", "Amount (incl. GST)")} ₹ *</label><input class="input" type="number" min="0" step="0.01" name="amount" value="${h(i.amount ?? q?.grand_total ?? "")}"></div></div>
      <label class="f">Notes</label><input class="input" name="notes" value="${h(i.notes || "")}" maxlength="2000">`,
    foot: `<span style="flex:1"></span><button class="btn" data-close>Cancel</button><button class="btn primary" id="isave">Save</button>`,
  });
  const pick = wireLeadPicker(m, "iLead");
  $("#iSrc", m).onchange = (e) => { $("#iNoW", m).hidden = e.target.value === "crm"; };
  $("#isave", m).onclick = (e) => busy(e.target, async () => {
    const f = formData(m), lead_id = pick();
    if (!lead_id) return toast(L("List se company chuno", "Pick a company from the list"), true);
    if (f.source !== "crm" && !f.invoice_no) return toast(L("Tally / software ka invoice number daalo", "Enter the Tally / software invoice number"), true);
    if (!(+f.amount > 0)) return toast(L("Amount daalo", "Enter the amount"), true);
    const L0 = lead || (await leadsById([lead_id])).get(lead_id) || {};
    const row = { lead_id, source: f.source, invoice_date: f.invoice_date, due_date: f.due_date, amount: +f.amount, notes: f.notes, order_id: i.order_id || null,
      to_party: q?.to_party || { name: L0.company, address: L0.address, state: L0.state, gstin: L0.gstin }, items: q?.items || [], subtotal: q?.subtotal || 0, tax_total: q?.tax_total || 0 };
    if (f.source !== "crm") row.invoice_no = f.invoice_no;
    const res = i.id ? await sb.from("invoices").update(row).eq("id", i.id).select("*").single() : await sb.from("invoices").insert(row).select("*").single();
    if (res.error) throw /duplicate key/.test(res.error.message) ? new Error(L("Ye invoice number pehle se hai", "This invoice number already exists")) : res.error;
    if (!i.id) {
      if (i.order_id) await sb.from("orders").update({ status: "invoiced" }).eq("id", i.order_id);
      await sb.from("activities").insert({ lead_id, kind: "system", body: `🧾 Invoice ${res.data.invoice_no} — ${inr(row.amount)}, due ${dOnly(row.due_date)}` }).then(() => {}, () => {});
    }
    toast(L(`Invoice ${res.data.invoice_no} saved ✔`, `Invoice ${res.data.invoice_no} saved ✔`)); closeModal(); done?.();
  });
}
async function invoiceView(id, done) {
  const [{ data: i, error }, { data: pays }] = await Promise.all([
    sb.from("invoice_balances").select("*").eq("id", id).single(), sb.from("payments").select("*").eq("invoice_id", id).order("paid_on"),
  ]);
  if (error) return fail(error);
  const { data: full } = await sb.from("invoices").select("*").eq("id", id).single();
  const lead = i.lead_id ? (await leadsById([i.lead_id])).get(i.lead_id) : null;
  const m = modal({
    title: `🧾 ${i.invoice_no}`,
    body: `<dl class="kv"><dt>${L("Company", "Company")}</dt><dd>${lead ? `<a href="#/leads/${lead.id}">${h(lead.company)}</a>` : h(i.to_party?.name || "—")}</dd><dt>Source</dt><dd>${h(i.source)}</dd>
      <dt>${L("Date", "Date")}</dt><dd>${h(dOnly(i.invoice_date))}</dd><dt>Due</dt><dd>${h(i.due_date ? dOnly(i.due_date) : "—")}</dd>
      <dt>${L("Amount", "Amount")}</dt><dd><b>${inr(i.amount)}</b></dd><dt>${L("Mila", "Received")}</dt><dd>${inr(i.paid)}</dd><dt>${L("Baaki", "Balance")}</dt><dd><b>${inr(Math.max(0, i.balance))}</b> <span class="badge ${PAYB[i.pay_status]}">${h(i.pay_status)}</span></dd>
      ${full?.notes ? `<dt>Notes</dt><dd>${h(full.notes)}</dd>` : ""}</dl>
      <div class="sec-t">${L("Payments", "Payments")}</div>${(pays || []).map((p) => `<div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)"><b>${inr(p.amount)}</b><span>${h(p.mode)}</span><span class="mu">${h(dOnly(p.paid_on))}${p.reference ? " · " + h(p.reference) : ""}</span><span class="mu right">${h(userName(p.created_by))}</span>${isMgr() ? `<button class="btn ghost icon sm" data-pdel="${p.id}" aria-label="Delete">${ic("x")}</button>` : ""}</div>`).join("") || `<div class="mu">${L("Abhi koi payment nahi", "No payments yet")}</div>`}`,
    foot: `${isMgr() ? `<button class="btn danger" id="icancel">${i.cancelled ? L("Un-cancel", "Restore") : L("Cancel invoice", "Cancel invoice")}</button>` : ""}<button class="btn" id="iedit">Edit</button><span style="flex:1"></span>${!i.cancelled && i.pay_status !== "paid" ? `<button class="btn primary" id="ipay">₹ ${L("Payment mila", "Record payment")}</button>` : `<button class="btn" data-close>OK</button>`}`,
  });
  $("#ipay", m)?.addEventListener("click", () => paymentForm(i, done));
  $("#iedit", m).onclick = () => invoiceForm(full, done);
  $("#icancel", m)?.addEventListener("click", (e) => busy(e.target, async () => { const { error: x } = await sb.from("invoices").update({ cancelled: !i.cancelled }).eq("id", id); if (x) throw x; closeModal(); done?.(); }));
  $$("[data-pdel]", m).forEach((b) => b.onclick = () => busy(b, async () => { await sb.from("payments").delete().eq("id", +b.dataset.pdel); invoiceView(id, done); done?.(); }));
}
function paymentForm(i, done) {
  const m = modal({
    title: `₹ ${L("Payment", "Payment")} — ${i.invoice_no}`,
    body: `<p class="mu">${L("Baaki", "Balance")}: <b>${inr(Math.max(0, i.balance))}</b></p><div class="grid2">
      <div><label class="f">${L("Amount", "Amount")} ₹ *</label><input class="input" type="number" min="0" step="0.01" id="pyA" value="${h(Math.max(0, r2(i.balance)))}"></div>
      <div><label class="f">${L("Date", "Date")}</label><input class="input" type="date" id="pyD" value="${h(today())}"></div>
      <div><label class="f">Mode</label><select class="input" id="pyM">${opt(["NEFT", "RTGS", "IMPS", "UPI", "Cheque", "Cash", "Card", "Other"].map((x) => [x, x]), "NEFT")}</select></div>
      <div><label class="f">${L("UTR / Cheque no.", "UTR / Cheque no.")}</label><input class="input" id="pyR" maxlength="120"></div></div>`,
    foot: `<button class="btn" data-close>Cancel</button><button class="btn primary" id="pyS">Save</button>`,
  });
  $("#pyS", m).onclick = (e) => busy(e.target, async () => {
    const amount = +$("#pyA", m).value; if (!(amount > 0)) return toast(L("Amount daalo", "Enter the amount"), true);
    if (amount > +i.balance + 1 && !(await confirmBox(L(`Amount baaki (${inr(i.balance)}) se zyada hai — phir bhi save karein?`, `Amount is more than the balance (${inr(i.balance)}) — save anyway?`), "Save"))) return;
    const { error } = await sb.from("payments").insert({ invoice_id: i.id, amount, paid_on: $("#pyD", m).value, mode: $("#pyM", m).value, reference: $("#pyR", m).value.trim() || null });
    if (error) throw error;
    if (i.lead_id) await sb.from("activities").insert({ lead_id: i.lead_id, kind: "system", body: `💰 ${inr(amount)} ${L("payment mila", "payment received")} — ${i.invoice_no}` }).then(() => {}, () => {});
    toast(L("💰 Payment saved", "💰 Payment saved")); closeModal(); done?.();
  });
}

// =====================================================================
//  QUOTATION helpers: share link, order from quote
// =====================================================================
export const quoteUrl = (token) => new URL("quote.html#" + token, location.href.split("#")[0]).href;
export async function shareQuote(q, channel) {
  const { data: token, error } = await sb.rpc("share_quote", { p_id: q.id });
  if (error) return fail(error);
  const link = quoteUrl(token);
  if (!channel) { try { await navigator.clipboard.writeText(link); toast(L("🔗 Link copy ho gaya — customer ko bhejo", "🔗 Link copied — send it to the customer")); } catch { prompt("Link", link); } return link; }
  let lead = q.lead_id ? await fullLead(q.lead_id) : null;
  if (lead && !(await ensureWork("lead", lead))) return;
  if (!lead) lead = { company: q.to_party?.name || "", contact_name: q.to_party?.contact || "", email: q.to_party?.email || "", products: [] };
  const prod = (q.items || []).map((i) => String(i.desc || "").split("\n")[0]).filter(Boolean).slice(0, 2).join(", ");
  openComposer({ channel, lead, to: q.to_party?.email, stage: "quote", vars: { quote_link: link, quote_link_en: ` You can also view & accept it online: ${link}`, quote_link_hi: ` Online dekhein / accept karein: ${link}`, quote_no: q.quote_no, ...(prod ? { product: prod } : {}) } });
  return link;
}
export function quoteTrackHtml(q) {
  if (!q.id) return "";
  const resp = q.customer_response === "accepted" ? `<span class="badge good">✅ ${L("Customer ne accept ki", "Accepted by customer")} · ${h(ago(q.customer_response_at))}</span>`
    : q.customer_response === "changes" ? `<span class="badge warn">✏️ ${L("Changes maange", "Changes requested")} · ${h(ago(q.customer_response_at))}</span>` : "";
  return `<div class="qtrack">${q.share_token ? (q.view_count ? `👁 <b>${q.view_count}×</b> ${L("dekhi", "viewed")} · ${L("pehli baar", "first")} ${h(ago(q.first_viewed_at))} · ${L("last", "last")} ${h(ago(q.last_viewed_at))}` : `🔗 ${L("Link bheja — customer ne abhi kholi nahi", "Link shared — not opened yet")}`) : `🔗 ${L("Online link banao — customer kab kholta hai wo pata chalega", "Create an online link — you'll know when the customer opens it")}`} ${resp}
    ${q.customer_note ? `<div class="mu" style="margin-top:4px">“${h(q.customer_note)}”</div>` : ""}</div>`;
}
export async function orderFromQuote(q, done) {
  const { data: ex } = await sb.from("orders").select("id, order_no").eq("quotation_id", q.id).limit(1);
  if (ex?.length && !(await confirmBox(L(`Is quotation ka order ${ex[0].order_no} pehle se hai. Ek aur banana hai?`, `Order ${ex[0].order_no} already exists for this quotation. Create another?`), L("Haan", "Yes")))) return;
  if (q.status !== "won") await sb.from("quotations").update({ status: "won" }).eq("id", q.id);
  if (q.lead_id) await sb.from("leads").update({ status: "won", deal_value: q.grand_total }).eq("id", q.lead_id).select("id").then(() => {}, () => {});
  orderForm({ quotation_id: q.id, lead_id: q.lead_id, amount: q.grand_total, po_date: today() }, done);
}

// =====================================================================
//  SUPPORT TICKETS
// =====================================================================
const TCAT = [["hardware", "Hardware"], ["software", "Software"], ["network", "Network"], ["amc", "AMC visit"], ["installation", "Installation"], ["other", "Other"]];
const TPRI = [["urgent", "🔴 Urgent"], ["high", "🟠 High"], ["normal", "🔵 Normal"], ["low", "⚪ Low"]];
const TST = [["open", "Open"], ["in_progress", "In progress"], ["waiting", "Waiting (customer)"], ["resolved", "Resolved"], ["closed", "Closed"]];
const tBadge = (s) => `<span class="badge ${s === "open" ? "warn" : s === "in_progress" ? "info" : s === "waiting" ? "" : "good"}">${h(TST.find((x) => x[0] === s)?.[1] || s)}</span>`;
export async function viewSupport(el, soft, params) {
  const f = el.dataset.tf || "open";
  let q = sb.from("tickets").select("*").order("created_at", { ascending: false }).limit(500);
  if (f === "open") q = q.in("status", ["open", "in_progress", "waiting"]);
  else if (f === "mine") q = q.eq("assignee_id", S.me.id).in("status", ["open", "in_progress", "waiting"]);
  else if (f === "done") q = q.in("status", ["resolved", "closed"]);
  const { data, error } = await q; if (error) throw error;
  const leads = await leadsById(data.map((t) => t.lead_id));
  const late = (t) => !["resolved", "closed"].includes(t.status) && t.due_at && new Date(t.due_at) < new Date();
  el.innerHTML = `<div class="toolbar"><div class="chips">${[["open", L("Open", "Open")], ["mine", L("Mujhe assigned", "Assigned to me")], ["done", L("Resolved", "Resolved")], ["all", L("Sab", "All")]].map(([k, l]) => `<button class="chip ${f === k ? "on" : ""}" data-tf="${k}">${h(l)}</button>`).join("")}</div>
    <span class="mu">${data.filter(late).length ? `⏰ ${data.filter(late).length} ${L("SLA se late", "past SLA")}` : ""}</span><span class="sp" style="flex:1"></span><button class="btn primary" id="tadd">${ic("plus")} Ticket</button></div>
  <div class="card"><div class="tbl-wrap">${!data.length ? empty("Koi ticket nahi 🎉", "No tickets 🎉") : `<table class="tbl"><thead><tr><th>#</th><th>${L("Problem", "Issue")}</th><th>${L("Company", "Company")}</th><th>Priority</th><th>Status</th><th>${L("Assigned", "Assigned")}</th><th>SLA</th></tr></thead><tbody>
  ${data.map((t) => `<tr data-tid="${t.id}"><td class="mono">${h(t.ticket_no)}</td><td><div class="co">${h(t.title)}</div><div class="sub">${h(TCAT.find((c) => c[0] === t.category)?.[1] || t.category)} · ${h(ago(t.created_at))}</div></td><td>${h(leads.get(t.lead_id)?.company || "—")}</td><td>${h(TPRI.find((p) => p[0] === t.priority)?.[1] || t.priority)}</td><td>${tBadge(t.status)}</td><td>${h(t.assignee_id ? userName(t.assignee_id) : "—")}</td><td class="sub" ${late(t) ? 'style="color:var(--bad)"' : ""}>${t.resolved_at ? "✔ " + h(ago(t.resolved_at)) : late(t) ? "⏰ " + h(ago(t.due_at)) : h(dt(t.due_at))}</td></tr>`).join("")}</tbody></table>`}</div></div>
  <p class="mu" style="font-size:12.5px">⏱ SLA: Urgent 4 ${L("ghante", "hours")} · High 1 ${L("din", "day")} · Normal 3 ${L("din", "days")} · Low 7 ${L("din", "days")}. ${h(L("Assign karte hi us engineer ko notification jata hai.", "The assignee gets a notification immediately."))}</p>`;
  $$("[data-tf]", el).forEach((b) => b.onclick = () => { el.dataset.tf = b.dataset.tf; viewSupport(el); });
  $("#tadd", el).onclick = () => ticketForm({}, () => viewSupport(el));
  $$("[data-tid]", el).forEach((r) => r.onclick = () => ticketView(+r.dataset.tid, () => viewSupport(el)));
  if (params?.id && !soft) ticketView(+params.id, () => viewSupport(el));
}
export async function ticketForm(t, done) {
  const lead = t.lead_id ? (await leadsById([t.lead_id])).get(t.lead_id) : null;
  const m = modal({
    title: t.id ? `🛠 ${t.ticket_no}` : L("Naya support ticket", "New support ticket"), wide: true,
    body: `<label class="f">${L("Problem (short)", "Issue (short)")} *</label><input class="input" name="title" value="${h(t.title || "")}" maxlength="200" placeholder="${h(L("Printer print nahi kar raha, laptop slow…", "Printer not printing, laptop slow…"))}">
      <label class="f">${L("Company", "Company")}</label>${leadPickerHtml("tLead", lead)}
      <div class="grid3 sec"><div><label class="f">Category</label><select class="input" name="category">${opt(TCAT, t.category || "hardware")}</select></div>
      <div><label class="f">Priority</label><select class="input" name="priority">${opt(TPRI, t.priority || "normal")}</select></div>
      <div><label class="f">${L("Assign karo", "Assign to")}</label><select class="input" name="assignee_id"><option value="">—</option>${opt(S.team.filter((u) => u.active).map((u) => [u.id, u.full_name]), t.assignee_id)}</select></div></div>
      <label class="f">${L("Details", "Details")}</label><textarea class="input" name="description" maxlength="5000" style="min-height:100px">${h(t.description || "")}</textarea>`,
    foot: `<span style="flex:1"></span><button class="btn" data-close>Cancel</button><button class="btn primary" id="tsave">Save</button>`,
  });
  const pick = wireLeadPicker(m, "tLead");
  $("#tsave", m).onclick = (e) => busy(e.target, async () => {
    const f = formData(m); if (!f.title) return toast(L("Problem likho", "Describe the issue"), true);
    const row = { title: f.title, lead_id: pick(), category: f.category, priority: f.priority, assignee_id: f.assignee_id, description: f.description };
    const res = t.id ? await sb.from("tickets").update(row).eq("id", t.id).select("*").single() : await sb.from("tickets").insert(row).select("*").single();
    if (res.error) throw res.error;
    toast(`🛠 ${res.data.ticket_no} saved ✔`); closeModal(); done?.();
  });
}
async function ticketView(id, done) {
  const [{ data: t, error }, { data: cm }] = await Promise.all([sb.from("tickets").select("*").eq("id", id).single(), sb.from("ticket_comments").select("*").eq("ticket_id", id).order("created_at")]);
  if (error) return fail(error);
  const lead = t.lead_id ? (await leadsById([t.lead_id])).get(t.lead_id) : null;
  const can = isMgr() || t.assignee_id === S.me.id || t.created_by === S.me.id;
  const m = modal({
    title: `🛠 ${t.ticket_no} — ${t.title}`, wide: true,
    body: `<div class="row">${tBadge(t.status)}<span class="badge">${h(TPRI.find((p) => p[0] === t.priority)?.[1])}</span><span class="badge">${h(TCAT.find((c) => c[0] === t.category)?.[1])}</span>
        ${lead ? `<a href="#/leads/${lead.id}" class="mu">${h(lead.company)}</a>` : ""}<span class="mu right">${L("Banaya", "Opened by")} ${h(userName(t.created_by))} · ${h(ago(t.created_at))}</span></div>
      ${t.description ? `<p style="white-space:pre-wrap">${h(t.description)}</p>` : ""}
      ${can ? `<div class="grid2 sec"><div><label class="f">Status</label><select class="input" id="tkS">${opt(TST, t.status)}</select></div><div><label class="f">${L("Assigned", "Assigned")}</label><select class="input" id="tkA"><option value="">—</option>${opt(S.team.filter((u) => u.active).map((u) => [u.id, u.full_name]), t.assignee_id)}</select></div></div>` : ""}
      <div class="sec-t">${L("Updates", "Updates")}</div><ul class="timeline">${(cm || []).map((c) => `<li><span class="ic">💬</span><div><div style="white-space:pre-wrap">${h(c.body)}</div><div class="t">${h(userName(c.user_id))} · ${h(dt(c.created_at))}</div></div></li>`).join("") || `<li><span></span><span class="mu">${L("Abhi koi update nahi", "No updates yet")}</span></li>`}</ul>
      <textarea class="input" id="tkC" maxlength="4000" placeholder="${h(L("Update likho — kya kiya, kya baaki…", "Write an update — what was done, what's pending…"))}"></textarea>`,
    foot: `${can ? `<button class="btn" id="tkE">Edit</button>` : ""}${isAdmin() ? `<button class="btn danger" id="tkD">${ic("trash")}</button>` : ""}<span style="flex:1"></span><button class="btn" data-close>${L("Band karo", "Close")}</button><button class="btn primary" id="tkSave">${L("Save update", "Save update")}</button>`,
  });
  $("#tkE", m)?.addEventListener("click", () => ticketForm(t, done));
  $("#tkD", m)?.addEventListener("click", async () => { if (!(await confirmBox(L("Ticket delete karna hai?", "Delete this ticket?"), "Delete"))) return; await sb.from("tickets").delete().eq("id", id); closeModal(); done?.(); });
  $("#tkSave", m).onclick = (e) => busy(e.target, async () => {
    const body = $("#tkC", m).value.trim(), upd = {};
    if (can) { const s = $("#tkS", m).value, a = $("#tkA", m).value || null; if (s !== t.status) upd.status = s; if (a !== t.assignee_id) upd.assignee_id = a; }
    if (body) { const { error: x } = await sb.from("ticket_comments").insert({ ticket_id: id, body }); if (x) throw x; }
    if (Object.keys(upd).length) { const { error: x } = await sb.from("tickets").update(upd).eq("id", id); if (x) throw x; }
    if (!body && !Object.keys(upd).length) return closeModal();
    toast(L("Update saved ✔", "Update saved ✔")); done?.(); ticketView(id, done);
  });
}

// =====================================================================
//  DAILY REPORT + ATTENDANCE + VISITS
// =====================================================================
const hm = (t) => t ? new Date(t).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "—";
const hrs = (m) => m ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : "—";
export async function viewDaily(el) {
  const day = el.dataset.dday || today();
  const from = addDays(day, -6);
  const [{ data: rep, error }, { data: att }, { data: vis }] = await Promise.all([
    sb.rpc("daily_report", { p_day: day }),
    sb.from("attendance").select("*").gte("day", from).lte("day", day),
    sb.from("visits").select("*").gte("created_at", new Date(day + "T00:00:00+05:30").toISOString()).lt("created_at", new Date(addDays(day, 1) + "T00:00:00+05:30").toISOString()).order("created_at"),
  ]);
  if (error) throw error;
  const rows = (rep || []).map((r) => ({ ...r, name: userName(r.user_id) })).sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name));
  const T = (k) => rows.reduce((a, r) => a + +(r[k] || 0), 0);
  const days = [...Array(7)].map((_, i) => addDays(from, i));
  const amap = new Map((att || []).map((a) => [a.user_id + "|" + a.day, a]));
  const vleads = await leadsById((vis || []).map((v) => v.lead_id));
  const wd = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "2-digit" });
  el.innerHTML = `<div class="toolbar"><button class="btn sm" data-dd="-1">‹</button><input class="input" type="date" id="dday" value="${h(day)}" max="${h(today())}" style="width:auto"><button class="btn sm" data-dd="1" ${day >= today() ? "disabled" : ""}>›</button>
      <span class="mu">${day === today() ? L("Aaj (live)", "Today (live)") : h(dOnly(day))}</span><span class="sp" style="flex:1"></span><button class="btn" id="dexp">${ic("download")} Export</button></div>
    <div class="kpis">
      <div class="card kpi"><div class="l">Calls</div><div class="v">${num(T("calls"))}</div><div class="s">${num(T("positive"))} positive</div></div>
      <div class="card kpi"><div class="l">Email / WhatsApp</div><div class="v">${num(T("emails"))} / ${num(T("whatsapp"))}</div></div>
      <div class="card kpi"><div class="l">${L("Quotations", "Quotations")}</div><div class="v">${num(T("quotes"))}</div><div class="s">${inrShort(T("quote_value"))}</div></div>
      <div class="card kpi"><div class="l">Won · ${L("Payment mila", "Collected")}</div><div class="v">${num(T("won"))}</div><div class="s">${inrShort(T("payments"))}</div></div>
      <div class="card kpi"><div class="l">${L("Visits · Tickets solved", "Visits · Tickets solved")}</div><div class="v">${num(T("visits"))} · ${num(T("tickets_resolved"))}</div></div></div>
    <div class="card"><div class="card-h"><h3>${isMgr() ? L("Team ka din", "Team's day") : L("Mera din", "My day")}</h3></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>${L("Naam", "Name")}</th><th>Login</th><th>${L("Last active", "Last active")}</th><th class="num">${L("Active time", "Active time")}</th><th class="num">Calls</th><th class="num">+ve</th><th class="num">Email</th><th class="num">WA</th><th class="num">Quotes</th><th class="num">Won</th><th class="num">₹ ${L("Mila", "Collected")}</th><th class="num">Visits</th></tr></thead><tbody>
      ${rows.map((r) => `<tr style="cursor:default"><td class="co">${h(r.name)}${r.first_seen ? "" : ` <span class="badge bad">${L("Absent", "Absent")}</span>`}</td><td>${h(hm(r.first_seen))}${r.first_seen && hm(r.first_seen) > "10:15" ? " ⏰" : ""}</td><td class="sub">${h(hm(r.last_seen))}</td><td class="num">${h(hrs(r.active_min))}</td><td class="num">${num(r.calls)}</td><td class="num">${num(r.positive)}</td><td class="num">${num(r.emails)}</td><td class="num">${num(r.whatsapp)}</td><td class="num">${num(r.quotes)}</td><td class="num">${num(r.won)}</td><td class="num">${r.payments > 0 ? inrShort(r.payments) : "—"}</td><td class="num">${num(r.visits)}</td></tr>`).join("")}
    </tbody></table></div></div>
    <div class="card sec"><div class="card-h"><h3>🕘 ${L("Attendance — last 7 din", "Attendance — last 7 days")}</h3></div><div class="tbl-wrap"><table class="tbl att"><thead><tr><th>${L("Naam", "Name")}</th>${days.map((d) => `<th class="num">${h(wd(d))}</th>`).join("")}</tr></thead><tbody>
      ${rows.map((r) => `<tr style="cursor:default"><td class="co">${h(r.name)}</td>${days.map((d) => { const a = amap.get(r.user_id + "|" + d), sun = new Date(d + "T00:00:00").getDay() === 0;
        return `<td class="num">${a ? `<div><b>${h(hm(a.first_seen))}</b></div><div class="sub">${h(hrs(a.active_min))}</div>` : `<span class="mu">${sun ? "—" : "✖"}</span>`}</td>`; }).join("")}</tr>`).join("")}
    </tbody></table></div><div class="card-b mu" style="font-size:12px">${h(L("Login = CRM pehli baar kab khula · Active time = jitni der CRM khula aur use hua (har minute heartbeat). ⏰ = 10:15 ke baad login.", "Login = first time the CRM was opened · Active time = time the CRM was open and in use (heartbeat every minute). ⏰ = login after 10:15."))}</div></div>
    ${(vis || []).length ? `<div class="card sec"><div class="card-h"><h3>📍 ${L("Visits", "Visits")}</h3></div><div class="card-b">${vis.map((v) => `<div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)"><b>${h(hm(v.created_at))}</b><span>${h(userName(v.user_id))}</span><a href="#/leads/${v.lead_id}">${h(vleads.get(v.lead_id)?.company || "#" + v.lead_id)}</a><span class="mu">${h(v.note || "")}</span>${v.lat != null ? `<a class="right" target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps?q=${+v.lat},${+v.lng}">🗺 Map${v.accuracy ? ` (±${v.accuracy}m)` : ""}</a>` : ""}</div>`).join("")}</div></div>` : ""}`;
  $("#dday", el).onchange = (e) => { el.dataset.dday = e.target.value || today(); viewDaily(el); };
  $$("[data-dd]", el).forEach((b) => b.onclick = () => { el.dataset.dday = addDays(day, +b.dataset.dd); viewDaily(el); });
  $("#dexp", el).onclick = () => download(`daily-report-${day}.csv`, toCSV(rows.map((r) => ({ ...r, login: hm(r.first_seen), last: hm(r.last_seen), active: hrs(r.active_min) })), [["name", "Name"], ["login", "Login"], ["last", "Last active"], ["active", "Active time"], ["calls", "Calls"], ["positive", "Positive"], ["emails", "Emails"], ["whatsapp", "WhatsApp"], ["quotes", "Quotations"], ["quote_value", "Quote value"], ["won", "Won"], ["payments", "Collected"], ["visits", "Visits"], ["tickets_resolved", "Tickets resolved"]]));
}

// ---------- visit check-in (GPS) ----------
export function checkIn(lead, done) {
  const m = modal({
    title: `📍 ${L("Visit check-in", "Visit check-in")} — ${lead.company}`,
    body: `<p class="mu" id="gps">${L("Location le rahe hain…", "Getting your location…")}</p><label class="f">${L("Note (kisse mile, kya hua)", "Note (who you met, outcome)")}</label><textarea class="input" id="vN" maxlength="500"></textarea>`,
    foot: `<button class="btn" data-close>Cancel</button><button class="btn primary" id="vOk" disabled>${L("Check-in karo", "Check in")}</button>`,
  });
  let pos = null;
  const ready = (msg) => { $("#gps", m).innerHTML = msg; $("#vOk", m).disabled = false; };
  if (!navigator.geolocation) ready("⚠️ " + h(L("Is device pe GPS nahi — bina location ke check-in hoga", "No GPS on this device — check-in without location")));
  else navigator.geolocation.getCurrentPosition(
    (p) => { pos = p.coords; ready(`✅ ${L("Location mili", "Location found")} (±${Math.round(pos.accuracy)}m)`); },
    () => ready("⚠️ " + h(L("Location permission nahi mili — bina location ke check-in hoga", "Location permission denied — check-in without location"))),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  $("#vOk", m).onclick = (e) => busy(e.target, async () => {
    const { error } = await sb.from("visits").insert({ lead_id: lead.id, lat: pos?.latitude ?? null, lng: pos?.longitude ?? null, accuracy: pos ? Math.round(pos.accuracy) : null, note: $("#vN", m).value.trim() || null });
    if (error) throw error;
    toast(L("📍 Check-in ho gaya", "📍 Checked in")); closeModal(); done?.();
  });
}

// =====================================================================
//  DUPLICATE CLEANER + SMART SCORING (managers)
// =====================================================================
export async function viewDuplicates(el) {
  const { data: groups, error } = await sb.rpc("find_duplicates"); if (error) throw error;
  const all = await leadsById(groups.flatMap((g) => g.ids));
  const { data: extra } = groups.length ? await sb.from("leads").select("id, call_count, created_at, score, source").in("id", [...all.keys()]) : { data: [] };
  (extra || []).forEach((x) => Object.assign(all.get(x.id) || {}, x));
  el.innerHTML = `<div class="toolbar"><span class="mu">${groups.length ? L(`${groups.length} duplicate groups mile`, `${groups.length} duplicate groups found`) : ""}</span><span class="sp" style="flex:1"></span>
    <button class="btn" id="rescore">⚡ ${L("Lead scores dobara calculate karo", "Recalculate lead scores")}</button></div>
    ${!groups.length ? `<div class="card">${empty("Koi duplicate nahi mila — data saaf hai ✨", "No duplicates found — your data is clean ✨")}</div>` : groups.map((g, gi) => `<div class="card sec dupg" data-g="${gi}"><div class="card-h"><h3>${h(L({ "Same GSTIN": "Same GSTIN", "Same email": "Same email", "Same company name": "Same company naam" }[g.reason] || g.reason, g.reason))}</h3><span class="sp"></span>
      <button class="btn sm" data-ign="${gi}">${L("Ye duplicate nahi hai", "Not a duplicate")}</button> <button class="btn sm primary" data-merge="${gi}">🔗 ${L("Merge karo", "Merge")}</button></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>${L("Rakhna hai", "Keep")}</th><th>${L("Company", "Company")}</th><th>Contact</th><th>Phone / Email</th><th>Status</th><th>Owner</th><th class="num">Calls</th><th>${L("Added", "Added")}</th></tr></thead><tbody>
      ${g.ids.map((id, i) => { const l = all.get(id) || { id }; return `<tr style="cursor:default"><td><input type="radio" name="p${gi}" value="${id}" ${i === 0 ? "checked" : ""} aria-label="Keep"></td><td><a href="#/leads/${id}" class="co">${h(l.company || "#" + id)}</a><div class="sub">${h([l.city, l.gstin].filter(Boolean).join(" · "))}</div></td><td>${h(l.contact_name || "—")}</td><td class="sub">${h(l.phone || "")}${l.email ? "<br>" + h(l.email) : ""}</td><td>${statusBadge(l.status)}</td><td>${h(userName(l.owner_id))}</td><td class="num">${num(l.call_count)}</td><td class="sub">${h(dOnly(l.created_at))}</td></tr>`; }).join("")}
      </tbody></table></div></div>`).join("")}
    <p class="mu" style="font-size:12.5px">🔗 ${h(L("Merge: jo lead “Rakhna hai” chuna wo bachegi — baaki ke calls, emails, quotations, tasks, orders, tickets usme aa jayenge, khaali fields bhar jayenge, extra phone numbers alt numbers ban jayenge.", "Merge: the lead marked “Keep” stays — the others' calls, emails, quotations, tasks, orders and tickets move into it, empty fields get filled and extra phone numbers become alternate numbers."))}</p>`;
  $("#rescore", el).onclick = (e) => busy(e.target, async () => { const { data, error: x } = await sb.rpc("recompute_scores"); if (x) throw x; toast(L(`⚡ ${data} leads ka score update hua`, `⚡ ${data} lead scores updated`)); });
  $$("[data-merge]", el).forEach((b) => b.onclick = () => busy(b, async () => {
    const g = groups[+b.dataset.merge], keep = +$(`input[name=p${b.dataset.merge}]:checked`, el).value, others = g.ids.filter((x) => x !== keep);
    if (!(await confirmBox(L(`${others.length} lead(s) ko "${all.get(keep)?.company}" mein merge karna hai? Ye wapas nahi hoga.`, `Merge ${others.length} lead(s) into "${all.get(keep)?.company}"? This cannot be undone.`), L("Merge karo", "Merge")))) return;
    const { error: x } = await sb.rpc("merge_leads", { p_primary: keep, p_others: others }); if (x) throw x;
    toast(L("🔗 Merge ho gaya", "🔗 Merged")); HOOK.softRefresh(); viewDuplicates(el);
  }));
  $$("[data-ign]", el).forEach((b) => b.onclick = () => busy(b, async () => {
    const { error: x } = await sb.from("duplicate_ignores").insert({ key: groups[+b.dataset.ign].key }); if (x) throw x; viewDuplicates(el);
  }));
}

// =====================================================================
//  LEAD DRAWER PANEL: renewals · orders · invoices · tickets · visits
// =====================================================================
export async function leadPanel(box, lead, reopen) {
  const [{ data: rn }, { data: od }, { data: iv }, { data: tk }, { data: vs }] = await Promise.all([
    sb.from("renewals").select("*").eq("lead_id", lead.id).eq("status", "active").order("end_date"),
    sb.from("orders").select("id, order_no, amount, status, created_at").eq("lead_id", lead.id).order("created_at", { ascending: false }).limit(10),
    sb.from("invoice_balances").select("*").eq("lead_id", lead.id).order("invoice_date", { ascending: false }).limit(10),
    sb.from("tickets").select("id, ticket_no, title, status").eq("lead_id", lead.id).in("status", ["open", "in_progress", "waiting"]),
    sb.from("visits").select("id").eq("lead_id", lead.id),
  ]);
  const due = (iv || []).filter((i) => !i.cancelled && +i.balance > 0.5);
  const can = canWork(lead);
  box.innerHTML = `<div class="card sec"><div class="card-h"><h3>💼 ${L("Account", "Account")}</h3><span class="sp"></span>
      ${can ? `<button class="btn sm" data-lp="visit">📍 ${L("Check-in", "Check-in")}</button>` : ""}<button class="btn sm" data-lp="ren">${ic("plus")} ${L("Renewal", "Renewal")}</button><button class="btn sm" data-lp="tkt">${ic("plus")} Ticket</button></div>
    <div class="card-b" style="padding:6px 16px">
      ${(rn || []).map((r) => `<div class="row lp-row" data-lpr="${r.id}">🔁 <span style="flex:1">${h(r.product)}</span>${renBadge(r)}<span class="mu">${h(dOnly(r.end_date))}</span></div>`).join("")}
      ${due.map((i) => `<div class="row lp-row">🧾 <span style="flex:1" class="mono">${h(i.invoice_no)}</span><span class="badge ${PAYB[i.pay_status]}">${h(i.pay_status)}</span><b>${inr(i.balance)}</b> <span class="mu">${L("baaki", "due")}</span></div>`).join("")}
      ${(od || []).slice(0, 3).map((o) => `<div class="row lp-row">📦 <span style="flex:1" class="mono">${h(o.order_no)}</span><span class="badge">${h(o.status)}</span>${inr(o.amount)}</div>`).join("")}
      ${(tk || []).map((t) => `<div class="row lp-row" data-lpt="${t.id}">🛠 <span style="flex:1">${h(t.ticket_no)} · ${h(t.title)}</span>${tBadge(t.status)}</div>`).join("")}
      ${!(rn || []).length && !due.length && !(od || []).length && !(tk || []).length ? `<div class="mu" style="padding:8px 0">${L("Koi renewal, order, payment ya ticket nahi", "No renewals, orders, dues or tickets")}${vs?.length ? ` · 📍 ${vs.length} visits` : ""}</div>` : vs?.length ? `<div class="mu" style="padding:6px 0;font-size:12px">📍 ${vs.length} ${L("visits", "visits")}</div>` : ""}
    </div></div>`;
  $$("[data-lp]", box).forEach((b) => b.onclick = () => {
    if (b.dataset.lp === "visit") return checkIn(lead, reopen);
    if (b.dataset.lp === "ren") return renewalForm({ lead_id: lead.id, owner_id: lead.owner_id || S.me.id }, reopen);
    if (b.dataset.lp === "tkt") return ticketForm({ lead_id: lead.id }, reopen);
  });
  $$("[data-lpr]", box).forEach((r) => r.onclick = () => renewalForm(rn.find((x) => x.id === +r.dataset.lpr), reopen));
  $$("[data-lpt]", box).forEach((r) => r.onclick = () => { location.hash = "#/support/" + r.dataset.lpt; });
}
