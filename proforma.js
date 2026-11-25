// =====================================================================
//  proforma.js — the customer answers a quotation mail ("approved only 1 and 3 numbers, pls process")
//  → find that quotation, read which lines were approved, show them as ticks the salesperson can correct,
//  then ONE click: Proforma Invoice (PI/26/0001, prices + GST from the quotation itself) + a reply mail
//  with the PDF attached, ready to send. Nothing is typed again, nothing can be priced differently.
// =====================================================================
import { sb, h, inr, toast, fail, busy, HOOK, openTab } from "./core.js";
import { saveBlob } from "./qpdf.js";
import { L } from "./i18n.js";
import { isHinglishText } from "./lprod.js";

const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const ORD = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };
// the customer says yes / go ahead / send the PI (English + Hinglish)
const APPROVE = /\b(approved?|approval|go ahead|proceed|process(ed)?|confirm(ed|ing)?|finali[sz]ed?|accept(ed)?|place (an |the )?order|send (the |us )?(pi|proforma( invoice)?|invoice)|raise (the |a )?(pi|invoice)|issue (the |a )?(po|pi|invoice)|okay|ok for|fine with|kar do|kardo|bhej do|bhejdo|chalega|final hai)\b/;
const EXCEPT = /\b(except|other than|excluding|without|remove|drop|cancel|skip|not (required|needed|necessary)|no need (of|for)|don'?t need|nahi chahiye)\b/;
// a number followed by one of these is a quantity, not a line number ("2 and 3 licences")
const QTY_AFTER = /^\s*(nos?\b|pcs?\b|pieces?\b|qty\b|quantity|units?\b|licen[cs]es?|users?\b|seats?\b|laptops?|desktops?|machines?|systems?|years?\b|months?\b|days?\b|gb\b|tb\b|%|lakhs?|rs\b|inr\b)/;
const STOP = new Set(["with", "from", "for", "and", "the", "this", "that", "your", "year", "years", "license", "licence", "licenses", "licences", "subscription", "new", "per", "unit", "units", "nos", "job", "pcs", "piece", "pieces", "number", "quotation", "genesis", "infoserve", "supply", "charges", "item", "items"]);

const r2 = (v) => Math.round((+v || 0) * 100) / 100;
const words = (s) => (String(s || "").toLowerCase().match(/[a-z][a-z0-9+.-]{3,}/g) || []).filter((w) => !STOP.has(w));
const mainItems = (q) => (Array.isArray(q?.items) ? q.items : []).filter((it) => !it.opt);
const lineAmt = (it) => r2((+it.qty || 0) * (+it.price || 0));

/** which lines of a quotation (1…n, as printed) does this mail approve? */
export function parsePick(raw, items) {
  const n = items.length;
  let t = " " + String(raw || "").toLowerCase().replace(/\s+/g, " ") + " ";
  t = t.replace(/\b(\d{1,2})\s*(st|nd|rd|th)\b/g, "$1").replace(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/g, (m) => String(ORD[m]));
  const approve = APPROVE.test(t), except = EXCEPT.test(t.replace(/\b(baaki|baki|bakki|rest|others?|remaining)\b.{0,25}/g, " "));
  const nums = new Set(); let said = "";
  const take = (list, phrase) => { const ok = list.filter((x) => x >= 1 && x <= n); if (!ok.length) return; ok.forEach((x) => nums.add(x)); if (!said) said = phrase; };
  // "1 and 3", "1, 3", "1 & 3", "items 1,2 and 4" — a list of small numbers
  for (const m of t.matchAll(/(^|[^\d./:-])(\d{1,2}(?:\s*(?:,|&|\+|and|aur|or)\s*\d{1,2})+)(?![\d./:-])/g)) {
    if (QTY_AFTER.test(t.slice(m.index + m[0].length))) continue;
    take(m[2].split(/\s*(?:,|&|\+|and|aur|or)\s*/).map(Number), m[2]);
  }
  // "item 2", "sr no 3", "line no. 1", "point #4", "option 2"
  for (const m of t.matchAll(/\b(?:items?|sr\.?\s*no\.?|s\.?\s*no\.?|serial(?:\s*no\.?)?|lines?|points?|options?|products?|#)\s*(?:no\.?|number|#)?\s*[:.-]?\s*(\d{1,2})(?![\d./:-])/g)) {
    if (QTY_AFTER.test(t.slice(m.index + m[0].length))) continue;
    take([+m[1]], m[0].trim());
  }
  // "except 2", "without item 3", "remove 1 and 2" → those are the lines NOT wanted
  const out = new Set();
  for (const m of t.matchAll(/\b(?:except|other than|excluding|without|remove|drop|skip|minus)\s+(?:items?\s*|sr\.?\s*no\.?\s*|no\.?\s*|#)?(\d{1,2}(?:\s*(?:,|&|and|aur)\s*\d{1,2})*)(?![\d./:-])/g)) {
    if (QTY_AFTER.test(t.slice(m.index + m[0].length))) continue;
    m[1].split(/\s*(?:,|&|and|aur)\s*/).map(Number).filter((x) => x >= 1 && x <= n).forEach((x) => out.add(x));
    if (!said) said = m[0].trim();
  }
  // Hinglish: "2 ke saath", "3 wala", "1 wale"
  for (const m of t.matchAll(/(^|[^\d./:-])(\d{1,2})\s*(?:no\.?\s*)?(?:ke saath|ke sath|wala|wale|wali)\b/g)) take([+m[2]], m[0].trim());
  // "only 2" (but not "only 2 laptops")
  for (const m of t.matchAll(/\bonly\s+(\d{1,2})(?![\d./:-])/g)) {
    if (QTY_AFTER.test(t.slice(m.index + m[0].length))) continue;
    take([+m[1]], m[0].trim());
  }
  if (out.size) {          // the lines NOT wanted were named → all the others
    const keep = Array.from({ length: n }, (_, i) => i + 1).filter((x) => !out.has(x));
    return { pick: keep, how: "nums-except", approve, except: true, said };
  }
  let pick = [...nums].sort((a, b) => a - b), how = pick.length ? "nums" : null;
  // no numbers: lines named in the mail by a word only they have ("transportation", "installation")
  if (!pick.length) {
    const named = [];
    items.forEach((it, i) => {
      const others = new Set(items.flatMap((o, j) => (j === i ? [] : words(o.desc))));
      const hit = words(it.desc).filter((w) => !others.has(w) && t.includes(w));
      if (hit.length && !hit.some((w) => new RegExp(`\\b\\d+\\s*(?:x\\s*)?${w.replace(/[.+]/g, "\\$&")}`).test(t))) named.push(i + 1);
    });
    if (named.length && named.length < n) { pick = named; how = "names"; }
  }
  if (pick.length && except) { pick = Array.from({ length: n }, (_, i) => i + 1).filter((x) => !pick.includes(x)); how += "-except"; }
  if (!pick.length && approve) { pick = Array.from({ length: n }, (_, i) => i + 1); how = "all"; }
  return { pick, how, approve, except, said };
}

/** the quotations this mail most likely answers, best first */
function rankQuotes(quotes, r, text) {
  const subj = String(r.subject || "").replace(/^\s*((re|fw|fwd|aw)\s*:\s*)+/i, "");
  const hay = (subj + " " + text).toLowerCase(), sw = new Set(words(subj)), mailAt = Date.parse(r.created_at) || Date.now();
  return quotes.map((q) => {
    let s = 0; const no = String(q.quote_no || "").toLowerCase();
    if (no && hay.includes(no)) s += 100;
    else { const tail = no.split("/").pop(); if (tail && tail.length >= 3 && new RegExp(`\\b${tail.replace(/[^a-z0-9]/g, "")}\\b`).test(hay)) s += 60; }
    const iw = new Set(mainItems(q).flatMap((it) => words(it.desc)));
    if (sw.size && iw.size) s += 40 * [...sw].filter((w) => iw.has(w)).length / sw.size;
    const at = Date.parse(q.created_at) || 0, days = (mailAt - at) / 864e5;
    s += days < -0.05 ? -60 : Math.max(0, 20 - days / 3);
    if (q.status === "draft") s -= 25;
    return { q, s };
  }).sort((a, b) => b.s - a.s).map((x) => x.q);
}

function totals(q, pick) {
  const inc = mainItems(q); let sub = 0, tax = 0;
  pick.forEach((i) => { const it = inc[i - 1]; if (!it) return; const a = lineAmt(it); sub += a; tax += r2(a * (+it.tax || 0) / 100); });
  const raw = r2(sub + tax);
  return { sub: r2(sub), tax: r2(tax), grand: q.round_off === false ? raw : Math.round(raw) };
}

function mailBody(pi, q, hi) {
  const inc = mainItems(q);
  const lines = pi.picked.map((i) => { const it = inc[i - 1]; return it ? `${i}. ${it.desc} — ${it.qty} × ${inr(+it.price || 0)}` : ""; }).filter(Boolean).join("\n");
  const SIGN = "Best Regards,\n\n{{my_name}}\n{{my_designation}}\nGENESIS INFOSERVE PVT. LTD.\n{{my_email}}\n{{my_phone}}";
  return hi
    ? `Namaste {{contact_name|Sir/Madam}},\n\nApproval ke liye dhanyavaad! Aapke mail ke hisaab se quotation ${q.quote_no} ke approved items ka Proforma Invoice **${pi.pi_no}** attach hai:\n\n${lines}\n\n**Total: ${inr(+pi.grand_total)} (GST ke saath)**\n\nPayment ya Purchase Order bhej dijiye, hum order process kar dete hain — bank details proforma pe hain.\n\n${SIGN}`
    : `Dear {{contact_name|Sir/Madam}},\n\nThank you for your approval. As per your mail, please find attached our Proforma Invoice **${pi.pi_no}** for the approved items of our quotation ${q.quote_no}:\n\n${lines}\n\n**Total: ${inr(+pi.grand_total)} (incl. GST)**\n\nKindly arrange the payment or send us your Purchase Order so that we can process the order — our bank details are on the proforma.\n\n${SIGN}`;
}

/**
 * The card in the Inbox mail view. ctx: { r, lead, text, openComposer, ensureWork, refresh }
 * Shows only when the mail looks like an answer to a quotation (an approval or a choice of lines).
 * Returns true when it is shown (the "make quotation" suggestions are then hidden — the quote exists).
 */
export async function drawDeal(box, ctx) {
  const { r, lead, text } = ctx;
  if (!box || !lead) return false;
  const { data: quotes } = await sb.from("quotations")
    .select("id, quote_no, quote_date, created_at, items, to_party, status, grand_total, round_off, show_optional, note_customer, payment_terms, delivery, validity_days, ref, site, amc, owner_id, lead_id, terms_html, annexure_html, notes")
    .eq("lead_id", lead.id).neq("status", "lost").order("created_at", { ascending: false }).limit(25);
  const ranked = rankQuotes((quotes || []).filter((q) => mainItems(q).length), r, text);
  if (!ranked.length || !box.isConnected) return false;
  let q = ranked[0], P = parsePick(text, mainItems(q));
  if (!P.pick.length) return false;              // not an approval / choice of lines → nothing to suggest
  let sel = new Set(P.pick);
  const { data: old } = await sb.from("proformas").select("id, pi_no, picked, grand_total, status, quotation_id, created_at, items").eq("lead_id", lead.id).order("id", { ascending: false }).limit(10);

  const draw = () => {
    const inc = mainItems(q), T = totals(q, [...sel]), hi = isHinglishText(text);
    const why = P.how === "all" ? L("Customer ne poori quotation approve ki", "The customer approved the whole quotation")
      : P.how?.startsWith("names") ? L("Customer ne mail mein ye items naam se likhe", "The customer named these items in the mail")
      : L(`Customer ne approve kiye: item ${P.pick.join(", ")}`, `The customer approved: item${P.pick.length > 1 ? "s" : ""} ${P.pick.join(", ")}`);
    const mine = (old || []).filter((p) => p.quotation_id === q.id);
    box.hidden = false;
    box.innerHTML = `
      <div class="deal-h"><span class="t">📄 ${L("Proforma bana do", "Make the proforma")}</span>
        <span class="badge ${P.approve ? "good" : "info"}">${P.approve ? "✅ " + L("Approval mila", "Approved") : "☑ " + L("Items chune", "Items chosen")}</span>
        ${ranked.length > 1 ? `<select class="input" id="dlQ" aria-label="${h(L("Kaunsi quotation", "Which quotation"))}">${ranked.slice(0, 8).map((x) => `<option value="${x.id}" ${x.id === q.id ? "selected" : ""}>${h(x.quote_no)} · ${h(new Date(x.quote_date || x.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }))} · ${h(inr(+x.grand_total || 0))}</option>`).join("")}</select>`
          : `<span class="mu" style="margin-left:auto;font-size:12.5px">${h(q.quote_no)}</span>`}</div>
      <div class="deal-why">${h(why)}${P.said ? ` — <q>${h(P.said)}</q>` : ""} <span class="mu">· ${L("galat ho toh tick badal do", "tick / untick to correct it")}</span></div>
      <div class="deal-lines">${inc.map((it, i) => `<label class="deal-line ${sel.has(i + 1) ? "on" : ""}"><input type="checkbox" data-dl="${i + 1}" ${sel.has(i + 1) ? "checked" : ""}><span class="dl-sr">#${i + 1}</span><span>${h(it.desc)} <span class="mu">· ${h(it.qty)} × ${h(inr(+it.price || 0))}</span></span><span class="amt">${h(inr(lineAmt(it)))}</span></label>`).join("")}</div>
      <div class="deal-foot"><span class="sum">${sel.size} ${L("item", sel.size === 1 ? "item" : "items")} · ${h(inr(T.sub))} + GST = <b>${h(inr(T.grand))}</b></span><span class="sp"></span>
        <button type="button" class="btn sm" id="dlView" ${sel.size ? "" : "disabled"}>👁 ${L("Proforma dekho", "Preview")}</button>
        <button type="button" class="btn sm primary" id="dlGo" ${sel.size ? "" : "disabled"}>✉️ ${L("Proforma + reply mail banao", "Make proforma + reply")}</button></div>
      ${mine.length ? `<div class="deal-old mu">${L("Pehle bane", "Already made")}: ${mine.map((p) => `<a href="#" data-dlo="${p.id}">${h(p.pi_no)}</a> (${h(p.picked.join(", "))} · ${h(inr(+p.grand_total))}${p.status === "sent" ? " · " + L("bheja", "sent") : ""})`).join(" · ")}</div>` : ""}`;
    $("#dlQ", box)?.addEventListener("change", (e) => { q = ranked.find((x) => x.id === +e.target.value) || q; P = parsePick(text, mainItems(q)); sel = new Set(P.pick); draw(); });
    $$("[data-dl]", box).forEach((c) => c.onchange = () => { c.checked ? sel.add(+c.dataset.dl) : sel.delete(+c.dataset.dl); draw(); });
    const pickNow = () => [...sel].sort((a, b) => a - b);
    const show = async (pi) => { const a = await HOOK.proformaPdf(pi, q, { mailAt: r.created_at }); const u = URL.createObjectURL(a.blob); if (!openTab(u)) saveBlob(a.blob, a.name); setTimeout(() => URL.revokeObjectURL(u), 60000); };
    $("#dlView", box).onclick = (e) => busy(e.target, async () => {     // a preview: nothing is saved, no number is used
      const inc2 = mainItems(q), pk = pickNow(), T2 = totals(q, pk);
      await show({ pi_no: "PI/DRAFT", picked: pk, items: pk.map((i) => ({ ...inc2[i - 1], sr: i })), grand_total: T2.grand, created_at: new Date().toISOString() });
    });
    $("#dlGo", box).onclick = (e) => busy(e.target, async () => {
      if (lead && ctx.ensureWork && !(await ctx.ensureWork("lead", lead))) return;
      const { data: pi, error } = await sb.rpc("proforma_make", { p_quote: q.id, p_pick: pickNow(), p_email: r.id });
      if (error) throw error;
      toast(L(`📄 Proforma ${pi.pi_no} ban gaya — reply mail tayyar hai, PDF lagi hai`, `📄 Proforma ${pi.pi_no} made — the reply is ready with the PDF attached`));
      ctx.openComposer({ channel: "email", reply: r, lead, rfq: r.rfqs || undefined,
        draft: { body: mailBody(pi, q, hi) },
        attach: { name: `Proforma ${pi.pi_no}.pdf`, line: false, make: () => HOOK.proformaPdf(pi, q, { mailAt: r.created_at }) },
        onSent: () => { sb.from("proformas").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", pi.id).eq("status", "draft").then(() => {}, () => {}); ctx.refresh?.(); } });
    });
    $$("[data-dlo]", box).forEach((a) => a.onclick = (e) => { e.preventDefault(); const p = (old || []).find((x) => x.id === +a.dataset.dlo); if (p) show(p).catch(fail); });
  };
  draw();
  return true;
}
