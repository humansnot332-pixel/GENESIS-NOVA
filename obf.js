// =====================================================================
//  OBF — Order Booking Form
//  Made by itself when a customer accepts a quotation (or with one click),
//  already filled from the quotation, the customer record and their payment
//  history. The salesperson adds PO + costs and sends it; the Director checks
//  it on the phone and approves → the order is created and billing can start.
// =====================================================================
import { sb, S, h, inr, ic, toast, fail, modal, closeModal, busy, isMgr, isAdmin, userName, dOnly, ago, confirmBox } from "./core.js";
import { L } from "./i18n.js";
import { invoiceForm } from "./biz.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const r2 = (n) => Math.round((+n + Number.EPSILON) * 100) / 100;
const num = (n) => Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const dmy = (s) => { if (!s) return ""; const [y, m, d] = String(s).slice(0, 10).split("-"); return `${d}.${m}.${y}`; };
const CATS = ["H/W", "S/W", "AMC", "Networking / Security", "Services", "Mixed"];
const ST = {
  draft: [L("Draft", "Draft"), ""], pending: [L("Director ke paas", "With the Director"), "warn"],
  approved: ["✅ Approved", "good"], rejected: [L("↩️ Wapas aaya", "↩️ Sent back"), "bad"],
};
const badge = (s) => `<span class="badge ${ST[s]?.[1] || ""}">${h(ST[s]?.[0] || s)}</span>`;
const pctOf = (sub, contribution) => (+sub > 0 && contribution != null ? (contribution * 100) / sub : null);
const mClass = (p) => (p == null ? "" : p < 5 ? "bad" : p < 10 ? "warn" : "good");
export const obfUrl = (id) => new URL("#/obf/" + id, location.href.split("#")[0]).href;

let APPROVER = null;
async function amApprover() {
  if (APPROVER === null) { const { data } = await sb.rpc("is_obf_approver"); APPROVER = !!data; }
  return APPROVER;
}

// same maths as the server (obf_totals): line → paise, GST per rate → paise, grand total → rupee
function calc(o) {
  const base = {}; let sub = 0, cost = 0;
  (o.items || []).forEach((it) => {
    const a = r2((+it.qty || 0) * (+it.rate || 0)); sub += a; cost += r2((+it.qty || 0) * (+it.cost || 0));
    base[+it.tax || 0] = (base[+it.tax || 0] || 0) + a;
  });
  let tax = 0; Object.keys(base).forEach((k) => { if (+k) tax += r2((base[k] * +k) / 100); });
  sub = r2(sub); tax = r2(tax); cost = r2(cost);
  return { sub, tax, cost, grand: Math.round(sub + tax + (+o.extra_charges || 0)), contribution: r2(sub - cost) };
}

// ---------------------------------------------------------------- list page
export async function viewObf(el) {
  const ap = await amApprover();
  const f = el.dataset.f || (ap ? "pending" : "mine");
  let qy = sb.from("obfs").select("id, obf_no, status, obf_date, customer, grand_total, subtotal, contribution, owner_id, submitted_at, decided_at, category, prev_outstanding")
    .order("created_at", { ascending: false }).limit(300);
  if (f === "pending") qy = qy.eq("status", "pending");
  else if (f === "draft") qy = qy.in("status", ["draft", "rejected"]);
  else if (f === "approved") qy = qy.eq("status", "approved");
  else if (f === "mine") qy = qy.eq("owner_id", S.me.id);
  const { data, error } = await qy; if (error) throw error;
  const tabs = [["pending", ap ? L("⏳ Meri approval chahiye", "⏳ Waiting for my approval") : L("⏳ Director ke paas", "⏳ With the Director")],
    ["draft", L("Draft / wapas aaye", "Drafts / sent back")], ["approved", "✅ Approved"], ["mine", L("Mere", "Mine")], ["all", L("Sab", "All")]];
  el.innerHTML = `<div class="toolbar"><div class="chips">${tabs.map(([k, l]) => `<button class="chip ${f === k ? "on" : ""}" data-of="${k}">${h(l)}</button>`).join("")}</div>
    <span class="sp" style="flex:1"></span><span class="mu" style="font-size:12.5px">📋 ${L("Customer quotation accept kare → OBF apne aap ban jaata hai", "A customer accepts a quotation → the OBF is made by itself")}</span></div>
  <div class="card"><div class="tbl-wrap">${!data.length ? `<div class="empty"><b>${L("Yahan koi OBF nahi", "No OBFs here")}</b>${L("Quotation kholo → “📋 OBF” dabao, ya customer online link se accept kare.", "Open a quotation → press “📋 OBF”, or let the customer accept on the online link.")}</div>`
    : `<table class="tbl"><thead><tr><th>OBF</th><th>Customer</th><th>Status</th><th class="num">Grand total</th><th class="num">Contribution</th><th>M.E.</th><th>${L("Kab", "When")}</th></tr></thead><tbody>
    ${data.map((o) => { const p = pctOf(o.subtotal, o.contribution); return `<tr data-obf="${o.id}"><td class="mono">${h(o.obf_no || "—")}</td>
      <td class="co">${h(o.customer?.name || "")}<div class="sub">${h(o.category || "")}${+o.prev_outstanding > 0 ? ` · <span style="color:var(--bad)">${L("baaki", "due")} ${inr(o.prev_outstanding)}</span>` : ""}</div></td>
      <td>${badge(o.status)}</td><td class="num">${inr(o.grand_total)}</td>
      <td class="num">${o.contribution != null ? `${inr(o.contribution)} <span class="badge ${mClass(p)}">${p == null ? "" : p.toFixed(1) + "%"}</span>` : "—"}</td>
      <td>${h(userName(o.owner_id))}</td><td class="sub">${h(ago(o.decided_at || o.submitted_at || o.obf_date))}</td></tr>`; }).join("")}</tbody></table>`}</div></div>`;
  $$("[data-of]", el).forEach((b) => b.onclick = () => { el.dataset.f = b.dataset.of; viewObf(el); });
  $$("[data-obf]", el).forEach((r) => r.onclick = () => openObf(+r.dataset.obf, () => viewObf(el)));
}

// ---------------------------------------------------------------- one OBF: fill / send / approve
export async function openObf(id, done) {
  const [{ data: o0, error }, ap] = await Promise.all([sb.from("obfs").select("*").eq("id", id).single(), amApprover()]);
  if (error) return fail(error);
  const o = structuredClone(o0); o.customer ||= {}; o.customer.contact ||= {}; o.items ||= [];
  const mine = o.owner_id === S.me.id || isMgr();
  const edit = mine && ["draft", "rejected"].includes(o.status);
  const decide = ap && o.status === "pending";
  const c0 = o.customer, ct = c0.contact;
  const dis = edit ? "" : " disabled";
  const inp = (path, val, attrs = "") => `<input class="input" data-o="${path}" value="${h(val ?? "")}"${dis} ${attrs}>`;
  const k = calc(o), p0 = pctOf(k.sub, k.contribution);
  const head = decide ? `<div class="obf-dec">
      <div class="obf-big"><div><span class="mu">Grand total</span><b>${inr(o.grand_total)}</b></div>
        <div><span class="mu">Contribution</span><b class="m-${mClass(pctOf(o.subtotal, o.contribution))}">${inr(o.contribution)} · ${(pctOf(o.subtotal, o.contribution) ?? 0).toFixed(1)}%</b></div>
        <div><span class="mu">${L("Purana baaki", "Previous O/S")}</span><b${+o.prev_outstanding > 0 ? ' class="m-bad"' : ""}>${inr(o.prev_outstanding || 0)}</b></div></div>
      <div class="obf-facts">💳 ${h(o.payment_history || "—")}${o.payment_note ? `<br>📝 ${h(o.payment_note)}` : ""}<br>🧾 ${L("Payment", "Payment")}: <b>${h(o.payment_terms || "—")}</b> · PO: <b>${h(o.po_no || L("abhi nahi aaya", "not received yet"))}</b>${o.po_date ? " · " + h(dmy(o.po_date)) : ""} · M.E.: <b>${h(userName(o.owner_id))}</b>${o.remarks ? `<br>💬 “${h(o.remarks)}”` : ""}</div>
      <textarea class="input" id="obNote" rows="2" maxlength="1000" placeholder="${h(L("Note (wapas bhejne par zaroori) — jaise: margin kam hai, pehle purana payment lo", "Note (needed to send back) — e.g. margin too low, collect old dues first"))}"></textarea>
      <div class="row" style="margin-top:8px"><button class="btn primary" id="obOk">✅ ${L("Approve karo", "Approve")}</button><button class="btn danger" id="obNo">↩️ ${L("Wapas bhejo", "Send back")}</button></div></div>` : "";
  const banner = o.status === "rejected" ? `<div class="obf-ban bad">↩️ ${L("Director ne wapas bheja", "Sent back by the Director")} (${h(userName(o.decided_by))}, ${h(ago(o.decided_at))}): <b>${h(o.decision_note || "")}</b> — ${L("theek karke dobara bhejo", "fix it and send it again")}</div>`
    : o.status === "approved" ? `<div class="obf-ban good">✅ ${L("Approved by", "Approved by")} <b>${h(userName(o.decided_by))}</b> · ${h(dOnly(o.decided_at))}${o.decision_note ? ` · “${h(o.decision_note)}”` : ""}${o.vendor_po ? ` · 📦 <a href="#/purchase">${h(o.vendor_po)}</a>` : ""}${o.order_id ? ` <button class="btn sm primary" id="obInv">🧾 ${L("Invoice banao", "Create invoice")}</button>` : ""}</div>`
    : o.status === "pending" && !decide ? `<div class="obf-ban warn">⏳ ${L("Director ke paas approval ke liye — bheja", "With the Director for approval — sent")} ${h(ago(o.submitted_at))}</div>` : "";
  const m = modal({
    title: `OBF ${o.obf_no || L("(draft)", "(draft)")} · ${c0.name || ""}`, wide: true,
    body: `${banner}${head}
    <div class="obf-grid">
      <div><label class="f">Date</label><input class="input" type="date" data-o="obf_date" value="${h(o.obf_date || "")}"${dis}></div>
      <div><label class="f">Category</label><select class="input" data-o="category"${dis}><option value=""></option>${CATS.map((x) => `<option${x === o.category ? " selected" : ""}>${h(x)}</option>`).join("")}</select></div>
      <div><label class="f">P.O. Ref</label>${inp("po_no", o.po_no, 'maxlength="80" placeholder="Customer PO no."')}</div>
      <div><label class="f">P.O. Date</label><input class="input" type="date" data-o="po_date" value="${h(o.po_date || "")}"${dis}></div>
      <label class="obf-chk"><input type="checkbox" data-o="customer_po_ok"${o.customer_po_ok ? " checked" : ""}${dis}> ${L("Customer PO mil gaya", "Customer PO received")}</label></div>
    <div class="obf-cust sec">
      <div><label class="f">${L("Customer ka naam", "Customer name")}</label>${inp("customer.name", c0.name, 'maxlength="200"')}
        <label class="f">Address</label><textarea class="input" data-o="customer.address" rows="2" maxlength="400"${dis}>${h(c0.address || "")}</textarea>
        <label class="f">GST Number</label>${inp("customer.gstin", c0.gstin, 'maxlength="15"')}</div>
      <div><label class="f">End user</label>${inp("customer.end_user", c0.end_user, 'maxlength="120"')}
        <label class="f">Delivery address <span class="lbl-hint">— ${L("khali = upar wala", "empty = same")}</span></label><textarea class="input" data-o="customer.delivery_address" rows="2" maxlength="400"${dis}>${h(c0.delivery_address || "")}</textarea>
        <div class="obf-2"><div><label class="f">Contact person</label>${inp("customer.contact.name", ct.name, 'maxlength="120"')}</div><div><label class="f">E-mail</label>${inp("customer.contact.email", ct.email, 'maxlength="200"')}</div>
        <div><label class="f">Tel.</label>${inp("customer.contact.tel", ct.tel, 'maxlength="40"')}</div><div><label class="f">Mobile</label>${inp("customer.contact.mobile", ct.mobile, 'maxlength="40"')}</div></div></div></div>
    <div class="sec"><div class="obl-h"><b>${L("Order ki lines", "Order lines")}</b><span class="mu">— ${L("har line ki cost / unit bharo, contribution apne aap ban jaata hai", "fill each line's cost / unit; the contribution works itself out")}</span></div><div id="obLines"></div>
      ${edit && isMgr() ? `<button type="button" class="btn sm ghost" id="obSug" style="margin-top:6px">💡 ${L("Vendor price list se cost bharo", "Fill costs from the vendor price list")}</button>` : ""}</div>
    <div class="obf-foot sec">
      <div class="obf-box"><b>${L("Customer details", "Customer details")}</b>
        <label class="f">Vendor PO</label>${inp("vendor_po", o.vendor_po, 'maxlength="200" placeholder="Hamara PO vendor ko (baad mein bhi)"')}
        <div class="obf-auto"><span>${L("Purana baaki (Previous O/S)", "Previous O/S")}</span><b${+o.prev_outstanding > 0 ? ' class="m-bad"' : ""}>${inr(o.prev_outstanding || 0)}</b></div>
        <div class="obf-auto"><span>${L("Payment history (CRM se)", "Payment history (from the CRM)")}</span><b>${h(o.payment_history || "—")}</b></div>
        <label class="f">${L("Payment note", "Payment note")}</label><textarea class="input" data-o="payment_note" rows="2" maxlength="1000"${dis}>${h(o.payment_note || "")}</textarea>
        <label class="f">Payment terms</label>${inp("payment_terms", o.payment_terms, 'maxlength="200" list="payDL2"')}
        <datalist id="payDL2">${["100% advance", "50% advance, 50% on delivery", "Against delivery", "Within 15 days", "Within 30 days", "Within 45 days"].map((x) => `<option value="${h(x)}"></option>`).join("")}</datalist></div>
      <div class="obf-box"><b>Totals</b><dl class="kv" id="obTot"></dl>
        <div class="obf-2"><div><label class="f">${L("Additional charges", "Additional charges")} ₹</label><input class="input" type="number" min="0" data-o="extra_charges" value="${h(+o.extra_charges || "")}"${dis}></div>
          <div><label class="f">Commission ₹</label><input class="input" type="number" min="0" data-o="commission" value="${h(o.commission ?? "")}"${dis}></div></div>
        <label class="f">${L("Commission kisko", "Commission to")}</label>${inp("commission_to", o.commission_to, 'maxlength="120"')}
        <label class="f">${L("Director ke liye note", "Note for the Director")}</label><textarea class="input" data-o="remarks" rows="2" maxlength="2000"${dis}>${h(o.remarks || "")}</textarea>
        <p class="mu" style="font-size:12px;margin:8px 0 0">M.E.: <b>${h(userName(o.owner_id))}</b> · ${L("Quotation", "Quotation")} ${o.quotation_id ? `<a href="#/quotes/${o.quotation_id}">${L("kholo", "open")}</a>` : "—"}</p></div></div>`,
    foot: `${isAdmin() ? `<button class="btn danger" id="obDel" title="${h(L("Admin: ye OBF hamesha ke liye hatao", "Admin: delete this OBF for good"))}">${ic("trash")}</button>` : ""}<button class="btn" id="obPr">${ic("print")} PDF</button>${o.status === "pending" && !decide ? `<button class="btn" id="obWa">${ic("wa")} ${L("Director ko WhatsApp", "WhatsApp the Director")}</button>` : ""}
      <span style="flex:1"></span><button class="btn" data-close>${L("Band karo", "Close")}</button>
      ${edit ? `<button class="btn" id="obSave">${L("Draft save", "Save draft")}</button><button class="btn primary" id="obSend">✈ ${L("Director ko bhejo", "Send to the Director")}</button>` : ""}`,
  });

  m.classList.add("obf-modal");
  // ---- lines
  const cnHtml = (tot, cn) => cn == null ? `<span class="mu">${L("Cost bharo →", "Fill the cost →")}</span>` : `Contribution <b class="m-${mClass(pctOf(tot, cn))}">${num(cn)} · ${(pctOf(tot, cn) ?? 0).toFixed(1)}%</b>`;
  const lineHtml = (it, i) => {
    const tot = r2((+it.qty || 0) * (+it.rate || 0)), g = r2((tot * (+it.tax || 0)) / 100);
    const noCost = it.cost === null || it.cost === "" || it.cost === undefined, cn = noCost ? null : r2(tot - (+it.qty || 0) * +it.cost);
    return `<div class="obl"><div class="obl-n">${i + 1}</div>
      <div><label class="f">Description of order</label><input class="input" data-i="${i}" data-f="desc" value="${h(it.desc || "")}" maxlength="400"${dis}>
        <textarea class="input obf-det" data-i="${i}" data-f="details" rows="${Math.max(3, Math.min(8, String(it.details || "").split("\n").length))}" maxlength="1000" placeholder="${h(L("Configuration / specs", "Configuration / specs"))}"${dis}>${h(it.details || "")}</textarea></div>
      <div><div class="obl-3"><div><label class="f">Rate ₹</label><input class="input" type="number" min="0" data-i="${i}" data-f="rate" value="${h(it.rate)}"${dis}></div>
          <div><label class="f">Qty</label><input class="input" type="number" min="0" data-i="${i}" data-f="qty" value="${h(it.qty)}"${dis}></div>
          <div><label class="f">HSN</label><input class="input" data-i="${i}" data-f="hsn" value="${h(it.hsn || "")}" maxlength="12"${dis}></div></div>
        <div class="obl-calc">Total <b class="obl-tot">${num(tot)}</b> · GST <span class="obl-gst">${num(g)} (${h(it.tax)}%)</span></div></div>
      <div><div class="obl-2"><div><label class="f">${L("Cost / unit", "Cost / unit")} ₹ *</label><input class="input${edit && noCost ? " need" : ""}" type="number" min="0" data-i="${i}" data-f="cost" value="${h(it.cost ?? "")}"${dis}></div>
          <div><label class="f">Vendor</label><input class="input" data-i="${i}" data-f="vendor" value="${h(it.vendor || "")}" maxlength="120"${dis}></div></div>
        <label class="f">Remarks</label><textarea class="input" data-i="${i}" data-f="remarks" rows="2" maxlength="300" placeholder="${h(L("jaise: cpu 16467 + mbd 6150 + ram 15750…", "e.g. cpu 16467 + mbd 6150 + ram 15750…"))}"${dis}>${h(it.remarks || "")}</textarea>
        <div class="obl-cn">${cnHtml(tot, cn)}</div></div></div>`;
  };
  const drawTot = () => {
    const c = calc(o), p = pctOf(c.sub, c.contribution);
    $("#obTot", m).innerHTML = `<dt>${L("Total (GST ke bina)", "Total without GST")}</dt><dd>${inr(c.sub)}</dd><dt>GST</dt><dd>${inr(c.tax)}</dd>
      ${+o.extra_charges ? `<dt>${L("Additional charges", "Additional charges")}</dt><dd>${inr(o.extra_charges)}</dd>` : ""}<dt><b>Grand total</b></dt><dd><b style="font-size:17px">${inr(c.grand)}</b></dd>
      <dt>${L("Kul cost", "Total cost")}</dt><dd>${inr(c.cost)}</dd><dt><b>Contribution</b></dt><dd><b class="m-${mClass(p)}">${inr(c.contribution)} · ${(p ?? 0).toFixed(1)}%</b></dd>
      ${+o.commission ? `<dt>${L("Commission ke baad", "After commission")}</dt><dd>${inr(c.contribution - +o.commission)}</dd>` : ""}`;
  };
  const drawLines = () => { $("#obLines", m).innerHTML = o.items.map(lineHtml).join(""); drawTot(); };
  drawLines();

  // ---- edits → the object
  const setPath = (path, v) => { const ks = path.split("."); let t = o; ks.slice(0, -1).forEach((x) => { t = t[x] ||= {}; }); t[ks.at(-1)] = v; };
  m.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.o) { const v = t.type === "checkbox" ? t.checked : t.type === "number" ? (t.value === "" ? null : +t.value) : t.value; setPath(t.dataset.o, v); if (["extra_charges", "commission"].includes(t.dataset.o)) drawTot(); }
    if (t.dataset.f) {
      const it = o.items[+t.dataset.i]; it[t.dataset.f] = ["rate", "qty", "cost"].includes(t.dataset.f) ? (t.value === "" ? null : +t.value) : t.value;
      if (["rate", "qty", "cost"].includes(t.dataset.f)) {
        const row = t.closest(".obl"), tot = r2((+it.qty || 0) * (+it.rate || 0)), cn = it.cost == null ? null : r2(tot - (+it.qty || 0) * +it.cost);
        row.querySelector(".obl-tot").textContent = num(tot); row.querySelector(".obl-gst").textContent = `${num(r2((tot * (+it.tax || 0)) / 100))} (${it.tax}%)`;
        row.querySelector(".obl-cn").innerHTML = cnHtml(tot, cn);
        if (t.dataset.f === "cost") t.classList.toggle("need", it.cost == null);
        drawTot();
      }
    }
  });
  m.addEventListener("change", (e) => { const t = e.target; if (t.dataset.o && (t.tagName === "SELECT" || t.type === "checkbox" || t.type === "date")) setPath(t.dataset.o, t.type === "checkbox" ? t.checked : t.value || null); });

  // ---- managers: costs from the vendor price list (cheapest valid price per product)
  $("#obSug", m)?.addEventListener("click", (e) => busy(e.target, async () => {
    const { data: prods } = await sb.from("products").select("id, brand, name, model");
    const lab = (p) => [p.brand, p.name, p.model].filter(Boolean).join(" ").toLowerCase();
    const ids = new Map((prods || []).map((p) => [lab(p), p.id]));
    const want = o.items.map((it) => ids.get(String(it.desc || "").trim().toLowerCase())).filter(Boolean);
    if (!want.length) return toast(L("In items ke liye price list mein product nahi mila", "No matching products in the price list"), true);
    const { data: vp } = await sb.from("vendor_prices").select("product_id, vendor, price, valid_till").in("product_id", want);
    let n = 0;
    o.items.forEach((it) => {
      const pid = ids.get(String(it.desc || "").trim().toLowerCase()); if (!pid || (it.cost != null && it.cost !== "")) return;
      const best = (vp || []).filter((v) => v.product_id === pid && (!v.valid_till || v.valid_till >= new Date().toISOString().slice(0, 10))).sort((a, b) => a.price - b.price)[0];
      if (best) { it.cost = +best.price; it.vendor ||= best.vendor; n++; }
    });
    drawLines(); toast(n ? L(`✔ ${n} items ki cost bhar di`, `✔ Filled the cost of ${n} items`) : L("Vendor price nahi mila", "No vendor price found"), !n);
  }));

  // ---- save / send
  const row = () => { const c = calc(o); return { obf_date: o.obf_date || null, category: o.category || null, po_no: o.po_no || null, po_date: o.po_date || null, customer_po_ok: !!o.customer_po_ok,
    customer: o.customer, items: o.items, extra_charges: +o.extra_charges || 0, subtotal: c.sub, tax_total: c.tax, grand_total: c.grand,
    commission: o.commission == null || o.commission === "" ? null : +o.commission, commission_to: o.commission_to || null,
    payment_terms: o.payment_terms || null, vendor_po: o.vendor_po || null, payment_note: o.payment_note || null, remarks: o.remarks || null }; };
  const save = async () => { const { error: e } = await sb.from("obfs").update(row()).eq("id", o.id); if (e) throw e; };
  $("#obSave", m)?.addEventListener("click", (e) => busy(e.target, async () => { await save(); toast(L("✔ Draft save ho gaya", "✔ Draft saved")); done?.(); }));
  $("#obSend", m)?.addEventListener("click", (e) => busy(e.target, async () => {
    const miss = o.items.findIndex((it) => it.cost == null || it.cost === "");
    if (miss >= 0) { $(`[data-i="${miss}"][data-f="cost"]`, m)?.focus(); return toast(L("Har item ki cost bharo (service ho toh 0 likho) — Director ko contribution dikhana hai", "Fill the cost of every item (0 for services) — the Director needs the contribution"), true); }
    if (!o.items.length) return toast(L("OBF mein koi item nahi", "No items in the OBF"), true);
    await save();
    const { data: r, error: e2 } = await sb.rpc("obf_submit", { p_id: o.id }); if (e2) throw e2;
    toast(L(`✈ OBF ${r.obf_no} Director ko chala gaya — approve hote hi aapko pata chalega`, `✈ OBF ${r.obf_no} sent to the Director — you'll be told when it's approved`));
    done?.(); openObf(o.id, done);
  }));

  // ---- Director
  const decideNow = (ok) => (e) => busy(e.target, async () => {
    const note = $("#obNote", m).value.trim();
    if (!ok && !note) { $("#obNote", m).focus(); return toast(L("Wapas bhejne ki wajah likho", "Write why you are sending it back"), true); }
    const { data: r, error: e2 } = await sb.rpc("obf_decide", { p_id: o.id, p_approve: ok, p_note: note || null }); if (e2) throw e2;
    toast(ok ? L(`✅ Approve — order ${r.order_no} ban gaya, team ko bata diya`, `✅ Approved — order ${r.order_no} created, the team is told`)
      + (ok && r.renewals ? L(` · 🔁 ${r.renewals} renewal apne aap set: ${r.renewal_names}`, ` · 🔁 ${r.renewals} renewal(s) set by themselves: ${r.renewal_names}`) : "")
      : L("↩️ Wapas bhej diya", "↩️ Sent back"), false, ok && r.renewals ? 9000 : 0);
    done?.(); openObf(o.id, done);
  });
  $("#obOk", m)?.addEventListener("click", decideNow(true));
  $("#obNo", m)?.addEventListener("click", decideNow(false));

  // ---- after approval: billing
  $("#obInv", m)?.addEventListener("click", () => { closeModal(); invoiceForm({ order_id: o.order_id, lead_id: o.lead_id, amount: o.grand_total, quotation_id: o.quotation_id }, done); });
  $("#obPr", m).addEventListener("click", () => printObf(o));
  $("#obDel", m)?.addEventListener("click", async () => {
    if (!(await confirmBox(L(`OBF ${o.obf_no || "(draft)"} permanently delete karna hai? ${o.order_id ? "Iska order aur vendor PO rahenge (unhe alag se delete kar sakte ho). " : ""}Ye wapas nahi aayega.`,
      `Delete OBF ${o.obf_no || "(draft)"} permanently? ${o.order_id ? "Its order and vendor POs stay (delete them separately if needed). " : ""}This cannot be undone.`), L("Haan, delete karo", "Yes, delete")))) return;
    const { data, error } = await sb.from("obfs").delete().eq("id", o.id).select("id");
    if (error) return fail(error);
    if (!data?.length) return toast(L("Delete nahi hua — sirf Admin delete kar sakta hai", "Not deleted — only an Admin can delete it"), true);
    closeModal(); toast(L(`🗑 OBF ${o.obf_no || ""} delete ho gaya`, `🗑 OBF ${o.obf_no || ""} deleted`)); done?.();
  });
  $("#obWa", m)?.addEventListener("click", () => {
    const c = calc(o), p = pctOf(c.sub, c.contribution);
    const t = `🙏 OBF ${o.obf_no} approval ke liye\n${o.customer?.name || ""}\nGrand total: ${inr(o.grand_total)}\nContribution: ${inr(c.contribution)} (${(p ?? 0).toFixed(1)}%)\nPayment: ${o.payment_terms || "—"}${+o.prev_outstanding > 0 ? `\nPurana baaki: ${inr(o.prev_outstanding)}` : ""}\n👉 ${obfUrl(o.id)}`;
    window.open("https://wa.me/?text=" + encodeURIComponent(t), "_blank", "noopener");
  });
  return m;
}

// ---------------------------------------------------------------- print / PDF — the GENINFO Order Booking Form
export function printObf(o) {
  const c = calc(o), cu = o.customer || {}, ct = cu.contact || {}, title = S.settings.obf?.title || "GENINFO - Order Booking Form";
  const vendors = [...new Set((o.items || []).map((it) => it.vendor).filter(Boolean))].join(", ");
  const rows = [];
  (o.items || []).forEach((it, i) => {
    const tot = r2((+it.qty || 0) * (+it.rate || 0)), g = r2((tot * (+it.tax || 0)) / 100);
    const rem = [it.vendor, it.cost != null && it.cost !== "" ? `cost ${num(it.cost)}${+it.qty > 1 ? ` × ${num(it.qty)} = ${num(r2(+it.cost * +it.qty))}` : ""}` : "", ...String(it.remarks || "").split(/\n|\s\+\s/)].filter((x) => String(x).trim());
    const det = String(it.details || "").split(/\n/).map((x) => x.trim()).filter(Boolean);
    const n = Math.max(1, det.length + 1, rem.length);
    for (let j = 0; j < n; j++) {
      rows.push(j === 0 ? `<tr><td class="c">${i + 1}</td><td><b>${h(it.desc || "")}</b></td><td class="r">${num(it.rate)}</td><td class="c">${num(it.qty)}</td><td class="r">${num(tot)}</td><td class="r">${num(g)} <small>(${h(it.tax)}%)</small></td><td>${h(it.hsn || "")}</td><td>${h(rem[0] || "")}</td></tr>`
        : `<tr><td></td><td>${h(det[j - 1] || "")}</td><td></td><td></td><td></td><td></td><td></td><td>${h(rem[j] || "")}</td></tr>`);
    }
  });
  while (rows.length < 14) rows.push(`<tr class="e"><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`);
  let pr = document.getElementById("printRoot");
  if (!pr) { pr = document.createElement("div"); pr.id = "printRoot"; pr.className = "print-root"; document.body.append(pr); }
  pr.innerHTML = `<div class="obfdoc">
    <div class="ob-h"><span></span><b class="ob-t">${h(title)}</b><b class="ob-no">${h(o.obf_no || "DRAFT")}</b></div>
    <table class="ob-top"><tr><td class="ob-l">
        <div class="ob-k">CUSTOMER'S NAME ADDRESS:</div><div class="ob-v"><b>${h(cu.name || "")}</b></div>${String(cu.address || "").split(/\n|,\s(?=[^,]{12,})/).map((x) => `<div class="ob-v">${h(x)}</div>`).join("")}
        <div class="ob-f"><span class="ob-k">GST Number :</span><span class="ob-v">${h(cu.gstin || "")}</span></div>
        <div class="ob-f"><span class="ob-k">End User Name:</span><span class="ob-v">${h(cu.end_user || "")}</span></div>
        <div class="ob-f"><span class="ob-k">DELIVERY ADDRESS :</span><span class="ob-v">${h(cu.delivery_address || L("Same as above", "Same as above"))}</span></div></td>
      <td class="ob-r">
        <div class="ob-f"><span class="ob-k">Date :</span><span class="ob-v">${h(dmy(o.obf_date))}</span></div>
        <div class="ob-f"><span class="ob-k">P.O Ref:</span><span class="ob-v">${h(o.po_no || "")}</span></div>
        <div class="ob-f"><span class="ob-k">P.O. Date:</span><span class="ob-v">${h(dmy(o.po_date))}</span></div>
        <div class="ob-f"><span class="ob-k">Category:</span><span class="ob-v">${h(o.category || "")}</span></div>
        <div class="ob-k" style="margin-top:12px">CONTACT PERSON :</div>
        <div class="ob-f"><span class="ob-k">1. Name:</span><span class="ob-v">${h(ct.name || "")}</span></div>
        <div class="ob-f"><span class="ob-k">E-Mail ID :</span><span class="ob-v">${h(ct.email || "")}</span></div>
        <div class="ob-f"><span class="ob-k">Tel.#:</span><span class="ob-v">${h(ct.tel || "")}</span><span class="ob-k">Mobile#:</span><span class="ob-v">${h(ct.mobile || "")}</span></div></td></tr></table>
    <table class="ob-it"><thead><tr><th>SR NO</th><th>Description of Order</th><th>Rate</th><th>Qty.</th><th>Total</th><th>GST</th><th>HSN NO</th><th>Remarks</th></tr></thead><tbody>${rows.join("")}</tbody>
      <tfoot><tr><td colspan="4"></td><td class="r"><b>${num(c.sub)}</b></td><td colspan="3"><b>TOTAL without GST</b></td></tr>
      <tr><td colspan="4"></td><td class="r"><b>${num(c.tax)}</b></td><td colspan="3"><b>GST</b></td></tr></tfoot></table>
    <table class="ob-bot"><tr><td class="ob-l">
        <div class="ob-box"><div class="ob-bh">CUSTOMER DETAILS:</div>
          <div><b>VENDOR PO :</b> ${h(o.vendor_po || "")}</div><div><b>CUSTOMER PO :</b> ${o.customer_po_ok ? "Received" : "Not received"}${o.po_no ? " — " + h(o.po_no) : ""}</div>
          <div><b>PREVIOUS O/S :</b> ${+o.prev_outstanding > 0 ? num(o.prev_outstanding) + "/-" : "Nil"}</div></div>
        <div class="ob-box"><div class="ob-bh">PAYMENT DETAILS:</div><div>${h(o.payment_history || "")}</div>${o.payment_note ? `<div>${h(o.payment_note)}</div>` : ""}</div>
        <div class="ob-f" style="margin-top:10px"><span class="ob-k">Payment Terms :</span><span class="ob-v">${h(o.payment_terms || "")}</span></div></td>
      <td class="ob-r">
        <div class="ob-f"><span class="ob-k">Additional Charges(Rs) :</span><span class="ob-v">${+o.extra_charges ? num(o.extra_charges) : ""}</span></div>
        <div class="ob-f"><span class="ob-k">Grand Total (Rs) :</span><span class="ob-v"><b>${num(c.grand)}</b></span></div>
        <div class="ob-f"><span class="ob-k">Contribution :</span><span class="ob-v">${num(c.contribution)}/- (${(pctOf(c.sub, c.contribution) ?? 0).toFixed(1)}%)</span></div>
        <div class="ob-f"><span class="ob-k">Commission :</span><span class="ob-v">${o.commission ? num(o.commission) + (o.commission_to ? " — " + h(o.commission_to) : "") : ""}</span></div>
        <div class="ob-f"><span class="ob-k">M. E. :</span><span class="ob-v">${h(userName(o.owner_id))}</span></div>
        <div class="ob-f"><span class="ob-k">Approved by :</span><span class="ob-v">${o.status === "approved" ? `<b>${h(userName(o.decided_by))}</b> · ${h(dmy(String(o.decided_at || "").slice(0, 10)))} ✔` : ""}</span></div>
        <div class="ob-f" style="margin-top:10px"><span class="ob-k">Vendor Name :</span><span class="ob-v">${h(vendors)}</span></div></td></tr></table>
    ${o.remarks ? `<p class="ob-rem"><b>Note:</b> ${h(o.remarks)}</p>` : ""}</div>`;
  window.print();
}
