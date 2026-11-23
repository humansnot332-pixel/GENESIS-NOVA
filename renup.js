// =====================================================================
//  Renewals → update from an Excel / CSV (vendor portal report, AMC sheet…)
//   file → columns found by their names → each row matched to a customer (GSTIN, email domain,
//   company name) and to its renewal (same product) → preview: new / update (old → new expiry) /
//   customer not found / date not understood → import → Undo.
// =====================================================================
import { sb, S, h, toast, toastAction, fail, modal, closeModal, busy, isMgr, inr, download } from "./core.js";
import { L } from "./i18n.js";
import { readTableFile, toISODate, headerRow } from "./import.js";
import { renGroup } from "./biz.js";

const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const COLS = [
  ["company", L("Company *", "Company *"), /company|customer|client|account|party|organi[sz]ation|firm|bill ?to|end ?user/i],
  ["product", L("Product *", "Product *"), /product|item|software|licen[cs]e name|plan|sku|offer|description|service|contract name/i],
  ["end", L("Expiry date *", "Expiry date *"), /expir|end ?date|renew(al)? ?date|valid ?(till|upto|until)|due ?date|term ?end|to ?date|\bend\b/i],
  ["start", L("Start date", "Start date"), /start|from ?date|purchase|activation|order ?date|begin/i],
  ["amount", L("Amount", "Amount"), /amount|value|price|total|cost|renewal ?(price|value)/i],
  ["qty", L("Qty / users", "Qty / users"), /qty|quantity|seats?|users?|nos|licen[cs]es$/i],
  ["kind", L("Type", "Type"), /^type$|kind|category/i],
  ["gstin", "GSTIN", /gst/i],
  ["email", "Email", /mail/i],
  ["notes", L("Notes / serial", "Notes / serial"), /note|remark|serial|contract ?(no|id)|subscription ?(no|id)|agreement|reference/i],
];
const nz = (x) => String(x || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
const STOP = /\b(m s|ms|the|pvt|private|ltd|limited|llp|inc|co|company|corp|corporation|india|and)\b/g;
const coKey = (x) => nz(x).replace(STOP, " ").replace(/\s+/g, " ").trim();
const FREE = /^(gmail|yahoo|hotmail|outlook|rediffmail|live|icloud|ymail|aol|protonmail|zoho)\./i;
const num = (v) => { const n = parseFloat(String(v ?? "").replace(/[^\d.]/g, "")); return isFinite(n) ? n : null; };
const okDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(new Date(d + "T00:00:00")) && new Date(d + "T00:00:00").toISOString().slice(0, 10) === d;
const addDays = (d, n) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const yearBefore = (d) => { const x = new Date(d + "T00:00:00Z"); x.setUTCFullYear(x.getUTCFullYear() - 1); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };
const fmt = (d) => d ? new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const guessKind = (p, t) => {
  const x = `${t || ""} ${p || ""}`.toLowerCase();
  if (/\bamc\b|maintenance|engineer|\bfms\b|facility/.test(x)) return "amc";
  if (/domain|hosting|cloud ?mail|email hosting/.test(x)) return "domain";
  if (/warranty/.test(x)) return "warranty";
  if (/^\s*licen[cs]e\b/.test(t || "")) return "licence";
  return "subscription";
};

async function allLeads() {
  const out = [];
  for (let from = 0; from < 50000; from += 1000) {
    const { data, error } = await sb.from("leads").select("id, company, gstin, email, owner_id, status").order("id").range(from, from + 999);
    if (error) throw error; out.push(...(data || [])); if (!data || data.length < 1000) break;
  }
  return out;
}

export async function renewalUpload(done) {
  if (!isMgr()) return toast(L("Sirf Manager / Admin upload kar sakte hain", "Only a Manager / Admin can upload"), true);
  const m = modal({
    title: L("⬆️ Renewals — Excel se update", "⬆️ Renewals — update from Excel"), wide: true,
    body: `<p class="mu" style="margin:0 0 10px;font-size:13px">${L("Autodesk / Microsoft / Adobe portal ki subscription report, ya apni AMC Excel daalo. Har line customer aur product se match hogi — <b>pehle preview dikhega</b>, phir hi kuch badlega.", "Drop the subscription report from the Autodesk / Microsoft / Adobe portal, or your own AMC sheet. Each line is matched to a customer and product — <b>you see a preview first</b>; nothing changes until you import.")}</p>
      <label class="dropzone" id="ruDrop"><input type="file" id="ruF" accept=".xlsx,.xls,.csv,.txt,.htm,.html,.xml" class="sr">
        <div style="font-size:26px">📄</div><b>${L("File chuno ya yahan chhodo", "Choose a file or drop it here")}</b>
        <div class="mu" style="font-size:12.5px">Excel (.xlsx / .xls) · CSV — ${L("zaroori columns: Company, Product, Expiry date", "needed: Company, Product, Expiry date")}</div></label>
      <div class="row" id="ruFile" hidden style="margin:0 0 4px"><span>📄 <b id="ruName"></b></span><button type="button" class="btn sm ghost" id="ruAgain">${L("Dusri file", "Another file")}</button></div>
      <div class="row" id="ruTplRow" style="margin-top:8px"><button type="button" class="btn sm ghost" id="ruTpl">⬇️ ${L("Sample Excel (CSV) download", "Download a sample (CSV)")}</button></div>
      <div id="ruBody"></div>`,
    foot: `<button class="btn" data-close>${L("Band karo", "Close")}</button><span style="flex:1"></span><button class="btn primary" id="ruGo" disabled>${L("Import karo", "Import")}</button>`,
  });
  $("#ruTpl", m).onclick = () => download("renewals-sample.csv",
    "Company,Product,Expiry date,Start date,Amount,Qty,Type,GSTIN,Notes\nSUPRIYATA PRIVATE LIMITED,AMC,30-06-2027,01-07-2026,1200000,1,AMC,,Residential engineer\nGumpro Drilling Fluids Pvt. Ltd.,AutoCAD LT,12-04-2027,,28500,1,Subscription,,Serial 123-45678901\n");
  const drop = $("#ruDrop", m), inp = $("#ruF", m);
  inp.onchange = () => inp.files[0] && load(inp.files[0]);
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("on"); };
  drop.ondragleave = () => drop.classList.remove("on");
  $("#ruAgain", m).onclick = () => inp.click();
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove("on"); if (e.dataTransfer.files[0]) load(e.dataTransfer.files[0]); };

  let sheets = [], sh = 0, hdr = 0, map = {}, plan = [], fileName = "", ctx = null, view = "all";
  async function load(f) {
    if (f.size > 15e6) return toast(L("File 15 MB se badi hai", "File is larger than 15 MB"), true);
    const box = $("#ruBody", m); box.innerHTML = `<div class="empty">${L("File padh rahe hain…", "Reading the file…")}</div>`;
    try {
      fileName = f.name; sheets = await readTableFile(f);
      if (!sheets.length) throw new Error(L("File mein data nahi mila", "No data found in the file"));
      // the sheet whose header names the most of our columns
      let best = 0, bs = -1;
      sheets.forEach((s, i) => { const hd = s.rows[headerRow(s.rows)] || []; const sc = autoMap(hd); if (Object.keys(sc).length > bs) { bs = Object.keys(sc).length; best = i; } });
      pickSheet(best);
      if (!ctx) {
        box.innerHTML = `<div class="empty">${L("Customers aur renewals mila rahe hain…", "Matching customers and renewals…")}</div>`;
        const [leads, { data: rens, error }] = await Promise.all([allLeads(), sb.from("renewals").select("id, lead_id, product, status, start_date, end_date, amount, qty, kind, notes").in("status", ["active", "unconfirmed"]).limit(10000)]);
        if (error) throw error;
        const byKey = new Map(), byGst = new Map(), byDom = new Map();
        for (const l of leads) {
          const k = coKey(l.company); if (k) (byKey.get(k) || byKey.set(k, []).get(k)).push(l);
          if (l.gstin) byGst.set(String(l.gstin).toUpperCase().replace(/\s/g, ""), l);
          const d = String(l.email || "").split("@")[1]?.toLowerCase(); if (d && !FREE.test(d)) (byDom.get(d) || byDom.set(d, []).get(d)).push(l);
        }
        ctx = { leads, rens: rens || [], byKey, byGst, byDom };
      }
      build(); draw();
      // the file is in: the big drop box gives its room to the preview
      drop.hidden = true; $("#ruTplRow", m).hidden = true; $("#ruFile", m).hidden = false; $("#ruName", m).textContent = fileName;
    } catch (e) { fail(e); box.innerHTML = ""; }
  }
  function autoMap(hd) {
    const mp = {}, used = new Set();
    const bad = { company: /product|item|contact|person|email|phone/i, amount: /qty|quantity|seat|user|date/i, end: /start|vendor/i, product: /company|customer|client/i };
    const take = (k, re) => { const i = hd.findIndex((c, j) => !used.has(j) && re.test(String(c || "")) && !(bad[k] && bad[k].test(String(c || "")))); if (i >= 0) { mp[k] = i; used.add(i); } return i >= 0; };
    // the surest columns first (dates, qty), so a "Total Qty" is never read as the amount
    for (const k of ["end", "start", "gstin", "email", "qty", "company", "product", "amount", "kind", "notes"]) take(k, COLS.find((c) => c[0] === k)[2]);
    if (mp.company == null) take("company", /\bname\b/i);       // a plain "Name" column, as a last resort
    return mp;
  }
  function pickSheet(i) { sh = i; hdr = headerRow(sheets[i].rows); map = autoMap(sheets[i].rows[hdr] || []); }

  function findLead(r) {
    const g = String(r.gstin || "").toUpperCase().replace(/\s/g, "");
    if (g && ctx.byGst.has(g)) return { lead: ctx.byGst.get(g), how: "GSTIN" };
    const d = String(r.email || "").split("@")[1]?.toLowerCase();
    if (d && !FREE.test(d) && ctx.byDom.get(d)?.length === 1) return { lead: ctx.byDom.get(d)[0], how: L("email", "email") };
    const k = coKey(r.company); if (!k) return null;
    const ex = ctx.byKey.get(k);
    if (ex?.length) return { lead: ex.slice().sort((a, b) => (b.status === "won") - (a.status === "won") || a.id - b.id)[0], how: L("naam", "name") };
    if (k.length >= 6) {   // "Kalpataru Projects International" ↔ "Kalpataru Projects International Ltd (Mumbai)"
      const near = ctx.leads.filter((l) => { const lk = coKey(l.company); return lk.length >= 6 && (lk.startsWith(k + " ") || k.startsWith(lk + " ")); });
      if (near.length === 1) return { lead: near[0], how: L("milta-julta naam", "similar name"), fuzzy: true };
    }
    return null;
  }
  function build() {
    const rows = sheets[sh].rows.slice(hdr + 1), cell = (row, k) => (map[k] == null ? "" : String(row[map[k]] ?? "").trim());
    const seen = new Map(); plan = [];
    rows.forEach((row, n) => {
      if (!row.some((c) => String(c ?? "").trim())) return;
      const r = { line: hdr + n + 2 }; COLS.forEach(([k]) => { r[k] = cell(row, k); });
      r.endISO = toISODate(r.end); r.startISO = r.start ? toISODate(r.start) : "";
      if (!r.company || !r.product) return plan.push({ ...r, st: "skip", why: L("Company / product khaali", "Company / product empty") });
      if (!okDate(r.endISO)) return plan.push({ ...r, st: "baddate", why: L(`Expiry samajh nahi aayi: "${r.end}"`, `Expiry not understood: "${r.end}"`) });
      if (r.startISO && !okDate(r.startISO)) r.startISO = "";
      const f = findLead(r);
      if (!f) return plan.push({ ...r, st: "nolead", why: L("Ye company CRM mein nahi mili", "This company is not in the CRM") });
      const g = renGroup(r.product), key = f.lead.id + "|" + g;
      const cur = ctx.rens.filter((x) => x.lead_id === f.lead.id && renGroup(x.product) === g).sort((a, b) => (a.status === "active" ? 0 : 1) - (b.status === "active" ? 0 : 1) || b.end_date.localeCompare(a.end_date))[0];
      const item = { ...r, lead: f.lead, how: f.how, fuzzy: f.fuzzy, group: g, cur, amountN: num(r.amount), qtyN: num(r.qty) };
      if (cur) {
        const same = cur.end_date === r.endISO && (item.amountN == null || +cur.amount === item.amountN) && cur.status === "active";
        item.st = same ? "same" : "update";
      } else item.st = "new";
      if (seen.has(key)) { const prev = seen.get(key); prev.st = "dup"; prev.why = L(`Neeche line ${r.line} mein dobara hai — wo wali li`, `Repeated on line ${r.line} — that one is used`); }
      seen.set(key, item); plan.push(item);
    });
  }
  const ST = {
    new: [L("Naya renewal", "New renewal"), "good"], update: [L("Date / amount update", "Date / amount update"), "info"], same: [L("Pehle se sahi", "Already right"), ""],
    nolead: [L("Company nahi mili", "Company not found"), "warn"], baddate: [L("Date galat", "Bad date"), "bad"], skip: [L("Khaali line", "Empty line"), ""], dup: [L("Dohraayi line", "Repeated line"), ""],
  };
  function draw() {
    const box = $("#ruBody", m), hd = sheets[sh].rows[hdr] || [];
    const cnt = (k) => plan.filter((p) => p.st === k).length, todo = cnt("new") + cnt("update");
    const show = plan.filter((p) => view === "all" || p.st === view).slice(0, 300);
    box.innerHTML = `
      ${sheets.length > 1 ? `<label class="f">Sheet</label><select class="input" id="ruSh" style="width:auto">${sheets.map((s, i) => `<option value="${i}" ${i === sh ? "selected" : ""}>${h(s.name)}</option>`).join("")}</select>` : ""}
      <details class="rucols" ${map.company != null && map.product != null && map.end != null ? "" : "open"}><summary>${L("Columns", "Columns")} <span class="mu">— ${map.company != null && map.product != null && map.end != null
        ? L("apne aap pehchane (" + COLS.filter(([k]) => map[k] != null).length + "); dekhne / badalne ke liye kholo", "found by name (" + COLS.filter(([k]) => map[k] != null).length + "); open to check / change")
        : L("⚠️ Company / Product / Expiry wala column chuno", "⚠️ pick the Company / Product / Expiry column")}</span></summary>
      <div class="grid3">${COLS.map(([k, lab]) => `<div><label class="f">${h(lab)}</label><select class="input" data-col="${k}"><option value="">— ${L("nahi hai", "none")} —</option>${hd.map((c, i) => `<option value="${i}" ${map[k] === i ? "selected" : ""}>${h(String(c || `#${i + 1}`)).slice(0, 40)}</option>`).join("")}</select></div>`).join("")}</div></details>
      <div class="chips" style="margin:14px 0 8px">${[["all", L("Sab", "All"), plan.length], ...Object.keys(ST).map((k) => [k, ST[k][0], cnt(k)])].filter(([k, , n]) => k === "all" || n).map(([k, l, n]) => `<button type="button" class="chip ${view === k ? "on" : ""}" data-v="${k}">${h(l)} · ${n}</button>`).join("")}</div>
      <div class="tbl-wrap" style="max-height:340px;overflow:auto"><table class="tbl"><thead><tr><th>#</th><th>${L("File mein", "In the file")}</th><th>${L("CRM customer", "CRM customer")}</th><th>Product</th><th>${L("Expiry", "Expiry")}</th><th class="num">${L("Amount", "Amount")}</th><th></th></tr></thead><tbody>
      ${show.map((p) => `<tr style="cursor:default"><td class="sub">${p.line}</td><td>${h(p.company)}</td>
        <td>${p.lead ? `${h(p.lead.company)}<div class="sub">${h(p.how)}${p.fuzzy ? " ⚠️" : ""}</div>` : "—"}</td>
        <td>${h(p.product)}${p.group && p.group !== p.product ? `<div class="sub">→ ${h(p.group)}</div>` : ""}</td>
        <td>${p.cur && p.st === "update" && p.cur.end_date !== p.endISO ? `<span class="mu" style="text-decoration:line-through">${h(fmt(p.cur.end_date))}</span> → ` : ""}<b>${h(okDate(p.endISO) ? fmt(p.endISO) : p.end || "—")}</b></td>
        <td class="num">${p.amountN != null ? inr(p.amountN) : "—"}</td>
        <td><span class="badge ${ST[p.st][1]}" title="${h(p.why || "")}">${h(ST[p.st][0])}</span>${p.why ? `<div class="sub">${h(p.why)}</div>` : ""}</td></tr>`).join("")}
      </tbody></table></div>
      ${plan.length > 300 && show.length === 300 ? `<div class="mu" style="font-size:12px">${L("Pehli 300 lines dikh rahi hain", "Showing the first 300 lines")}</div>` : ""}
      <div class="banner" style="margin:12px 0 0">ℹ️ <div>${L(`<b>${cnt("new")}</b> naye renewal banenge, <b>${cnt("update")}</b> ki date / amount badlegi. Date badalte hi reminders nayi date se chalenge. Import ke baad <b>Undo</b> bhi kar sakte ho.`, `<b>${cnt("new")}</b> new renewals, <b>${cnt("update")}</b> date / amount updates. Reminders follow the new dates. You can <b>Undo</b> after importing.`)}
        ${cnt("nolead") ? `<br>${L(`${cnt("nolead")} line ki company CRM mein nahi mili — wo chhod di jayengi (naam theek karke dobara upload kar sakte ho).`, `${cnt("nolead")} line(s) have a company that is not in the CRM — they are skipped (fix the name and upload again).`)}` : ""}</div></div>`;
    $("#ruGo", m).disabled = !todo;
    $("#ruGo", m).textContent = todo ? L(`Import karo (${todo})`, `Import (${todo})`) : L("Import karo", "Import");
    $("#ruSh", m)?.addEventListener("change", (e) => { pickSheet(+e.target.value); build(); draw(); });
    $$("[data-col]", box).forEach((s) => s.onchange = () => { const v = s.value; if (v === "") delete map[s.dataset.col]; else map[s.dataset.col] = +v; build(); draw(); });
    $$("[data-v]", box).forEach((b) => b.onclick = () => { view = b.dataset.v; draw(); });
  }

  $("#ruGo", m).onclick = (e) => busy(e.target, async () => {
    const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const tag = `Excel ${today} (${fileName.slice(0, 60)})`;
    const ins = plan.filter((p) => p.st === "new"), upd = plan.filter((p) => p.st === "update");
    const added = [], before = [];
    // new renewals
    const rows = ins.map((p) => ({
      lead_id: p.lead.id, product: p.product.slice(0, 200), kind: p.kind ? guessKind(p.product, p.kind) : guessKind(p.product),
      qty: p.qtyN && p.qtyN > 0 ? p.qtyN : 1, start_date: p.startISO || yearBefore(p.endISO), end_date: p.endISO,
      amount: p.amountN, notes: [tag, p.notes].filter(Boolean).join(" · ").slice(0, 1000), status: "active", owner_id: p.lead.owner_id || S.me.id,
    }));
    for (let i = 0; i < rows.length; i += 200) {
      const { data, error } = await sb.from("renewals").insert(rows.slice(i, i + 200)).select("id");
      if (error) throw error; added.push(...(data || []).map((x) => x.id));
    }
    // updates (the old values are kept for Undo)
    let failed = 0;
    for (const p of upd) {
      const c = p.cur, patch = { end_date: p.endISO, status: "active", reminder_stage: 999,
        notes: `${c.notes ? c.notes + " · " : ""}${tag}: expiry ${fmt(c.end_date)} → ${fmt(p.endISO)}${p.notes ? " · " + p.notes : ""}`.slice(-1000) };
      if (p.startISO) patch.start_date = p.startISO; else if (c.end_date !== p.endISO) patch.start_date = yearBefore(p.endISO);
      if (p.amountN != null) patch.amount = p.amountN;
      if (p.qtyN && p.qtyN > 0) patch.qty = p.qtyN;
      const { data, error } = await sb.from("renewals").update(patch).eq("id", c.id).select("id");
      if (error || !data?.length) { failed++; continue; }
      before.push({ id: c.id, start_date: c.start_date, end_date: c.end_date, amount: c.amount, qty: c.qty, status: c.status, notes: c.notes });
    }
    closeModal(); done?.();
    const undo = async () => {
      if (added.length) await sb.from("renewals").delete().in("id", added);
      for (const b of before) { const { id, ...rest } = b; await sb.from("renewals").update({ ...rest, reminder_stage: 999 }).eq("id", id); }
      toast(L("↩️ Upload wapas le liya", "↩️ Upload undone")); done?.();
    };
    toastAction(L(`✔ ${added.length} naye renewal, ${before.length} update${failed ? ` · ${failed} update nahi hue (permission)` : ""}`, `✔ ${added.length} new renewals, ${before.length} updated${failed ? ` · ${failed} not updated (permission)` : ""}`),
      L("Undo", "Undo"), () => undo().catch(fail), 20000);
  });
}
