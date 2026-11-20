// Public, read-only quotation page for customers (no login).
// The link is quote.html#<token>; the token never leaves the browser in URLs/referrers.
import { CONFIG } from "./config.js";
import { renderRich, textToHtml } from "./rte.js";

const app = document.getElementById("app");
const token = decodeURIComponent(location.hash.slice(1).split("&")[0] || "");
const preview = /[#&]p=1\b/.test(location.hash);
const h = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const r2 = (n) => Math.round((+n + Number.EPSILON) * 100) / 100;
const dt = (d) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "";

async function call(action = "view", note = null, options = null) {
  const res = await fetch(CONFIG.SUPABASE_URL + "/rest/v1/rpc/quote_public", {
    method: "POST",
    headers: { apikey: CONFIG.SUPABASE_ANON_KEY, Authorization: "Bearer " + CONFIG.SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ p_token: token, p_action: action, p_note: note, p_preview: preview, ...(options ? { p_options: options } : {}) }),
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

// totals of a set of items, exactly like the CRM (line → paise; GST per rate → paise)
function calc(q, items) {
  const base = {}; let sub = 0;
  items.forEach((it) => { const t = r2((+it.qty || 0) * (+it.price || 0)); sub += t; base[+it.tax || 0] = (base[+it.tax || 0] || 0) + t; });
  const a = String(q.company.state || "").trim().toLowerCase(), b = String(q.to.state || "").trim().toLowerCase();
  const inter = !!(a && b && a !== b), lines = []; let tax = 0;
  Object.keys(base).map(Number).sort((x, y) => x - y).forEach((rt) => {
    if (!rt) return; const t = r2(base[rt] * rt / 100); tax += t;
    if (inter) lines.push([`IGST ${rt}%`, t]); else { const c = r2(t / 2); lines.push([`CGST ${rt / 2}%`, c], [`SGST ${rt / 2}%`, r2(t - c)]); }
  });
  return { sub: r2(sub), tax: r2(tax), grand: r2(sub + tax), lines };
}
const rowHtml = (it, i) => `<td>${i + 1}</td><td><pre>${h(it.desc)}</pre></td><td>${h(it.hsn)}</td><td class="r">${h(it.qty)}</td><td class="r">${inr(it.price)}</td><td class="r">${h(it.tax)}%</td><td class="r">${inr(r2((+it.qty || 0) * (+it.price || 0)))}</td>`;

function respBox(q) {
  if (q.response === "accepted") return `<div class="note ok">✅ You accepted this quotation on ${h(dt(q.response_at))}${q.options_added ? ` (including ${q.options_added} optional item${q.options_added > 1 ? "s" : ""} you added)` : ""}. Our team will contact you shortly with the next steps. Thank you!</div>`;
  if (q.status === "lost") return `<div class="note w">This quotation is no longer active. Please contact us for an updated offer.</div>`;
  return `<div id="resp">${q.response === "changes" ? `<div class="note w">✏️ You requested changes on ${h(dt(q.response_at))}. We'll send a revised quotation soon.</div>` : ""}
    <div class="actions"><button class="pri" id="acc">✅ Accept quotation</button><button id="chg">✏️ Request changes</button><button id="pr">🖨 Print / Save PDF</button></div>
    <div id="chgBox" hidden><textarea id="chgNote" maxlength="1000" placeholder="Tell us what you would like changed (quantity, model, price, delivery…)"></textarea>
      <div class="actions"><button class="pri" id="chgSend">Send request</button></div></div></div>`;
}

function render(q) {
  const co = q.company || {}, to = q.to || {}, rep = q.rep || {};
  const all = (q.items || []).map((it, n) => ({ ...it, n }));             // n = position in the saved quotation
  const inc = all.filter((it) => !it.opt), opt = all.filter((it) => it.opt);
  const canPick = q.response !== "accepted" && q.status !== "lost";
  document.title = `Quotation ${q.quote_no} · ${co.name || ""}`;
  app.innerHTML = `<div class="card">
    <div class="hd"><div><h1>${h(co.name || "")}</h1><div class="mu">${h(co.address || "")}</div><div class="mu">${co.gstin ? "GSTIN: " + h(co.gstin) : ""}${co.pan ? " · PAN: " + h(co.pan) : ""}</div></div>
      <div class="r"><h2>QUOTATION</h2><div>No: <b>${h(q.quote_no)}</b></div><div class="mu">Date: ${h(dt(q.date))}</div></div></div>
    <div><b>To:</b> ${h(to.name || "")}${to.address ? "<br>" + h(to.address) : ""}${to.state ? ", " + h(to.state) : ""}${to.gstin ? "<br>GSTIN: " + h(to.gstin) : ""}${to.contact ? "<br>Kind Attn: " + h(to.contact) : ""}</div>
    <div class="tw"><table><thead><tr><th>#</th><th>Description</th><th>HSN/SAC</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">GST</th><th class="r">Amount</th></tr></thead><tbody>
      ${inc.map((it, i) => `<tr>${rowHtml(it, i)}</tr>`).join("")}
      <tr class="tot"><td colspan="6" class="r">Subtotal</td><td class="r">${inr(q.subtotal)}</td></tr>
      ${calc(q, inc).lines.map(([l, v]) => `<tr class="tot"><td colspan="6" class="r">${h(l)}</td><td class="r">${inr(v)}</td></tr>`).join("")}
      <tr class="grand"><td colspan="6" class="r">Grand Total</td><td class="r">${inr(q.grand_total)}</td></tr></tbody></table></div>
    ${opt.length ? `<div class="blk optbox"><b class="t">Optional items — not included in the total</b>
      ${canPick ? `<p class="mu hint" style="margin:0 0 4px">Tick any item you would like to add — the new total shows below. Accepting the quotation adds them to your order.</p>` : ""}
      <div class="tw" style="margin:6px 0"><table><thead><tr>${canPick ? "<th></th>" : ""}<th>#</th><th>Description</th><th>HSN/SAC</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">GST</th><th class="r">Amount</th></tr></thead><tbody>
      ${opt.map((it, i) => `<tr data-row="${it.n}">${canPick ? `<td><input type="checkbox" data-oi="${it.n}" aria-label="Add ${h(String(it.desc || "item").slice(0, 80))}"></td>` : ""}${rowHtml(it, i)}</tr>`).join("")}</tbody></table></div>
      <div class="optsum" id="optSum" hidden></div></div>` : ""}
    ${q.note ? `<div class="blk"><b class="t">Note</b><pre>${h(q.note)}</pre></div>` : ""}
    <div class="blk" id="qTerms" hidden><b class="t">Terms &amp; Conditions</b><div class="rich"></div></div>
    ${co.bank ? `<p class="mu"><b>Bank:</b> ${h(co.bank)} · A/c ${h(co.acno || "")} · ${h(co.branch || "")} · IFSC ${h(co.ifsc || "")}</p>` : ""}
    <p style="margin-top:18px">Your contact: <b>${h(rep.name || "")}</b>${rep.designation ? ", " + h(rep.designation) : ""}<br>
      <span class="mu">${rep.phone ? `📞 <a href="tel:${h(String(rep.phone).replace(/[^\d+]/g, ""))}">${h(rep.phone)}</a>` : ""} ${rep.email ? ` · ✉️ <a href="mailto:${h(rep.email)}">${h(rep.email)}</a>` : ""}</span></p>
    ${respBox(q)}
  </div>
  <div class="card annex" id="qAnnex" hidden><div class="hd"><h2>ANNEXURE</h2><div class="mu">Quotation No. ${h(q.quote_no)} · ${h(dt(q.date))}</div></div><div class="rich"></div></div>
  <p class="mu" style="text-align:center;margin-top:14px">${h(co.name || "")}${co.website ? " · " + h(co.website) : ""}</p>`;
  const $ = (id) => document.getElementById(id);
  const terms = q.terms_html || textToHtml(q.notes);
  if (terms) { renderRich($("qTerms").querySelector(".rich"), terms); $("qTerms").hidden = false; }
  if (q.annexure_html) { renderRich($("qAnnex").querySelector(".rich"), q.annexure_html); $("qAnnex").hidden = false; }
  $("pr")?.addEventListener("click", () => print());
  $("chg")?.addEventListener("click", () => { $("chgBox").hidden = false; $("chgNote").focus(); });
  // optional items the customer ticks → new total
  const picked = () => opt.filter((it) => document.querySelector(`[data-oi="${it.n}"]`)?.checked);
  const withPicked = () => calc(q, [...inc, ...picked()]);
  app.querySelectorAll("[data-oi]").forEach((cb) => cb.addEventListener("change", () => {
    cb.closest("tr").classList.toggle("on", cb.checked);
    const sel = picked(), box = $("optSum"), acc = $("acc");
    box.hidden = !sel.length;
    box.innerHTML = sel.length ? `New total with ${sel.length} optional item${sel.length > 1 ? "s" : ""}: <b>${inr(withPicked().grand)}</b> <span class="mu">(incl. GST)</span>` : "";
    if (acc) acc.textContent = sel.length ? `✅ Accept quotation — ${inr(withPicked().grand)}` : "✅ Accept quotation";
  }));
  const send = async (action, note, btn, options = null) => {
    btn.disabled = true;
    try {
      const r = await call(action, note, options);
      if (r.error === "slow_down") { alert("Please wait a minute before sending again."); btn.disabled = false; return; }
      if (r.error && r.error !== "already_accepted") throw new Error(r.error);
      render(r.error ? { ...q, response: "accepted" } : r);
    } catch { alert("Could not send — please check your internet and try again."); btn.disabled = false; }
  };
  $("acc")?.addEventListener("click", (e) => {
    const sel = picked();
    const msg = sel.length ? `Accept quotation ${q.quote_no} with ${sel.length} optional item${sel.length > 1 ? "s" : ""} — new total ${inr(withPicked().grand)}?` : `Accept quotation ${q.quote_no} for ${inr(q.grand_total)}?`;
    if (confirm(msg)) send("accepted", null, e.target, sel.length ? sel.map((it) => ({ i: it.n, d: String(it.desc || "") })) : null);
  });
  $("chgSend")?.addEventListener("click", (e) => {
    let n = $("chgNote").value.trim(); if (!n) return $("chgNote").focus();
    const sel = picked(); if (sel.length) n = (`Interested in the optional items: ${sel.map((it) => it.desc).join(", ")}. ` + n).slice(0, 1000);
    send("changes", n, e.target);
  });
}

(async () => {
  if (!token) { app.innerHTML = `<div class="center"><h1>Link incomplete</h1><p class="mu">Please open the full link that was shared with you.</p></div>`; return; }
  try {
    const q = await call("view");
    if (q.error) { app.innerHTML = `<div class="center"><h1>Quotation not found</h1><p class="mu">This link is invalid or has been withdrawn. Please contact your sales representative.</p></div>`; return; }
    render(q);
  } catch {
    app.innerHTML = `<div class="center"><h1>Could not load</h1><p class="mu">Please check your internet connection and refresh.</p></div>`;
  }
})();
