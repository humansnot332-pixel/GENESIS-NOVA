// =====================================================================
//  Genesis CRM — communications: email / WhatsApp composer, templates,
//  replies inbox (Gmail via Apps Script, Outlook via Microsoft Graph),
//  notifications and lock access-requests.
// =====================================================================
import {
  sb, S, h, ic, dt, ago, toast, fail, modal, closeModal, confirmBox, busy, isMgr, isAdmin, userName, ROLE,
  STATUS, OPEN_STATUSES, HOOK, lockOf, canWork, claim, claimFailMsg, claimOkMsg, tplContext, TPL_VARS, fillTemplate,
  mdToPlain, mdToHtml, mdToWhatsApp, composeUrl, URL_LIMIT, waUrl, openTab, copyRich, loadScript, isMobile, callFn, bannerHtml, bannerUrl, bannerOn, toastAction,
} from "./core.js";
import { L, isEn, getLang } from "./i18n.js";
import { CONFIG } from "./config.js";
import { filesHtml, wireFiles, loadFiles } from "./files.js";
import { blobB64, saveBlob } from "./qpdf.js";
import { loadCatalog, productMessage, templateFit, productPicker, detectItems, replyDrafts } from "./lprod.js";

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
  if (k.other) { toast(L(`🔒 ${k.holder} is pe kaam kar raha hai — pehle "Request access" karo`, `🔒 ${k.holder} is working on this — send a "Request access" first`), true); return false; }
  const r = await claim(entity, row.id);
  if (!r.ok) { toast(claimFailMsg(r), true); return false; }
  row.owner_id = S.me.id; row.lock_until = r.until;
  toast(claimOkMsg(r, entity === "rfq" ? "RFQ" : "Lead"));
  HOOK.softRefresh();
  return true;
}

// ---------------------------------------------------------------------
//  Mail open tracking: an invisible 1×1 image + tracked links in every mail
//  made from the CRM (→ edge function mail-open → popup for the sender)
// ---------------------------------------------------------------------
const TRACK_URL = () => String(CONFIG.SUPABASE_URL || "").replace(/\/$/, "") + "/functions/v1/mail-open";
const trackOn = () => (S.settings?.mail_track || {}).on !== false;
const receiptOn = () => (S.settings?.mail_track || {}).receipt !== false;
function trackToken() {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function trackMail(html) {
  if (!trackOn()) return { html, token: null, links: null };
  const token = trackToken(), links = [], base = TRACK_URL();
  html = html.replace(/(<a\b[^>]*?\bhref=")(https?:\/\/[^"]+)(")/gi, (all, a, url, b) => {
    if (links.length >= 20) return all;
    links.push(url.replace(/&amp;/g, "&"));
    return `${a}${base}?t=${token}&amp;l=${links.length}${b}`;
  });
  html += `<img src="${base}?t=${token}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0">`;
  return { html, token, links: links.length ? links : null };
}
const NO_TRACK = (html) => ({ html, token: null, links: null });

// ---------------------------------------------------------------------
//  Attachments (the quotation PDF): made while the composer is open
// ---------------------------------------------------------------------
const GMAIL_FILES_V = 5;                      // Gmail script version that attaches files to its drafts
const GMAIL_FAST_V = 6;                       // Gmail script version that keeps the banner picture (no download per draft)
// Apps Script sleeps after a few idle minutes and the first call then takes several seconds →
// wake the person's web app as soon as an email window opens, so "Gmail mein kholo" answers fast
let gasWarmAt = 0, gasWarmP = null;
function warmGmail() {
  if (!S.me?.mail_webapp || (S.me.mail_provider || "gmail") === "outlook" || Date.now() - gasWarmAt < 90000) return;
  gasWarmAt = Date.now();
  gasWarmP = fetch(S.me.mail_webapp, { redirect: "follow" }).then((r) => r.json()).catch(() => null);
}
// the quotation PDF goes up for the Gmail script (kept a day) — started while the mail is still open
async function uploadOutPdf(a) {
  const path = `out/${S.me.id}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.pdf`;
  const up = await sb.storage.from("crm-files").upload(path, a.blob, { contentType: "application/pdf", upsert: false });
  if (up.error) throw up.error;
  const sg = await sb.storage.from("crm-files").createSignedUrl(path, 2 * 86400);
  if (sg.error || !sg.data?.signedUrl) throw sg.error || new Error("no link");
  return { name: a.name, url: sg.data.signedUrl, mime: "application/pdf" };
}
const OUTLOOK_MAX = 2.8e6;                    // Graph takes up to ~3 MB of attachment in one draft call
const kb = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB";
// no automatic attaching possible (plain compose link / mail app) → the file is saved on this device to attach by hand
function attachByHand(att) {
  if (!att) return;
  att.then((a) => { saveBlob(a.blob, a.name); toast(L(`📎 ${a.name} download ho gaya — mail mein attach karke Send karo`, `📎 ${a.name} downloaded — attach it to the mail and press Send`), false, 9000); },
    () => toast(L("PDF nahi ban paya — Print se PDF save karke attach karo", "Couldn't make the PDF — save it from Print and attach it"), true));
}

// ---------------------------------------------------------------------
//  Gmail draft with the team banner (made by the person's Gmail script)
// ---------------------------------------------------------------------
function openGmailDraft({ parts, text, toList, cc, bulk, bulkList, lead, opts, tplId, fu, m, att = null, pre = null, scriptV = 0 }) {
  // open the tab now (inside the click) — a tab opened later would be blocked
  const w = window.open("", "_blank");
  try { w.document.title = "Gmail draft…"; w.document.body.innerHTML = `<div style="font:16px/1.5 system-ui,sans-serif;max-width:460px;margin:22vh auto;text-align:center;color:#334">⏳ <b>${L("Gmail draft ban raha hai…", "Making your Gmail draft…")}</b><br><span style="color:#667">${S.me.mail_webapp ? L("Template + Geninfo banner ke saath. Bas 2-3 second…", "With the template + Geninfo banner. Just 2-3 seconds…") : L("Template + Geninfo banner ke saath. ~30 second, ye tab apne aap khul jayega.", "With the template + Geninfo banner. ~30 seconds, this tab opens it automatically.")}</span></div>`; } catch { /* ignore */ }
  const plainUrl = composeUrl("gmail", parts);
  const go = (url) => { if (w && !w.closed) w.location.href = url; else if (!openTab(url)) toastAction(L("Gmail draft ready", "Gmail draft ready"), L("Kholo", "Open"), () => openTab(url), 20000); };
  const html0 = `<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#222">${mdToHtml(text)}${bannerOn() ? bannerHtml() : ""}</div>`;
  const tr = bulk ? NO_TRACK(html0) : trackMail(html0), html = tr.html;   // one draft to many (BCC) can't tell who opened
  // the PDF: kept in storage for a day, the Gmail script fetches it and attaches it to the draft
  let hadFile = false;
  const filesFor = async () => {
    if (!att) return null;
    let a;
    try { a = await att; } catch { toast(L("PDF nahi ban paya — draft bina PDF ke ban raha hai", "Couldn't make the PDF — the draft is made without it"), true); return null; }
    if (scriptV < GMAIL_FILES_V) {
      saveBlob(a.blob, a.name);
      toast(L(`📎 PDF download ho gaya — draft mein attach kar do. Agli baar apne aap lagega: Inbox → Gmail code update karo`, `📎 PDF downloaded — attach it to the draft. To attach it automatically next time: Inbox → update the Gmail code`), true, 12000);
      return null;
    }
    let f = null;
    if (pre) f = await pre.catch(() => null);                 // usually already uploaded while the mail was open
    if (!f) f = await uploadOutPdf(a).catch(() => null);
    if (!f) { saveBlob(a.blob, a.name); toast(L("PDF upload nahi hua — download ho gaya, draft mein attach kar do", "Couldn't upload the PDF — it was downloaded, attach it to the draft"), true, 10000); return null; }
    hadFile = true;
    return [f];
  };
  filesFor().then((files) => sb.from("email_outbox").insert({ kind: "draft", to_addr: parts.to, cc: parts.cc || null, bcc: parts.bcc || null, subject: parts.subject, html, body: parts.body,
    lead_id: !bulk && lead && canWork(lead) ? lead.id : null, ...(files ? { files } : {}) }).select("id").single()).then(async ({ data: row, error }) => {
    if (error) { go(plainUrl); if (hadFile) attachByHand(att); return fail(error); }
    logEmail({ provider: "gmail", subject: parts.subject, text, toList, cc, opts, tplId, bulkList, fu, track: tr }).catch(fail);
    const draftUrl = (d) => `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(d.account || S.me.email)}#drafts?compose=${encodeURIComponent(d.gmail_id || d.msg_id)}`;
    if (S.me.mail_webapp) {
      const find = (j) => (j?.done || []).find((x) => x.id === row.id && x.ok && x.msg_id);
      const warm = gasWarmP;      // a wake-up call still running may be the one that makes this draft
      gasWarmAt = Date.now();
      try {
        const r = await fetch(S.me.mail_webapp, { redirect: "follow" }); const j = await r.json();
        const mine = find(j) || find(await warm);
        if (mine) return go(draftUrl(mine));
      } catch { /* the timer will still pick it up */ }
    }
    const withFile = hadFile;
    toast(withFile ? L("⏳ PDF ke saath Gmail draft ban raha hai — naye tab mein apne aap khulega (kabhi 5 min tak)", "⏳ Making the Gmail draft with the PDF — it opens in the new tab by itself (sometimes up to 5 min)")
                   : L("⏳ Gmail draft ban raha hai — naye tab mein apne aap khulega (~30 sec)", "⏳ Making the Gmail draft — it opens in the new tab automatically (~30 sec)"));
    const t0 = Date.now();
    while (Date.now() - t0 < (withFile ? 330000 : 110000)) {
      await new Promise((r) => setTimeout(r, Date.now() - t0 < 20000 ? 1000 : 2500));
      const { data: d } = await sb.from("email_outbox").select("status, gmail_id, account, error").eq("id", row.id).single();
      if (d?.status === "drafted" && d.gmail_id) return go(draftUrl(d));
      if (d?.status === "failed") { toast(L("Gmail draft nahi bana: ", "Couldn't make the Gmail draft: ") + (d.error || ""), true); if (withFile) attachByHand(att); return go(plainUrl); }
    }
    await sb.from("email_outbox").update({ status: "cancelled" }).eq("id", row.id).eq("status", "queued");
    toast(L("Gmail script jawab nahi de raha — bina banner ke Gmail khol diya", "The Gmail script didn't answer — opened Gmail without the banner"), true);
    if (withFile) attachByHand(att);
    go(plainUrl);
  }).catch((e) => { go(plainUrl); attachByHand(att); fail(e); });
  closeModal();
}

// ---------------------------------------------------------------------
//  Outlook draft (Microsoft Graph): template + banner (inside the mail, so
//  Outlook shows it without "download pictures") + open tracking + read receipt
// ---------------------------------------------------------------------
async function bannerB64() {
  try {
    const r = await fetch(bannerUrl(), { cache: "force-cache" }); if (!r.ok) return null;
    const b = await r.blob(); if (!b.size || b.size > 1.5e6) return null;
    const data = await new Promise((ok, no) => { const f = new FileReader(); f.onload = () => ok(String(f.result).split(",")[1] || ""); f.onerror = no; f.readAsDataURL(b); });
    return data ? { type: (b.type || "image/png").split(";")[0], data } : null;
  } catch { return null; }
}
const graphAddrs = (s) => String(s || "").split(/[,;\s]+/).filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)).map((address) => ({ emailAddress: { address } }));
function openOutlookDraft({ parts, text, toList, cc, bulk, bulkList, opts, tplId, fu, att = null }) {
  // open the tab now (inside the click) — a tab opened later would be blocked
  const w = window.open("", "_blank");
  try { w.document.title = "Outlook draft…"; w.document.body.innerHTML = `<div style="font:16px/1.5 system-ui,sans-serif;max-width:460px;margin:22vh auto;text-align:center;color:#334">⏳ <b>${L("Outlook draft ban raha hai…", "Making your Outlook draft…")}</b><br><span style="color:#667">${L("Template + banner + open tracking ke saath. Bas 2-3 second…", "With the template, the banner and open tracking. Just 2-3 seconds…")}</span></div>`; } catch { /* ignore */ }
  const plainUrl = composeUrl("outlook", parts);
  const go = (url) => { if (w && !w.closed) w.location.href = url; else if (!openTab(url)) toastAction(L("Outlook draft ready", "Outlook draft ready"), L("Kholo", "Open"), () => openTab(url), 20000); };
  const log = (track) => logEmail({ provider: "outlook", subject: parts.subject, text, toList, cc, opts, tplId, bulkList, fu, track }).catch(fail);
  closeModal();
  (async () => {
    let token;
    try { token = await graphToken(false, MAIL_RW); }
    catch {
      go(plainUrl); log(null); attachByHand(att);
      toastAction(L("Outlook mein banner + open tracking ke liye ek baar permission do", "Allow Outlook once for the banner and open tracking"), L("Allow", "Allow"),
        () => graphToken(true, MAIL_RW).then(() => toast(L("✔ Ho gaya — agle mail se banner + tracking", "✔ Done — from the next mail: banner + tracking")), fail), 20000);
      return;
    }
    const img = bannerOn() ? await bannerB64() : null;
    const html0 = `<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#222">${mdToHtml(text)}${bannerOn() ? bannerHtml(img ? "cid:gnbanner" : null) : ""}</div>`;
    const tr = bulk ? NO_TRACK(html0) : trackMail(html0);
    const msg = {
      subject: parts.subject, body: { contentType: "HTML", content: tr.html },
      toRecipients: graphAddrs(parts.to), ccRecipients: graphAddrs(parts.cc), bccRecipients: graphAddrs(parts.bcc),
      isReadReceiptRequested: !!tr.token && receiptOn(),
    };
    if (img) msg.attachments = [{ "@odata.type": "#microsoft.graph.fileAttachment", name: "geninfo-banner." + (img.type.split("/")[1] || "png"), contentType: img.type, contentBytes: img.data, isInline: true, contentId: "gnbanner" }];
    let byHand = null;
    if (att) {
      try {
        const a = await att;
        if (a.bytes <= OUTLOOK_MAX) (msg.attachments ||= []).push({ "@odata.type": "#microsoft.graph.fileAttachment", name: a.name, contentType: "application/pdf", contentBytes: await blobB64(a.blob) });
        else byHand = att;
      } catch { byHand = att; }
    }
    try {
      const r = await fetch("https://graph.microsoft.com/v1.0/me/messages", { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify(msg) });
      if (!r.ok) throw new Error("Outlook " + r.status);
      const d = await r.json();
      if (!d.webLink) throw new Error("Outlook: no draft link");
      go(d.webLink); log(tr); attachByHand(byHand);
    } catch {
      go(plainUrl); log(null); attachByHand(att);
      toast(L("Outlook draft nahi bana — bina banner ke Outlook khola", "Couldn't make the Outlook draft — opened Outlook without the banner"), true);
    }
  })();
}
function outlookTip(m) {
  const box = $("#cSendInfo", m); if (!box || !m.isConnected) return;
  const t = box.querySelector("span"); box.querySelector("button")?.remove();
  if (outlookReady() && outlookConnected()) { box.classList.add("ok"); t.textContent = L("⚡ Outlook mein kholo — draft template + banner + open tracking ke saath turant khulega.", "⚡ Open in Outlook — the draft opens instantly with the template, the banner and open tracking."); return; }
  if (!outlookReady()) { t.innerHTML = L("Outlook mein banner + open tracking ke liye Admin ek baar <b>Outlook setup</b> kare (Company settings).", "For the banner and open tracking in Outlook, an Admin does the <b>Outlook setup</b> once (Company settings)."); return; }
  t.innerHTML = L("Banner + open tracking ke liye <b>Outlook ek baar connect karo</b>.", "For the banner and open tracking, <b>connect Outlook once</b>.");
  const b = document.createElement("button"); b.type = "button"; b.className = "btn sm primary"; b.textContent = L("Connect", "Connect");
  b.onclick = (e) => busy(e.target, async () => { await outlookConnect(); outlookTip(m); }); box.append(b);
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
function tplOptions(list, sel, autoLabel = "") {
  const cur = getLang(), other = cur === "en" ? "hinglish" : "en", nm = { en: "English", hinglish: "Hinglish" };
  const o = (arr) => arr.map((t) => `<option value="${t.id}" ${t.id === sel ? "selected" : ""}>${h(t.name)}</option>`).join("");
  const grp = (label, arr) => (arr.length ? `<optgroup label="${label}">${o(arr)}</optgroup>` : "");
  const lg = (t) => t.lang || "en";
  return (autoLabel ? `<option value="auto" ${sel === "auto" ? "selected" : ""}>✨ ${h(autoLabel)}</option>` : "")
    + `<option value="">— Blank (sirf signature) —</option>`
    + grp(`Company templates · ${nm[cur]}`, list.filter((t) => t.is_shared && lg(t) === cur))
    + grp(`Mere templates · ${nm[cur]}`, list.filter((t) => !t.is_shared && lg(t) === cur))
    + grp(`Company templates · ${nm[other]}`, list.filter((t) => t.is_shared && lg(t) === other))
    + grp(`Mere templates · ${nm[other]}`, list.filter((t) => !t.is_shared && lg(t) === other));
}
const signatureBlock = () => `\n\nBest Regards,\n\n${S.me.full_name}\n${S.me.designation || ROLE[S.me.role] || ""}\nGENESIS INFOSERVE PVT. LTD.\n${S.me.email}${S.me.phone ? "\n" + S.me.phone : ""}`;

// ---------------------------------------------------------------------
//  COMPOSER (email + WhatsApp)
//  opts: { channel, lead?, rfq?, bulk?: lead[], reply?: email row, onSent? }
// ---------------------------------------------------------------------
export async function openComposer(opts) {
  const { channel, lead, rfq, bulk, reply } = opts;
  // the admin may have switched the team banner since this tab loaded → always use the current one
  const freshBanner = channel === "email" ? sb.from("settings").select("value").eq("key", "email_banner").maybeSingle().then(({ data }) => { if (data?.value) S.settings.email_banner = data.value; }, () => {}) : null;
  const [allT] = await Promise.all([loadTemplates(), freshBanner]);
  const all = allT.filter((t) => t.channel === channel && (t.use_for === "any" || t.use_for === (rfq ? "rfq" : "lead")));
  // current-language templates first (auto-picked), the other language still selectable
  const list = [...all.filter((t) => (t.lang || "en") === getLang()), ...all.filter((t) => (t.lang || "en") !== getLang())];
  const stage = opts.stage || pickStage({ channel, lead, rfq, reply });
  const mine = (t) => (t.lang || "en") === getLang();
  const stageT = reply ? null : (list.find((t) => mine(t) && t.is_shared && t.stage === stage) || list.find((t) => mine(t) && t.stage === stage)
    || list.find((t) => t.is_shared && t.stage === stage) || list[0]);
  // the lead's products write the message: a template tagged with those products, else one built from them
  // (only for the selling stages — quotation / RFQ / reply mails keep their own templates)
  const prodOn = !!(lead && !bulk && !reply && !rfq && !opts.attach && !opts.stage);
  let prods = prodOn ? [...(lead.products || [])] : [];
  if (prodOn) await loadCatalog().catch(() => {});
  const sellStage = ["new", "followup", "interested", "demo"].includes(stage);
  const genT = () => ({ id: "auto", ...productMessage({ channel, hinglish: getLang() !== "en", stage, products: prods }) });
  const prodT = () => {
    if (!prods.length) return null;
    const sc = (t) => templateFit(t, prods) * 10 + (t.stage === stage ? 5 : 0) + (t.is_shared ? 1 : 0);
    return list.filter((t) => mine(t) && templateFit(t, prods) > 0 && (!t.stage || t.stage === stage || sellStage)).sort((a, b) => sc(b) - sc(a))[0] || null;
  };
  const pickAuto = () => reply ? null : (prodT() || (prods.length && sellStage ? genT() : stageT));
  const autoLabel = () => prods.length ? `${prods.slice(0, 3).join(", ")}${prods.length > 3 ? ` +${prods.length - 3}` : ""} — ${L("products se bana (auto)", "written from the products (auto)")}` : "";
  const auto = pickAuto();
  const ctx = { ...tplContext({ lead: bulk ? null : lead, rfq }), ...(opts.vars || {}) };
  if (bulk) { ctx.company = L("aapki company", "your organization"); ctx.contact_name = ""; }
  const isEmail = channel === "email";
  const lastMail = lead?.last_emailed_at || rfq?.last_emailed_at;
  const warn = [];
  if (isEmail && lastMail && Date.now() - new Date(lastMail) < 3 * 864e5) warn.push(L(`Is ${rfq ? "RFQ" : "lead"} ko ${ago(lastMail)} email gaya tha — dobara bhejna hai?`, `This ${rfq ? "RFQ" : "lead"} was emailed ${ago(lastMail)} — send again?`));
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
    ${prodOn ? `<div class="cprod" id="cProd"></div><div id="cProdPick" hidden style="margin-top:8px"></div>` : ""}
    <div class="grid2"><div><label class="f" for="cTpl">Template</label><select class="input" id="cTpl">${tplOptions(list, auto?.id, autoLabel())}</select></div>
      ${isEmail ? `<div><label class="f" for="cSub">Subject</label><input class="input" id="cSub" maxlength="300"></div>` : `<div></div>`}</div>
    <div class="row" style="margin:12px 0 4px"><label class="f" style="margin:0" for="cBody">Message</label><span class="sp" style="flex:1"></span>
      <button type="button" class="btn sm" id="cBold" title="Selected text bold"><b>B</b></button>
      <button type="button" class="btn sm" id="cPrev">👁 Preview</button>
      <button type="button" class="btn sm" id="cSave">💾 Template save</button></div>
    <textarea class="input" id="cBody" style="min-height:300px;font-size:13.5px;line-height:1.55"></textarea>
    <div id="cPreview" class="script" style="display:none;max-height:340px;overflow:auto;background:var(--surface);border:1px solid var(--line)"></div>
    <div class="mu" style="font-size:12px;margin-top:4px">**text** = bold. Aap kuch bhi edit kar sakte ho — bhejne se pehle sab yahin badlo.</div>
    ${isEmail && opts.attach ? `<div class="attrow" id="cAtt" aria-live="polite">📎 <span class="mu">${L("PDF ban raha hai…", "Making the PDF…")}</span></div>` : ""}
    ${isEmail && bannerOn() ? `<div class="sigtip" id="cSendInfo"><img src="${h(bannerUrl())}" alt=""><span>…</span></div>` : ""}
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
      body.value = isEmail
        ? (isEn() ? `Dear ${ctx.contact_name || "Sir/Madam"},\n\n${reply ? "Thank you for your reply.\n\n" : ""}${signatureBlock()}`
                  : `Namaste ${ctx.contact_name || "Sir/Madam"},\n\n${reply ? "Aapke reply ke liye dhanyavaad.\n\n" : ""}${signatureBlock()}`)
        : `${L("Namaste", "Hello")} ${ctx.contact_name || "Sir/Madam"} 🙏\n\n– ${S.me.full_name}, Genesis Infoserve`;
      if (sub) sub.value = reply ? (/^re:/i.test(reply.subject || "") ? reply.subject : "Re: " + (reply.subject || "")) : "";
    }
    body.dataset.dirty = "";
  };
  // the customer's online page (tick / untick items, total with GST, accept) is always in the mail
  const addLink = () => {
    if (!isEmail) return;
    const en = isEn() || /^(dear|hello|hi)\b/i.test(body.value.trim());
    const ins = (line) => { const i = body.value.indexOf("\n\n"); body.value = i < 0 ? body.value + "\n\n" + line : body.value.slice(0, i + 2) + line + "\n\n" + body.value.slice(i + 2); };
    if (opts.attach) {     // the PDF itself has the ticks — the mail only says so (no link)
      if (!/tick/i.test(body.value)) ins(en ? "✅ In the attached PDF you can tick / untick items — the total with GST changes by itself (open it in Google Chrome or Adobe Acrobat Reader; Microsoft Edge, Mac Preview and phone viewers don't update the total). Save it and reply with it to confirm."
                                            : "✅ Attached PDF mein hi items tick / untick karein — GST ke saath total apne aap badlega (PDF Google Chrome ya Adobe Acrobat Reader mein kholein; Microsoft Edge, Mac Preview aur phone viewer mein total nahi badalta). PDF save karke reply mein bhej dein.");
      return;
    }
    const url = ctx.quote_link; if (!url) return;
    if (body.value.includes(url)) {      // the template has the link: make sure it also says what the customer can do there
      if (!/tick/i.test(body.value)) body.value = body.value.replace(url, url + (en ? " (tick / untick items to see the total with GST, then accept)" : " (items tick / untick karke GST ke saath total dekhein, phir accept karein)"));
      return;
    }
    const line = en ? `✅ View the quotation online — tick or untick items to see the total with GST, and accept it in one click:\n${url}`
                    : `✅ Quotation online dekhein — items tick / untick karke GST ke saath total dekhein aur ek click mein accept karein:\n${url}`;
    ins(line);
  };
  const apply0 = apply;
  const applyL = (t) => { apply0(t); addLink(); };
  applyL(auto);
  if (opts.draft?.body) { body.value = fillTemplate(opts.draft.body, ctx); if (sub && opts.draft.subject) sub.value = fillTemplate(opts.draft.subject, ctx); body.dataset.dirty = ""; }
  // the PDF is made now (a few seconds) so it is ready when Send is pressed
  let att = null, attOn = !!(isEmail && opts.attach);
  const drawAtt = (a, err) => {
    const box = $("#cAtt", m); if (!box || !m.isConnected) return;
    if (!attOn) { box.innerHTML = `📎 <span class="mu">${L("PDF nahi jayega", "No PDF attached")}</span> <button type="button" class="btn sm" id="cAttOn">${L("PDF wapas lagao", "Attach the PDF again")}</button>`; $("#cAttOn", m).onclick = () => { attOn = true; drawAtt(a, err); }; return; }
    if (err) { box.innerHTML = `⚠️ <span>${L("PDF nahi ban paya", "Couldn't make the PDF")}</span> <button type="button" class="btn sm" id="cAttRe">${L("Dobara try", "Try again")}</button>`; $("#cAttRe", m).onclick = makeAtt; return; }
    if (!a) { box.innerHTML = `📎 <span class="mu">${L("PDF ban raha hai…", "Making the PDF…")}</span>`; return; }
    box.innerHTML = `📎 <b class="att-name">${h(a.name)}</b> <span class="mu">· ${a.pages} ${a.pages > 1 ? "pages" : "page"} · ${kb(a.bytes)}</span>
      <button type="button" class="btn sm" id="cAttView">👁 ${L("Dekho", "View")}</button><button type="button" class="btn sm ghost" id="cAttOff" title="${h(L("Is mail mein PDF mat bhejo", "Don't attach the PDF to this mail"))}" aria-label="${h(L("PDF hatao", "Remove PDF"))}">✕</button>`;
    $("#cAttView", m).onclick = () => { const u = URL.createObjectURL(a.blob); if (!openTab(u)) saveBlob(a.blob, a.name); setTimeout(() => URL.revokeObjectURL(u), 60000); };
    $("#cAttOff", m).onclick = () => { attOn = false; drawAtt(a, err); };
  };
  let preUp = null;
  function makeAtt() {
    drawAtt(null, null); preUp = null;
    att = Promise.resolve().then(() => opts.attach.make());
    att.then((a) => drawAtt(a, null), (e) => { console.error(e); drawAtt(null, e); });
    att.catch(() => {});
  }
  if (attOn) makeAtt();
  const attNow = () => (attOn ? att : null);
  body.addEventListener("input", () => { body.dataset.dirty = "1"; });
  let curT = auto;
  $("#cTpl", m).onchange = async (e) => {
    if (body.dataset.dirty && !(await confirmBox("Template badalne se aapke changes chale jayenge. Continue?", "Haan, badlo"))) { $("#cTpl", m).value = curT?.id ?? ""; return; }
    curT = e.target.value === "auto" ? genT() : list.find((t) => t.id === +e.target.value);
    applyL(curT);
  };
  // ---- the lead's products: shown above the template, changed right here (saved to the lead too) ----
  if (prodOn) {
    let saveTimer = 0, picker = null;
    const drawProd = (note = "") => {
      const box = $("#cProd", m); if (!box) return;
      box.innerHTML = `🏷️ <b>${L("Products", "Products")}:</b> ${prods.map((p) => `<span class="badge acc">${h(p)}</span>`).join("") || `<span class="mu">${L("koi nahi — product chuno, message unhi ke hisaab se banega", "none — pick the products and the message is written for them")}</span>`}
        <button type="button" class="btn sm" id="cProdEd" aria-expanded="${!$("#cProdPick", m).hidden}">${$("#cProdPick", m).hidden ? (prods.length ? "✏️ " + L("Badlo", "Change") : "＋ " + L("Product jodo", "Add products")) : "✔ " + L("Ho gaya", "Done")}</button>
        ${note ? `<span class="mu" style="font-size:12px">${note}</span>` : ""}`;
      $("#cProdEd", m).onclick = () => { const pk = $("#cProdPick", m); pk.hidden = !pk.hidden; if (!pk.hidden && !picker) picker = productPicker(pk, prods, onProds); drawProd(); if (!pk.hidden) setTimeout(() => $(".ppick-q", pk)?.focus(), 30); };
    };
    const regen = () => { curT = pickAuto(); $("#cTpl", m).innerHTML = tplOptions(list, curT?.id, autoLabel()); applyL(curT); };
    const onProds = (sel) => {
      prods = [...sel];
      const keep = $("#cTpl", m).value;
      $("#cTpl", m).innerHTML = tplOptions(list, keep === "auto" && !prods.length ? "" : keep, autoLabel());
      let note = "";
      if (!body.dataset.dirty) regen();
      else note = `<button type="button" class="btn sm ghost" id="cProdRe">↻ ${L("Naye products se message dobara banao", "Rewrite the message for these products")}</button>`;
      if (canWork(lead)) {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => sb.from("leads").update({ products: prods }).eq("id", lead.id).then(({ error }) => {
          if (error) return fail(error);
          lead.products = [...prods]; HOOK.softRefresh();
          const n = $("#cProdSaved", m); if (n) n.textContent = "✔ " + L("lead mein saved", "saved to the lead");
        }), 700);
        note += `<span class="mu" id="cProdSaved" style="font-size:12px"></span>`;
      }
      drawProd(note);
      $("#cProdRe", m)?.addEventListener("click", async () => {
        if (!(await confirmBox(L("Aapke changes chale jayenge — naya message banayein?", "Your edits will be lost — write a new message?"), L("Haan, banao", "Yes, rewrite")))) return;
        regen();
      });
    };
    drawProd();
  }
  $("#cBold", m).onclick = () => {
    const a = body.selectionStart, b = body.selectionEnd; if (a === b) return toast("Pehle text select karo");
    body.setRangeText("**" + body.value.slice(a, b).replace(/\*\*/g, "") + "**", a, b, "select"); body.dataset.dirty = "1"; body.focus();
  };
  $("#cPrev", m).onclick = () => {
    const p = $("#cPreview", m), on = p.style.display === "none";
    p.innerHTML = isEmail ? mdToHtml(body.value) + (bannerOn() ? bannerHtml() : "") : h(mdToWhatsApp(body.value)).replace(/\*([^*\n]+)\*/g, "<b>$1</b>").replace(/\n/g, "<br>");
    p.style.display = on ? "block" : "none"; body.style.display = on ? "none" : "block";
    $("#cPrev", m).textContent = on ? "✏️ Edit" : "👁 Preview";
  };
  // a message not edited by hand is saved with its {{variables}} (works for every lead); tagged with the lead's products
  $("#cSave", m).onclick = () => saveAsTemplate(channel, body.dataset.dirty || !curT ? sub?.value || "" : curT.subject || "", body.dataset.dirty || !curT ? body.value : curT.body,
    { products: prods, stage: prods.length ? stage : null });
  // can this person's Gmail script make the draft (template + banner)?
  let draftOk = false, scriptV = 0;
  if (isEmail) warmGmail();
  const preUpload = () => {
    if (preUp || !attOn || !att || !draftOk || scriptV < GMAIL_FILES_V || (S.me.mail_provider || "gmail") === "outlook") return;
    preUp = att.then(uploadOutPdf); preUp.catch(() => {});
  };
  if (isEmail) sb.rpc("mail_status").then(({ data: ms }) => {
    draftOk = !!ms?.draft_ok; scriptV = +ms?.script_v || 0;
    if ((S.me.mail_provider || "gmail") === "outlook") return outlookTip(m);
    preUpload();
    const box = $("#cSendInfo", m); if (!box || !m.isConnected) return;
    const t = box.querySelector("span");
    if (draftOk && opts.attach && scriptV < GMAIL_FILES_V) {
      t.innerHTML = L("📎 PDF Gmail draft mein <b>apne aap</b> lage — iske liye Gmail code ek baar update karo (abhi PDF download hoga, haath se attach karna padega).", "📎 For the PDF to attach <b>by itself</b> in the Gmail draft, update the Gmail code once (for now the PDF downloads, attach it by hand).");
      const b = document.createElement("button"); b.type = "button"; b.className = "btn sm primary"; b.textContent = L("Update", "Update"); b.onclick = () => gmailSetup(); box.append(b); return;
    }
    if (draftOk && S.me.mail_webapp && scriptV < GMAIL_FAST_V) {
      box.classList.add("ok"); t.innerHTML = L("⚡ Draft turant khulega. Aur <b>tez</b> chahiye? Gmail code ek baar update karo.", "⚡ The draft opens instantly. Want it even <b>faster</b>? Update the Gmail code once.");
      const b = document.createElement("button"); b.type = "button"; b.className = "btn sm"; b.textContent = L("Update", "Update"); b.onclick = () => gmailSetup(); box.append(b); return;
    }
    if (draftOk && S.me.mail_webapp) { box.classList.add("ok"); t.textContent = opts.attach ? L("⚡ Gmail mein kholo — draft template + banner + PDF ke saath khulega, wahan Send dabao.", "⚡ Open in Gmail — the draft opens with the template, the banner and the PDF; press Send there.") : L("⚡ Gmail mein kholo — draft template + Geninfo banner ke saath turant khulega.", "⚡ Open in Gmail — the draft opens instantly with the template + the Geninfo banner."); return; }
    if (draftOk) {
      box.classList.add("ok"); t.innerHTML = L("✔ Draft banner ke saath ~30 sec mein khulega. <b>Turant</b> chahiye? Ek baar web app set karo.", "✔ The draft opens with the banner in ~30 sec. Want it <b>instant</b>? Set up the web app once.");
      const b = document.createElement("button"); b.type = "button"; b.className = "btn sm"; b.textContent = L("⚡ Turant karo", "⚡ Make it instant"); b.onclick = () => gmailSetup(); box.append(b); return;
    }
    t.innerHTML = ms?.connected ? L("Banner ke saath Gmail draft ke liye <b>Gmail code ek baar update karo</b>.", "For Gmail drafts with the banner, <b>update your Gmail code once</b>.")
                                : L("Banner ke saath Gmail draft ke liye <b>Gmail ek baar connect karo</b> (2 min).", "For Gmail drafts with the banner, <b>connect Gmail once</b> (2 min).");
    const b = document.createElement("button"); b.type = "button"; b.className = "btn sm primary"; b.textContent = ms?.connected ? L("Update", "Update") : L("Connect", "Connect");
    b.onclick = () => gmailSetup(); box.append(b);
  });

  $("#cCopy", m).onclick = async () => { const ok = isEmail ? await copyRich(body.value, { banner: bannerOn() }) : await navigator.clipboard.writeText(mdToWhatsApp(body.value)).then(() => true, () => false); toast(ok ? "Copied ✔ — kahin bhi paste karo" : "Copy nahi hua", !ok); };

  const tplId = () => +$("#cTpl", m).value || null;
  const showFallback = (url, label) => {
    $("#cFallback", m).innerHTML = `<div class="banner" style="margin:12px 0 0">${L("Browser ne naya tab block kiya.", "Your browser blocked the new tab.")} <a class="btn sm primary" href="${h(url)}" target="_blank" rel="noopener noreferrer">${L(`${h(label)} kholo`, `Open ${h(label)}`)}</a></div>`;
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
    // Gmail + banner + script ready → the script makes a real Gmail draft (template + banner) and we open it
    if (provider === "gmail" && draftOk && (bannerOn() || attNow())) { if (attNow()) preUpload(); return openGmailDraft({ parts, text, toList, cc, bulk, bulkList, lead, opts, tplId: tplId(), fu: $("#cFu", m)?.checked, m, att: attNow(), pre: attNow() ? preUp : null, scriptV }); }
    // Outlook connected → a real Outlook draft (template + banner + open tracking + read receipt)
    if (provider === "outlook" && outlookReady() && outlookConnected()) {
      if (S.me.mail_provider !== "outlook") { S.me.mail_provider = "outlook"; sb.from("profiles").update({ mail_provider: "outlook" }).eq("id", S.me.id).then(() => {}, () => {}); }
      return openOutlookDraft({ parts, text, toList, cc, bulk, bulkList, opts, tplId: tplId(), fu: $("#cFu", m)?.checked, att: attNow() });
    }
    let url = composeUrl(provider, parts), copied = false;
    if (url.length > URL_LIMIT[provider]) { url = composeUrl(provider, { ...parts, body: "" }); copyRich(text); copied = true; }
    if (!openTab(url)) showFallback(url, PROVIDERS.find((p) => p[0] === provider)[1]);
    if (provider !== S.me.mail_provider) { S.me.mail_provider = provider; sb.from("profiles").update({ mail_provider: provider }).eq("id", S.me.id).then(() => {}, () => {}); }
    logEmail({ provider, subject, text, toList, cc, opts, tplId: tplId(), bulkList, fu: $("#cFu", m)?.checked }).catch(fail);
    if (attNow()) { attachByHand(attNow()); if (!$("#cFallback", m).innerHTML) closeModal(); return; }
    toast(copied ? L("Message lamba tha — body clipboard mein copy hai, compose mein Ctrl+V / Cmd+V karo", "Long message — the body is on your clipboard, paste it in the compose window") : `✉️ ${PROVIDERS.find((p) => p[0] === provider)[1]} mein draft ready — wahan Send dabao`);
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

async function logEmail({ provider, subject, text, toList, cc, opts, tplId, bulkList, fu, track }) {
  const { lead, rfq, bulk, reply } = opts;
  let rows;
  if (bulk) rows = bulkList.map((l) => ({ direction: "out", lead_id: l.id, counterpart: l.email, subject, body: text, provider, template_id: tplId, bulk: true }));
  else rows = [{
    direction: "out", lead_id: lead?.id || reply?.lead_id || null, rfq_id: rfq?.id || reply?.rfq_id || null,
    counterpart: toList.join(", "), cc: cc.join(", ") || null, subject, body: text, provider, template_id: tplId,
    ...(track?.token ? { track_token: track.token, track_links: track.links } : {}),
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

function saveAsTemplate(channel, subject, body, { products = [], stage = null } = {}) {
  const m = modal({
    title: "Template save karo",
    body: `<label class="f">Naam</label><input class="input" id="tN" maxlength="80" placeholder="e.g. Workstation offer" value="${h(products.length ? products.slice(0, 3).join(" + ") + (channel === "email" ? " — intro mail" : " — WhatsApp") : "")}">
      ${products.length ? `<label class="check" style="margin-top:10px"><input type="checkbox" id="tP" checked> ${L("In products ke leads pe apne aap aaye", "Pick it automatically for leads with these products")}: <b>${h(products.join(", "))}</b></label>` : ""}
      ${isMgr() ? `<label class="check" style="margin-top:10px"><input type="checkbox" id="tS"> Poori team ke liye (company template)</label>` : ""}
      <p class="mu" style="font-size:12.5px">Tip: company naam ki jagah <span class="mono">{{company}}</span>, contact ke liye <span class="mono">{{contact_name|Sir/Madam}}</span> likho — har lead ke liye apne aap bhar jayega.</p>`,
    foot: `<button class="btn" data-close>Cancel</button><button class="btn primary" id="tGo">Save</button>`,
  });
  $("#tGo", m).onclick = (e) => busy(e.target, async () => {
    const name = $("#tN", m).value.trim(); if (!name) return toast("Naam daalo", true);
    const tag = !!$("#tP", m)?.checked;
    const { error } = await sb.from("message_templates").insert({ channel, name, subject: subject || null, body, is_shared: !!$("#tS", m)?.checked, owner_id: S.me.id, lang: getLang(),
      ...(tag ? { products: products.slice(0, 30), stage } : {}) });
    if (error) throw error; tplAt = 0; closeModal(); toast("Template saved ✔");
  });
}

// ---------------------------------------------------------------------
//  TEMPLATES PAGE
// ---------------------------------------------------------------------
export async function viewTemplates(el) {
  const ch = el.dataset.ch || "email", lf = el.dataset.lf || getLang();
  const list = (await loadTemplates(true)).filter((t) => t.channel === ch && (lf === "all" || (t.lang || "en") === lf));
  const sample = tplContext({ lead: { company: "Sample Technologies Pvt Ltd", contact_name: "Mr. Sharma", city: "Mumbai", products: ["HP Workstations"] }, rfq: null });
  el.innerHTML = `
    <div class="toolbar"><div class="chips"><button class="chip ${ch === "email" ? "on" : ""}" data-ch="email">✉️ Email</button><button class="chip ${ch === "whatsapp" ? "on" : ""}" data-ch="whatsapp">💬 WhatsApp</button></div>
      <div class="chips">${[["hinglish", "Hinglish"], ["en", "English"], ["all", L("Dono languages", "Both languages")]].map(([k, l]) => `<button class="chip ${lf === k ? "on" : ""}" data-lf="${k}">${l}</button>`).join("")}</div>
      <span class="sp" style="flex:1"></span><button class="btn primary" id="tNew">${ic("plus")} Naya template</button></div>
    <div class="queue">${list.map((t) => `
      <div class="card" style="padding:14px 16px;min-width:0"><div class="row tpl-row" style="flex-wrap:nowrap">
        <div style="min-width:0;flex:1"><b>${h(t.name)}</b> ${t.is_shared ? '<span class="badge acc">Company</span>' : '<span class="badge">Mera</span>'} ${t.stage ? `<span class="badge">${h(t.stage)}</span>` : ""} <span class="badge">${(t.lang || "en") === "en" ? "EN" : "Hinglish"}</span>
          ${(t.products || []).length ? `<div style="margin-top:4px">🏷️ ${t.products.map((p) => `<span class="badge info" style="margin:0 4px 2px 0">${h(p)}</span>`).join("")}</div>` : ""}
          ${t.subject ? `<div class="mu" style="font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Subject: ${h(fillTemplate(t.subject, sample))}</div>` : ""}</div>
        <button class="btn sm" data-tv="${t.id}">👁</button>
        ${(!t.is_shared && t.owner_id === S.me.id) || isMgr() ? `<button class="btn sm" data-te="${t.id}">Edit</button>` : ""}
        <button class="btn sm" data-td="${t.id}">Copy</button>
        ${(!t.is_shared && t.owner_id === S.me.id) || isMgr() ? `<button class="btn sm danger" data-tx="${t.id}" aria-label="Delete">${ic("trash")}</button>` : ""}
      </div></div>`).join("") || '<div class="card empty">Abhi koi template nahi</div>'}</div>`;
  $$("[data-ch]", el).forEach((b) => b.onclick = () => { el.dataset.ch = b.dataset.ch; viewTemplates(el); });
  $$("[data-lf]", el).forEach((b) => b.onclick = () => { el.dataset.lf = b.dataset.lf; viewTemplates(el); });
  const get = (id) => list.find((t) => t.id === +id);
  $("#tNew", el).onclick = () => templateEditor({ channel: ch, body: "", subject: "", lang: lf === "all" ? getLang() : lf }, () => viewTemplates(el));
  $$("[data-te]", el).forEach((b) => b.onclick = () => templateEditor(get(b.dataset.te), () => viewTemplates(el)));
  $$("[data-td]", el).forEach((b) => b.onclick = () => { const t = get(b.dataset.td); templateEditor({ ...t, id: null, name: t.name + " (copy)", is_shared: false, owner_id: S.me.id }, () => viewTemplates(el)); });
  $$("[data-tv]", el).forEach((b) => b.onclick = () => { const t = get(b.dataset.tv); modal({ title: t.name, wide: true, body: `${t.subject ? `<p><b>Subject:</b> ${h(fillTemplate(t.subject, sample))}</p>` : ""}<div class="script" style="background:var(--surface);border:1px solid var(--line)">${mdToHtml(fillTemplate(t.body, sample))}</div><p class="mu" style="font-size:12px">Preview sample data ke saath.</p>` }); });
  $$("[data-tx]", el).forEach((b) => b.onclick = async () => {
    if (!(await confirmBox(L(`"${get(b.dataset.tx).name}" delete karna hai?`, `Delete "${get(b.dataset.tx).name}"?`), "Delete"))) return;
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
      <div><label class="f">Language</label><select class="input" id="eL">${[["hinglish", "Hinglish"], ["en", "English"]].map(([k, l]) => `<option value="${k}" ${k === (t.lang || getLang()) ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div><label class="f">Auto-select stage</label><select class="input" id="eS"><option value="">—</option>${[["new", "Naya lead"], ["followup", "Follow-up (reply nahi aaya)"], ["interested", "Interested"], ["quote", "Quote bheja"], ["demo", "Demo / meeting"], ["rfq", "RFQ"]].map(([k, l]) => `<option value="${k}" ${k === t.stage ? "selected" : ""}>${l}</option>`).join("")}</select></div></div>
      ${isEmail ? `<label class="f">Subject</label><input class="input" id="eSub" maxlength="300" value="${h(t.subject || "")}">` : ""}
      <div class="row" style="margin:12px 0 4px"><label class="f" style="margin:0">Message</label><span style="flex:1"></span>
        <select class="input" id="eVar" style="width:auto;height:28px"><option value="">+ Variable daalo</option>${TPL_VARS.map((v) => `<option>${v}</option>`).join("")}</select>
        <button type="button" class="btn sm" id="eB"><b>B</b></button></div>
      <textarea class="input" id="eBody" style="min-height:300px;font-size:13.5px">${h(t.body || "")}</textarea>
      <p class="mu" style="font-size:12px"><span class="mono">**bold**</span> · <span class="mono">{{contact_name|Sir/Madam}}</span> = contact naam, nahi ho toh "Sir/Madam"</p>
      <label class="f">🏷️ ${L("Kin products ke liye — in products wale lead pe ye template apne aap chunega (khaali = sab ke liye)", "For which products — picked automatically for leads with these products (empty = for everyone)")}</label><div id="eP"></div>
      ${isMgr() ? `<label class="check"><input type="checkbox" id="eSh" ${t.is_shared ? "checked" : ""}> Company template (poori team dekh payegi)</label>` : ""}`,
    foot: `<button class="btn" data-close>Cancel</button><button class="btn primary" id="eGo">Save</button>`,
  });
  const ta = $("#eBody", m);
  const tagP = productPicker($("#eP", m), t.products || [], () => {}, { cats: true });
  $("#eVar", m).onchange = (e) => { if (!e.target.value) return; ta.setRangeText(`{{${e.target.value}}}`, ta.selectionStart, ta.selectionEnd, "end"); e.target.value = ""; ta.focus(); };
  $("#eB", m).onclick = () => { const a = ta.selectionStart, b = ta.selectionEnd; if (a === b) return; ta.setRangeText("**" + ta.value.slice(a, b) + "**", a, b, "select"); };
  $("#eGo", m).onclick = (e) => busy(e.target, async () => {
    const row = { channel: t.channel, lang: $("#eL", m).value, name: $("#eN", m).value.trim(), use_for: $("#eU", m).value, stage: $("#eS", m).value || null,
      subject: isEmail ? $("#eSub", m).value.trim() || null : null, body: ta.value.trim(), is_shared: isMgr() ? $("#eSh", m).checked : false,
      products: (await tagP).get().slice(0, 30) };
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
// 👁 opened 2× · 3 h ago (✔ = Outlook read receipt, 🔗 = clicked a link)
export function openChip(r) {
  if (!r.track_token && !r.opened_at) return "";
  if (!r.opened_at) return `<span class="badge" title="${h(L("Tracking chalu hai — customer ne abhi nahi khola (ya uske mail mein images band hain)", "Tracking is on — not opened yet (or images are blocked in their mail)"))}">📭 ${L("Nahi khola", "Not opened")}</span> `;
  const via = r.open_via === "receipt" ? "Outlook read receipt" : r.open_via === "image" ? "" : r.open_via || "";
  const tip = `${L("Pehli baar", "First")}: ${dt(r.opened_at)}${via ? " · " + via : ""}${r.click_count ? ` · ${r.click_count} link click` : ""}`;
  return `<span class="badge info" title="${h(tip)}">👁 ${L("Khola", "Opened")} ${r.open_count || 1}× · ${h(ago(r.last_open_at))}${r.receipt_at ? " ✔" : ""}${r.click_count ? " 🔗" : ""}</span> `;
}
export async function viewInbox(el, params = {}) {
  const team = IB.team && isMgr();
  const { data: ms } = await sb.rpc("mail_status");
  let rows = [], sentRows = [];
  if (IB.tab === "replies") {
    let q = sb.from("email_messages").select("id, user_id, lead_id, rfq_id, counterpart, counterpart_name, subject, snippet, intent, is_read, archived, created_at, thread_url, provider, files, leads(company, status, owner_id)")
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
    let q = sb.from("email_messages").select("id, user_id, lead_id, rfq_id, counterpart, subject, created_at, bulk, direction, track_token, open_count, click_count, opened_at, last_open_at, open_via, receipt_at, leads(company, status, owner_id, reply_count, last_reply_at), rfqs(rfq_no, company)")
      .eq("direction", "out");
    q = IB.tab === "opened" ? q.not("opened_at", "is", null).order("last_open_at", { ascending: false }).limit(200) : q.order("created_at", { ascending: false }).limit(400);
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
  if (s) { rows = rows.filter((r) => [r.counterpart, r.counterpart_name, r.subject, r.snippet, r.leads?.company].join(" ").toLowerCase().includes(s)); sentRows = sentRows.filter((r) => [r.counterpart, r.subject, r.leads?.company, r.rfqs?.company, r.rfqs?.rfq_no].join(" ").toLowerCase().includes(s)); }
  const msOk = ms?.connected, olReady = outlookReady();
  el.innerHTML = `
  <div class="card" style="padding:12px 16px;margin-bottom:14px"><div class="row">
    <b>📬 Reply sync</b>
    ${(() => { const stale = msOk && ms.last_sync && Date.now() - new Date(ms.last_sync) > 15 * 60e3;
      return `<span class="badge ${msOk ? (stale ? "warn" : "good") : ""}" ${stale ? `title="${h(L("Apps Script mein purana code ho sakta hai — Gmail setup kholke naya code paste karo", "Apps Script may have an old code — open Gmail setup and paste a new code"))}"` : ""}>Gmail: ${msOk ? (stale ? "⚠️ " + L("sync ruka hua", "sync stopped") : "connected") + (ms.last_sync ? " · " + h(ago(ms.last_sync)) : " · " + L("pehli sync baaki", "waiting for first sync")) : "setup nahi"}</span>`; })()}
    ${olReady ? `<span class="badge ${outlookConnected() ? "good" : ""}">Outlook: ${outlookConnected() ? "connected" : "connect nahi"}</span>` : ""}
    <span class="sp" style="flex:1"></span>
    <button class="btn sm" id="ibGmail">${msOk ? L("⚙️ Gmail setup", "⚙️ Gmail setup") : "🔗 Gmail connect"}</button>
    ${olReady ? `<button class="btn sm" id="ibOutlook">${outlookConnected() ? "🔄 Outlook sync" : "🔗 Outlook connect"}</button>` : `<button class="btn sm ghost" id="ibOutHelp">Outlook?</button>`}
  </div></div>
  ${msOk && (ms.script_v || 1) < 5 ? `<div class="banner" style="margin:0 0 14px">📎 <div><b>${L("Naya: quotation PDF Gmail draft mein apne aap + mail ki photos / files CRM mein", "New: the quotation PDF attaches itself to Gmail drafts + mail pictures / files come into the CRM")}</b> — <span>${L("Quotation Email karte hi PDF draft mein lagi milegi. Customer ki photo / screenshot / PDF yahan dikhegi aur ticket ke saath engineer tak jaayegi. Gmail code ek baar update karo: <b>Naya code banao</b> → Apps Script mein paste → Save → <b>setup</b> Run.", "When you email a quotation, its PDF is already in the draft. Customers' photos / screenshots / PDFs show here and go with the ticket to the engineer. Update your Gmail code once: <b>Make a new code</b> → paste in Apps Script → Save → Run <b>setup</b>.")}</span></div><button class="btn sm primary right" id="ibUpd">${L("Update", "Update")}</button></div>` : ""}
  <div class="toolbar">
    <div class="chips">${[["replies", "📩 Replies"], ["sent", "📤 Sent"], ["opened", L("👁 Khole gaye", "👁 Opened")], ["due", "⏰ Follow-up due"]].map(([k, l]) => `<button class="chip ${IB.tab === k ? "on" : ""}" data-ibt="${k}">${l}</button>`).join("")}</div>
    ${IB.tab === "replies" ? `<select class="input" id="ibF" style="width:auto">${[["open", "Saare replies"], ["unread", "Unread"], ["action", "Interested / Quote"], ["no", "Not interested"], ["auto", "Auto-reply / Bounce"], ["archived", "Archived"]].map(([k, l]) => `<option value="${k}" ${IB.f === k ? "selected" : ""}>${l}</option>`).join("")}</select>` : ""}
    <input class="input grow" id="ibQ" placeholder="Search company, email, subject…" value="${h(IB.q)}">
    ${isMgr() ? `<div class="chips"><button class="chip ${team ? "" : "on"}" data-ibm="0">Mere</button><button class="chip ${team ? "on" : ""}" data-ibm="1">Team</button></div>` : ""}
  </div>
  ${IB.tab === "replies" ? `<div class="inbox"><div class="card ib-list" id="ibList">${rows.map((r) => `
      <div class="ib-item ${r.is_read ? "" : "unread"} ${String(r.id) === String(params.id) ? "on" : ""}" data-ib="${r.id}">
        <div class="row" style="flex-wrap:nowrap;gap:6px">${r.is_read ? "" : '<span class="dot on" style="background:var(--accent);box-shadow:none"></span>'}<b class="ib-co">${h(r.leads?.company || r.counterpart_name || r.counterpart)}</b><span class="mu" style="font-size:12px;margin-left:auto;white-space:nowrap">${h(ago(r.created_at))}</span></div>
        <div class="ib-sub">${r.files > 0 ? `<span title="${h(L(r.files + " photo / file", r.files + " picture(s) / file(s)"))}">📎 </span>` : ""}${h(r.subject || "(no subject)")}</div>
        <div class="ib-snip">${h(onlyReply(r.snippet || ""))}</div>
        <div class="row" style="gap:6px;margin-top:4px">${intentBadge(r.intent)}${team ? `<span class="mu" style="font-size:12px">${h(userName(r.user_id))}</span>` : ""}</div>
      </div>`).join("") || `<div class="empty"><b>Abhi koi reply nahi</b>${msOk || outlookConnected() ? "Jin companies ko CRM se mail kiya hai, unke reply yahan aayenge." : "Pehle upar se Gmail / Outlook connect karo."}</div>`}</div>
    <div class="card ib-read" id="ibRead"><div class="empty">← Koi reply select karo</div></div></div>`
  : `<div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Company</th><th>To</th><th>Subject</th><th>Bheja</th><th>Status</th>${team ? "<th>By</th>" : ""}<th></th></tr></thead><tbody>
    ${sentRows.map((r) => `<tr data-lid="${r.lead_id || ""}" data-rid="${r.rfq_id || ""}"><td class="co">${h(r.leads?.company || r.rfqs?.company || "—")}${r.rfqs?.rfq_no ? ` <span class="badge info">${h(r.rfqs.rfq_no)}</span>` : ""}${r.bulk ? ' <span class="badge">bulk</span>' : ""}</td><td class="sub">${h(r.counterpart)}</td><td>${h(r.subject || "")}</td><td class="sub">${h(ago(r.created_at))}</td>
      <td>${openChip(r)}${r.replied ? '<span class="badge good">✅ Reply aaya</span>' : r.age >= 3 ? `<span class="badge warn">⏳ ${Math.floor(r.age)} din, no reply</span>` : '<span class="badge">Waiting</span>'}</td>
      ${team ? `<td class="sub">${h(userName(r.user_id))}</td>` : ""}
      <td>${r.lead_id && !r.replied ? `<button class="btn sm" data-fu="${r.lead_id}">Follow-up bhejo</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="7" class="empty">${IB.tab === "due" ? "Koi pending follow-up nahi 🎉" : IB.tab === "opened" ? L("Abhi kisi customer ne CRM mail nahi khola (ya tracking wale mail abhi gaye nahi)", "No customer has opened a CRM mail yet (or no tracked mail has gone out yet)") : "Abhi tak CRM se koi email nahi gaya"}</td></tr>`}
    </tbody></table></div></div>`}`;

  $$("[data-ibt]", el).forEach((b) => b.onclick = () => { IB.tab = b.dataset.ibt; viewInbox(el); });
  $$("[data-ibm]", el).forEach((b) => b.onclick = () => { IB.team = b.dataset.ibm === "1"; viewInbox(el); });
  $("#ibF", el)?.addEventListener("change", (e) => { IB.f = e.target.value; viewInbox(el); });
  let t; $("#ibQ", el).oninput = (e) => { clearTimeout(t); t = setTimeout(() => { IB.q = e.target.value; viewInbox(el).then(() => { const i = $("#ibQ", el); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 350); };
  $("#ibGmail", el).onclick = () => gmailSetup(() => viewInbox(el));
  $("#ibUpd", el)?.addEventListener("click", () => gmailSetup(() => viewInbox(el)));
  $("#ibOutlook", el)?.addEventListener("click", (e) => busy(e.target, async () => { await outlookConnect(); viewInbox(el); }));
  $("#ibOutHelp", el)?.addEventListener("click", outlookHelp);
  $$("[data-ib]", el).forEach((d) => d.onclick = () => { $$(".ib-item", el).forEach((x) => x.classList.remove("on")); d.classList.add("on"); d.classList.remove("unread"); history.replaceState(null, "", "#/inbox/" + d.dataset.ib); readMail(+d.dataset.ib, $("#ibRead", el), () => viewInbox(el, { id: d.dataset.ib })); });
  $$("[data-fu]", el).forEach((b) => b.onclick = async (e) => { e.stopPropagation(); await followupFor(+b.dataset.fu); });
  $$("tr[data-lid]", el).forEach((tr) => tr.onclick = () => (tr.dataset.lid ? HOOK.openLead(+tr.dataset.lid) : tr.dataset.rid && HOOK.go("#/rfqs/" + tr.dataset.rid)));
  if (params.id && IB.tab === "replies" && rows.some((r) => String(r.id) === String(params.id))) readMail(+params.id, $("#ibRead", el), () => viewInbox(el, params));
}

async function followupFor(leadId) {
  const { data: lead, error } = await sb.from("leads").select("*").eq("id", leadId).single();
  if (error) return fail(error);
  if (!(await ensureWork("lead", lead))) return;
  openComposer({ channel: "email", lead: { ...lead, reply_count: 0, email_count: Math.max(1, lead.email_count) } });
}

// show only the new reply: cut the quoted earlier mail ("On … wrote:", "-----Original Message-----", Outlook "From:/Sent:", "> …" lines)
export function onlyReply(t) {
  t = String(t || "").replace(/\r\n/g, "\n");
  const cut = [/(^|\n)[ \t]*On [\s\S]{5,300}?wrote:[ \t]*(\n|$)/i, /(^|\n)[ \t]*-{2,}\s*Original Message\s*-{2,}/i, /(^|\n)_{5,}[ \t]*\n\s*From:/i,
    /(^|\n)From: .+\n(Sent|Date): .+/i, /(^|\n)>/,
    /\s+On (Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*, \d/i, /\s+On \d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{4}/i];   // same, squeezed onto one line
  let end = t.length;
  for (const re of cut) { const m = t.match(re); if (m && m.index > 0 && m.index < end) end = m.index; }
  const out = t.slice(0, end).replace(/\n{3,}/g, "\n\n").trim();
  return out || t.trim();
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
      <div class="mu" style="font-size:13px"><b style="color:var(--tx)">${h(r.counterpart_name || "")}</b> &lt;${h(r.counterpart)}&gt; · ${h(dt(r.created_at))}${!mine ? " · " + L(h(userName(r.user_id)) + " ko", "to " + h(userName(r.user_id))) : ""}</div>
      <div class="row" style="margin-top:6px;gap:6px">${intentBadge(r.intent)}${lead ? `<a href="#" data-ol="${lead.id}" class="badge info">📋 ${h(lead.company)} · ${h(STATUS[lead.status]?.l || lead.status)}</a>` : ""}${r.rfqs ? `<span class="badge">${h(r.rfqs.rfq_no)}</span>` : ""}</div></div>
      ${r.thread_url ? `<a class="btn sm" href="${h(r.thread_url)}" target="_blank" rel="noopener noreferrer">${r.provider === "outlook" ? "Outlook" : "Gmail"} mein kholo ↗</a>` : ""}</div></div>
    <div class="ib-body">${h(onlyReply(r.body || r.snippet || "")).replace(/\n/g, "<br>")}</div>
    <div id="ibFiles"></div>
    ${mine ? `<div class="smartrep" id="ibSmart" aria-live="polite"></div>` : ""}
    ${mine ? `<div class="ib-actions">
      <button class="btn primary" data-a="reply">${ic("mail")} Reply</button>
      ${lead ? `<button class="btn" data-a="wa">${ic("wa")} WhatsApp</button>` : ""}
      ${lead ? `<button class="btn" data-a="int">🔥 Interested mark</button><button class="btn" data-a="rfq">${ic("inbox")} RFQ banao</button><button class="btn" data-a="fu">⏰ Kal follow-up</button><button class="btn danger" data-a="no">🚫 Not interested</button>` : ""}
      <button class="btn" data-a="ticket" title="${h(L("Support ticket — mail ki photos / files ke saath engineer ko", "Support ticket — goes to the engineer with the mail's pictures / files"))}">🛠 ${L("Ticket banao", "Make ticket")}</button>
      <span style="flex:1"></span>
      <select class="input" data-a="intent" style="width:auto;height:30px" aria-label="Tag">${Object.entries(INTENT).map(([k, [l]]) => `<option value="${k}" ${k === (r.intent || "other") ? "selected" : ""}>${l}</option>`).join("")}</select>
      <button class="btn ghost" data-a="unread">Unread</button><button class="btn ghost" data-a="arch">${r.archived ? "Unarchive" : "Archive"}</button>
      <button class="btn ghost danger" data-a="del" title="${h(L("CRM se hatao (Gmail mein rahega)", "Remove from the CRM (stays in Gmail)"))}">${ic("trash")} ${L("Delete", "Delete")}</button>
    </div>` : ""}`;
  pane.querySelector("[data-ol]")?.addEventListener("click", (e) => { e.preventDefault(); HOOK.openLead(lead.id); });
  const files = await loadFiles("email_id", id);
  const fb = $("#ibFiles", pane);
  if (fb && files.length) { fb.innerHTML = filesHtml(files, `📎 ${files.length} ${L("photo / file", files.length > 1 ? "attachments" : "attachment")}`); wireFiles(fb, files); }
  // ⚡ ready replies: what the mail asks (price / interest / no / out-of-office / bounce) + the products and quantities in it
  if (mine) drawSmart().catch(() => {});
  async function drawSmart() {
    const box = $("#ibSmart", pane); if (!box) return;
    await loadCatalog().catch(() => {});
    const text = onlyReply(r.body || r.snippet || ""), items = detectItems(`${r.subject || ""}\n${text}`);
    const sm = replyDrafts({ intent: r.intent, text: `${r.subject || ""} ${text}`, lead, items });
    if (!box.isConnected || (!sm.drafts.length && !sm.actions.length && !sm.note)) { box.remove(); return; }
    const A = {
      quote: `📄 ${L("Quotation banao", "Make quotation")}${items.length ? ": " + h(items.map((x) => `${x.qty} × ${x.name}`).join(", ")) : ""}`,
      lost: `🚫 ${L("Lead Lost karo", "Mark lead lost")}`, fu90: `⏰ ${L("3 mahine baad yaad dilao", "Remind in 3 months")}`,
      fu3: `⏰ ${L("3 din baad follow-up", "Follow up in 3 days")}`, fixmail: `✏️ ${L("Lead ka email theek karo", "Fix the lead's email")}`,
    };
    box.innerHTML = `<div class="smartrep-h">⚡ <b>${L("Jawab tayyar", "Ready replies")}</b> <span class="mu">— ${L("ek click, phir bhejne se pehle badal bhi sakte ho", "one click, edit before sending")}</span></div>
      ${sm.note ? `<div class="mu" style="font-size:12.5px;margin-top:6px">${h(sm.note)}</div>` : ""}
      ${items.length ? `<div class="smartrep-items">🏷️ ${L("Mail mein", "In the mail")}: ${items.map((x) => `<span class="badge acc">${x.qtyKnown ? x.qty + " × " : ""}${h(x.name)}</span>`).join(" ")}</div>` : ""}
      <div class="smartrep-b">${sm.drafts.map((d, i) => `<button type="button" class="btn sm ${i ? "" : "primary"}" data-sd="${i}" title="${h(d.body.split("\n").slice(2, 4).join(" ").replace(/\*\*/g, "").slice(0, 160))}">✉️ ${h(d.label)}</button>`).join("")}
        ${sm.actions.map((k) => `<button type="button" class="btn sm" data-sa="${k}">${A[k]}</button>`).join("")}</div>`;
    $$("[data-sd]", box).forEach((b) => b.onclick = async () => {
      const d = sm.drafts[+b.dataset.sd];
      if (lead && !canWork(lead) && !lockOf(lead).free) return openComposer({ channel: "email", reply: r, draft: d, onSent: refresh });
      if (lead && lockOf(lead).free) await ensureWork("lead", lead);
      openComposer({ channel: "email", reply: r, lead: lead || undefined, rfq: r.rfqs || undefined, draft: d, onSent: refresh });
    });
    $$("[data-sa]", box).forEach((b) => b.onclick = () => smartAct(b.dataset.sa, items).catch(fail));
  }
  async function smartAct(k, items) {
    if (!lead || !(await ensureWork("lead", lead))) return;
    if (k === "lost") return act("no");
    if (k === "fu3" || k === "fu90") {
      const days = k === "fu3" ? 3 : 90;
      const { error: e1 } = await sb.from("leads").update({ next_follow_up: new Date(Date.now() + days * 864e5).toISOString() }).eq("id", lead.id);
      if (e1) return fail(e1); return toast(L(`⏰ ${days} din baad ka follow-up set`, `⏰ Follow-up set in ${days} days`));
    }
    if (k === "fixmail") return HOOK.openLead(lead.id);
    if (k === "quote") {
      const { data: full } = await sb.from("leads").select("company, contact_name, email, address, area, city, state, gstin").eq("id", lead.id).single();
      const l = full || lead;
      return HOOK.newQuote?.({ lead_id: lead.id, to_party: { name: l.company, contact: l.contact_name, email: l.email || r.counterpart, address: l.address || [l.area, l.city].filter(Boolean).join(", "), state: l.state || "Maharashtra", gstin: l.gstin || "" },
        items: items.length ? items.map((x) => ({ desc: x.desc, hsn: x.hsn, qty: x.qty, price: x.price, tax: x.tax })) : [] });
    }
  }
  const act = async (a) => {
    if (a === "reply") {
      if (lead && !canWork(lead) && !lockOf(lead).free) return openComposer({ channel: "email", reply: r, onSent: refresh });
      if (lead && lockOf(lead).free) await ensureWork("lead", lead);
      return openComposer({ channel: "email", reply: r, lead: lead || undefined, rfq: r.rfqs || undefined, onSent: refresh });
    }
    if (a === "ticket") return HOOK.openTicket?.({ title: (r.subject || "").replace(/^\s*((re|fw|fwd)\s*:\s*)+/i, "").slice(0, 200), lead_id: lead?.id || r.lead_id || null,
      description: onlyReply(r.body || "").slice(0, 4800), email_id: r.id, _files: files.length, _from: r.counterpart_name || r.counterpart });
    if (a === "unread") { await sb.from("email_messages").update({ is_read: false }).eq("id", id); HOOK.refreshBadges(); return refresh(); }
    if (a === "arch") { await sb.from("email_messages").update({ archived: !r.archived }).eq("id", id); toast(r.archived ? "Inbox mein wapas" : "Archived"); return refresh(); }
    if (a === "del") {
      if (!(await confirmBox(L("Ye mail CRM se delete karna hai? (Gmail / Outlook mein ye mail waise hi rahega, aur dobara sync nahi hoga.)", "Delete this mail from the CRM? (It stays in Gmail / Outlook and won't sync back.)"), "Delete"))) return;
      const { data: gone, error: de } = await sb.from("email_messages").delete().eq("id", id).select("id");
      if (de) return fail(de);
      if (!gone?.length) return toast(L("Delete nahi hua — sirf apni mail delete kar sakte ho", "Not deleted — you can only delete your own mail"), true);
      history.replaceState(null, "", "#/inbox"); HOOK.refreshBadges(); return refresh();
    }
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
const GAS_MANIFEST = JSON.stringify({
  timeZone: "Asia/Kolkata", runtimeVersion: "V8", exceptionLogging: "STACKDRIVER",
  dependencies: { enabledAdvancedServices: [{ userSymbol: "Gmail", serviceId: "gmail", version: "v1" }] },
  oauthScopes: ["https://mail.google.com/", "https://www.googleapis.com/auth/gmail.settings.basic", "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/script.scriptapp", "https://www.googleapis.com/auth/userinfo.email"],
}, null, 2);
function appsScript(token) {
  const url = CONFIG.SUPABASE_URL + "/functions/v1/mail-sync";
  return `// Genesis Nova — Gmail for ${S.me.email}
// 1) CRM mein "Gmail mein kholo" dabate hi aapke Gmail mein draft banata hai — template + team ka banner
// 2) Sirf un addresses ke replies CRM ko bhejta hai jinko aapne CRM se email kiya hai.
// 3) Nayi enquiry mails (IndiaMART / TradeIndia / JustDial alerts, "requirement / quotation" wale mails)
//    CRM ko bhejta hai → CRM mein apne aap RFQ. Dekhi hui mails pe Gmail label "CRM-RFQ" lagta hai.
// 4) In replies ki photos / screenshots / files bhi CRM ko bhejta hai (Inbox + support ticket).
const CRM_URL = "${url}";
const TOKEN = "${token}";   // personal — kisi ke saath share mat karo

function setup() {                       // ▶ ek baar ye function Run karo
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("syncReplies").timeBased().everyMinutes(1).create();
  syncReplies();
}

function removeSetup() {                 // ▶ sync band karna ho to ye Run karo
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  PropertiesService.getUserProperties().deleteAllProperties();
}

function call_(action, payload, qs) {
  var res = UrlFetchApp.fetch(CRM_URL + "?v=6&action=" + action + (qs || ""), {
    method: "post", contentType: "application/json", headers: { "x-mail-token": TOKEN },
    payload: JSON.stringify(payload || {}), muteHttpExceptions: true
  });
  return answer_(res);
}

function answer_(res) {
  var code = res.getResponseCode();
  if (code === 401 || code === 403) {      // token band ho gaya (Disconnect / naya code) → ye script khud ruk jaata hai
    removeSetup();
    throw new Error("CRM ne is code ko band kar diya hai. Naya code CRM se copy karke yahan paste karo, phir setup Run karo.");
  }
  if (code !== 200) throw new Error("CRM " + code + ": " + res.getContentText().slice(0, 300));
  return JSON.parse(res.getContentText());
}

// replies ki photos + files → CRM (har file 20 MB tak; usse badi ka sirf naam, kholne ke liye Gmail)
function sendFiles_(ids) {
  var props = PropertiesService.getUserProperties();
  var q = JSON.parse(props.getProperty("fileq") || "[]");
  (ids || []).forEach(function (id) { if (!q.some(function (x) { return x.id === id; })) q.push({ id: id, n: 0 }); });
  if (!q.length) return;
  if (Date.now() - Number(props.getProperty("file_busy") || 0) < 5 * 60e3) { props.setProperty("fileq", JSON.stringify(q.slice(0, 300))); return; }
  props.setProperty("file_busy", String(Date.now()));
  var t0 = Date.now(), left = [];
  try {
    q.forEach(function (it) {
      if (Date.now() - t0 > 150e3) { left.push(it); return; }       // baaki agli baar
      try {
        var m = GmailApp.getMessageById(it.id);
        var all = m.getAttachments({ includeInlineImages: true, includeAttachments: false }).map(function (a) { return [a, 1]; })
          .concat(m.getAttachments({ includeInlineImages: false, includeAttachments: true }).map(function (a) { return [a, 0]; }));
        all.forEach(function (p) {
          var a = p[0], size = a.getSize();
          if (p[1] && size < 10240) return;                       // signature ke logo / icons
          var qs = "&id=" + encodeURIComponent(it.id) + "&name=" + encodeURIComponent(a.getName() || "file")
                 + "&mime=" + encodeURIComponent(a.getContentType() || "") + "&size=" + size + "&inline=" + p[1];
          if (size > 20 * 1048576) { call_("file", {}, qs + "&big=1"); return; }
          answer_(UrlFetchApp.fetch(CRM_URL + "?v=6&action=file" + qs, { method: "post", contentType: "application/octet-stream",
            headers: { "x-mail-token": TOKEN }, payload: a.getBytes(), muteHttpExceptions: true }));
        });
        call_("file", {}, "&id=" + encodeURIComponent(it.id) + "&done=1");
      } catch (e) {
        console.log("files " + it.id + ": " + e);
        if (String(e).indexOf("CRM 404") < 0 && ++it.n < 3) left.push(it);
      }
    });
  } finally {
    props.setProperty("fileq", JSON.stringify(left.slice(0, 300)));
    props.deleteProperty("file_busy");
  }
}

function doGet(e) {                     // CRM "Gmail mein kholo" dabate hi isse bulata hai → draft turant
  var out = { ok: true };
  try { out.done = sendQueued_() || []; } catch (err) { out.ok = false; out.error = String(err && err.message || err); }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function banner_(url) {                 // banner ki photo 6 ghante yaad rakhta hai — har draft pe download nahi
  var c = CacheService.getUserCache();
  var k = "bn" + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, url));
  var hit = c.get(k);
  if (hit) { var i = hit.indexOf("|"); return Utilities.newBlob(Utilities.base64Decode(hit.slice(i + 1)), hit.slice(0, i), "geninfo-banner"); }
  var b = UrlFetchApp.fetch(url).getBlob().setName("geninfo-banner");
  var s = (b.getContentType() || "image/png") + "|" + Utilities.base64Encode(b.getBytes());
  if (s.length < 95000) c.put(k, s, 21600);
  return b;
}

function sendQueued_() {                // CRM se aaye mails: draft banao (ya seedha bhejo)
  var lock = LockService.getUserLock();
  if (!lock.tryLock(20000)) return [];
  try { return sendQueuedNow_(); } finally { lock.releaseLock(); }
}

function sendQueuedNow_() {
  var o = call_("outbox");
  if (!o.items || !o.items.length) return [];
  var img = null;
  if (o.banner) { try { img = banner_(o.banner); } catch (e) { img = null; } }
  var me = Session.getEffectiveUser().getEmail();
  var res = [];
  o.items.forEach(function (m) {
    try {
      var opt = { htmlBody: m.html, name: o.name };
      if (img && o.banner) { opt.htmlBody = m.html.split(o.banner).join("cid:gnbanner"); opt.inlineImages = { gnbanner: img }; }
      if (m.cc) opt.cc = m.cc;
      if (m.bcc) opt.bcc = m.bcc;
      var att = [];                       // CRM ki files (jaise quotation PDF) — draft mein attach
      (m.files || []).forEach(function (f) {
        try { att.push(UrlFetchApp.fetch(f.url).getBlob().setName(f.name).setContentType(f.mime || "application/pdf")); } catch (e) { }
      });
      if (att.length) opt.attachments = att;
      if (m.kind === "draft") {
        var d = GmailApp.createDraft(m.to, m.subject, m.body || " ", opt);
        res.push({ id: m.id, ok: true, draft: true, msg_id: d.getMessage().getId(), account: me });
      } else {
        GmailApp.sendEmail(m.to, m.subject, m.body || " ", opt);
        res.push({ id: m.id, ok: true });
      }
    } catch (e) { res.push({ id: m.id, ok: false, error: String(e && e.message || e) }); }
  });
  call_("sent", { results: res });
  return res;
}

// Gmail search for mails that may be a buyer's enquiry (the CRM decides; anything else is ignored there)
var ENQ_Q = "in:inbox newer_than:2d -in:sent -label:crm-rfq (from:(indiamart.com OR tradeindia.com OR justdial.com OR exportersindia.com OR sulekha.com)" +
  " OR subject:(enquiry OR inquiry OR requirement OR required OR quotation OR quote OR rfq OR \\"best price\\" OR \\"price list\\" OR need OR purchase))";

function scanEnquiries_() {             // nayi enquiry mails → CRM mein RFQ (har ~5 minute)
  var props = PropertiesService.getUserProperties();
  if (Date.now() - Number(props.getProperty("enq_at") || 0) < 4 * 60e3) return;
  props.setProperty("enq_at", String(Date.now()));
  var threads = GmailApp.search(ENQ_Q, 0, 20);
  if (!threads.length) return;
  var items = threads.map(function (th) {
    var m = th.getMessages()[0];
    return { id: m.getId(), from: m.getFrom(), reply_to: m.getReplyTo(), subject: m.getSubject(), date: m.getDate().toISOString(),
             body: m.getPlainBody().slice(0, 8000), list: !!m.getHeader("List-Unsubscribe"), link: th.getPermalink() };
  });
  var r = call_("enquiry", { provider: "gmail", items: items });
  if (r && r.ok) (GmailApp.getUserLabelByName("CRM-RFQ") || GmailApp.createLabel("CRM-RFQ")).addToThreads(threads);
}

function syncReplies() {
  sendQueued_();
  try { scanEnquiries_(); } catch (e) { console.log("enquiries: " + e); }
  var w = call_("watchlist");
  var who = (w.emails || []).concat(w.domains || []);
  if (!who.length) return;
  var props = PropertiesService.getUserProperties();
  var since = Number(props.getProperty("since") || (Date.now() - 3 * 864e5));
  if (!props.getProperty("files_v4")) since = Math.min(since, Date.now() - 30 * 864e5);   // pehli baar: pichhle 30 din ki photos / files bhi
  var after = Math.floor((since - 2 * 3600e3) / 1000);
  var me = Session.getEffectiveUser().getEmail().toLowerCase();
  var out = [];
  for (var i = 0; i < who.length; i += 25) {
    var q = "from:(" + who.slice(i, i + 25).join(" OR ") + ") after:" + after + " -in:sent -in:chats";
    GmailApp.search(q, 0, 100).forEach(function (th) {
      th.getMessages().forEach(function (m) {
        if (m.getDate().getTime() < since - 2 * 3600e3) return;
        if (m.getFrom().toLowerCase().indexOf(me) >= 0) return;
        out.push({ id: m.getId(), thread_id: th.getId(), from: m.getFrom(), to: m.getTo(), subject: m.getSubject(),
                   date: m.getDate().toISOString(), body: m.getPlainBody().slice(0, 15000),
                   files: m.getAttachments({ includeInlineImages: true }).length });
      });
    });
  }
  var want = [];
  for (var j = 0; j < out.length; j += 100) {
    var r = call_("push", { provider: "gmail", messages: out.slice(j, j + 100) });
    want = want.concat((r && r.want) || []);
  }
  props.setProperty("since", String(Date.now()));
  props.setProperty("files_v4", "1");
  sendFiles_(want);
}
`;
}
export async function gmailSetup(done) {
  const { data: ms } = await sb.rpc("mail_status");
  const m = modal({
    title: L("🔗 Gmail connect karo — mail bhejo + replies", "🔗 Connect Gmail — send mail + get replies"), wide: true,
    body: `<p>Ye aapke <b>apne Gmail</b> mein ek chhota script lagata hai jo har 5 minute mein check karta hai ki jin companies ko aapne CRM se mail kiya, unka reply aaya ya nahi — aur sirf wahi replies yahan dikhata hai. Koi aur email CRM mein nahi aata.</p>
      <ol style="padding-left:18px;line-height:1.7">
        <li>Neeche <b>Code banao</b> dabao aur code copy karo.</li>
        <li><a href="https://script.google.com/home/projects/create" target="_blank" rel="noopener noreferrer">script.google.com → New project</a> kholo (usi Gmail account se jisse mail bhejte ho).</li>
        <li>Editor mein <b>Ctrl + A</b> dabao → <b>Delete</b> (pehle se likha <code>function myFunction() { }</code> poora hatana zaroori hai, warna <i>"Unexpected token"</i> error aata hai) → phir ye code paste karo → 💾 Save.</li>
        <li>${L('Left side ⚙️ <b>Project Settings</b> → <b>"Show appsscript.json manifest file"</b> tick karo → wapas <b>Editor</b> (&lt;&gt;) → <b>appsscript.json</b> kholo → <b>Ctrl + A</b> → neeche diya <b>appsscript.json</b> paste karo → 💾 Save. (Isse script aapke Gmail signature mein team ka banner laga sakta hai.)',
          'Left side ⚙️ <b>Project Settings</b> → tick <b>"Show appsscript.json manifest file"</b> → back to the <b>Editor</b> (&lt;&gt;) → open <b>appsscript.json</b> → <b>Ctrl + A</b> → paste the <b>appsscript.json</b> below → 💾 Save. (This lets the script put the team banner in your Gmail signature.)')}</li>
        <li>${L('<b>Turant draft ke liye (ek baar):</b> upar <b>Deploy → New deployment</b> → ⚙️ <b>Web app</b> chuno → <i>Execute as:</i> <b>Me</b>, <i>Who has access:</i> <b>Anyone</b> → <b>Deploy</b> → <b>Web app URL</b> copy karke neeche wale box mein paste karo → Save. <b>Code update kiya?</b> Deploy → <b>Manage deployments</b> → ✏️ → Version: <b>New version</b> → Deploy (warna turant wala draft purane code se banega).',
          '<b>For instant drafts (once):</b> top <b>Deploy → New deployment</b> → ⚙️ choose <b>Web app</b> → <i>Execute as:</i> <b>Me</b>, <i>Who has access:</i> <b>Anyone</b> → <b>Deploy</b> → copy the <b>Web app URL</b> and paste it in the box below → Save. <b>Updated the code?</b> Deploy → <b>Manage deployments</b> → ✏️ → Version: <b>New version</b> → Deploy (otherwise the instant draft runs the old code).')}</li>
        <li>Upar function list mein <b>setup</b> select karke <b>▶ Run</b> dabao → <b>Review permissions</b> → apna account → <i>Advanced → Go to project</i> → <b>Allow</b>.</li>
        <li>${L("Bas! Ab CRM mein <b>Gmail mein kholo</b> dabao — aapke Gmail mein draft khulega: template + neeche team ka banner. Admin banner badle to agle mail se naya. Replies har minute Inbox mein aate hain.", "Done! Now press <b>Open in Gmail</b> in the CRM — a draft opens in your Gmail: the template + the team banner underneath. When the Admin changes the banner, the next mail uses it. Replies reach the Inbox every minute.")}</li>
        <li class="mu">${L("Band karna ho: yahan <b>Disconnect</b> dabao (ya Apps Script mein <b>removeSetup</b> Run karo).", "To stop: press <b>Disconnect</b> here (or Run <b>removeSetup</b> in Apps Script).")}</li>
      </ol>
      <div class="row" style="gap:8px;margin:6px 0 10px;flex-wrap:nowrap"><input class="input" id="gsWeb" placeholder="https://script.google.com/macros/s/…/exec" value="${h(S.me.mail_webapp || "")}" style="flex:1"><button type="button" class="btn sm primary" id="gsWebSave">${L("Save", "Save")}</button></div>
      <div id="gsCode"></div>
      <p class="mu" style="font-size:12.5px">🔒 Code mein aapka personal token hai. Naya code banane se purana token band ho jata hai.</p>
      ${ms?.connected ? `<div class="banner" style="margin-top:10px">✅ <div><b>${L("Gmail abhi connected hai", "Gmail is connected")}</b> · ${L("last sync", "last sync")}: ${h(ms.last_sync ? ago(ms.last_sync) : L("abhi tak nahi", "not yet"))}<br>
        <small>${L("Naya code tabhi banao jab Apps Script mein code badalna ho — warna chal raha sync band ho jayega.", "Only make a new code if you'll replace it in Apps Script — otherwise the running sync stops.")}</small></div></div>` : ""}`,
    foot: `${ms?.connected ? `<button class="btn danger" id="gsOff">${ic("trash")} ${L("Disconnect", "Disconnect")}</button>` : ""}<span style="flex:1"></span><button class="btn" data-close>Close</button><button class="btn primary" id="gsGo">${ms?.connected ? L("Naya code banao", "Make a new code") : L("Code banao", "Make code")}</button>`,
  });
  $("#gsWebSave", m).onclick = (e) => busy(e.target, async () => {
    const v = $("#gsWeb", m).value.trim();
    if (v && !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/.test(v)) return toast(L("Ye Web app URL sahi nahi lagta — script.google.com/macros/s/…/exec wala poora link daalo", "That doesn't look like a Web app URL — paste the full script.google.com/macros/s/…/exec link"), true);
    const { error } = await sb.from("profiles").update({ mail_webapp: v || null }).eq("id", S.me.id); if (error) throw error;
    S.me.mail_webapp = v || null;
    if (!v) return toast(L("Web app hata diya", "Web app removed"));
    // try it once so a wrong deployment shows up now, not on the next mail
    try { const r = await fetch(v, { redirect: "follow" }); const j = await r.json(); toast(j.ok ? L("⚡ Web app chal raha hai — ab Gmail draft turant khulega", "⚡ Web app works — Gmail drafts now open instantly") : L("Web app ne error diya: ", "The web app returned an error: ") + (j.error || ""), !j.ok); }
    catch { toast(L("Web app se jawab nahi aaya — 'Who has access: Anyone' chuna tha? Deploy dobara karke naya URL daalo.", "No answer from the web app — did you pick 'Who has access: Anyone'? Deploy again and paste the new URL."), true); }
  });
  $("#gsOff", m)?.addEventListener("click", async () => {
    if (!(await confirmBox(L("Gmail reply sync band karna hai? Apps Script apne aap ruk jayega (agli baar chalte hi). Purane replies CRM mein rahenge.", "Turn off Gmail reply sync? The Apps Script stops itself on its next run. Replies already in the CRM stay."), "Disconnect"))) return;
    const { error } = await sb.rpc("disconnect_mail"); if (error) return fail(error);
    closeModal(); toast(L("🔌 Gmail disconnect ho gaya", "🔌 Gmail disconnected")); done?.();
  });
  $("#gsGo", m).onclick = async (e) => {
    if (ms?.connected && !e.target.dataset.made && !(await confirmBox(L("Naya code banate hi Apps Script mein chal raha purana code band ho jayega. Naya code wahan paste karke setup dobara Run karna padega. Aage badhein?", "A new code stops the old one running in Apps Script. You'll need to paste the new code there and Run setup again. Continue?"), L("Haan, naya code", "Yes, new code")))) return;
    busy(e.target, async () => {
    const { data: token, error } = await sb.rpc("rotate_mail_token"); if (error) throw error;
    e.target.dataset.made = "1";
    const code = appsScript(token);
    setTimeout(() => { const box = $("#gsCode", m); if (!box || box.querySelector("#gsMan")) return;
      box.insertAdjacentHTML("beforeend", `<div class="row" style="margin:12px 0 6px"><b>appsscript.json</b><span style="flex:1"></span><button class="btn sm primary" id="gsMan">${ic("copy")} Copy appsscript.json</button></div><pre class="log" style="max-height:160px;overflow:auto">${h(GAS_MANIFEST)}</pre>`);
      $("#gsMan", m).onclick = async () => { try { await navigator.clipboard.writeText(GAS_MANIFEST); toast("appsscript.json copied ✔"); } catch { toast("Copy nahi hua — select karke copy karo", true); } };
    }, 0);
    $("#gsCode", m).innerHTML = `<div class="row" style="margin-bottom:6px"><b>Apps Script code</b><span style="flex:1"></span><button class="btn sm primary" id="gsCopy">${ic("copy")} Copy code</button></div><pre class="log" style="max-height:260px">${h(code)}</pre>`;
    $("#gsCopy", m).onclick = async () => { try { await navigator.clipboard.writeText(code); toast("Code copied ✔"); } catch { toast("Copy nahi hua — select karke copy karo", true); } };
    e.target.textContent = "Naya code banao";
    done?.();
    });
  };
}

// ---------------------------------------------------------------------
//  Outlook / Microsoft 365 (Microsoft Graph, read-only Mail.Read)
// ---------------------------------------------------------------------
let pca = null, pcaId = "", outlookTimer = null;
// Client ID comes from Admin → Company settings → Outlook (or config.js as a fallback)
const msConf = () => { const o = S.settings?.outlook || {}; return { id: (o.client_id || CONFIG.MS_CLIENT_ID || "").trim(), tenant: (o.tenant_id || CONFIG.MS_TENANT_ID || "").trim() || "organizations" }; };
export const outlookReady = () => /^[0-9a-f-]{36}$/i.test(msConf().id);
// which Microsoft account belongs to which CRM user (shared laptops never mix two people's mail)
const OLK = () => "crm_ol_" + (S.me?.id || "");
const olAccount = () => { try { return localStorage.getItem(OLK()) || ""; } catch { return ""; } };
const outlookConnected = () => !!olAccount();
async function msal() {
  const c = msConf();
  if (pca && pcaId === c.id + c.tenant) return pca;
  await loadScript("msal-browser.min.js");
  const base = location.origin + location.pathname.replace(/[^/]*$/, "");
  pca = new window.msal.PublicClientApplication({
    auth: { clientId: c.id, authority: "https://login.microsoftonline.com/" + c.tenant, redirectUri: base + "auth-redirect.html" },
    cache: { cacheLocation: "localStorage" },      // stays connected after the browser is closed
  });
  await pca.initialize(); pcaId = c.id + c.tenant;
  return pca;
}
const MAIL_READ = ["Mail.Read"], MAIL_RW = ["Mail.ReadWrite"];
async function graphToken(interactive, scopes = MAIL_READ) {
  const p = await msal(), req = { scopes };
  const mine = olAccount(), acc = mine && p.getAllAccounts().find((a) => a.homeAccountId === mine);
  if (acc) {
    try { return (await p.acquireTokenSilent({ ...req, account: acc })).accessToken; }
    catch (e) { if (!interactive) throw e; return (await p.acquireTokenPopup({ ...req, account: acc })).accessToken; }   // e.g. drafts permission not given yet
  }
  if (!interactive) throw new Error("Outlook login chahiye");
  // one sign-in asks for both: read customer replies + make drafts
  const r = await p.loginPopup({ scopes: ["Mail.Read", "Mail.ReadWrite"], loginHint: S.me.email, prompt: "select_account" });
  try { localStorage.setItem(OLK(), r.account.homeAccountId); } catch { /* ignore */ }
  return (await p.acquireTokenSilent({ ...req, account: r.account })).accessToken;
}
export async function outlookSync(interactive = false) {
  if (!outlookReady()) return 0;
  let token;
  try { token = await graphToken(interactive); }
  catch (e) { if (!interactive) { try { localStorage.removeItem(OLK()); } catch { /* ignore */ } outlookBanner(); } throw e; }
  document.getElementById("olBanner")?.replaceChildren();
  const { data: w, error } = await sb.functions.invoke("mail-sync?action=watchlist", { body: {} });
  if (error) throw error;
  const who = new Set(w.emails || []), doms = new Set(w.domains || []);
  const since = new Date(Date.now() - 14 * 864e5).toISOString();
  // message class tells a read receipt (REPORT.IPM.Note.IPNRN) from a real reply
  const CLS = "&$expand=singleValueExtendedProperties($filter=id eq 'String 0x001A')";
  let url = `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$filter=receivedDateTime ge ${since}&$orderby=receivedDateTime desc&$top=50&$select=id,conversationId,subject,from,receivedDateTime,body,webLink` + CLS;
  const out = [], receipts = [], enq = [];
  const ENQ = /\b(enquiry|inquiry|requirement|required|quotation|quote|rfq|best price|price list|need|purchase)\b/i, PORTAL = /(^|\.)(indiamart|tradeindia|justdial|exportersindia|sulekha)\.com$/i;
  for (let page = 0; url && page < 8; page++) {
    let r = await fetch(url, { headers: { Authorization: "Bearer " + token, Prefer: 'outlook.body-content-type="text"' } });
    if (!r.ok && page === 0 && url.endsWith(CLS)) { url = url.slice(0, -CLS.length); r = await fetch(url, { headers: { Authorization: "Bearer " + token, Prefer: 'outlook.body-content-type="text"' } }); }
    if (!r.ok) throw new Error("Outlook " + r.status);
    const j = await r.json();
    for (const msg of j.value || []) {
      const a = (msg.from?.emailAddress?.address || "").toLowerCase();
      if (!a) continue;
      if (!(who.has(a) || doms.has(a.split("@")[1]))) {
        // not someone we mailed: maybe a new buyer's enquiry (the server decides, and keeps nothing else)
        if (PORTAL.test(a.split("@")[1]) || ENQ.test(msg.subject || "")) enq.push({ id: msg.id, from: `${msg.from.emailAddress.name || ""} <${a}>`, subject: msg.subject || "", date: msg.receivedDateTime, body: (msg.body?.content || "").slice(0, 8000), link: msg.webLink });
        continue;
      }
      const cls = msg.singleValueExtendedProperties?.[0]?.value || "";
      if (/IPNNRN$/i.test(cls)) continue;   // "deleted without reading" notice
      if (/IPNRN$/i.test(cls) || (!cls && /^read\s*:/i.test(msg.subject || "") && /\bread\b/i.test(msg.body?.content || ""))) {
        receipts.push({ id: msg.id, from: a, subject: msg.subject || "", at: msg.receivedDateTime }); continue;
      }
      out.push({ id: msg.id, thread_id: msg.conversationId, thread_url: msg.webLink, from: `${msg.from.emailAddress.name || ""} <${a}>`, subject: msg.subject, date: msg.receivedDateTime, body: (msg.body?.content || "").slice(0, 15000) });
    }
    url = j["@odata.nextLink"];
  }
  let n = 0;
  for (let i = 0; i < out.length; i += 100) {
    const { data, error: e2 } = await sb.functions.invoke("mail-sync?action=push", { body: { provider: "outlook", messages: out.slice(i, i + 100) } });
    if (e2) throw e2; n += data?.inserted || 0;
  }
  // enquiry mails → RFQs (each mail once)
  if (enq.length) {
    const EK = "crm_enq_" + S.me.id; let seen = [];
    try { seen = JSON.parse(localStorage.getItem(EK) || "[]"); } catch { /* ignore */ }
    const fresh = enq.filter((x) => !seen.includes(x.id)).slice(0, 30);
    if (fresh.length) {
      const { data: er, error: e4 } = await sb.functions.invoke("mail-sync?action=enquiry", { body: { provider: "outlook", items: fresh } });
      if (!e4 && er?.ok) { seen.push(...fresh.map((x) => x.id)); try { localStorage.setItem(EK, JSON.stringify(seen.slice(-500))); } catch { /* ignore */ } }
    }
  }
  // read receipts → the mail shows as opened (each receipt once)
  if (receipts.length) {
    const RK = "crm_rcpt_" + S.me.id; let done = [];
    try { done = JSON.parse(localStorage.getItem(RK) || "[]"); } catch { /* ignore */ }
    for (const rc of receipts) {
      if (done.includes(rc.id)) continue;
      const { error: e3 } = await sb.rpc("mail_receipt", { p_from: rc.from, p_subject: rc.subject, p_at: rc.at });
      if (!e3) done.push(rc.id);
    }
    try { localStorage.setItem(RK, JSON.stringify(done.slice(-300))); } catch { /* ignore */ }
  }
  return n;
}
// one click from anywhere: connect + first sync
export async function outlookConnect() {
  const n = await outlookSync(true);
  toast(L(`✅ Outlook connected · ${n} naye replies`, `✅ Outlook connected · ${n} new replies`));
  startOutlookAutoSync(); HOOK.refreshBadges();
  return n;
}
export function startOutlookAutoSync() {
  clearInterval(outlookTimer);
  if (!outlookReady()) return;
  if (!outlookConnected()) return outlookBanner();
  const run = () => { if (!document.hidden) outlookSync(false).then((n) => { if (n) { toast(L(`📩 ${n} naye Outlook replies`, `📩 ${n} new Outlook replies`)); HOOK.refreshBadges(); } }).catch(() => {}); };
  run();
  outlookTimer = setInterval(run, 5 * 60e3);
}
// top-of-page reminder for Outlook users who haven't connected on this device yet
function outlookBanner() {
  const el = document.getElementById("olBanner");
  if (!el || !outlookReady() || outlookConnected() || (S.me?.mail_provider || "outlook") !== "outlook") return;
  try { if (sessionStorage.getItem("crm_ol_skip")) return; } catch { /* ignore */ }
  el.innerHTML = `<div class="banner">📩 <div><b>${h(L("Outlook connect karo", "Connect Outlook"))}</b> — <span>${h(L("customers ke replies apne aap CRM Inbox mein aayenge (1 click, office account se login).", "customer replies will arrive in the CRM Inbox automatically (1 click, sign in with your office account)."))}</span></div>
    <button class="btn sm primary right" id="olGo">🔗 ${h(L("Connect", "Connect"))}</button><button class="btn ghost sm" id="olSkip">${h(L("Baad mein", "Later"))}</button></div>`;
  el.querySelector("#olGo").onclick = (e) => busy(e.target, outlookConnect);
  el.querySelector("#olSkip").onclick = () => { try { sessionStorage.setItem("crm_ol_skip", "1"); } catch { /* ignore */ } el.replaceChildren(); };
}
// logout: forget Microsoft sign-in on this device
export function outlookForget() {
  clearInterval(outlookTimer); pca = null; pcaId = "";
  try { Object.keys(localStorage).filter((k) => k.startsWith("msal.") || k.startsWith("crm_ol_") || /login\.windows\.net|microsoftonline/.test(k)).forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ }
}
function outlookHelp() {
  modal({ title: "Outlook / Microsoft 365 replies", body: `<p>${h(L("Outlook replies ke liye Admin ko ek baar setup karna hai (10 minute): Admin → Company settings → “Outlook setup” mein step-by-step guide hai. Uske baad yahan “Outlook connect” button aa jayega.", "To receive Outlook replies an Admin sets it up once (10 minutes): Admin → Company settings → “Outlook setup” has a step-by-step guide. After that an “Outlook connect” button appears here."))}</p>` });
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
// ---- notifications: grouped by day, like a phone (Aaj / Kal / Monday / 12 Nov) ----
const N_ICON = { assign: "👤", digest: "📊", lock: "🔒", lock_request: "🙋", payment: "💰", quote_reply: "💬", quote_view: "👀", obf: "📋", quote_expiry: "⏳", vpo: "📦",
  renewal: "🔁", reply: "✉️", mail_open: "👁", enquiry_mail: "📧", rfq: "📥", ticket: "🎫", mail_stale: "📭", access: "🔑", lock_warn: "⏳", rfq_stuck: "🚨" };
function nDay(t) {
  const d = new Date(t), today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  const diff = Math.round((today - day) / 864e5);
  if (diff <= 0) return L("Aaj", "Today");
  if (diff === 1) return L("Kal", "Yesterday");
  if (diff < 7) return isEn() ? day.toLocaleDateString("en-IN", { weekday: "long" }) : ["Ravivaar", "Somvaar", "Mangalvaar", "Budhvaar", "Guruvaar", "Shukravaar", "Shanivaar"][day.getDay()];
  return day.toLocaleDateString("en-IN", { day: "numeric", month: "short", ...(day.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}) });
}
const nTime = (t) => new Date(t).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
export async function toggleNotifications(anchor, filter) {
  const old = $("#notifPanel"); if (old && !filter) { old.remove(); return; }
  filter = filter || "all";
  const { data } = await sb.from("notifications").select("*").eq("user_id", S.me.id).order("created_at", { ascending: false }).limit(80);
  const reqIds = (data || []).filter((n) => n.kind === "lock_request" && n.ref_id).map((n) => n.ref_id);
  const { data: reqs } = reqIds.length ? await sb.from("lock_requests").select("id, status").in("id", reqIds) : { data: [] };
  const pending = new Set((reqs || []).filter((r) => r.status === "pending").map((r) => r.id));
  const all = data || [], unread = all.filter((n) => !n.is_read).length;
  const list = filter === "unread" ? all.filter((n) => !n.is_read) : all;
  const groups = [];
  for (const n of list) { const k = nDay(n.created_at); let g = groups[groups.length - 1]; if (!g || g.k !== k) groups.push(g = { k, items: [] }); g.items.push(n); }
  const item = (n) => `<div class="notif ${n.is_read ? "" : "unread"}" data-n="${n.id}" data-link="${h(n.link || "")}">
      <span class="n-ic">${N_ICON[n.kind] || "🔔"}</span>
      <div class="n-body"><div class="n-top"><b>${h(String(n.title || "").replace(/^\p{Extended_Pictographic}\uFE0F?\s*/u, ""))}</b><span class="n-time">${h(nTime(n.created_at))}</span></div>
        ${n.body ? `<div class="n-txt">${h(n.body)}</div>` : ""}
        ${n.kind === "lock_request" && pending.has(n.ref_id) ? `<div class="row" style="margin-top:6px"><button class="btn sm primary" data-rq="${n.ref_id}" data-ok="1">✅ De do</button><button class="btn sm" data-rq="${n.ref_id}" data-ok="0">Mana karo</button></div>` : ""}
      </div>${n.is_read ? "" : '<span class="n-dot" aria-label="unread"></span>'}</div>`;
  const p = old || document.createElement("div"); p.id = "notifPanel"; p.className = "notif-panel card"; p.setAttribute("role", "dialog");
  p.innerHTML = `<div class="card-h"><h3>Notifications</h3>${unread ? `<span class="n-count">${unread}</span>` : ""}<span class="sp"></span>${unread ? `<button class="btn sm ghost" id="nAll">✓ ${L("Sab read", "Mark all read")}</button>` : ""}</div>
    <div class="n-tabs"><button class="chip ${filter === "all" ? "on" : ""}" data-nf="all">${L("Sab", "All")}</button><button class="chip ${filter === "unread" ? "on" : ""}" data-nf="unread">${L("Unread", "Unread")}${unread ? ` (${unread})` : ""}</button></div>
    <div class="notif-list">${groups.map((g) => `<div class="n-group"><div class="n-day"><span>${h(g.k)}</span><span class="n-dc">${g.items.length}</span></div>${g.items.map(item).join("")}</div>`).join("")
      || `<div class="empty">${filter === "unread" ? L("🎉 Sab padh liya — koi unread nahi", "🎉 All caught up") : L("Koi notification nahi", "No notifications")}</div>`}</div>`;
  if (!old) {
    document.body.append(p);
    const r = anchor.getBoundingClientRect();
    p.style.top = r.bottom + 8 + "px";
    if (innerWidth < 560) { p.style.left = "8px"; p.style.right = "8px"; p.style.width = "auto"; }   // phone: full width, never off-screen
    else p.style.right = Math.max(8, innerWidth - r.right) + "px";
    const close = (e) => { if (!p.contains(e.target) && !anchor.contains(e.target)) { p.remove(); document.removeEventListener("click", close, true); } };
    setTimeout(() => document.addEventListener("click", close, true), 0);
  }
  $$("[data-nf]", p).forEach((b) => b.onclick = (e) => { e.stopPropagation(); toggleNotifications(anchor, b.dataset.nf); });
  const nAll = $("#nAll", p);
  if (nAll) nAll.onclick = async (e) => { e.stopPropagation(); await sb.from("notifications").update({ is_read: true }).eq("user_id", S.me.id).eq("is_read", false); HOOK.refreshBadges(); toggleNotifications(anchor, filter); };
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
// ---------------------------------------------------------------------
//  Release with a reason (shown to the next person in lock history)
// ---------------------------------------------------------------------
const REL_REASONS = [["Number band / galat", "Number off / wrong"], ["Interested nahi", "Not interested"], ["Baad mein call karo", "Call back later"],
  ["Kahin aur se le liya", "Bought elsewhere"], ["Mera area / product nahi", "Not my area / product"]];
const coolDays = () => S.settings?.locks?.cooldown_days ?? 7;
const freeChances = () => S.settings?.locks?.free_chances ?? 2;
const DROPS = ["release", "expire", "stale", "claim"];
// how many chances this person has already used on one lead / RFQ (from its lock history)
export function dropsUsed(hist, uid = S.me?.id) {
  const since = Date.now() - coolDays() * 864e5;
  return (hist || []).filter((x) => x.from_user === uid && x.to_user !== uid && DROPS.includes(x.why) && !x.pardoned && new Date(x.at).getTime() > since).length;
}
const chanceNote = (used) => {
  if (coolDays() <= 0) return "";
  const left = freeChances() - used;            // chances left BEFORE this release
  if (left > 1) return L(` Aap ise wapas le sakte ho — is lead pe abhi <b>${left} chance</b> baaki hain.`, ` You can take it back — <b>${left} chances</b> left on this lead.`);
  if (left === 1) return L(` Aap ise wapas le sakte ho — ye <b>aakhri chance</b> hai.`, ` You can take it back — this is your <b>last chance</b>.`);
  return L(` <b style="color:var(--bad)">⚠️ Chances khatam: ab chhoda to ${coolDays()} din tak aap ise dobara lock nahi kar paoge</b> (Admin reset kar sakta hai).`,
           ` <b style="color:var(--bad)">⚠️ No chances left: release now and you can't re-lock it for ${coolDays()} days</b> (an Admin can reset this).`);
};
// toast after a release: chances left / ban
export function releasedMsg(d) {
  if (!d?.ok) return L("Release nahi hua", "Couldn't release");
  if (d.banned_until) return L(`🔓 Release ho gaya · chances khatam — ${dt(d.banned_until)} tak aap ise dobara lock nahi kar sakte (Admin reset kar sakta hai)`, `🔓 Released · no chances left — you can't re-lock it until ${dt(d.banned_until)} (an Admin can reset this)`);
  if (d.drops != null && d.chances != null && (d.days ?? 7) > 0) { const left = d.chances - d.drops;
    return left > 0 ? L(`🔓 Release ho gaya · galti hui? wapas le sakte ho (${left} chance baaki)`, `🔓 Released · mistake? you can take it back (${left} chance${left > 1 ? "s" : ""} left)`)
                    : L("🔓 Release ho gaya · wapas le sakte ho, par agli baar chhoda to ban lagega", "🔓 Released · you can take it back, but the next release starts a ban"); }
  return L("🔓 Release ho gaya — ab pool mein hai", "🔓 Released — it's in the pool now");
}
export function askRelease({ force = false, holder = "", used = 0 } = {}) {
  return new Promise((res) => {
    let done = false; const fin = (v) => { if (!done) { done = true; res(v); } };
    const m = modal({
      title: force ? L(`${holder} ka lock hatao`, `Remove ${holder}'s lock`) : L("🔓 Release — kyun chhod rahe ho?", "🔓 Release — why are you dropping it?"),
      body: `<p class="mu" style="margin-top:0">${force ? L("Unhe notification jayega. Wajah likho (optional):", "They'll be notified. Reason (optional):")
        : L("Agle bande ko dikhega kyun chhoda. Ek wajah chuno ya likho.", "The next person will see why. Pick or type a reason.") + chanceNote(used)}</p>
        <div class="row" style="gap:6px;margin:8px 0 10px">${REL_REASONS.map((r) => `<button type="button" class="chip" data-rr="${h(r[0])}">${h(isEn() ? r[1] : r[0])}</button>`).join("")}</div>
        <input class="input" id="rrT" maxlength="300" placeholder="${h(L("Ya apni wajah likho…", "Or type your own reason…"))}">`,
      foot: `<button class="btn" data-close>Cancel</button><button class="btn primary" id="rrGo">🔓 Release</button>`,
    });
    const inp = $("#rrT", m);
    $$("[data-rr]", m).forEach((c) => c.onclick = () => { $$("[data-rr]", m).forEach((x) => x.classList.toggle("on", x === c)); inp.value = c.dataset.rr; });
    $("#rrGo", m).onclick = () => {
      const v = inp.value.trim();
      if (!force && !v) { inp.focus(); return toast(L("Ek wajah chuno — agle bande ke kaam aayegi", "Pick a reason — it helps the next person"), true); }
      closeModal(); fin(v || null);
    };
    $$("[data-close]", m).forEach((b) => b.addEventListener("click", () => fin(false)));
    document.querySelector(".scrim.m")?.addEventListener("click", () => fin(false));
  });
}

// ---------------------------------------------------------------------
//  Handover: all of one person's leads / RFQs / tasks → someone else (or pool)
// ---------------------------------------------------------------------
export async function openHandover(fromId, onDone) {
  const people = S.team.filter((u) => u.role !== "admin" || u.id === fromId);
  const m = modal({
    title: L("🔁 Kaam handover karo", "🔁 Hand over work"),
    body: `<p class="mu" style="margin-top:0">${L("Koi chhuti pe hai ya company chhod raha hai? Uske saare open leads, RFQs, tasks (aur tickets / renewals) ek click mein kisi aur ko do — ya pool mein daalo.",
      "Someone on leave or leaving? Move all their open leads, RFQs, tasks (and tickets / renewals) to someone else in one click — or back to the pool.")}</p>
      <div class="grid2"><div><label class="f">${L("Kiska kaam", "From")}</label><select class="input" id="hoF">${people.map((u) => `<option value="${u.id}" ${u.id === fromId ? "selected" : ""}>${h(u.full_name)}${u.active ? "" : " (disabled)"}</option>`).join("")}</select></div>
      <div><label class="f">${L("Kisko dena hai", "To")}</label><select class="input" id="hoT"><option value="">🔓 ${L("Free pool (sab ke liye)", "Free pool (anyone)")}</option>${S.team.filter((u) => u.active).map((u) => `<option value="${u.id}">${h(u.full_name)}</option>`).join("")}</select></div></div>
      <label class="row check" style="margin-top:10px"><input type="checkbox" id="hoW" checked> ${L("Won customers bhi do (sirf jab kisi bande ko de rahe ho)", "Include won customers (only when giving to a person)")}</label>
      <div class="card" id="hoP" style="padding:10px 14px;margin-top:12px">…</div>`,
    foot: `<button class="btn" data-close>Cancel</button><button class="btn primary" id="hoGo">🔁 Handover</button>`,
  });
  const F = $("#hoF", m), T = $("#hoT", m), W = $("#hoW", m), P = $("#hoP", m);
  const preview = async () => {
    const f = F.value, won = W.checked && T.value;
    const cnt = (q) => q.then((r) => r.count ?? 0);
    const [l, lw, r, t] = await Promise.all([
      cnt(sb.from("leads").select("id", { count: "exact", head: true }).eq("owner_id", f).in("status", OPEN_STATUSES)),
      won ? cnt(sb.from("leads").select("id", { count: "exact", head: true }).eq("owner_id", f).eq("status", "won")) : 0,
      cnt(sb.from("rfqs").select("id", { count: "exact", head: true }).eq("owner_id", f).in("status", won ? ["new", "in_progress", "quoted", "negotiating", "won"] : ["new", "in_progress", "quoted", "negotiating"])),
      cnt(sb.from("tasks").select("id", { count: "exact", head: true }).eq("assignee_id", f).eq("done", false))]);
    P.innerHTML = `<b>${L("Jayega", "Will move")}:</b> ${l} ${L("open leads", "open leads")}${won ? ` + ${lw} won` : ""} · ${r} RFQs · ${t} tasks${T.value ? ` · ${L("open tickets + active renewals bhi", "plus open tickets + active renewals")}` : ""}
      ${F.value === T.value ? `<div style="color:var(--bad)">${L("Same banda chuna hai", "Same person picked twice")}</div>` : ""}`;
  };
  [F, T, W].forEach((x) => x.onchange = preview); preview();
  $("#hoGo", m).onclick = (e) => busy(e.target, async () => {
    if (F.value === T.value) return toast(L("Alag-alag log chuno", "Pick two different people"), true);
    const { data, error } = await sb.rpc("handover_locks", { p_from: F.value, p_to: T.value || null, p_won: W.checked });
    if (error) throw error;
    closeModal();
    toast(`🔁 ${L("Handover ho gaya", "Handed over")}: ${data.leads} leads · ${data.rfqs} RFQs · ${data.tasks} tasks${data.tickets + data.renewals ? ` · ${data.tickets} tickets · ${data.renewals} renewals` : ""} — ${L("galti hui to Undo (🕘) se wapas", "use Undo (🕘) if it was a mistake")}`);
    onDone?.();
  });
}

// ---------------------------------------------------------------------
//  Locks & requests page
// ---------------------------------------------------------------------
const goLead = (id) => { location.hash = "#/leads/" + id; };
export async function viewRequests(el) {
  const now = Date.now(), soon = new Date(now + 864e5).toISOString();
  const lk = S.settings?.locks || {}, max = lk.max_active_per_user ?? 150;
  const [{ data, error }, { data: mine }, { data: droppedRaw }] = await Promise.all([
    sb.from("lock_requests").select("*").order("created_at", { ascending: false }).limit(200),
    sb.from("leads").select("id, company, city, lock_until, next_follow_up, status, last_contacted").eq("owner_id", S.me.id).gt("lock_until", new Date(now).toISOString()).in("status", OPEN_STATUSES).order("lock_until").limit(1000),
    sb.from("lock_history").select("entity, entity_id, why, reason, at, to_user").eq("from_user", S.me.id).eq("pardoned", false).in("why", DROPS).gt("at", new Date(now - coolDays() * 864e5).toISOString()).order("at", { ascending: false }).limit(200),
  ]);
  if (error) throw error;
  // one row per lead I dropped: chances used, banned or not
  const dmap = new Map();
  (droppedRaw || []).filter((d) => d.to_user !== S.me.id).forEach((d) => { const k = d.entity + ":" + d.entity_id, g = dmap.get(k); if (g) g.n++; else dmap.set(k, { ...d, n: 1 }); });
  const dropped = [...dmap.values()].map((d) => ({ ...d, banned: coolDays() > 0 && d.n > freeChances() })).sort((a, b) => b.banned - a.banned).slice(0, 40);
  const leadIds = data.filter((r) => r.entity === "lead").map((r) => r.entity_id).concat(dropped.filter((d) => d.entity === "lead").map((d) => d.entity_id));
  const rfqIds = data.filter((r) => r.entity === "rfq").map((r) => r.entity_id);
  const [{ data: ls }, { data: rs }] = await Promise.all([
    leadIds.length ? sb.from("leads").select("id, company").in("id", [...new Set(leadIds)]) : { data: [] },
    rfqIds.length ? sb.from("rfqs").select("id, company, rfq_no").in("id", rfqIds) : { data: [] }]);
  const lname = (id) => (ls || []).find((x) => x.id === id)?.company;
  const nm = (r) => r.entity === "lead" ? lname(r.entity_id) : ((x) => x && `${x.rfq_no} · ${x.company}`)((rs || []).find((x) => x.id === r.entity_id));
  const sec = (title, list, mineAsHolder) => `<div class="sec-t" style="margin-top:18px">${title} (${list.length})</div><div class="card">${list.map((r) => `
    <div class="row" style="padding:11px 16px;border-bottom:1px solid var(--line);flex-wrap:nowrap">
      <div style="flex:1;min-width:0"><b>${h(nm(r) || r.entity + " #" + r.entity_id)}</b> <span class="badge">${r.entity === "lead" ? "Lead" : "RFQ"}</span>
        <div class="mu" style="font-size:12.5px">${mineAsHolder ? L(h(userName(r.requester)) + " maang raha/rahi hai", h(userName(r.requester)) + " is asking for it") : "Holder: " + h(userName(r.holder))}${r.note ? ` — “${h(r.note)}”` : ""} · ${h(ago(r.created_at))}</div></div>
      ${r.status === "pending" && (mineAsHolder || isMgr()) && r.requester !== S.me.id ? `<button class="btn sm primary" data-ok="1" data-rq="${r.id}">✅ De do</button><button class="btn sm" data-ok="0" data-rq="${r.id}">Mana</button>` : `<span class="badge ${r.status === "approved" ? "good" : r.status === "pending" ? "warn" : ""}">${h(r.status)}</span>`}
    </div>`).join("") || '<div class="empty" style="padding:16px">—</div>'}</div>`;

  // ---- my locks ----
  const my = mine || [], exp = my.filter((l) => l.lock_until < soon), pct = Math.min(100, Math.round((my.length / max) * 100));
  const myCard = `<div class="card" style="padding:16px">
    <div class="row"><div style="flex:1;min-width:200px"><div class="mu" style="font-size:12.5px">${L("Mere active locks", "My active locks")}</div>
      <div style="font-size:26px;font-weight:700">${my.length} <span class="mu" style="font-size:15px;font-weight:500">/ ${max}</span></div></div>
      ${exp.length ? `<span class="badge warn" style="font-size:13px">⏳ ${exp.length} ${L("kal tak khatam", "expire within 24h")}</span>` : `<span class="badge good">✔ ${L("Koi lock khatam nahi ho raha", "Nothing expiring")}</span>`}</div>
    <div class="lkbar ${pct >= 90 ? "hot" : ""}"><i style="width:${pct}%"></i></div>
    <div class="mu" style="font-size:12.5px">${pct >= 90 ? L("⚠️ Limit ke paas — naye leads lene se pehle purane khatam karo ya release karo.", "⚠️ Near the limit — finish or release old leads before taking new ones.")
      : L(`Lead pe call / email / note karte hi lock ${lk.lead_days ?? 3} din badh jata hai. Kaam nahi kiya to lead pool mein chala jata hai.`, `Any call / email / note on a lead extends its lock by ${lk.lead_days ?? 3} days. No work → it goes back to the pool.`)}</div>
  </div>
  ${exp.length ? `<div class="sec-t" style="margin-top:18px">⏳ ${L("24 ghante mein khatam — aaj call karo", "Expiring in 24h — call today")} (${exp.length})</div><div class="card">${exp.slice(0, 60).map((l) => `
    <div class="row" style="padding:10px 16px;border-bottom:1px solid var(--line);flex-wrap:nowrap;cursor:pointer" data-go-lead="${l.id}">
      <div style="flex:1;min-width:0"><b>${h(l.company)}</b><div class="mu" style="font-size:12.5px">${h(l.city || "")} · ${L("lock khatam", "lock ends")} ${h(dt(l.lock_until))} · ${L("last call", "last call")} ${h(ago(l.last_contacted))}</div></div>
      <button class="btn sm primary">📞 ${L("Kholo", "Open")}</button></div>`).join("")}</div>` : ""}
  ${dropped.length ? `<details class="card sec" style="margin-top:18px" ${dropped.some((d) => d.banned) ? "open" : ""}><summary>🎟️ ${L("Chhode hue leads — chances", "Leads I dropped — chances")} (${dropped.length})${dropped.some((d) => d.banned) ? ` · <span style="color:var(--bad)">${dropped.filter((d) => d.banned).length} ${L("ban", "banned")}</span>` : ""}</summary><div class="card-b" style="padding:4px 16px">
    <div class="mu" style="font-size:12.5px;padding:8px 0">${L(`Har lead pe ${freeChances()} chance: itni baar chhod ke wapas le sakte ho. Uske baad chhoda to ${coolDays()} din ka ban. Galti se hua? Admin se bolo — wo reset kar sakta hai.`, `${freeChances()} chances per lead: you can drop and re-take it that many times. One more drop starts a ${coolDays()}-day ban. A mistake? Ask your Admin to reset it.`)}</div>${dropped.map((d) => `
    <div class="row" style="padding:7px 0;border-top:1px solid var(--line)"><span style="flex:1">${d.entity === "lead" ? `<a href="#/leads/${d.entity_id}">${h(lname(d.entity_id) || "#" + d.entity_id)}</a>` : "RFQ #" + d.entity_id}</span>
      ${d.banned ? `<span class="badge bad">🚫 ${L("Ban", "Banned")} · ${h(dt(new Date(new Date(d.at).getTime() + coolDays() * 864e5)))} ${L("tak", "")}</span>` : `<span class="badge ${d.n >= freeChances() ? "warn" : ""}">🎟️ ${Math.min(d.n, freeChances())}/${freeChances()} ${L("chance use hue", "chances used")}</span>`}
      <span class="mu" style="font-size:12px">${h(d.why === "expire" ? L("lock khatam", "expired") : d.why === "stale" ? L("manager ne hataya", "removed by manager") : L("aapne chhoda", "you released"))}${d.reason ? ` — “${h(d.reason)}”` : ""}</span></div>`).join("")}</div></details>` : ""}`;

  el.innerHTML = myCard
    + sec("🙋 Mujhse maange gaye", data.filter((r) => r.holder === S.me.id && r.status === "pending"), true)
    + sec("📤 Maine maange", data.filter((r) => r.requester === S.me.id), false)
    + (isMgr() ? sec("👥 Team ke pending requests", data.filter((r) => r.status === "pending" && r.holder !== S.me.id && r.requester !== S.me.id), true)
      + `<div class="sec-t" style="margin-top:24px">🎟️ ${L("Team ke bans & chances", "Team bans & chances")}</div><div id="banBox" class="card"><div class="empty" style="padding:16px">…</div></div>
         <div class="sec-t" style="margin-top:24px">🧹 ${L("Stale locks — lock liya par kaam nahi", "Stale locks — locked but no work")}</div><div id="staleBox" class="card"><div class="empty" style="padding:16px">…</div></div>
         <div class="row" style="margin-top:18px;gap:8px"><button class="btn" id="hoBtn">🔁 ${L("Handover (chhuti / resign)", "Handover (leave / exit)")}</button>${isAdmin() ? `<button class="btn" id="lkSet">⚙️ ${L("Lock rules", "Lock rules")}</button>` : ""}</div>` : "");
  $$("[data-rq]", el).forEach((b) => b.onclick = () => decide(+b.dataset.rq, b.dataset.ok === "1").then(() => viewRequests(el)));
  $$("[data-go-lead]", el).forEach((b) => b.onclick = () => goLead(b.dataset.goLead));
  if (!isMgr()) return;
  $("#hoBtn", el).onclick = () => openHandover(null, () => viewRequests(el));
  $("#lkSet", el)?.addEventListener("click", () => lockRules(() => viewRequests(el)));
  staleReport($("#staleBox", el), lk.stale_days ?? 2);
  banReport($("#banBox", el));
}

// managers: who used chances / is banned on which lead — reset it or hand the lead back
async function banReport(box) {
  const { data, error } = await sb.rpc("lock_bans");
  if (error) { box.innerHTML = `<div class="empty" style="padding:16px">${h(error.message)}</div>`; return; }
  const by = new Map(); (data || []).forEach((r) => { if (!by.has(r.user_id)) by.set(r.user_id, []); by.get(r.user_id).push(r); });
  box.innerHTML = `<div class="mu" style="font-size:12.5px;padding:10px 16px;border-bottom:1px solid var(--line)">${L(`Har bande ko har lead pe ${freeChances()} chance milte hain. Chances khatam hone ke baad chhoda to ${coolDays()} din ka ban. Yahan se aap chance / ban hata sakte ho, ya lead seedha wapas de sakte ho.`,
    `Everyone gets ${freeChances()} chances per lead. Dropping it again after that starts a ${coolDays()}-day ban. Reset a chance / ban here, or hand the lead straight back.`)}</div>
    ${[...by].map(([u, rows]) => { const nb = rows.filter((r) => r.banned_until).length; return `<div class="stg"><div class="row" style="padding:10px 16px;border-bottom:1px solid var(--line);flex-wrap:nowrap">
        <b style="flex:1">${h(userName(u))}</b>${nb ? `<span class="badge bad">🚫 ${nb} ${L("ban", "banned")}</span>` : ""}<span class="badge">${rows.length} ${L("lead", rows.length > 1 ? "leads" : "lead")}</span>
        <button type="button" class="btn sm" data-pall="${u}">♻️ ${L("Sab reset", "Reset all")}</button><button type="button" class="btn sm ghost" data-stt>${nb ? L("Chhupao", "Hide") + " ▴" : L("Dikhao", "Show") + " ▾"}</button></div><div class="stl" ${nb ? "" : "hidden"}>
      ${rows.map((r) => `<div class="row" style="padding:8px 16px 8px 32px;border-bottom:1px solid var(--line)">
        <span style="flex:1;min-width:180px"><a href="${r.entity === "lead" ? "#/leads/" + r.entity_id : "#/rfqs"}">${h(r.company || "#" + r.entity_id)}</a> <span class="badge">${r.entity === "lead" ? "Lead" : "RFQ"}</span>
          <div class="mu" style="font-size:12px">${h(r.last_why === "expire" ? L("lock khatam hua", "lock expired") : r.last_why === "stale" ? L("stale — manager ne hataya", "stale — removed by manager") : L("khud chhoda", "released"))}${r.last_reason ? ` — “${h(r.last_reason)}”` : ""} · ${h(ago(r.last_at))}${r.holder ? ` · ${L("abhi", "now with")} ${h(userName(r.holder))}${L(" ke paas", "")}` : ` · ${L("abhi pool mein", "now in the pool")}`}</div></span>
        ${r.banned_until ? `<span class="badge bad">🚫 ${L("Ban", "Banned")} · ${h(dt(r.banned_until))} ${L("tak", "")}</span>` : `<span class="badge ${r.drops >= r.chances ? "warn" : ""}">🎟️ ${Math.min(r.drops, r.chances)}/${r.chances}</span>`}
        <button type="button" class="btn sm" data-pone="${u}|${r.entity}|${r.entity_id}|0">♻️ ${L("Reset", "Reset")}</button>
        ${r.holder && r.holder !== u ? "" : r.holder === u ? "" : `<button type="button" class="btn sm primary" data-pone="${u}|${r.entity}|${r.entity_id}|1">↩️ ${L("Lead wapas do", "Give lead back")}</button>`}</div>`).join("")}</div></div>`; }).join("")
    || `<div class="empty" style="padding:16px">✔ ${L("Kisi ne koi chance use nahi kiya", "Nobody has used a chance")}</div>`}`;
  $$("[data-stt]", box).forEach((b) => b.onclick = () => { const l = b.closest(".stg").querySelector(".stl"); l.hidden = !l.hidden; b.textContent = l.hidden ? L("Dikhao", "Show") + " ▾" : L("Chhupao", "Hide") + " ▴"; });
  const run = (btn, args, msg) => busy(btn, async () => { const { data: d, error: e } = await sb.rpc("pardon_lock", args); if (e) throw e;
    toast(args.p_give ? (d.given ? L("↩️ Lead wapas de diya ✔", "↩️ Lead handed back ✔") : L(`Reset ho gaya, par lead abhi ${userName(d.holder)} ke paas hai`, `Reset done, but the lead is with ${userName(d.holder)} right now`)) : msg); banReport(box); HOOK.softRefresh?.(); });
  $$("[data-pone]", box).forEach((b) => b.onclick = () => { const [u, en, id, give] = b.dataset.pone.split("|"); run(b, { p_user: u, p_entity: en, p_id: +id, p_give: give === "1" }, L("♻️ Chance / ban hata diya ✔", "♻️ Chance / ban cleared ✔")); });
  $$("[data-pall]", box).forEach((b) => b.onclick = async () => { const u = b.dataset.pall;
    if (!(await confirmBox(L(`${userName(u)} ke saare used chances aur ban hata dein?`, `Clear all used chances and bans for ${userName(u)}?`), L("Haan, reset", "Yes, reset")))) return;
    run(b, { p_user: u, p_entity: null, p_id: null, p_give: false }, L("♻️ Sab reset ✔", "♻️ All reset ✔")); });
}

async function staleReport(box, days) {
  const { data, error } = await sb.rpc("stale_locks", { p_days: days });
  if (error) { box.innerHTML = `<div class="empty" style="padding:16px">${h(error.message)}</div>`; return; }
  const by = new Map(); (data || []).forEach((r) => { if (!by.has(r.owner_id)) by.set(r.owner_id, []); by.get(r.owner_id).push(r); });
  box.innerHTML = `<div class="row" style="padding:10px 16px;border-bottom:1px solid var(--line)"><span class="mu" style="font-size:12.5px;flex:1">${L("Jinpe itne din se koi call / email / note nahi hua (aage ka follow-up set ho to nahi dikhte):", "No call / email / note for this many days (leads with a future follow-up are skipped):")}</span>
      <select class="input" id="stD" style="width:auto;height:30px">${[1, 2, 3, 5, 7].map((d) => `<option value="${d}" ${d === days ? "selected" : ""}>${d} ${L("din", d > 1 ? "days" : "day")}</option>`).join("")}</select>
      <button class="btn sm danger" id="stGo" disabled>🧹 ${L("Selected release", "Release selected")} (<span id="stN">0</span>)</button></div>
    ${[...by].map(([u, rows]) => `<div class="stg"><div class="row" style="padding:10px 16px;border-bottom:1px solid var(--line);flex-wrap:nowrap"><input type="checkbox" data-stall="${u}" aria-label="${h(L("Sab chuno", "Select all"))}">
        <b style="flex:1">${h(userName(u))}</b><span class="badge warn">${rows.length}</span><button type="button" class="btn sm ghost" data-stt>${L("Dikhao", "Show")} ▾</button></div><div class="stl" hidden>
      ${rows.map((r) => `<label class="row check" style="padding:7px 16px 7px 40px;border-bottom:1px solid var(--line);flex-wrap:nowrap"><input type="checkbox" data-st="${r.entity}:${r.id}" data-u="${u}">
        <span style="flex:1;min-width:0"><a href="${r.entity === "lead" ? "#/leads/" + r.id : "#/rfqs"}">${h(r.company)}</a> <span class="badge">${r.entity === "lead" ? "Lead" : "RFQ"}</span></span>
        <span class="mu" style="font-size:12px;white-space:nowrap">${L("last kaam", "last work")} ${h(ago(r.last_touch))}</span></label>`).join("")}</div></div>`).join("")
    || `<div class="empty" style="padding:16px">✔ ${L("Sab log apne locks pe kaam kar rahe hain", "Everyone is working their locks")}</div>`}`;
  const sel = () => $$("[data-st]:checked", box);
  const upd = () => { const n = sel().length; $("#stN", box).textContent = n; $("#stGo", box).disabled = !n; };
  $$("[data-st]", box).forEach((c) => c.onchange = upd);
  $$("[data-stall]", box).forEach((c) => c.onchange = () => { $$(`[data-u="${c.dataset.stall}"]`, box).forEach((x) => x.checked = c.checked); upd(); });
  $("#stD", box).onchange = (e) => staleReport(box, +e.target.value);
  $$("[data-stt]", box).forEach((b) => b.onclick = () => { const l = b.closest(".stg").querySelector(".stl"); l.hidden = !l.hidden; b.textContent = l.hidden ? L("Dikhao", "Show") + " ▾" : L("Chhupao", "Hide") + " ▴"; });
  $("#stGo", box).onclick = (e) => busy(e.target, async () => {
    const ids = { lead: [], rfq: [] }; sel().forEach((c) => { const [k, id] = c.dataset.st.split(":"); ids[k].push(+id); });
    if (!(await confirmBox(L(`${ids.lead.length + ids.rfq.length} locks hata ke pool mein daalne hain? Holders ko notification jayega aur wo ${coolDays()} din tak inhe dobara nahi le paayenge.`,
      `Release ${ids.lead.length + ids.rfq.length} locks to the pool? Holders get notified and can't re-lock them for ${coolDays()} days.`), L("Release", "Release")))) return;
    let n = 0;
    for (const k of ["lead", "rfq"]) if (ids[k].length) { const { data: c, error: er } = await sb.rpc("release_bulk", { p_entity: k, p_ids: ids[k], p_reason: L("Kaam nahi hua (stale)", "No work done (stale)") }); if (er) throw er; n += c || 0; }
    toast(`🧹 ${n} ${L("locks pool mein", "locks released to pool")}`); staleReport(box, +$("#stD", box).value);
  });
}

function lockRules(done) {
  const lk = S.settings?.locks || {}, sp = S.settings?.rfq_speed || {};
  const m = modal({
    title: L("⚙️ Lock rules", "⚙️ Lock rules"),
    body: `<div class="grid2">
      <div><label class="f">${L("Lead lock (din)", "Lead lock (days)")}</label><input class="input" type="number" min="1" max="30" id="lr1" value="${lk.lead_days ?? 3}"></div>
      <div><label class="f">${L("RFQ lock (din)", "RFQ lock (days)")}</label><input class="input" type="number" min="1" max="30" id="lr2" value="${lk.rfq_days ?? 2}"></div>
      <div><label class="f">${L("Ek bande ke max locks", "Max locks per person")}</label><input class="input" type="number" min="10" max="2000" id="lr3" value="${lk.max_active_per_user ?? 150}"></div>
      <div><label class="f">${L("Chhoda hua lead dobara lene ka gap (din, 0 = off)", "Re-lock cooldown (days, 0 = off)")}</label><input class="input" type="number" min="0" max="60" id="lr4" value="${lk.cooldown_days ?? 7}"></div>
      <div><label class="f">${L("Stale report: kitne din bina kaam", "Stale report: days without work")}</label><input class="input" type="number" min="1" max="30" id="lr5" value="${lk.stale_days ?? 2}"></div>
      <div><label class="f">${L("Ban se pehle kitne chance (har lead pe)", "Free chances before a ban (per lead)")}</label><input class="input" type="number" min="0" max="10" id="lr6" value="${lk.free_chances ?? 2}"></div>
    </div>
    <div class="sec-t" style="margin-top:16px">⚡ ${L("RFQ speed rule", "RFQ speed rule")}</div>
    <label class="row check"><input type="checkbox" id="rs1" ${sp.enabled !== false ? "checked" : ""}> ${L("Website / email / IndiaMART RFQ pe tay minute mein call / email nahi hua to apne aap agle free bande ko (Mon–Sat, 9:30–7 baje)", "If nobody calls / emails a web / email / IndiaMART RFQ in time, move it to the next free person (Mon–Sat, 9:30–19:00)")}</label>
    <div class="grid2"><div><label class="f">${L("Minute", "Minutes")}</label><input class="input" type="number" min="5" max="240" id="rs2" value="${sp.minutes ?? 15}"></div>
      <div><label class="f">${L("Max kitni baar aage bheje", "Max hops")}</label><input class="input" type="number" min="1" max="10" id="rs3" value="${sp.max_hops ?? 3}"></div></div>
    <p class="mu" style="font-size:12.5px">${L("Pehle us customer ke lead owner ko milta hai, warna jo online hai aur jiske paas kam naye RFQ hain. RFQ page ka access jinke paas hai wahi isme aate hain. Koi na mile to Admin / Manager ko alert.", "It goes first to that customer's lead owner, else to whoever is online with the fewest new RFQs — only people with RFQ page access. If nobody fits, Admin / Manager get an alert.")}</p>`,
    foot: `<button class="btn" data-close>Cancel</button><button class="btn primary" id="lrS">Save</button>`,
  });
  $("#lrS", m).onclick = (e) => busy(e.target, async () => {
    const n = (id) => Math.max(0, parseInt($(id, m).value, 10) || 0), at = new Date().toISOString();
    const locks = { ...lk, lead_days: Math.max(1, n("#lr1")), rfq_days: Math.max(1, n("#lr2")), max_active_per_user: Math.max(10, n("#lr3")), cooldown_days: n("#lr4"), stale_days: Math.max(1, n("#lr5")), free_chances: n("#lr6") };
    const speed = { ...sp, enabled: $("#rs1", m).checked, minutes: Math.max(5, n("#rs2")), max_hops: Math.max(1, n("#rs3")) };
    if (speed.enabled && !sp.enabled) speed.since = at;      // don't reroute old RFQs when switched on later
    const { error } = await sb.from("settings").upsert([{ key: "locks", value: locks, updated_by: S.me.id, updated_at: at }, { key: "rfq_speed", value: speed, updated_by: S.me.id, updated_at: at }]);
    if (error) throw error;
    S.settings.locks = locks; S.settings.rfq_speed = speed;
    closeModal(); toast(L("Lock rules saved ✔", "Lock rules saved ✔")); done?.();
  });
}
export function requestAccess(entity, row) {
  const k = lockOf(row);
  const m = modal({
    title: L(`🙋 ${k.holder} se access maango`, `🙋 Request access from ${k.holder}`),
    body: `<p>${L(`<b>${h(row.company)}</b> abhi <b>${h(k.holder)}</b> ke paas locked hai (till ${h(dt(k.until))}). Request bhejne pe unhe notification jayega; wo approve karenge toh lock aapke naam ho jayega.`,
      `<b>${h(row.company)}</b> is currently locked by <b>${h(k.holder)}</b> (until ${h(dt(k.until))}). They'll get a notification; if they approve, the lock moves to you.`)}</p>
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
