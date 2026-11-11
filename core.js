// =====================================================================
//  Genesis CRM — core: Supabase client, state, helpers, UI primitives
// =====================================================================
import { CONFIG } from "./config.js";

if (!window.supabase) throw new Error("supabase-js failed to load");
export const sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: window.sessionStorage },
});

// ---------- global state ----------
export const S = {
  session: null, me: null, team: [], teamById: new Map(), settings: {}, announcement: null,
  route: "dashboard", params: {},
};

// ---------- constants ----------
export const STATUSES = [
  ["new", "New", ""], ["contacted", "Contacted", "info"], ["interested", "Interested", "acc"],
  ["quote_sent", "Quote sent", "info"], ["demo", "Demo / Meeting", "info"], ["negotiation", "Negotiation", "warn"],
  ["won", "Won", "good"], ["lost", "Lost", "bad"], ["junk", "Junk", "bad"],
];
export const STATUS = Object.fromEntries(STATUSES.map(([k, l, c]) => [k, { l, c }]));
export const OPEN_STATUSES = ["new", "contacted", "interested", "quote_sent", "demo", "negotiation"];
export const CATEGORIES = ["Design software", "Security", "IT Hardware", "Networking & CCTV"];
export const RFQ_STATUSES = [["new", "New", "info"], ["in_progress", "In progress", "acc"], ["quoted", "Quoted", "info"], ["negotiating", "Negotiating", "warn"], ["won", "Won", "good"], ["lost", "Lost", "bad"]];
export const RFQ_STATUS = Object.fromEntries(RFQ_STATUSES.map(([k, l, c]) => [k, { l, c }]));
export const ROLES = [["admin", "Admin"], ["manager", "Manager"], ["sales", "Sales Executive"], ["telecaller", "Telecaller"], ["presales", "Presales / Tech"]];
export const ROLE = Object.fromEntries(ROLES);
export const SOURCES = { manual: "Manual", import: "CSV import", legacy: "Old desk", google_places: "Auto · Google", indiamart: "IndiaMART", webform: "Website", webhook: "Webhook" };

// call outcomes → [label, tone, new lead status | null, auto follow-up in hours | null]
export const OUTCOMES = [
  ["no_answer", "Uthaya nahi", "", null, 24], ["busy", "Busy, baad mein", "", null, 3],
  ["not_interested", "Interested nahi", "bad", "lost", null], ["wrong_number", "Galat number", "bad", "junk", null],
  ["interested", "Interested hai", "good", "interested", 48], ["quote", "Quote bheja", "", "quote_sent", 72],
  ["demo", "Demo / meeting fix", "", "demo", 24], ["won", "Deal ho gayi 🎉", "good", "won", null],
];
export const OUTCOME = Object.fromEntries(OUTCOMES.map((o) => [o[0], o]));

// ---------- role helpers ----------
export const isAdmin = () => S.me?.role === "admin";
export const isMgr = () => ["admin", "manager"].includes(S.me?.role);

// ---------- formatting / escaping ----------
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const h = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
export const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
export const inrShort = (n) => {
  n = Number(n || 0);
  if (n >= 1e7) return "₹" + (n / 1e7).toFixed(n >= 1e8 ? 0 : 1) + " Cr";
  if (n >= 1e5) return "₹" + (n / 1e5).toFixed(n >= 1e6 ? 0 : 1) + " L";
  return inr(n);
};
export const num = (n) => Number(n || 0).toLocaleString("en-IN");
export const initials = (s) => String(s || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
export function ago(t) {
  if (!t) return "—";
  const s = (Date.now() - new Date(t).getTime()) / 1000, f = s < 0, a = Math.abs(s);
  const v = a < 60 ? "abhi" : a < 3600 ? Math.round(a / 60) + " min" : a < 86400 ? Math.round(a / 3600) + " ghante" : Math.round(a / 86400) + " din";
  return a < 60 ? v : f ? v + " mein" : v + " pehle";
}
export const dt = (t) => t ? new Date(t).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
export const dOnly = (t) => t ? new Date(t).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
export const telHref = (p) => { const d = String(p || "").replace(/[^\d+]/g, ""); return d ? "tel:" + d : ""; };
export const waHref = (p, text = "") => {
  let d = String(p || "").replace(/\D/g, "");
  if (d.length === 10) d = "91" + d; else if (d.length === 11 && d[0] === "0") d = "91" + d.slice(1);
  return d.length >= 11 ? `https://wa.me/${d}${text ? "?text=" + encodeURIComponent(text) : ""}` : "";
};
export const isMobile = (p) => /^[6-9]\d{9}$/.test(String(p || "").replace(/\D/g, "").slice(-10));
export const statusBadge = (s) => `<span class="badge ${STATUS[s]?.c || ""}">${h(STATUS[s]?.l || s)}</span>`;
export const rfqBadge = (s) => `<span class="badge ${RFQ_STATUS[s]?.c || ""}">${h(RFQ_STATUS[s]?.l || s)}</span>`;
export const userName = (id) => S.teamById.get(id)?.full_name || (id ? "—" : "Unassigned");
export const online = (u) => u?.last_seen && Date.now() - new Date(u.last_seen).getTime() < 3 * 60e3;
export function followBadge(t) {
  if (!t) return "";
  const d = new Date(t).getTime() - Date.now();
  if (d < 0) return `<span class="badge bad">Overdue · ${h(ago(t))}</span>`;
  if (d < 864e5) return `<span class="badge warn">Aaj · ${new Date(t).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>`;
  return `<span class="badge">${h(dt(t))}</span>`;
}
export const toLocalInput = (t) => {
  if (!t) return "";
  const d = new Date(t); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

// ---------- icons (inline SVG, stroke = currentColor) ----------
const P = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  phone: "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  kanban: "M3 3h6v18H3zM10 3h5v12h-5zM16 3h5v8h-5z",
  inbox: "M22 12h-6l-2 3h-4l-2-3H2M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z",
  check: "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
  chart: "M3 3v18h18M7 16v-5M12 16V8M17 16v-8",
  bot: "M12 8V4H8M4 12a8 8 0 0 1 8-4 8 8 0 0 1 8 4v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM9 13v2M15 13v2",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
  plus: "M12 5v14M5 12h14", x: "M18 6 6 18M6 6l12 12",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
  menu: "M3 12h18M3 6h18M3 18h18", logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  mail: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6l-10 7L2 6",
  wa: "M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.5A8.4 8.4 0 1 1 21 11.5z",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  upload: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12",
  play: "M5 3l14 9-14 9z", refresh: "M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15",
  calendar: "M3 4h18v18H3zM16 2v4M8 2v4M3 10h18", copy: "M20 9h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1",
  print: "M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z",
  next: "M5 12h14M12 5l7 7-7 7", trash: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6",
};
export const ic = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${P[n] || ""}"/></svg>`;

// ---------- toast ----------
export function toast(msg, bad = false) {
  let w = document.querySelector(".toasts");
  if (!w) { w = document.createElement("div"); w.className = "toasts"; w.setAttribute("role", "status"); document.body.append(w); }
  const t = document.createElement("div");
  t.className = "toast" + (bad ? " bad" : ""); t.textContent = msg; w.append(t);
  setTimeout(() => t.remove(), bad ? 5200 : 3200);
}
export const fail = (e) => { console.error(e); toast(friendly(e), true); };
export function friendly(e) {
  const m = String(e?.message || e || "Error");
  if (/duplicate key.*phone/i.test(m)) return "Ye phone number pehle se kisi lead mein hai";
  if (/row-level security|permission denied/i.test(m)) return "Aapko ye karne ki permission nahi hai";
  if (/Failed to fetch|NetworkError/i.test(m)) return "Internet / server se connect nahi ho paya";
  if (/PGRST116|0 rows|multiple \(or no\) rows/i.test(m)) return "Ye record ab aapke paas locked nahi hai (ya mila nahi) — refresh karo";
  if (/Lock badalne/i.test(m)) return m;
  return m.length > 160 ? m.slice(0, 160) + "…" : m;
}

// ---------- modal ----------
export function modal({ title, body, foot = "", wide = false, onMount }) {
  closeModal();
  const scrim = document.createElement("div"); scrim.className = "scrim m"; scrim.dataset.modal = "1";
  const m = document.createElement("div"); m.className = "modal" + (wide ? " wide" : ""); m.dataset.modal = "1";
  m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true"); m.setAttribute("aria-label", title);
  m.innerHTML = `<div class="modal-h"><h3>${h(title)}</h3><button class="btn ghost icon right" data-close aria-label="Close">${ic("x")}</button></div><div class="modal-b">${body}</div>${foot ? `<div class="modal-f">${foot}</div>` : ""}`;
  scrim.onclick = closeModal;
  m.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeModal(); });
  document.body.append(scrim, m);
  const f = m.querySelector("input:not([type=hidden]),select,textarea"); f?.focus();
  onMount?.(m);
  return m;
}
export const closeModal = () => document.querySelectorAll("[data-modal]").forEach((n) => n.remove());

export function confirmBox(text, okLabel = "Haan, karo") {
  return new Promise((res) => {
    const m = modal({ title: "Confirm", body: `<p>${h(text)}</p>`, foot: `<button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>${h(okLabel)}</button>` });
    m.querySelector("[data-ok]").onclick = () => { closeModal(); res(true); };
    m.querySelector("[data-close]").addEventListener("click", () => res(false));
  });
}

// read a form into an object (empty strings → null)
export function formData(root) {
  const o = {};
  root.querySelectorAll("[name]").forEach((el) => {
    if (el.type === "checkbox") { if (el.dataset.multi) (o[el.name] ||= []), el.checked && o[el.name].push(el.value); else o[el.name] = el.checked; }
    else o[el.name] = el.value.trim() === "" ? null : el.value.trim();
  });
  return o;
}

// busy button helper
export async function busy(btn, fn) {
  if (btn) { btn.disabled = true; btn.dataset.l = btn.innerHTML; btn.innerHTML = "…"; }
  try { return await fn(); } catch (e) { fail(e); } finally { if (btn) { btn.disabled = false; btn.innerHTML = btn.dataset.l; } }
}

// ---------- CSV ----------
export function toCSV(rows, cols) {
  const q = (v) => {
    let s = Array.isArray(v) ? v.join("; ") : String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // spreadsheet formula injection guard
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return "﻿" + [cols.map((c) => q(c[1])).join(","), ...rows.map((r) => cols.map((c) => q(typeof c[0] === "function" ? c[0](r) : r[c[0]])).join(","))].join("\n");
}
export function download(name, text, type = "text/csv;charset=utf-8") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export function parseCSV(t) {
  t = t.replace(/^﻿/, "");
  const rows = [], n = t.length; let row = [], f = "", q = false;
  for (let i = 0; i < n; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

// ---------- edge function call ----------
export async function callFn(name, body) {
  const { data, error } = await sb.functions.invoke(name, { body });
  if (error) {
    let msg = error.message;
    try { const j = await error.context?.json?.(); if (j?.error) msg = j.error; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return data;
}

// ---------- team cache ----------
export async function loadTeam() {
  const { data, error } = await sb.from("profiles").select("id, email, full_name, role, active, daily_target, categories, last_seen, created_at").order("full_name");
  if (error) throw error;
  S.team = data || [];
  S.teamById = new Map(S.team.map((u) => [u.id, u]));
}
export const assignable = () => S.team.filter((u) => u.active);

// =====================================================================
//  Cross-module hooks (main.js fills these; comms.js calls them)
// =====================================================================
export const HOOK = { openLead: null, softRefresh: () => {}, refreshBadges: () => {}, openRfq: null, go: (l) => { location.hash = l; } };

// ---------- locks ----------
export function lockOf(row) {
  const free = !row?.owner_id || (row.lock_until && new Date(row.lock_until).getTime() < Date.now());
  const mine = !free && row.owner_id === S.me?.id;
  return { free, mine, other: !free && !mine, holder: free ? null : userName(row.owner_id), until: row?.lock_until };
}
export const canWork = (row) => isMgr() || lockOf(row).mine;
export function lockBadge(row) {
  const k = lockOf(row);
  if (k.free) return `<span class="badge">🔓 Free</span>`;
  if (k.mine) return `<span class="badge acc">🔒 Aap</span>`;
  return `<span class="badge warn" title="Lock: ${h(k.holder)}">🔒 ${h(k.holder)}</span>`;
}
export async function claim(entity, id) {
  const { data, error } = await sb.rpc("claim", { p_entity: entity, p_id: id });
  if (error) throw error;
  return data || { ok: false };
}
export function claimFailMsg(r) {
  if (r.reason === "limit") return `Aapke paas already ${r.limit} active locks hain — pehle kuch release karo`;
  if (r.reason === "locked") return `🔒 ${r.holder_name || "Koi aur"} is pe kaam kar raha hai (till ${dt(r.until)})`;
  return "Lock nahi mil paya";
}
export const maskPhone = (p) => { const s = String(p || ""); const d = s.replace(/\D/g, ""); return d.length < 6 ? "•••" : s.slice(0, 7) + " ••• " + d.slice(-3); };
export const maskEmail = (e) => { const [a, b] = String(e || "").split("@"); return b ? a.slice(0, 1) + "•••@" + b : "•••"; };

// ---------- template variables ----------
export function tplContext({ lead, rfq } = {}) {
  const co = S.settings.company || {};
  const products = rfq?.product || (lead?.products || []).slice(0, 3).join(", ");
  return {
    company: rfq?.company || lead?.company || "",
    contact_name: rfq?.contact || lead?.contact_name || "",
    city: rfq?.city || lead?.city || "",
    area: lead?.area || "",
    product: products || "",
    rfq_no: rfq?.rfq_no || "",
    qty_text: rfq?.qty ? ` (Qty: ${rfq.qty})` : "",
    category: lead?.category || "",
    my_name: S.me?.full_name || "",
    my_first_name: (S.me?.full_name || "").split(" ")[0],
    my_designation: S.me?.designation || ROLE[S.me?.role] || "",
    my_email: S.me?.email || "",
    my_phone: S.me?.phone || "",
    company_name: co.name || "",
    our_website: co.website || "www.genesisinfoserve.com",
    today: new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
  };
}
export const TPL_VARS = ["company", "contact_name", "city", "product", "rfq_no", "qty_text", "my_name", "my_designation", "my_email", "my_phone", "our_website", "today"];
export function fillTemplate(text, ctx) {
  return String(text || "").replace(/\{\{\s*([a-z_]+)\s*(?:\|([^}]*))?\}\}/gi, (_, k, fb) => {
    const v = ctx[k.toLowerCase()];
    return v != null && String(v).trim() !== "" ? String(v) : (fb ?? "");
  }).replace(/[ \t]+\n/g, "\n").replace(/\n{4,}/g, "\n\n\n");
}

// **bold** → Unicode sans-serif bold (works inside plain-text compose links)
const boldChar = (c) => {
  const x = c.codePointAt(0);
  if (x >= 65 && x <= 90) return String.fromCodePoint(0x1d5d4 + x - 65);
  if (x >= 97 && x <= 122) return String.fromCodePoint(0x1d5ee + x - 97);
  if (x >= 48 && x <= 57) return String.fromCodePoint(0x1d7ec + x - 48);
  return c;
};
export const mdToPlain = (t) => String(t || "").replace(/\*\*([^*\n]+)\*\*/g, (_, s) => [...s].map(boldChar).join(""));
export const mdStrip = (t) => String(t || "").replace(/\*\*([^*\n]+)\*\*/g, "$1");
export function mdToHtml(t) {
  return h(t).replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>")
    .replace(/(https?:\/\/[^\s<]+|www\.[^\s<]+\.[a-z]{2,}[^\s<]*)/gi, (u) => `<a href="${u.startsWith("http") ? u : "https://" + u}">${u}</a>`)
    .replace(/\n/g, "<br>");
}
// WhatsApp uses *bold*
export const mdToWhatsApp = (t) => String(t || "").replace(/\*\*([^*\n]+)\*\*/g, "*$1*");

// ---------- compose links ----------
const enc = encodeURIComponent;
export function composeUrl(provider, { to = "", cc = "", bcc = "", subject = "", body = "" }) {
  const qp = (o) => Object.entries(o).filter(([, v]) => v).map(([k, v]) => `${k}=${enc(v)}`).join("&");
  if (provider === "gmail") return "https://mail.google.com/mail/?view=cm&fs=1&tf=1&" + qp({ authuser: S.me?.email, to, cc, bcc, su: subject, body });
  if (provider === "outlook") return "https://outlook.office.com/mail/deeplink/compose?" + qp({ to, cc, bcc, subject, body });
  return "mailto:" + String(to).split(/[,;]\s*/).filter(Boolean).map(enc).join(",") + "?" + qp({ cc, bcc, subject, body });
}
export const URL_LIMIT = { gmail: 7000, outlook: 7000, mailto: 1800 };
export function waUrl(phone, text, web = false) {
  let d = String(phone || "").replace(/\D/g, "");
  if (d.length === 10) d = "91" + d; else if (d.length === 11 && d[0] === "0") d = "91" + d.slice(1);
  return web ? `https://web.whatsapp.com/send?phone=${d}&text=${enc(text)}` : `https://wa.me/${d}?text=${enc(text)}`;
}
export function openTab(url) {
  const w = window.open(url, "_blank");
  if (w) { try { w.opener = null; } catch { /* ignore */ } return true; }
  return false;
}
export async function copyRich(md) {
  const html = `<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt">${mdToHtml(md)}</div>`;
  try {
    if (window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([mdToPlain(md)], { type: "text/plain" }) })]);
      return true;
    }
  } catch { /* fall through */ }
  try { await navigator.clipboard.writeText(mdToPlain(md)); return true; } catch { return false; }
}
export function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[data-src="${src}"]`)) return res();
    const s = document.createElement("script"); s.src = src; s.dataset.src = src;
    s.onload = () => res(); s.onerror = () => rej(new Error(src + " load nahi hui"));
    document.head.append(s);
  });
}
