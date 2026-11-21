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
  const raw = r2(r2(sub) + r2(tax));
  return { sub: r2(sub), tax: r2(tax), grand: q.round_off === false ? raw : Math.round(raw), lines };
}
const niceDay = (s) => s ? new Date(String(s).slice(0, 10) + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "";
const plusDays = (s, n) => { const d = new Date(String(s).slice(0, 10) + "T00:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
function termRows(q) {
  const rows = [["Valid till", q.date ? niceDay(plusDays(q.date, +q.validity_days || 7)) : ""], ["Payment terms", q.payment_terms], ["Delivery", q.delivery], ["Your reference", q.ref]];
  const a = q.amc;
  if (a?.start) {
    const e = new Date(a.start + "T00:00:00"); e.setMonth(e.getMonth() + (+a.months || 12)); e.setDate(e.getDate() - 1);
    rows.push(["AMC period", `${niceDay(a.start)} – ${niceDay(e.toISOString().slice(0, 10))} (${+a.months || 12} months)`], ["Coverage", a.coverage], ["Preventive visits", a.pm], ["Standby", a.standby],
      ["Billing", (a.billing || "") + (/monthly|quarterly/i.test(a.billing || "") && a.bill_day ? `, bill on day ${a.bill_day}` : "")]);
  }
  return rows.filter(([, v]) => v);
}
const rowHtml = (it, i) => `<td>${i + 1}</td><td><pre>${h(it.desc)}</pre>${it.details ? `<pre class="mu dt">${h(it.details)}</pre>` : ""}</td><td>${h(it.hsn)}</td><td class="r">${h(it.qty)}</td><td class="r">${inr(it.price)}</td><td class="r">${h(it.tax)}%</td><td class="r">${inr(r2((+it.qty || 0) * (+it.price || 0)))}</td>`;

function respBox(q) {
  if (q.response === "accepted") return `<div class="note ok">✅ You accepted this quotation on ${h(dt(q.response_at))}${q.options_added || q.options_removed ? " with your own selection of items" : ""}. Our team will contact you shortly with the next steps. Thank you!</div>`;
  if (q.status === "lost") return `<div class="note w">This quotation is no longer active. Please contact us for an updated offer.</div>`;
  return `<div id="resp">${q.response === "changes" ? `<div class="note w">✏️ You requested changes on ${h(dt(q.response_at))}. We'll send a revised quotation soon.</div>` : ""}
    <div class="actions"><button class="pri" id="acc">✅ Accept quotation</button><button id="chg">✏️ Request changes</button><button id="pr">🖨 Print / Save PDF</button></div>
    <div id="chgBox" hidden><textarea id="chgNote" maxlength="1000" placeholder="Tell us what you would like changed (quantity, model, price, delivery…)"></textarea>
      <div class="actions"><button class="pri" id="chgSend">Send request</button></div></div></div>`;
}

function render(q) {
  const co = q.company || {}, to = q.to || {}, rep = q.rep || {};
  // n = the item's place in the saved quotation (sent by the server as i)
  const all = (q.items || []).map((it, k) => ({ ...it, n: Number.isInteger(it.i) ? it.i : k }));
  const inc = all.filter((it) => !it.opt), opt = all.filter((it) => it.opt);
  const canPick = q.response !== "accepted" && q.status !== "lost" && all.length > 0;
  const head = (ck) => `<thead><tr>${ck ? '<th class="ck"></th>' : ""}<th>#</th><th>Description</th><th>HSN/SAC</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">GST</th><th class="r">Amount</th></tr></thead>`;
  document.title = `Quotation ${q.quote_no} · ${co.name || ""}`;
  app.innerHTML = `<div class="card">
    <div class="hd"><div><h1>${h(co.name || "")}</h1><div class="mu">${h(co.address || "")}</div><div class="mu">${co.gstin ? "GSTIN: " + h(co.gstin) : ""}${co.pan ? " · PAN: " + h(co.pan) : ""}</div></div>
      <div class="r"><h2>QUOTATION</h2><div>No: <b>${h(q.quote_no)}</b></div><div class="mu">Date: ${h(dt(q.date))}</div></div></div>
    <div><b>To:</b> ${h(to.name || "")}${to.address ? "<br>" + h(to.address) : ""}${to.state ? ", " + h(to.state) : ""}${to.gstin ? "<br>GSTIN: " + h(to.gstin) : ""}${to.contact ? "<br>Kind Attn: " + h(to.contact) : ""}</div>
    ${q.site?.address ? `<div style="margin-top:6px"><b>Delivery / site:</b> ${h(q.site.address)}</div>` : ""}
    ${termRows(q).length ? `<div class="terms">${termRows(q).map(([k, v]) => `<div><span class="mu">${h(k)}</span><b>${h(v)}</b></div>`).join("")}</div>` : ""}
    ${canPick ? `<p class="pickhint">✔ <b>Tick the items you want</b> — the total with GST updates instantly. Accepting confirms exactly your selection.</p>
    <div class="tw pick"><table>${head(true)}<tbody>
      ${all.map((it, k) => `<tr data-row="${it.n}" class="${it.opt ? "" : "on"}"><td class="ck"><input type="checkbox" data-pi="${it.n}" ${it.opt ? "" : "checked"} aria-label="Include ${h(String(it.desc || "item").slice(0, 80))}"></td>${rowHtml(it, k).replace("<pre>", it.opt ? '<span class="otag">Optional</span><pre>' : "<pre>")}</tr>`).join("")}
      </tbody><tbody id="tots"></tbody></table></div>
    <div class="selsum" id="selSum" hidden></div>`
    : `<div class="tw"><table>${head(false)}<tbody>
      ${inc.map((it, i) => `<tr>${rowHtml(it, i)}</tr>`).join("")}
      <tr class="tot"><td colspan="6" class="r">Subtotal</td><td class="r">${inr(q.subtotal)}</td></tr>
      ${calc(q, inc).lines.concat(+q.round_amt ? [["Round off", +q.round_amt]] : []).map(([l, v]) => `<tr class="tot"><td colspan="6" class="r">${h(l)}</td><td class="r">${inr(v)}</td></tr>`).join("")}
      <tr class="grand"><td colspan="6" class="r">Grand Total (incl. GST)</td><td class="r">${inr(q.grand_total)}</td></tr></tbody></table></div>
    ${opt.length ? `<div class="blk optbox"><b class="t">${q.response === "accepted" ? "Not included in your order" : "Optional items — not included in the total"}</b>
      <div class="tw" style="margin:6px 0"><table>${head(false)}<tbody>${opt.map((it, i) => `<tr>${rowHtml(it, i)}</tr>`).join("")}</tbody></table></div></div>` : ""}`}
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

  // the customer's ticks → live totals with GST (same rounding as the CRM and the server)
  const chosen = () => all.filter((it) => app.querySelector(`[data-pi="${it.n}"]`)?.checked);
  const isOriginal = () => { const c = chosen(); return c.length === inc.length && c.every((it) => !it.opt); };
  const refresh = () => {
    if (!canPick) return;
    const c = chosen(), t = calc(q, c), round = r2(t.grand - (t.sub + t.tax));
    app.querySelectorAll("[data-pi]").forEach((cb) => cb.closest("tr").classList.toggle("on", cb.checked));
    $("tots").innerHTML = `<tr class="tot"><td colspan="7" class="r">Subtotal</td><td class="r">${inr(t.sub)}</td></tr>
      ${t.lines.concat(round ? [["Round off", round]] : []).map(([l, v]) => `<tr class="tot"><td colspan="7" class="r">${h(l)}</td><td class="r">${inr(v)}</td></tr>`).join("")}
      <tr class="grand"><td colspan="7" class="r">Grand Total (incl. GST)</td><td class="r">${inr(t.grand)}</td></tr>`;
    const box = $("selSum"), acc = $("acc"), orig = isOriginal();
    box.hidden = orig;
    box.innerHTML = !c.length ? "Please tick at least one item."
      : `Your selection: <b>${c.length} of ${all.length}</b> item${all.length > 1 ? "s" : ""} · Total incl. GST <b>${inr(t.grand)}</b> <button type="button" class="lnk" id="selReset">↺ Back to our offer</button>`;
    box.classList.toggle("bad", !c.length);
    $("selReset")?.addEventListener("click", () => { app.querySelectorAll("[data-pi]").forEach((cb) => { cb.checked = !all.find((it) => String(it.n) === cb.dataset.pi)?.opt; }); refresh(); });
    if (acc) { acc.disabled = !c.length; acc.textContent = `✅ Accept quotation — ${inr(t.grand)}`; }
  };
  app.querySelectorAll("[data-pi]").forEach((cb) => cb.addEventListener("change", refresh));
  // tapping anywhere on the row ticks it (easy on a phone)
  app.querySelectorAll(".pick tbody:first-of-type tr").forEach((tr) => tr.addEventListener("click", (e) => {
    if (e.target.closest("input, a, button")) return;
    const cb = tr.querySelector("[data-pi]"); if (cb) { cb.checked = !cb.checked; refresh(); }
  }));
  refresh();

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
    const c = chosen(); if (!c.length) return;
    const total = inr(calc(q, c).grand), orig = isOriginal();
    const msg = orig ? `Accept quotation ${q.quote_no} for ${total} (incl. GST)?` : `Accept quotation ${q.quote_no} with your selection of ${c.length} item${c.length > 1 ? "s" : ""} — ${total} (incl. GST)?`;
    if (confirm(msg)) send("accepted", null, e.target, orig ? null : { sel: c.map((it) => ({ i: it.n, d: String(it.desc || "") })) });
  });
  $("chgSend")?.addEventListener("click", (e) => {
    let n = $("chgNote").value.trim(); if (!n) return $("chgNote").focus();
    if (canPick && !isOriginal()) n = (`My selection: ${chosen().map((it) => it.desc).join(", ") || "none"} (${inr(calc(q, chosen()).grand)} incl. GST). ` + n).slice(0, 1000);
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
