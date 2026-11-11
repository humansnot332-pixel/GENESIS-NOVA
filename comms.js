// =====================================================================
//  Genesis CRM — communications: email / WhatsApp composer, templates,
//  replies inbox (Gmail via Apps Script, Outlook via Microsoft Graph),
//  notifications and lock access-requests.
// =====================================================================
import {
  sb, S, h, ic, dt, ago, toast, fail, modal, closeModal, confirmBox, busy, isMgr, isAdmin, userName, ROLE,
  STATUS, OPEN_STATUSES, HOOK, lockOf, canWork, claim, claimFailMsg, tplContext, TPL_VARS, fillTemplate,
  mdToPlain, mdToHtml, mdToWhatsApp, composeUrl, URL_LIMIT, waUrl, openTab, copyRich, loadScript, isMobile, callFn,
} from "./core.js";
import { CONFIG } from "./config.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;
const splitEmails = (s) => String(s || "").split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
const PROVIDERS = [["gmail", "Gmail"], ["outlook", "Outlook"], ["mailto", "Mail app"]];
const INTENT = {
  interested: ["🔥 Interested", "good"], quote_request: ["💰 Quote maanga", "acc"], not_interested: ["🚫 Not interested", "bad"],
  auto_reply: ["🤖 Auto-reply", ""], bounce: ["⚠️ Bounce", "bad"], other: ["💬 Reply", "info"],
};
const intentBadge = (i) => { const x = INTENT[i || "other"] || INTENT.other; return `<span class="badge ${x[1]}">${x[0]}</span>`; };

// ---------------------------------------------------------------------
//  Lock gate used before any outreach
// ---------------------------------------------------------------------
export async function ensureWork(entity, row) {
  if (!row) return true;
  if (canWork(row)) return true;
  const k = lockOf(row);
  if (k.other) { toast(`🔒 ${k.holder} is pe kaam kar raha hai — pehle "Request access" karo`, true); return false; }
  const r = await claim(entity, row.id);
  if (!r.ok) { toast(claimFailMsg(r), true); return false; }
  row.owner_id = S.me.id; row.lock_until = r.until;
  toast("🔒 Lock aapke naam — ab sirf aap is pe kaam karoge");
  HOOK.softRefresh();
  return true;
}

// ---------------------------------------------------------------------
//  Templates cache
// ---------------------------------------------------------------------
let TPL = [], tplAt = 0;
export async function loadTemplates(force = false) {
  if (!force && Date.now() - tplAt < 60e3 && TPL.length) return TPL;
  const { data, error } = await sb.from("message_templates").select("*").order("is_shared", { ascending: false }).order("sort").order("name");
  if (error) throw error;
  TPL = data || []; tplAt = Date.now();
  return TPL;
}
function pickStage({ channel, lead, rfq, reply }) {
  if (reply) return "reply";
  if (rfq) return "rfq";
  const st = lead?.status;
  if (st === "interested") return "interested";
  if (st === "quote_sent" || st === "negotiation") return "quote";
  if (st === "demo") return channel === "whatsapp" ? "demo" : "interested";
  if (lead?.email_count > 0 && !lead?.reply_count) return "followup";
  return "new";
}
function tplOptions(list, sel) {
  const g = (shared) => list.filter((t) => t.is_shared === shared).map((t) => `<option value="${t.id}" ${t.id === sel ? "selected" : ""}>${h(t.name)}</option>`).join("");
  return `<option value="">— Blank (sirf signature) —</option><optgroup label="Company templates">${g(true)}</optgroup><optgroup label="Mere templates">${g(false)}</optgroup>`;
}
const signatureBlock = () => `\n\nBest Regards,\n\n${S.me.full_name}\n${S.me.designation || ROLE[S.me.role] || ""}\nGENESIS INFOSERVE PVT. LTD.\n${S.me.email}${S.me.phone ? "\n" + S.me.phone : ""}`;

// ---------------------------------------------------------------------
//  COMPOSER (email + WhatsApp)
//  opts: { channel, lead?, rfq?, bulk?: lead[], reply?: email row, onSent? }
// ---------------------------------------------------------------------
export async function openComposer(opts) {
  const { channel, lead, rfq, bulk, reply } = opts;
  const list = (await loadTemplates()).filter((t) => t.channel === channel && (t.use_for === "any" || t.use_for === (rfq ? "rfq" : "lead")));
  const stage = pickStage({ channel, lead, rfq, reply });
  const auto = reply ? null : (list.find((t) => t.is_shared && t.stage === stage) || list.find((t) => t.stage === stage) || list[0]);
  const ctx = tplContext({ lead: bulk ? null : lead, rfq });
  if (bulk) { ctx.company = "your organization"; ctx.contact_name = ""; }
  const isEmail = channel === "email";
  const lastMail = lead?.last_emailed_at || rfq?.last_emailed_at;
  const warn = [];
  if (isEmail && lastMail && Date.now() - new Date(lastMail) < 3 * 864e5) warn.push(`Is ${rfq ? "RFQ" : "lead"} ko ${ago(lastMail)} email gaya tha — dobara bhejna hai?`);
  let to = "", phones = [];
  if (isEmail) {
    to = reply ? reply.counterpart : bulk ? "" : (opts.to || rfq?.email || lead?.email || "");
    if (!bulk && !to) warn.push("Email address nahi hai — upar daal do (lead mein bhi save ho jayega).");
  } else {
    phones = [lead?.phone || rfq?.phone, ...(lead?.alt_phones || [])].filter(Boolean);
    if (!phones.length) warn.push("Phone number nahi hai.");
    else if (!phones.some(isMobile)) warn.push("Ye number landline lagta hai — WhatsApp shayad na chale.");
  }
  const pref = S.me.mail_provider || "gmail";
  const bulkList = bulk ? bulk.filter((l) => EMAIL_RE.test(l.email || "")) : [];

  const title = isEmail ? (bulk ? `✉️ Bulk email — ${bulkList.length} companies` : `✉️ Email — ${rfq?.company || lead?.company || reply?.counterpart || ""}`)
    : `💬 WhatsApp — ${rfq?.company || lead?.company || ""}`;
  const m = modal({
    title, wide: true,
    body: `
    ${warn.length ? `<div class="banner" style="margin:12px 0 0;background:var(--warn-soft);border-color:transparent">⚠️ <div>${warn.map(h).join("<br>")}</div></div>` : ""}
    ${isEmail ? `
      ${bulk ? `<label class="f">BCC (${bulkList.length}) — har company ko alag dikhega, ek doosre ka email nahi dikhega</label>
        <div class="script mono" style="max-height:72px;overflow:auto;font-size:12px">${h(bulkList.map((l) => l.email).join(", ")) || "Koi valid email nahi"}</div>
        ${bulk.length > bulkList.length ? `<div class="mu" style="font-size:12px">${bulk.length - bulkList.length} leads skip (email nahi hai)</div>` : ""}`
      : `<div class="grid2"><div><label class="f" for="cTo">To</label><input class="input" id="cTo" value="${h(to)}" placeholder="name@company.com" autocomplete="off"></div>
         <div><label class="f" for="cCc">CC (optional)</label><input class="input" id="cCc" placeholder="comma separated"></div></div>`}` : `
      <label class="f" for="cPh">WhatsApp number</label><select class="input" id="cPh">${phones.map((p) => `<option value="${h(p)}">${h(p)}${isMobile(p) ? " · mobile" : " · landline?"}</option>`).join("") || "<option value=''>—</option>"}</select>`}
    <div class="grid2"><div><label class="f" for="cTpl">Template</label><select class="input" id="cTpl">${tplOptions(list, auto?.id)}</select></div>
      ${isEmail ? `<div><label class="f" for="cSub">Subject</label><input class="input" id="cSub" maxlength="300"></div>` : `<div></div>`}</div>
    <div class="row" style="margin:12px 0 4px"><label class="f" style="margin:0" for="cBody">Message</label><span class="sp" style="flex:1"></span>
      <button type="button" class="btn sm" id="cBold" title="Selected text bold"><b>B</b></button>
      <button type="button" class="btn sm" id="cPrev">👁 Preview</button>
      <button type="button" class="btn sm" id="cSave">💾 Template save</button></div>
    <textarea class="input" id="cBody" style="min-height:300px;font-size:13.5px;line-height:1.55"></textarea>
    <div id="cPreview" class="script" style="display:none;max-height:340px;overflow:auto;background:var(--surface);border:1px solid var(--line)"></div>
    <div class="mu" style="font-size:12px;margin-top:4px">**text** = bold. Aap kuch bhi edit kar sakte ho — bhejne se pehle sab yahin badlo.</div>
    ${lead && !bulk ? `<label class="check" style="margin-top:10px"><input type="checkbox" id="cFu" ${lead.next_follow_up ? "" : "checked"}> 3 din baad follow-up reminder set karo</label>` : ""}
    <div id="cFallback"></div>`,
    foot: isEmail
      ? `<button class="btn" id="cCopy" title="Formatting ke saath copy">${ic("copy")} Copy</button><span style="flex:1"></span>
         ${PROVIDERS.map(([k, l]) => `<button class="btn ${k === pref ? "primary" : ""}" data-send="${k}">${ic("mail")} ${l} mein kholo</button>`).join("")}`
      : `<button class="btn" id="cCopy">${ic("copy")} Copy</button><span style="flex:1"></span>
         <button class="btn" data-wa="web">WhatsApp Web</button><button class="btn primary" data-wa="app">${ic("wa")} WhatsApp kholo</button>`,
  });
  const body = $("#cBody", m), sub = $("#cSub", m);
  const apply = (t) => {
    if (t) { body.value = fillTemplate(t.body, ctx); if (sub) sub.value = fillTemplate(t.subject || "", ctx); }
    else {
      body.value = isEmail ? `Dear ${ctx.contact_name || "Sir/Madam"},\n\n${reply ? "Thank you for your reply.\n\n" : ""}${signatureBlock()}` : `Namaste ${ctx.contact_name || "Sir/Madam"} 🙏\n\n– ${S.me.full_name}, Genesis Infoserve`;
      if (sub) sub.value = reply ? (/^re:/i.test(reply.subject || "") ? reply.subject : "Re: " + (reply.subject || "")) : "";
    }
    body.dataset.dirty = "";
  };
  apply(auto);
  body.addEventListener("input", () => { body.dataset.dirty = "1"; });
  $("#cTpl", m).onchange = async (e) => {
    if (body.dataset.dirty && !(await confirmBox("Template badalne se aapke changes chale jayenge. Continue?", "Haan, badlo"))) return;
    apply(list.find((t) => t.id === +e.target.value));
  };
  $("#cBold", m).onclick = () => {
    const a = body.selectionStart, b = body.selectionEnd; if (a === b) return toast("Pehle text select karo");
    body.setRangeText("**" + body.value.slice(a, b).replace(/\*\*/g, "") + "**", a, b, "select"); body.dataset.dirty = "1"; body.focus();
  };
  $("#cPrev", m).onclick = () => {
    const p = $("#cPreview", m), on = p.style.display === "none";
    p.innerHTML = isEmail ? mdToHtml(body.value) : h(mdToWhatsApp(body.value)).replace(/\*([^*\n]+)\*/g, "<b>$1</b>").replace(/\n/g, "<br>");
    p.style.display = on ? "block" : "none"; body.style.display = on ? "none" : "block";
    $("#cPrev", m).textContent = on ? "✏️ Edit" : "👁 Preview";
  };
  $("#cSave", m).onclick = () => saveAsTemplate(channel, sub?.value || "", body.value);
  $("#cCopy", m).onclick = async () => { const ok = isEmail ? await copyRich(body.value) : await navigator.clipboard.writeText(mdToWhatsApp(body.value)).then(() => true, () => false); toast(ok ? "Copied ✔ — kahin bhi paste karo" : "Copy nahi hua", !ok); };

  const tplId = () => +$("#cTpl", m).value || null;
  const showFallback = (url, label) => {
    $("#cFallback", m).innerHTML = `<div class="banner" style="margin:12px 0 0">Browser ne naya tab block kiya. <a class="btn sm primary" href="${h(url)}" target="_blank" rel="noopener noreferrer">${h(label)} kholo</a></div>`;
  };

  // ---- EMAIL ----
  $$("[data-send]", m).forEach((btn) => btn.addEventListener("click", () => {
    const provider = btn.dataset.send;
    const subject = (sub?.value || "").trim(), text = fillTemplate(body.value, ctx);
    let toList = bulk ? [] : splitEmails($("#cTo", m).value), cc = bulk ? [] : splitEmails($("#cCc", m).value);
    const bad = [...toList, ...cc].filter((e) => !EMAIL_RE.test(e));
    if (bad.length) return toast("Email galat hai: " + bad.join(", "), true);
    if (!bulk && !toList.length) return toast("To mein email daalo", true);
    if (bulk && !bulkList.length) return toast("Kisi selected lead ka email nahi hai", true);
    if (!subject) return toast("Subject daalo", true);
    const bcc = bulk ? bulkList.map((l) => l.email).join(",") : "";
    const parts = { to: bulk ? S.me.email : toList.join(","), cc: cc.join(","), bcc, subject, body: mdToPlain(text) };
    let url = composeUrl(provider, parts), copied = false;
    if (url.length > URL_LIMIT[provider]) { url = composeUrl(provider, { ...parts, body: "" }); copyRich(text); copied = true; }
    if (!openTab(url)) showFallback(url, PROVIDERS.find((p) => p[0] === provider)[1]);
    if (provider !== S.me.mail_provider) { S.me.mail_provider = provider; sb.from("profiles").update({ mail_provider: provider }).eq("id", S.me.id).then(() => {}, () => {}); }
    logEmail({ provider, subject, text, toList, cc, opts, tplId: tplId(), bulkList, fu: $("#cFu", m)?.checked }).catch(fail);
    toast(copied ? "Message lamba tha — body clipboard mein copy hai, compose mein Ctrl+V / Cmd+V karo" : `✉️ ${PROVIDERS.find((p) => p[0] === provider)[1]} mein draft ready — wahan Send dabao`);
    if (!$("#cFallback", m).innerHTML) closeModal();
  }));

  // ---- WHATSAPP ----
  $$("[data-wa]", m).forEach((btn) => btn.addEventListener("click", () => {
    const ph = $("#cPh", m)?.value;
    if (!ph) return toast("Number nahi hai", true);
    const text = mdToWhatsApp(fillTemplate(body.value, ctx));
    const url = waUrl(ph, text, btn.dataset.wa === "web");
    if (!openTab(url)) showFallback(url, "WhatsApp");
    if (lead && canWork(lead)) {
      sb.from("activities").insert({ lead_id: lead.id, kind: "whatsapp", body: "💬 WhatsApp: " + text.slice(0, 280) }).then(({ error }) => { if (error) fail(error); else HOOK.softRefresh(); });
    }
    toast("💬 WhatsApp khul raha hai — wahan Send dabao");
    if (!$("#cFallback", m).innerHTML) closeModal();
    opts.onSent?.();
  }));
}

async function logEmail({ provider, subject, text, toList, cc, opts, tplId, bulkList, fu }) {
  const { lead, rfq, bulk, reply } = opts;
  let rows;
  if (bulk) rows = bulkList.map((l) => ({ direction: "out", lead_id: l.id, counterpart: l.email, subject, body: text, provider, template_id: tplId, bulk: true }));
  else rows = [{
    direction: "out", lead_id: lead?.id || reply?.lead_id || null, rfq_id: rfq?.id || reply?.rfq_id || null,
    counterpart: toList.join(", "), cc: cc.join(", ") || null, subject, body: text, provider, template_id: tplId,
  }];
  // keep lead/RFQ links only where this user may work on them (RLS would reject otherwise)
  for (const r of rows) {
    if (r.lead_id && !(isMgr() || (bulk ? bulk.find((l) => l.id === r.lead_id) && canWork(bulk.find((l) => l.id === r.lead_id)) : lead ? canWork(lead) : false))) r.lead_id = null;
    if (r.rfq_id && !(isMgr() || (rfq && canWork(rfq)))) r.rfq_id = null;
  }
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await sb.from("email_messages").insert(rows.slice(i, i + 100));
    if (error) throw error;
  }
  if (lead && !bulk && canWork(lead)) {
    const upd = {};
    if (!lead.email && toList[0]) upd.email = toList[0];
    if (fu && (!lead.next_follow_up || new Date(lead.next_follow_up) < new Date())) upd.next_follow_up = new Date(Date.now() + 3 * 864e5).toISOString();
    if (Object.keys(upd).length) await sb.from("leads").update(upd).eq("id", lead.id);
  }
  if (rfq && !rfq.email && toList[0] && canWork(rfq)) await sb.from("rfqs").update({ email: toList[0] }).eq("id", rfq.id);
  if (reply && !reply.is_read) await sb.from("email_messages").update({ is_read: true }).eq("id", reply.id);
  HOOK.softRefresh(); HOOK.refreshBadges();
  opts.onSent?.();
}

function saveAsTemplate(channel, subject, body) {
  const m = modal({
    title: "Template save karo",
    body: `<label class="f">Naam</label><input class="input" id="tN" maxlength="80" placeholder="e.g. Workstation offer">
      ${isMgr() ? `<label class="check" style="margin-top:10px"><input type="checkbox" id="tS"> Poori team ke liye (company template)</label>` : ""}
      <p class="mu" style="font-size:12.5px">Tip: company naam ki jagah <span class="mono">{{company}}</span>, contact ke liye <span class="mono">{{contact_name|Sir/Madam}}</span> likho — har lead ke liye apne aap bhar jayega.</p>`,
    foot: `<button class="btn" data-close>Cancel</button><button class="btn primary" id="tGo">Save</button>`,
  });
  $("#tGo", m).onclick = (e) => busy(e.target, async () => {
    const name = $("#tN", m).value.trim(); if (!name) return toast("Naam daalo", true);
    const { error } = await sb.from("message_templates").insert({ channel, name, subject: subject || null, body, is_shared: !!$("#tS", m)?.checked, owner_id: S.me.id });
    if (error) throw error; tplAt = 0; closeModal(); toast("Template saved ✔");
  });
}

// ---------------------------------------------------------------------
//  TEMPLATES PAGE
// ---------------------------------------------------------------------
export async function viewTemplates(el) {
  const ch = el.dataset.ch || "email";
  const list = (await loadTemplates(true)).filter((t) => t.channel === ch);
  const sample = tplContext({ lead: { company: "Sample Technologies Pvt Ltd", contact_name: "Mr. Sharma", city: "Mumbai", products: ["HP Workstations"] }, rfq: null });
  el.innerHTML = `
    <div class="toolbar"><div class="chips"><button class="chip ${ch === "email" ? "on" : ""}" data-ch="email">✉️ Email</button><button class="chip ${ch === "whatsapp" ? "on" : ""}" data-ch="whatsapp">💬 WhatsApp</button></div>
      <span class="sp" style="flex:1"></span><button class="btn primary" id="tNew">${ic("plus")} Naya template</button></div>
    <div class="queue">${list.map((t) => `
      <div class="card" style="padding:14px 16px"><div class="row" style="flex-wrap:nowrap">
        <div style="min-width:0;flex:1"><b>${h(t.name)}</b> ${t.is_shared ? '<span class="badge acc">Company</span>' : '<span class="badge">Mera</span>'} ${t.stage ? `<span class="badge">${h(t.stage)}</span>` : ""}
          ${t.subject ? `<div class="mu" style="font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Subject: ${h(fillTemplate(t.subject, sample))}</div>` : ""}</div>
        <button class="btn sm" data-tv="${t.id}">👁</button>
        ${(!t.is_shared && t.owner_id === S.me.id) || isMgr() ? `<button class="btn sm" data-te="${t.id}">Edit</button>` : ""}
        <button class="btn sm" data-td="${t.id}">Copy</button>
        ${(!t.is_shared && t.owner_id === S.me.id) || isMgr() ? `<button class="btn sm danger" data-tx="${t.id}" aria-label="Delete">${ic("trash")}</button>` : ""}
      </div></div>`).join("") || '<div class="card empty">Abhi koi template nahi</div>'}</div>`;
  $$("[data-ch]", el).forEach((b) => b.onclick = () => { el.dataset.ch = b.dataset.ch; viewTemplates(el); });
  const get = (id) => list.find((t) => t.id === +id);
  $("#tNew", el).onclick = () => templateEditor({ channel: ch, body: "", subject: "" }, () => viewTemplates(el));
  $$("[data-te]", el).forEach((b) => b.onclick = () => templateEditor(get(b.dataset.te), () => viewTemplates(el)));
  $$("[data-td]", el).forEach((b) => b.onclick = () => { const t = get(b.dataset.td); templateEditor({ ...t, id: null, name: t.name + " (copy)", is_shared: false, owner_id: S.me.id }, () => viewTemplates(el)); });
  $$("[data-tv]", el).forEach((b) => b.onclick = () => { const t = get(b.dataset.tv); modal({ title: t.name, wide: true, body: `${t.subject ? `<p><b>Subject:</b> ${h(fillTemplate(t.subject, sample))}</p>` : ""}<div class="script" style="background:var(--surface);border:1px solid var(--line)">${mdToHtml(fillTemplate(t.body, sample))}</div><p class="mu" style="font-size:12px">Preview sample data ke saath.</p>` }); });
  $$("[data-tx]", el).forEach((b) => b.onclick = async () => {
    if (!(await confirmBox(`"${get(b.dataset.tx).name}" delete karna hai?`, "Delete"))) return;
    const { error } = await sb.from("message_templates").delete().eq("id", +b.dataset.tx); if (error) return fail(error);
    tplAt = 0; toast("Deleted"); viewTemplates(el);
  });
}
function templateEditor(t, done) {
  const isEmail = t.channel === "email";
  const m = modal({
    title: t.id ? "Template edit" : "Naya template", wide: true,
    body: `<div class="grid3">
      <div><label class="f">Naam *</label><input class="input" id="eN" maxlength="80" value="${h(t.name || "")}"></div>
      <div><label class="f">Kahan use ho</label><select class="input" id="eU">${[["any", "Leads + RFQs"], ["lead", "Sirf leads"], ["rfq", "Sirf RFQs"]].map(([k, l]) => `<option value="${k}" ${k === (t.use_for || "any") ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div><label class="f">Auto-select stage</label><select class="input" id="eS"><option value="">—</option>${[["new", "Naya lead"], ["followup", "Follow-up (reply nahi aaya)"], ["interested", "Interested"], ["quote", "Quote bheja"], ["demo", "Demo / meeting"], ["rfq", "RFQ"]].map(([k, l]) => `<option value="${k}" ${k === t.stage ? "selected" : ""}>${l}</option>`).join("")}</select></div></div>
      ${isEmail ? `<label class="f">Subject</label><input class="input" id="eSub" maxlength="300" value="${h(t.subject || "")}">` : ""}
      <div class="row" style="margin:12px 0 4px"><label class="f" style="margin:0">Message</label><span style="flex:1"></span>
        <select class="input" id="eVar" style="width:auto;height:28px"><option value="">+ Variable daalo</option>${TPL_VARS.map((v) => `<option>${v}</option>`).join("")}</select>
        <button type="button" class="btn sm" id="eB"><b>B</b></button></div>
      <textarea class="input" id="eBody" style="min-height:300px;font-size:13.5px">${h(t.body || "")}</textarea>
      <p class="mu" style="font-size:12px"><span class="mono">**bold**</span> · <span class="mono">{{contact_name|Sir/Madam}}</span> = contact naam, nahi ho toh "Sir/Madam"</p>
      ${isMgr() ? `<label class="check"><input type="checkbox" id="eSh" ${t.is_shared ? "checked" : ""}> Company template (poori team dekh payegi)</label>` : ""}`,
    foot: `<button class="btn" data-close>Cancel</button><button class="btn primary" id="eGo">Save</button>`,
  });
  const ta = $("#eBody", m);
  $("#eVar", m).onchange = (e) => { if (!e.target.value) return; ta.setRangeText(`{{${e.target.value}}}`, ta.selectionStart, ta.selectionEnd, "end"); e.target.value = ""; ta.focus(); };
  $("#eB", m).onclick = () => { const a = ta.selectionStart, b = ta.selectionEnd; if (a === b) return; ta.setRangeText("**" + ta.value.slice(a, b) + "**", a, b, "select"); };
  $("#eGo", m).onclick = (e) => busy(e.target, async () => {
    const row = { channel: t.channel, name: $("#eN", m).value.trim(), use_for: $("#eU", m).value, stage: $("#eS", m).value || null,
      subject: isEmail ? $("#eSub", m).value.trim() || null : null, body: ta.value.trim(), is_shared: isMgr() ? $("#eSh", m).checked : false };
    if (!row.name || !row.body) return toast("Naam aur message zaroori hain", true);
    const res = t.id ? await sb.from("message_templates").update(row).eq("id", t.id) : await sb.from("message_templates").insert({ ...row, owner_id: S.me.id });
    if (res.error) throw res.error;
    tplAt = 0; closeModal(); toast("Template saved ✔"); done?.();
  });
}

// ---------------------------------------------------------------------
//  INBOX (replies) + SENT + FOLLOW-UP DUE
// ---------------------------------------------------------------------
const IB = { tab: "replies", f: "open", team: false, q: "" };
export async function viewInbox(el, params = {}) {
  const team = IB.team && isMgr();
  const { data: ms } = await sb.rpc("mail_status");
  let rows = [], sentRows = [];
  if (IB.tab === "replies") {
    let q = sb.from("email_messages").select("id, user_id, lead_id, rfq_id, counterpart, counterpart_name, subject, snippet, intent, is_read, archived, created_at, thread_url, provider, leads(company, status, owner_id)")
      .eq("direction", "in").order("created_at", { ascending: false }).limit(300);
    if (!team) q = q.eq("user_id", S.me.id);
    if (IB.f === "archived") q = q.eq("archived", true); else q = q.eq("archived", false);
    if (IB.f === "unread") q = q.eq("is_read", false);
    if (IB.f === "action") q = q.in("intent", ["interested", "quote_request"]);
    if (IB.f === "no") q = q.eq("intent", "not_interested");
    if (IB.f === "auto") q = q.in("intent", ["auto_reply", "bounce"]);
    if (IB.f === "open") q = q.not("intent", "in", "(auto_reply,bounce)");
    const { data, error } = await q; if (error) throw error; rows = data || [];
  } else {
    let q = sb.from("email_messages").select("id, user_id, lead_id, rfq_id, counterpart, subject, created_at, bulk, direction, leads(company, status, owner_id, reply_count, last_reply_at)")
      .eq("direction", "out").order("created_at", { ascending: false }).limit(400);
    if (!team) q = q.eq("user_id", S.me.id);
    const { data, error } = await q; if (error) throw error;
    const { data: ins } = await sb.from("email_messages").select("counterpart, created_at").eq("direction", "in").gte("created_at", new Date(Date.now() - 120 * 864e5).toISOString()).limit(2000);
    const lastIn = {}; (ins || []).forEach((r) => { const k = r.counterpart; if (!lastIn[k] || r.created_at > lastIn[k]) lastIn[k] = r.created_at; const d = k.split("@")[1]; if (d && (!lastIn["@" + d] || r.created_at > lastIn["@" + d])) lastIn["@" + d] = r.created_at; });
    sentRows = (data || []).map((r) => {
      const first = r.counterpart.split(/[,;\s]+/)[0], d = first.split("@")[1];
      const rep = [lastIn[first], lastIn["@" + d]].filter((x) => x && x > r.created_at).sort()[0];
      return { ...r, replied: rep, age: (Date.now() - new Date(r.created_at)) / 864e5 };
    });
    if (IB.tab === "due") {
      const seen = new Set();
      sentRows = sentRows.filter((r) => !r.replied && r.age >= 3 && r.lead_id && !["won", "lost", "junk"].includes(r.leads?.status) && !seen.has(r.lead_id) && seen.add(r.lead_id));
    }
  }
  const s = IB.q.toLowerCase();
  if (s) { rows = rows.filter((r) => [r.counterpart, r.counterpart_name, r.subject, r.snippet, r.leads?.company].join(" ").toLowerCase().includes(s)); sentRows = sentRows.filter((r) => [r.counterpart, r.subject, r.leads?.company].join(" ").toLowerCase().includes(s)); }
  const msOk = ms?.connected, outlookReady = !!CONFIG.MS_CLIENT_ID;
  el.innerHTML = `
  <div class="card" style="padding:12px 16px;margin-bottom:14px"><div class="row">
    <b>📬 Reply sync</b>
    <span class="badge ${msOk ? "good" : ""}">Gmail: ${msOk ? "connected" + (ms.last_sync ? " · " + h(ago(ms.last_sync)) : "") : "setup nahi"}</span>
    ${outlookReady ? `<span class="badge ${outlookConnected() ? "good" : ""}">Outlook: ${outlookConnected() ? "connected" : "connect nahi"}</span>` : ""}
    <span class="sp" style="flex:1"></span>
    <button class="btn sm" id="ibGmail">${msOk ? "Gmail setup dobara" : "🔗 Gmail connect"}</button>
    ${outlookReady ? `<button class="btn sm" id="ibOutlook">${outlookConnected() ? "🔄 Outlook sync" : "🔗 Outlook connect"}</button>` : `<button class="btn sm ghost" id="ibOutHelp">Outlook?</button>`}
  </div></div>
  <div class="toolbar">
    <div class="chips">${[["replies", "📩 Replies"], ["sent", "📤 Sent"], ["due", "⏰ Follow-up due"]].map(([k, l]) => `<button class="chip ${IB.tab === k ? "on" : ""}" data-ibt="${k}">${l}</button>`).join("")}</div>
    ${IB.tab === "replies" ? `<select class="input" id="ibF" style="width:auto">${[["open", "Saare replies"], ["unread", "Unread"], ["action", "Interested / Quote"], ["no", "Not interested"], ["auto", "Auto-reply / Bounce"], ["archived", "Archived"]].map(([k, l]) => `<option value="${k}" ${IB.f === k ? "selected" : ""}>${l}</option>`).join("")}</select>` : ""}
    <input class="input grow" id="ibQ" placeholder="Search company, email, subject…" value="${h(IB.q)}">
    ${isMgr() ? `<div class="chips"><button class="chip ${team ? "" : "on"}" data-ibm="0">Mere</button><button class="chip ${team ? "on" : ""}" data-ibm="1">Team</button></div>` : ""}
  </div>
  ${IB.tab === "replies" ? `<div class="inbox"><div class="card ib-list" id="ibList">${rows.map((r) => `
      <div class="ib-item ${r.is_read ? "" : "unread"} ${String(r.id) === String(params.id) ? "on" : ""}" data-ib="${r.id}">
        <div class="row" style="flex-wrap:nowrap;gap:6px">${r.is_read ? "" : '<span class="dot on" style="background:var(--accent);box-shadow:none"></span>'}<b class="ib-co">${h(r.leads?.company || r.counterpart_name || r.counterpart)}</b><span class="mu" style="font-size:12px;margin-left:auto;white-space:nowrap">${h(ago(r.created_at))}</span></div>
        <div class="ib-sub">${h(r.subject || "(no subject)")}</div>
        <div class="ib-snip">${h(r.snippet || "")}</div>
        <div class="row" style="gap:6px;margin-top:4px">${intentBadge(r.intent)}${team ? `<span class="mu" style="font-size:12px">${h(userName(r.user_id))}</span>` : ""}</div>
      </div>`).join("") || `<div class="empty"><b>Abhi koi reply nahi</b>${msOk || outlookConnected() ? "Jin companies ko CRM se mail kiya hai, unke reply yahan aayenge." : "Pehle upar se Gmail / Outlook connect karo."}</div>`}</div>
    <div class="card ib-read" id="ibRead"><div class="empty">← Koi reply select karo</div></div></div>`
  : `<div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Company</th><th>To</th><th>Subject</th><th>Bheja</th><th>Status</th>${team ? "<th>By</th>" : ""}<th></th></tr></thead><tbody>
    ${sentRows.map((r) => `<tr data-lid="${r.lead_id || ""}"><td class="co">${h(r.leads?.company || "—")}${r.bulk ? ' <span class="badge">bulk</span>' : ""}</td><td class="sub">${h(r.counterpart)}</td><td>${h(r.subject || "")}</td><td class="sub">${h(ago(r.created_at))}</td>
      <td>${r.replied ? '<span class="badge good">✅ Reply aaya</span>' : r.age >= 3 ? `<span class="badge warn">⏳ ${Math.floor(r.age)} din, no reply</span>` : '<span class="badge">Waiting</span>'}</td>
      ${team ? `<td class="sub">${h(userName(r.user_id))}</td>` : ""}
      <td>${r.lead_id && !r.replied ? `<button class="btn sm" data-fu="${r.lead_id}">Follow-up bhejo</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="7" class="empty">${IB.tab === "due" ? "Koi pending follow-up nahi 🎉" : "Abhi tak CRM se koi email nahi gaya"}</td></tr>`}
    </tbody></table></div></div>`}`;

  $$("[data-ibt]", el).forEach((b) => b.onclick = () => { IB.tab = b.dataset.ibt; viewInbox(el); });
  $$("[data-ibm]", el).forEach((b) => b.onclick = () => { IB.team = b.dataset.ibm === "1"; viewInbox(el); });
  $("#ibF", el)?.addEventListener("change", (e) => { IB.f = e.target.value; viewInbox(el); });
  let t; $("#ibQ", el).oninput = (e) => { clearTimeout(t); t = setTimeout(() => { IB.q = e.target.value; viewInbox(el).then(() => { const i = $("#ibQ", el); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 350); };
  $("#ibGmail", el).onclick = gmailSetup;
  $("#ibOutlook", el)?.addEventListener("click", (e) => busy(e.target, async () => { const n = await outlookSync(true); toast(`Outlook sync: ${n} naye replies`); viewInbox(el); }));
  $("#ibOutHelp", el)?.addEventListener("click", outlookHelp);
  $$("[data-ib]", el).forEach((d) => d.onclick = () => { $$(".ib-item", el).forEach((x) => x.classList.remove("on")); d.classList.add("on"); d.classList.remove("unread"); history.replaceState(null, "", "#/inbox/" + d.dataset.ib); readMail(+d.dataset.ib, $("#ibRead", el), () => viewInbox(el, { id: d.dataset.ib })); });
  $$("[data-fu]", el).forEach((b) => b.onclick = async (e) => { e.stopPropagation(); await followupFor(+b.dataset.fu); });
  $$("tr[data-lid]", el).forEach((tr) => tr.onclick = () => tr.dataset.lid && HOOK.openLead(+tr.dataset.lid));
  if (params.id && IB.tab === "replies") readMail(+params.id, $("#ibRead", el), () => viewInbox(el, params));
}

async function followupFor(leadId) {
  const { data: lead, error } = await sb.from("leads").select("*").eq("id", leadId).single();
  if (error) return fail(error);
  if (!(await ensureWork("lead", lead))) return;
  openComposer({ channel: "email", lead: { ...lead, reply_count: 0, email_count: Math.max(1, lead.email_count) } });
}

async function readMail(id, pane, refresh) {
  pane.innerHTML = `<div class="empty">Loading…</div>`;
  const { data: r, error } = await sb.from("email_messages").select("*, leads(id, company, status, owner_id, lock_until, contact_name, email, phone, products, next_follow_up, email_count, reply_count, last_emailed_at, alt_phones, category, city, area), rfqs(id, rfq_no, company, product, qty, contact, email, phone, city, owner_id, lock_until, last_emailed_at)").eq("id", id).single();
  if (error) { pane.innerHTML = `<div class="empty">Message nahi mila</div>`; return; }
  if (!r.is_read && r.user_id === S.me.id) { sb.from("email_messages").update({ is_read: true }).eq("id", id).then(() => HOOK.refreshBadges()); }
  const lead = r.leads, mine = r.user_id === S.me.id;
  pane.innerHTML = `
    <div class="ib-head"><div class="row" style="flex-wrap:nowrap;align-items:flex-start"><div style="min-width:0;flex:1">
      <h3 style="margin:0 0 4px;font-size:16px">${h(r.subject || "(no subject)")}</h3>
      <div class="mu" style="font-size:13px"><b style="color:var(--tx)">${h(r.counterpart_name || "")}</b> &lt;${h(r.counterpart)}&gt; · ${h(dt(r.created_at))}${!mine ? " · " + h(userName(r.user_id)) + " ko" : ""}</div>
      <div class="row" style="margin-top:6px;gap:6px">${intentBadge(r.intent)}${lead ? `<a href="#" data-ol="${lead.id}" class="badge info">📋 ${h(lead.company)} · ${h(STATUS[lead.status]?.l || lead.status)}</a>` : ""}${r.rfqs ? `<span class="badge">${h(r.rfqs.rfq_no)}</span>` : ""}</div></div>
      ${r.thread_url ? `<a class="btn sm" href="${h(r.thread_url)}" target="_blank" rel="noopener noreferrer">${r.provider === "outlook" ? "Outlook" : "Gmail"} mein kholo ↗</a>` : ""}</div></div>
    <div class="ib-body">${h(r.body || r.snippet || "").replace(/\n/g, "<br>")}</div>
    ${mine ? `<div class="ib-actions">
      <button class="btn primary" data-a="reply">${ic("mail")} Reply</button>
      ${lead ? `<button class="btn" data-a="wa">${ic("wa")} WhatsApp</button>` : ""}
      ${lead ? `<button class="btn" data-a="int">🔥 Interested mark</button><button class="btn" data-a="rfq">${ic("inbox")} RFQ banao</button><button class="btn" data-a="fu">⏰ Kal follow-up</button><button class="btn danger" data-a="no">🚫 Not interested</button>` : ""}
      <span style="flex:1"></span>
      <select class="input" data-a="intent" style="width:auto;height:30px" aria-label="Tag">${Object.entries(INTENT).map(([k, [l]]) => `<option value="${k}" ${k === (r.intent || "other") ? "selected" : ""}>${l}</option>`).join("")}</select>
      <button class="btn ghost" data-a="unread">Unread</button><button class="btn ghost" data-a="arch">${r.archived ? "Unarchive" : "Archive"}</button>
    </div>` : ""}`;
  pane.querySelector("[data-ol]")?.addEventListener("click", (e) => { e.preventDefault(); HOOK.openLead(lead.id); });
  const act = async (a) => {
    if (a === "reply") {
      if (lead && !canWork(lead) && !lockOf(lead).free) return openComposer({ channel: "email", reply: r, onSent: refresh });
      if (lead && lockOf(lead).free) await ensureWork("lead", lead);
      return openComposer({ channel: "email", reply: r, lead: lead || undefined, rfq: r.rfqs || undefined, onSent: refresh });
    }
    if (a === "unread") { await sb.from("email_messages").update({ is_read: false }).eq("id", id); HOOK.refreshBadges(); return refresh(); }
    if (a === "arch") { await sb.from("email_messages").update({ archived: !r.archived }).eq("id", id); toast(r.archived ? "Inbox mein wapas" : "Archived"); return refresh(); }
    if (!lead || !(await ensureWork("lead", lead))) return;
    if (a === "wa") return openComposer({ channel: "whatsapp", lead });
    if (a === "int" || a === "no") {
      const st = a === "int" ? "interested" : "lost";
      const { error: e1 } = await sb.from("leads").update({ status: st, ...(a === "int" ? { next_follow_up: new Date(Date.now() + 864e5).toISOString() } : {}) }).eq("id", lead.id);
      if (e1) return fail(e1);
      await sb.from("activities").insert({ lead_id: lead.id, kind: "status", body: `Status → ${STATUS[st].l} (email reply se)` });
      await sb.from("email_messages").update({ intent: a === "int" ? "interested" : "not_interested" }).eq("id", id);
      toast(`${lead.company} → ${STATUS[st].l}`); HOOK.softRefresh(); return refresh();
    }
    if (a === "fu") {
      const { error: e1 } = await sb.from("leads").update({ next_follow_up: new Date(Date.now() + 864e5).toISOString() }).eq("id", lead.id);
      if (e1) return fail(e1); toast("⏰ Kal ka follow-up set"); return;
    }
    if (a === "rfq") return HOOK.openRfq?.({ lead_id: lead.id, company: lead.company, contact: r.counterpart_name || lead.contact_name, email: r.counterpart, phone: lead.phone, city: lead.city, details: (r.body || "").slice(0, 3000), product: "" });
  };
  $$("[data-a]", pane).forEach((b) => b.tagName === "SELECT"
    ? b.addEventListener("change", async () => { await sb.from("email_messages").update({ intent: b.value }).eq("id", id); toast("Tag updated"); })
    : b.addEventListener("click", () => act(b.dataset.a).catch(fail)));
}

// ---------------------------------------------------------------------
//  Gmail connect (personal Google Apps Script — no Google app approval needed)
// ---------------------------------------------------------------------
function appsScript(token) {
  const url = CONFIG.SUPABASE_URL + "/functions/v1/mail-sync";
  return `// Genesis CRM — Gmail reply sync for ${S.me.email}
// Sirf un addresses ke replies CRM ko bhejta hai jinko aapne CRM se email kiya hai.
const CRM_URL = "${url}";
const TOKEN = "${token}";   // personal — kisi ke saath share mat karo

function setup() {                       // ▶ ek baar ye function Run karo
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("syncReplies").timeBased().everyMinutes(10).create();
  syncReplies();
}

function call_(action, payload) {
  var res = UrlFetchApp.fetch(CRM_URL + "?action=" + action, {
    method: "post", contentType: "application/json", headers: { "x-mail-token": TOKEN },
    payload: JSON.stringify(payload || {}), muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) throw new Error("CRM " + res.getResponseCode() + ": " + res.getContentText());
  return JSON.parse(res.getContentText());
}

function syncReplies() {
  var w = call_("watchlist");
  var who = (w.emails || []).concat(w.domains || []);
  if (!who.length) return;
  var props = PropertiesService.getUserProperties();
  var since = Number(props.getProperty("since") || (Date.now() - 3 * 864e5));
  var after = Math.floor((since - 2 * 3600e3) / 1000);
  var me = Session.getActiveUser().getEmail().toLowerCase();
  var out = [];
  for (var i = 0; i < who.length; i += 25) {
    var q = "from:(" + who.slice(i, i + 25).join(" OR ") + ") after:" + after + " -in:sent -in:chats";
    GmailApp.search(q, 0, 100).forEach(function (th) {
      th.getMessages().forEach(function (m) {
        if (m.getDate().getTime() < since - 2 * 3600e3) return;
        if (m.getFrom().toLowerCase().indexOf(me) >= 0) return;
        out.push({ id: m.getId(), thread_id: th.getId(), from: m.getFrom(), to: m.getTo(), subject: m.getSubject(),
                   date: m.getDate().toISOString(), body: m.getPlainBody().slice(0, 15000) });
      });
    });
  }
  for (var j = 0; j < out.length; j += 100) call_("push", { provider: "gmail", messages: out.slice(j, j + 100) });
  props.setProperty("since", String(Date.now()));
}
`;
}
export function gmailSetup() {
  const m = modal({
    title: "🔗 Gmail replies connect karo", wide: true,
    body: `<p>Ye aapke <b>apne Gmail</b> mein ek chhota script lagata hai jo har 10 minute mein check karta hai ki jin companies ko aapne CRM se mail kiya, unka reply aaya ya nahi — aur sirf wahi replies yahan dikhata hai. Koi aur email CRM mein nahi aata.</p>
      <ol style="padding-left:18px;line-height:1.7">
        <li>Neeche <b>Code banao</b> dabao aur code copy karo.</li>
        <li><a href="https://script.google.com/home/projects/create" target="_blank" rel="noopener noreferrer">script.google.com → New project</a> kholo (usi Gmail account se jisse mail bhejte ho).</li>
        <li>Wahan ka sara code hata ke ye code paste karo → 💾 Save.</li>
        <li>Upar function list mein <b>setup</b> select karke <b>▶ Run</b> dabao → <b>Review permissions</b> → apna account → <i>Advanced → Go to project</i> → <b>Allow</b>.</li>
        <li>Bas! 10 minute mein pehli sync ho jayegi. Status yahan Inbox mein dikhega.</li>
      </ol>
      <div id="gsCode"></div>
      <p class="mu" style="font-size:12.5px">🔒 Code mein aapka personal token hai. Naya code banane se purana token band ho jata hai.</p>`,
    foot: `<button class="btn" data-close>Close</button><button class="btn primary" id="gsGo">Code banao</button>`,
  });
  $("#gsGo", m).onclick = (e) => busy(e.target, async () => {
    const { data: token, error } = await sb.rpc("rotate_mail_token"); if (error) throw error;
    const code = appsScript(token);
    $("#gsCode", m).innerHTML = `<div class="row" style="margin-bottom:6px"><b>Apps Script code</b><span style="flex:1"></span><button class="btn sm primary" id="gsCopy">${ic("copy")} Copy code</button></div><pre class="log" style="max-height:260px">${h(code)}</pre>`;
    $("#gsCopy", m).onclick = async () => { try { await navigator.clipboard.writeText(code); toast("Code copied ✔"); } catch { toast("Copy nahi hua — select karke copy karo", true); } };
    e.target.textContent = "Naya code banao";
  });
}

// ---------------------------------------------------------------------
//  Outlook / Microsoft 365 (Microsoft Graph, read-only Mail.Read)
// ---------------------------------------------------------------------
let pca = null, outlookTimer = null;
const outlookConnected = () => { try { return !!sessionStorage.getItem("crm_ol"); } catch { return false; } };
async function msal() {
  if (pca) return pca;
  await loadScript("msal-browser.min.js");
  const base = location.origin + location.pathname.replace(/[^/]*$/, "");
  pca = new window.msal.PublicClientApplication({
    auth: { clientId: CONFIG.MS_CLIENT_ID, authority: "https://login.microsoftonline.com/" + (CONFIG.MS_TENANT_ID || "organizations"), redirectUri: base + "auth-redirect.html" },
    cache: { cacheLocation: "sessionStorage" },
  });
  await pca.initialize();
  return pca;
}
async function graphToken(interactive) {
  const p = await msal(), req = { scopes: ["Mail.Read"] };
  const acc = p.getActiveAccount() || p.getAllAccounts()[0];
  if (acc) { try { return (await p.acquireTokenSilent({ ...req, account: acc })).accessToken; } catch (e) { if (!interactive) throw e; } }
  if (!interactive) throw new Error("Outlook login chahiye");
  const r = await p.loginPopup({ ...req, loginHint: S.me.email, prompt: "select_account" });
  p.setActiveAccount(r.account);
  return (await p.acquireTokenSilent({ ...req, account: r.account })).accessToken;
}
export async function outlookSync(interactive = false) {
  if (!CONFIG.MS_CLIENT_ID) return 0;
  const token = await graphToken(interactive);
  try { sessionStorage.setItem("crm_ol", "1"); } catch { /* ignore */ }
  const { data: w, error } = await sb.functions.invoke("mail-sync?action=watchlist", { body: {} });
  if (error) throw error;
  const who = new Set(w.emails || []), doms = new Set(w.domains || []);
  if (!who.size && !doms.size) return 0;
  const since = new Date(Date.now() - 14 * 864e5).toISOString();
  let url = `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$filter=receivedDateTime ge ${since}&$orderby=receivedDateTime desc&$top=50&$select=id,conversationId,subject,from,receivedDateTime,body,webLink`;
  const out = [];
  for (let page = 0; url && page < 8; page++) {
    const r = await fetch(url, { headers: { Authorization: "Bearer " + token, Prefer: 'outlook.body-content-type="text"' } });
    if (!r.ok) throw new Error("Outlook " + r.status);
    const j = await r.json();
    for (const msg of j.value || []) {
      const a = (msg.from?.emailAddress?.address || "").toLowerCase();
      if (!a || !(who.has(a) || doms.has(a.split("@")[1]))) continue;
      out.push({ id: msg.id, thread_id: msg.conversationId, thread_url: msg.webLink, from: `${msg.from.emailAddress.name || ""} <${a}>`, subject: msg.subject, date: msg.receivedDateTime, body: (msg.body?.content || "").slice(0, 15000) });
    }
    url = j["@odata.nextLink"];
  }
  let n = 0;
  for (let i = 0; i < out.length; i += 100) {
    const { data, error: e2 } = await sb.functions.invoke("mail-sync?action=push", { body: { provider: "outlook", messages: out.slice(i, i + 100) } });
    if (e2) throw e2; n += data?.inserted || 0;
  }
  return n;
}
export function startOutlookAutoSync() {
  clearInterval(outlookTimer);
  if (!CONFIG.MS_CLIENT_ID || !outlookConnected()) return;
  outlookTimer = setInterval(() => { if (!document.hidden) outlookSync(false).then((n) => { if (n) { toast(`📩 ${n} naye Outlook replies`); HOOK.refreshBadges(); } }).catch(() => {}); }, 5 * 60e3);
}
function outlookHelp() {
  modal({ title: "Outlook / Microsoft 365 replies", body: `<p>Outlook replies padhne ke liye Admin ko ek baar Microsoft (Azure) mein free app register karni hogi (5 minute). Steps <span class="mono">SETUP.md → Outlook</span> mein hain. Uske baad <span class="mono">config.js</span> mein <span class="mono">MS_CLIENT_ID</span> daalte hi yahan "Outlook connect" button aa jayega.</p><p class="mu">Gmail / Google Workspace wale abhi “Gmail connect” use kar sakte hain.</p>` });
}

// ---------------------------------------------------------------------
//  NOTIFICATIONS (bell) + ACCESS REQUESTS
// ---------------------------------------------------------------------
export async function unreadCounts() {
  const [n, r] = await Promise.all([
    sb.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", S.me.id).eq("is_read", false),
    sb.from("email_messages").select("id", { count: "exact", head: true }).eq("user_id", S.me.id).eq("direction", "in").eq("is_read", false).eq("archived", false),
  ]);
  return { notif: n.count || 0, replies: r.count || 0 };
}
export async function toggleNotifications(anchor) {
  const old = $("#notifPanel"); if (old) { old.remove(); return; }
  const { data } = await sb.from("notifications").select("*").eq("user_id", S.me.id).order("created_at", { ascending: false }).limit(40);
  const reqIds = (data || []).filter((n) => n.kind === "lock_request" && n.ref_id).map((n) => n.ref_id);
  const { data: reqs } = reqIds.length ? await sb.from("lock_requests").select("id, status").in("id", reqIds) : { data: [] };
  const pending = new Set((reqs || []).filter((r) => r.status === "pending").map((r) => r.id));
  const p = document.createElement("div"); p.id = "notifPanel"; p.className = "notif-panel card"; p.setAttribute("role", "dialog");
  p.innerHTML = `<div class="card-h"><h3>Notifications</h3><span class="sp"></span><button class="btn sm ghost" id="nAll">Sab read</button></div>
    <div class="notif-list">${(data || []).map((n) => `<div class="notif ${n.is_read ? "" : "unread"}" data-n="${n.id}" data-link="${h(n.link || "")}">
      <b>${h(n.title)}</b><div class="mu" style="font-size:12.5px">${h(n.body || "")}</div><div class="mu" style="font-size:11.5px">${h(ago(n.created_at))}</div>
      ${n.kind === "lock_request" && pending.has(n.ref_id) ? `<div class="row" style="margin-top:6px"><button class="btn sm primary" data-rq="${n.ref_id}" data-ok="1">✅ De do</button><button class="btn sm" data-rq="${n.ref_id}" data-ok="0">Mana karo</button></div>` : ""}
    </div>`).join("") || '<div class="empty">Koi notification nahi</div>'}</div>`;
  document.body.append(p);
  const r = anchor.getBoundingClientRect();
  p.style.top = r.bottom + 8 + "px"; p.style.right = Math.max(8, innerWidth - r.right) + "px";
  const close = (e) => { if (!p.contains(e.target) && !anchor.contains(e.target)) { p.remove(); document.removeEventListener("click", close, true); } };
  setTimeout(() => document.addEventListener("click", close, true), 0);
  $("#nAll", p).onclick = async () => { await sb.from("notifications").update({ is_read: true }).eq("user_id", S.me.id).eq("is_read", false); p.remove(); HOOK.refreshBadges(); };
  $$("[data-rq]", p).forEach((b) => b.onclick = (e) => { e.stopPropagation(); decide(+b.dataset.rq, b.dataset.ok === "1").then(() => { p.remove(); }); });
  $$("[data-n]", p).forEach((d) => d.onclick = async () => {
    sb.from("notifications").update({ is_read: true }).eq("id", +d.dataset.n).then(() => HOOK.refreshBadges());
    p.remove(); if (d.dataset.link) HOOK.go(d.dataset.link);
  });
}
export async function decide(reqId, approve) {
  const { data, error } = await sb.rpc("decide_request", { p_req: reqId, p_approve: approve });
  if (error) return fail(error);
  toast(data?.ok ? (approve ? "✅ Lock transfer ho gaya" : "Request decline ki") : "Request ab pending nahi hai", !data?.ok);
  HOOK.softRefresh(); HOOK.refreshBadges();
}
export async function viewRequests(el) {
  const { data, error } = await sb.from("lock_requests").select("*").order("created_at", { ascending: false }).limit(200);
  if (error) throw error;
  const leadIds = data.filter((r) => r.entity === "lead").map((r) => r.entity_id), rfqIds = data.filter((r) => r.entity === "rfq").map((r) => r.entity_id);
  const [{ data: ls }, { data: rs }] = await Promise.all([
    leadIds.length ? sb.from("leads").select("id, company").in("id", leadIds) : { data: [] },
    rfqIds.length ? sb.from("rfqs").select("id, company, rfq_no").in("id", rfqIds) : { data: [] }]);
  const nm = (r) => r.entity === "lead" ? (ls || []).find((x) => x.id === r.entity_id)?.company : ((x) => x && `${x.rfq_no} · ${x.company}`)((rs || []).find((x) => x.id === r.entity_id));
  const sec = (title, list, mineAsHolder) => `<div class="sec-t" style="margin-top:18px">${title} (${list.length})</div><div class="card">${list.map((r) => `
    <div class="row" style="padding:11px 16px;border-bottom:1px solid var(--line);flex-wrap:nowrap">
      <div style="flex:1;min-width:0"><b>${h(nm(r) || r.entity + " #" + r.entity_id)}</b> <span class="badge">${r.entity === "lead" ? "Lead" : "RFQ"}</span>
        <div class="mu" style="font-size:12.5px">${mineAsHolder ? h(userName(r.requester)) + " maang raha/rahi hai" : "Holder: " + h(userName(r.holder))}${r.note ? ` — “${h(r.note)}”` : ""} · ${h(ago(r.created_at))}</div></div>
      ${r.status === "pending" && (mineAsHolder || isMgr()) && r.requester !== S.me.id ? `<button class="btn sm primary" data-ok="1" data-rq="${r.id}">✅ De do</button><button class="btn sm" data-ok="0" data-rq="${r.id}">Mana</button>` : `<span class="badge ${r.status === "approved" ? "good" : r.status === "pending" ? "warn" : ""}">${h(r.status)}</span>`}
    </div>`).join("") || '<div class="empty" style="padding:16px">—</div>'}</div>`;
  el.innerHTML = sec("🙋 Mujhse maange gaye", data.filter((r) => r.holder === S.me.id && r.status === "pending"), true)
    + sec("📤 Maine maange", data.filter((r) => r.requester === S.me.id), false)
    + (isMgr() ? sec("👥 Team ke pending requests", data.filter((r) => r.status === "pending" && r.holder !== S.me.id && r.requester !== S.me.id), true) : "");
  $$("[data-rq]", el).forEach((b) => b.onclick = () => decide(+b.dataset.rq, b.dataset.ok === "1").then(() => viewRequests(el)));
}
export function requestAccess(entity, row) {
  const k = lockOf(row);
  const m = modal({
    title: `🙋 ${k.holder} se access maango`,
    body: `<p><b>${h(row.company)}</b> abhi <b>${h(k.holder)}</b> ke paas locked hai (till ${h(dt(k.until))}). Request bhejne pe unhe notification jayega; wo approve karenge toh lock aapke naam ho jayega.</p>
      <label class="f">Reason (optional)</label><input class="input" id="raN" maxlength="300" placeholder="e.g. Ye mera purana client hai / unhone mujhe call kiya">`,
    foot: `<button class="btn" data-close>Cancel</button><button class="btn primary" id="raGo">Request bhejo</button>`,
  });
  $("#raGo", m).onclick = (e) => busy(e.target, async () => {
    const { data, error } = await sb.rpc("request_access", { p_entity: entity, p_id: row.id, p_note: $("#raN", m).value.trim() || null });
    if (error) throw error;
    closeModal();
    toast(data?.reason === "free" ? "Lead ab free hai — seedha lock kar lo" : data?.duplicate ? "Request pehle se bheji hui hai" : `Request ${k.holder} ko bhej di ✔`);
  });
}
