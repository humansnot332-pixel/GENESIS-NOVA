// =====================================================================
//  Genesis CRM — Import Center
//  Excel (.xlsx) / CSV / old Calling-Desk backup (.json)
//  → companies (leads), quotations (with line items), RFQs
//  Auto-detect · smart column mapping · validation · duplicate merge ·
//  dry-run preview · chunked import with progress · one-click UNDO.
// =====================================================================
import { sb, S, h, ic, toast, fail, confirmBox, busy, isMgr, userName, dt, num, inr, download, CATEGORIES, assignable, HOOK } from "./core.js";
import { L } from "./i18n.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// ---------------------------------------------------------------------
//  File readers
// ---------------------------------------------------------------------
async function inflateRaw(u8) {
  const ds = new DecompressionStream("deflate-raw");
  return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(ds)).arrayBuffer());
}
function unzip(buf) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf);
  let e = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error(L("Ye sahi .xlsx file nahi hai", "This is not a valid .xlsx file"));
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
  const files = {};
  for (let i = 0; i < n && dv.getUint32(p, true) === 0x02014b50; i++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true),
      xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lho = dv.getUint32(p + 42, true);
    files[new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nl))] = { method, csize, lho };
    p += 46 + nl + xl + cl;
  }
  return async (name) => {
    const f = files[name]; if (!f) return null;
    const s = f.lho + 30 + dv.getUint16(f.lho + 26, true) + dv.getUint16(f.lho + 28, true);
    const d = u8.subarray(s, s + f.csize);
    return new TextDecoder().decode(f.method === 0 ? d : await inflateRaw(d));
  };
}
const xml = (t) => new DOMParser().parseFromString(t, "application/xml");
const colIdx = (ref) => { let n = 0; for (const ch of ref.replace(/\d+/g, "")) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
const serialToISO = (v) => { const d = new Date(Math.round((v - 25569) * 864e5)); return isNaN(d) ? "" : d.toISOString().slice(0, 10); };

async function readXlsx(buf) {
  const read = unzip(buf);
  const wb = xml(await read("xl/workbook.xml") || "");
  const rels = xml(await read("xl/_rels/workbook.xml.rels") || "<x/>");
  const relMap = {}; [...rels.getElementsByTagName("Relationship")].forEach((r) => { relMap[r.getAttribute("Id")] = r.getAttribute("Target"); });
  const ss = []; const sst = await read("xl/sharedStrings.xml");
  if (sst) [...xml(sst).getElementsByTagName("si")].forEach((si) => ss.push([...si.getElementsByTagName("t")].filter((t) => t.parentNode.nodeName !== "rPh").map((t) => t.textContent).join("")));
  // which cell styles are dates
  const dateStyle = new Set(); const st = await read("xl/styles.xml");
  if (st) {
    const sd = xml(st), custom = {};
    [...sd.getElementsByTagName("numFmt")].forEach((f) => { custom[f.getAttribute("numFmtId")] = f.getAttribute("formatCode") || ""; });
    const xfs = sd.getElementsByTagName("cellXfs")[0];
    if (xfs) [...xfs.getElementsByTagName("xf")].forEach((xf, i) => {
      const id = +xf.getAttribute("numFmtId"), code = custom[id] || "";
      if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47) || (code && /[dy]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]/g, "")) && !/0\.0|#/.test(code))) dateStyle.add(i);
    });
  }
  const sheets = [];
  for (const s of [...wb.getElementsByTagName("sheet")]) {
    const target = relMap[s.getAttribute("r:id")] || "";
    const path = target.startsWith("/") ? target.slice(1) : "xl/" + target.replace(/^\.\//, "");
    const txt = await read(path); if (!txt) continue;
    const rows = [];
    for (const r of [...xml(txt).getElementsByTagName("row")]) {
      const out = [];
      for (const c of [...r.getElementsByTagName("c")]) {
        const t = c.getAttribute("t"), v = c.getElementsByTagName("v")[0]?.textContent ?? "", i = colIdx(c.getAttribute("r") || "A1");
        let val;
        if (t === "s") val = ss[+v] ?? "";
        else if (t === "inlineStr") val = [...c.getElementsByTagName("t")].map((x) => x.textContent).join("");
        else if (t === "b") val = v === "1" ? "TRUE" : "FALSE";
        else if (t === "str" || t === "e") val = v;
        else if (v !== "" && dateStyle.has(+c.getAttribute("s"))) val = serialToISO(+v);
        else val = v;
        out[i] = String(val ?? "");
      }
      rows[+r.getAttribute("r") - 1] = Array.from(out, (x) => x ?? "");
    }
    sheets.push({ name: s.getAttribute("name"), rows: Array.from(rows, (x) => x || []).filter((x) => x.some((c) => String(c).trim())) });
  }
  return sheets;
}
function readDelimited(text) {
  text = text.replace(/^﻿/, "");
  const first = text.split(/\r?\n/, 1)[0];
  const d = [",", ";", "\t", "|"].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"' && f === "") q = true;
    else if (c === d) { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return [{ name: "CSV", rows: rows.filter((r) => r.some((x) => x.trim())) }];
}

// ---------------------------------------------------------------------
//  Field definitions + synonym matching
// ---------------------------------------------------------------------
const F = {
  companies: [
    ["company", "Company *", /^(company|firm|organi[sz]ation|customer|client|party|account|business)( ?name)?$|^name of (company|firm)|^company/i, true],
    ["contact_name", "Contact person", /contact( ?person| ?name)?$|^person|concern(ed)? person|^name$/i],
    ["designation", "Designation", /designation|title|role|post/i],
    ["phone", "Phone / mobile", /^(phone|mobile|mob|cell|contact)( ?(no|number|#))?\.?( ?1)?$|^tel|whatsapp/i],
    ["alt_phone", "Alternate phone", /alt|alternate|other ?phone|phone ?2|landline|mobile ?2/i],
    ["email", "Email", /e-?mail/i], ["website", "Website", /web|site|url/i],
    ["address", "Address", /address|addr/i], ["area", "Area / locality", /area|locality|location/i],
    ["city", "City", /city|town/i], ["state", "State", /^state/i], ["pincode", "Pincode", /pin|zip|postal/i],
    ["gstin", "GSTIN", /gst/i], ["pan", "PAN", /^pan/i],
    ["industry", "Industry / type", /industry|segment|vertical|business type|^type/i], ["category", "Category", /categor/i],
    ["products", "Products", /product|interest|requirement/i], ["status", "Status / stage", /status|stage/i],
    ["deal_value", "Deal value (₹)", /value|amount|budget|revenue/i], ["notes", "Notes / remarks", /note|remark|comment|description/i],
    ["owner", "Sales person / owner", /owner|sales ?(person|executive|rep)|assigned|handled|executive|account manager/i],
    ["tags", "Tags", /tag|label/i], ["next_follow_up", "Next follow-up", /follow|next (call|date)|reminder/i],
  ],
  quotations: [
    ["quote_no", "Quotation no. *", /(quot(e|ation)|proposal|offer|ref(erence)?|qtn)( ?(no|number|#|id))|^(quote|quotation|qtn) ?no|^no\.?$/i, true],
    ["version", "Version", /^ver(sion)?$|revision|rev/i], ["quote_date", "Date", /date/i],
    ["status", "Status", /status|stage|result/i], ["customer", "Customer *", /customer|client|company|party|bill ?to|to$/i, true],
    ["contact", "Contact person", /^contact|contact ?person|kind attn|attention|^person|^name$/i], ["email", "Email", /e-?mail/i], ["phone", "Phone", /phone|mobile|tel/i],
    ["gstin", "Customer GSTIN", /gst/i], ["address", "Address", /address/i], ["city", "City", /city/i], ["state", "State", /state|place of supply/i],
    ["item_desc", "Item / description", /item|description|product|particular|model|desc/i], ["hsn", "HSN / SAC", /hsn|sac/i],
    ["qty", "Qty", /^q(ty|uantity)|units?$|nos/i], ["unit_price", "Rate / unit price", /rate|unit ?price|price|basic/i],
    ["tax_rate", "GST %", /gst ?%|tax ?%|tax rate|gst rate|^gst$|^tax$/i], ["line_total", "Line amount", /line ?(total|amount)|^amount$|item ?total/i],
    ["grand_total", "Grand total", /grand|net ?total|total ?(amount|value)|invoice ?value|^total$/i],
    ["notes", "Notes / terms", /note|term|remark/i], ["owner", "Sales person", /sales|owner|executive|prepared by|created by/i],
  ],
  rfqs: [
    ["rfq_no", "RFQ / enquiry no.", /(rfq|enquiry|inquiry|ref)( ?(no|number|#|id))?$/i], ["company", "Company *", /company|customer|client|buyer|firm|organi/i, true],
    ["contact", "Contact", /^contact|contact ?person|^person|^(buyer|customer) ?name$|^name$/i], ["phone", "Phone", /phone|mobile|tel/i], ["email", "Email", /e-?mail/i], ["city", "City", /city|location/i],
    ["product", "Product / requirement *", /product|item|requirement|description|subject/i, true], ["qty", "Qty", /q(ty|uantity)/i],
    ["details", "Details", /detail|message|remark|note|spec/i], ["due_date", "Due date", /due|deadline|closing|last date/i],
    ["status", "Status", /status|stage/i], ["quoted_value", "Quoted value (₹)", /quoted|value|amount/i], ["created", "Enquiry date", /^date|received|created|enquiry date/i],
  ],
};
const KIND = {
  companies: ["🏢", L("Companies / customers", "Companies / customers"), L("Leads, customers, contacts — GSTIN aur address ke saath", "Leads, customers, contacts — with GSTIN and address")],
  quotations: ["📄", L("Purani quotations", "Past quotations"), L("Har row ek item ho ya ek quotation — dono chalega. Customer apne aap link hota hai.", "One row per item or per quotation — both work. Customers are linked automatically.")],
  rfqs: ["📨", "RFQs / enquiries", L("Purani enquiries aur unka status", "Past enquiries and their status")],
  erp_backup: ["🗂", L("Purane Calling Desk ka backup", "Old Calling Desk backup"), L("gdcd_erp_backup_….json — companies + quotations ek saath", "gdcd_erp_backup_….json — companies + quotations in one go")],
};
const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const keyName = (s) => norm(s).toLowerCase().replace(/&/g, " and ").replace(/\b(m\/s|messrs|the|pvt|private|ltd|limited|llp|inc|co|company|corporation|corp)\b\.?/g, "").replace(/[^a-z0-9]+/g, "");
const p10 = (s) => { const d = String(s ?? "").replace(/\D/g, ""); return d.length >= 10 ? d.slice(-10) : ""; };
const num0 = (s) => { const n = Number(String(s ?? "").replace(/[₹,\s]|rs\.?|inr/gi, "")); return Number.isFinite(n) ? n : 0; };
const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/i;
const GST_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const GST_STATE = { "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur", "15": "Mizoram", "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal", "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat", "26": "Dadra & Nagar Haveli and Daman & Diu", "27": "Maharashtra", "29": "Karnataka", "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry", "35": "Andaman & Nicobar", "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh" };
function toISODate(v) {
  const s = norm(v); if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{5}(\.\d+)?$/.test(s)) return serialToISO(+s);
  let m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (m) { const y = m[3].length === 2 ? "20" + m[3] : m[3]; return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
  m = s.match(/^(\d{1,2})[ -]([a-z]{3})[a-z]*[ -,]*(\d{2,4})/i);
  if (m) { const mo = "janfebmaraprmayjunjulaugsepoctnovdec".indexOf(m[2].toLowerCase()) / 3 + 1; if (mo > 0) { const y = m[3].length === 2 ? "20" + m[3] : m[3]; return `${y}-${String(mo).padStart(2, "0")}-${m[1].padStart(2, "0")}`; } }
  const d = new Date(s); return isNaN(d) ? "" : d.toISOString().slice(0, 10);
}
const LEAD_ST = [[/won|customer|order|converted|closed ?won|po/i, "won"], [/lost|not interested|closed ?lost|reject/i, "lost"], [/junk|invalid|wrong|spam/i, "junk"], [/negoti/i, "negotiation"], [/demo|meeting/i, "demo"], [/quot/i, "quote_sent"], [/interest|hot|warm/i, "interested"], [/contact|called|follow/i, "contacted"]];
const QUOTE_ST = [[/won|order|po|accept|approv|confirm/i, "won"], [/lost|reject|declin|cancel/i, "lost"], [/sent|submit|shared|mailed/i, "sent"]];
const RFQ_ST = [[/won|order/i, "won"], [/lost|reject|cancel/i, "lost"], [/negoti/i, "negotiating"], [/quot/i, "quoted"], [/progress|working/i, "in_progress"]];
const mapSt = (v, list, d) => { const s = norm(v); if (!s) return d; for (const [re, k] of list) if (re.test(s)) return k; return d; };
function guessCat(t) {
  const s = String(t || "").toLowerCase();
  if (/autocad|autodesk|revit|adobe|sketchup|v-?ray|lumion|architect|interior|design/.test(s)) return "Design software";
  if (/firewall|antivirus|security|backup|ca firm|chartered|law|legal|financ/.test(s)) return "Security";
  if (/cctv|camera|network|wifi|wi-fi|switch|router|hospital|hotel/.test(s)) return "Networking & CCTV";
  return "IT Hardware";
}
function ownerOf(v) {
  const s = norm(v).toLowerCase(); if (!s) return null;
  const t = assignable();
  return (t.find((u) => u.email.toLowerCase() === s) || t.find((u) => u.full_name.toLowerCase() === s)
    || (() => { const m = t.filter((u) => u.full_name.toLowerCase().split(" ")[0] === s.split(" ")[0]); return m.length === 1 ? m[0] : null; })())?.id || null;
}
function autoMap(kind, header) {
  const used = new Set(), map = {};
  for (const [k, , re] of F[kind]) {
    const i = header.findIndex((hd, j) => !used.has(j) && re.test(norm(hd)));
    if (i >= 0) { map[k] = i; used.add(i); }
  }
  return map;
}
function detectKind(header) {
  let best = "companies", score = -1;
  for (const k of ["quotations", "rfqs", "companies"]) {
    const m = autoMap(k, header), s = Object.keys(m).length + (k === "quotations" && m.quote_no != null ? 3 : 0) + (k === "rfqs" && (m.rfq_no != null || m.product != null) && m.quote_no == null ? 1 : 0);
    if (s > score) { score = s; best = k; }
  }
  return best;
}
function headerRow(rows) {   // first row (of the first 10) that looks like a header
  let bi = 0, bs = -1;
  rows.slice(0, 10).forEach((r, i) => {
    const s = r.filter((c) => /[a-z]/i.test(c) && String(c).length < 40).length;
    if (s > bs) { bs = s; bi = i; }
  });
  return bi;
}

// ---------------------------------------------------------------------
//  Existing data (for duplicate detection)
// ---------------------------------------------------------------------
async function existingLeads() {
  const all = [];
  for (let p = 0; p < 50; p++) {
    const { data, error } = await sb.from("leads").select("id, company, phone_norm, email, gstin, owner_id, contact_name, address, city, state, pincode, pan, website, notes, industry, area")
      .order("id").range(p * 1000, p * 1000 + 999);
    if (error) throw error; all.push(...data); if (data.length < 1000) break;
  }
  const byPhone = new Map(), byGst = new Map(), byName = new Map(), byEmail = new Map();
  for (const l of all) {
    if (l.phone_norm) byPhone.set(l.phone_norm, l);
    if (l.gstin) byGst.set(l.gstin.toUpperCase(), l);
    if (l.email) byEmail.set(l.email.toLowerCase(), l);
    const k = keyName(l.company); if (k && !byName.has(k)) byName.set(k, l);
  }
  return { all, find: (r) => (r.gstin && byGst.get(r.gstin)) || (r._p10 && byPhone.get(r._p10)) || (r.email && byEmail.get(r.email.toLowerCase())) || byName.get(keyName(r.company)) || null };
}

// ---------------------------------------------------------------------
//  Build normalized records + issues
// ---------------------------------------------------------------------
function cell(row, map, k) { const i = map[k]; return i == null ? "" : norm(row[i]); }
function buildCompanies(rows, map, ex) {
  const seen = new Map();
  return rows.map((row, idx) => {
    const r = { _row: idx + 1, issues: [], warn: [] };
    for (const [k] of F.companies) r[k] = cell(row, map, k);
    r.gstin = r.gstin.toUpperCase().replace(/\s/g, "");
    if (!r.company) r.issues.push(L("Company naam khaali", "Company name missing"));
    if (r.email && !EMAIL_RE.test(r.email)) { r.warn.push(L("Email galat — chhod diya", "Invalid email — skipped")); r.email = ""; }
    r._p10 = p10(r.phone);
    if (r.phone && !r._p10) r.warn.push(L("Phone adhoora", "Incomplete phone"));
    if (r.gstin && !GST_RE.test(r.gstin)) r.warn.push(L("GSTIN format galat", "GSTIN format looks wrong"));
    if (!r.state && GST_RE.test(r.gstin)) r.state = GST_STATE[r.gstin.slice(0, 2)] || "";
    if (r.next_follow_up) r.next_follow_up = toISODate(r.next_follow_up);
    const k = r._p10 || r.gstin || keyName(r.company);
    if (k && seen.has(k)) { r.dupFile = seen.get(k); r.warn.push(L(`File mein row ${seen.get(k)} jaisa`, `Same as row ${seen.get(k)} in file`)); } else if (k) seen.set(k, r._row);
    r.match = r.company ? ex.find(r) : null;
    r.state_ = r.issues.length ? "error" : r.dupFile ? "dupfile" : r.match ? "dup" : "new";
    return r;
  });
}
function buildQuotes(rows, map, ex) {
  const groups = new Map();
  rows.forEach((row, idx) => {
    const no = cell(row, map, "quote_no"), ver = Math.max(1, parseInt(cell(row, map, "version"), 10) || 1);
    const key = no ? no + "#" + ver : "__row" + idx;
    if (!groups.has(key)) groups.set(key, { no, ver, rows: [] });
    groups.get(key).rows.push({ row, idx });
  });
  const co = S.settings.company || {};
  return [...groups.values()].map((g) => {
    const first = g.rows[0].row, r = { _row: g.rows[0].idx + 1, issues: [], warn: [], items: [] };
    for (const [k] of F.quotations) r[k] = cell(first, map, k);
    r.quote_no = g.ver > 1 ? `${g.no}-V${g.ver}` : g.no; r.version = g.ver;
    r.gstin = (r.gstin || "").toUpperCase().replace(/\s/g, "");
    if (!r.state && GST_RE.test(r.gstin)) r.state = GST_STATE[r.gstin.slice(0, 2)];
    if (!g.no) r.issues.push(L("Quotation number khaali", "Quotation number missing"));
    if (!r.customer) r.issues.push(L("Customer naam khaali", "Customer name missing"));
    r.quote_date = toISODate(r.quote_date);
    for (const { row } of g.rows) {
      const desc = cell(row, map, "item_desc"), qty = num0(cell(row, map, "qty")) || (desc ? 1 : 0), price = num0(cell(row, map, "unit_price"));
      const tax = map.tax_rate != null ? num0(cell(row, map, "tax_rate")) : 18, line = num0(cell(row, map, "line_total"));
      if (!desc && !price && !line) continue;
      r.items.push({ desc: (desc || L("As per quotation", "As per quotation")).slice(0, 400), hsn: cell(row, map, "hsn").slice(0, 12), qty, price: price || (line && qty ? +(line / qty).toFixed(2) : 0), tax: [0, 5, 12, 18, 28].includes(tax) ? tax : 18 });
    }
    const gt = num0(r.grand_total);
    if (!r.items.length && gt) r.items.push({ desc: L("As per quotation (total)", "As per quotation (total)"), hsn: "", qty: 1, price: gt, tax: 0 });
    if (!r.items.length) r.warn.push(L("Koi item / amount nahi", "No items / amount"));
    // GST totals (same rule as the quotation editor)
    let sub = 0, tax = 0; const a = String(co.state || "").toLowerCase(), b = String(r.state || "").toLowerCase();
    for (const it of r.items) { const t = Math.round(it.qty * it.price * 100) / 100; sub += t; tax += Math.round(t * it.tax) / 100; }
    r.subtotal = Math.round(sub * 100) / 100; r.tax_total = Math.round(tax * 100) / 100; r.grand = Math.round((sub + tax) * 100) / 100;
    r.inter = !!(a && b && a !== b);
    if (gt && Math.abs(gt - r.grand) > Math.max(2, gt * 0.01)) r.warn.push(L(`File ka total ₹${gt} ≠ calculate ₹${r.grand}`, `File total ₹${gt} ≠ calculated ₹${r.grand}`));
    r.status = mapSt(r.status, QUOTE_ST, "sent");
    r.match = r.customer ? ex.find({ company: r.customer, gstin: r.gstin, _p10: p10(r.phone), email: r.email }) : null;
    r.state_ = r.issues.length ? "error" : "new";
    return r;
  });
}
function buildRfqs(rows, map, ex) {
  return rows.map((row, idx) => {
    const r = { _row: idx + 1, issues: [], warn: [] };
    for (const [k] of F.rfqs) r[k] = cell(row, map, k);
    if (!r.company) r.issues.push(L("Company khaali", "Company missing"));
    if (!r.product) r.issues.push(L("Product / requirement khaali", "Product / requirement missing"));
    if (r.email && !EMAIL_RE.test(r.email)) { r.warn.push(L("Email galat — chhod diya", "Invalid email — skipped")); r.email = ""; }
    r.due_date = toISODate(r.due_date); r.created = toISODate(r.created);
    r.status = mapSt(r.status, RFQ_ST, "new");
    r.match = r.company ? ex.find({ company: r.company, _p10: p10(r.phone), email: r.email }) : null;
    r.state_ = r.issues.length ? "error" : "new";
    return r;
  });
}

// old Calling Desk ERP backup → rows in our shapes
function fromErpBackup(j) {
  const co = (j.co || []).map((c, i) => ({
    _row: i + 1, issues: c.name ? [] : [L("Naam khaali", "Name missing")], warn: [], company: norm(c.name), contact_name: norm(c.contact), phone: norm(c.mobile || c.phone),
    alt_phone: c.mobile && c.phone ? norm(c.phone) : "", email: EMAIL_RE.test(norm(c.email)) ? norm(c.email) : "", address: norm(c.address), city: norm(c.city), state: norm(c.state),
    pincode: norm(c.pincode), gstin: norm(c.gstin).toUpperCase(), pan: norm(c.pan), notes: [c.code && "Code: " + c.code, c.branch && "Branch: " + c.branch, c.ship && "Ship to: " + c.ship].filter(Boolean).join("\n"),
  }));
  const qt = (j.qt || []).map((q, i) => {
    const t = q.to || {}, items = (q.items || []).filter((it) => it.title || it.detail || +it.price).map((it) => ({
      desc: [it.title, it.detail].filter(Boolean).join(" — ").slice(0, 400) + (it.warranty ? ` (Warranty: ${it.warranty})` : ""), hsn: norm(it.hsn).slice(0, 12),
      qty: num0(it.qty) || 1, price: num0(it.price), tax: [0, 5, 12, 18, 28].includes(num0(it.tax)) ? num0(it.tax) : 18,
    }));
    return {
      _row: i + 1, issues: q.no ? [] : [L("Number khaali", "Number missing")], warn: [], quote_no_raw: norm(q.no), version: +q.ver || 1, quote_date: toISODate(q.date),
      status: mapSt(q.status, QUOTE_ST, "draft"), customer: norm(t.name), contact: norm(t.contact), email: norm(t.email), phone: norm(t.mobile || t.phone), gstin: norm(t.gstin).toUpperCase(),
      address: [t.address, t.city, t.pincode].filter(Boolean).join(", "), state: norm(t.state), items,
      notes: [q.notes, q.validity && "Validity: " + q.validity, q.credit && "Payment: " + q.credit, q.delivery && q.delivery !== "-----" && "Delivery: " + q.delivery, q.type && "Type: " + q.type].filter(Boolean).join("\n"),
    };
  });
  return { co, qt };
}

// ---------------------------------------------------------------------
//  UI state + page
// ---------------------------------------------------------------------
const IM = { step: "pick", kind: null, file: null, sheets: [], sheet: 0, hdr: 0, map: {}, recs: [], ex: null, dupMode: "merge", owner: "", leadStatus: "", createCustomers: true, filter: "all", erp: null };
const reset = () => Object.assign(IM, { step: "pick", kind: null, file: null, sheets: [], sheet: 0, hdr: 0, map: {}, recs: [], ex: null, filter: "all", erp: null });

export async function viewImport(el) {
  if (!isMgr()) { el.innerHTML = `<div class="empty">${L("Sirf Manager / Admin", "Managers / Admins only")}</div>`; return; }
  if (IM.step === "pick") return pickStep(el);
  if (IM.step === "map") return mapStep(el);
  if (IM.step === "review") return reviewStep(el);
}

async function pickStep(el) {
  const { data: hist } = await sb.from("import_batches").select("*").order("created_at", { ascending: false }).limit(20);
  el.innerHTML = `
  <div class="card" style="padding:18px;margin-bottom:16px">
    <div class="row"><div style="flex:1;min-width:240px"><h2 style="margin:0 0 4px;font-size:18px">📥 Import Center</h2>
      <div class="mu">${L("Purani quotations, companies aur enquiries ek baar mein laao. Pehle preview dikhega — kuch bhi save hone se pehle. Galti ho toh ek click mein Undo.", "Bring in past quotations, companies and enquiries in one go. You see a full preview before anything is saved — and one-click Undo if needed.")}</div></div></div>
    <label class="dropzone" id="drop"><input type="file" id="impF" accept=".xlsx,.csv,.txt,.json" class="sr">
      <div style="font-size:30px">⬆️</div><b>${L("File yahan drop karo ya click karke chuno", "Drop a file here or click to choose")}</b>
      <div class="mu" style="font-size:12.5px">Excel (.xlsx) · CSV · ${L("purane Calling Desk ka backup (.json)", "old Calling Desk backup (.json)")} — max 15 MB</div></label>
    <div class="mu" style="font-size:12.5px;margin-top:8px">${L("App khud pehchanega ki file mein companies hain, quotations ya RFQs. Excel .xls (purana format) ho toh pehle Excel mein \"Save As → .xlsx\" karo.", "The app detects whether the file has companies, quotations or RFQs. For old .xls files, first use \"Save As → .xlsx\" in Excel.")}</div>
  </div>
  <div class="kpis">${Object.entries(KIND).filter(([k]) => k !== "erp_backup").map(([k, [i, t, d]]) => `<div class="card kpi"><div style="font-size:22px">${i}</div><b>${h(t)}</b><div class="s">${h(d)}</div>
    <button class="btn sm" style="margin-top:8px" data-sample="${k}">${ic("download")} ${L("Sample file", "Sample file")}</button></div>`).join("")}
    <div class="card kpi"><div style="font-size:22px">${KIND.erp_backup[0]}</div><b>${h(KIND.erp_backup[1])}</b><div class="s">${h(KIND.erp_backup[2])}</div><div class="s" style="margin-top:6px">${L("Purane app mein: Quotations → Settings → ERP backup", "In the old app: Quotations → Settings → ERP backup")}</div></div></div>
  <div class="card sec"><div class="card-h"><h3>${L("Import history", "Import history")}</h3></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>${L("Kab", "When")}</th><th>${L("Kisne", "By")}</th><th>${L("Kya", "What")}</th><th>File</th><th>${L("Result", "Result")}</th><th></th></tr></thead><tbody>
    ${(hist || []).map((b) => `<tr style="cursor:default"><td class="sub">${h(dt(b.created_at))}</td><td>${h(userName(b.created_by))}</td><td>${h(KIND[b.kind]?.[1] || b.kind)}</td><td class="sub" data-raw>${h(b.file_name || "")}</td>
      <td class="sub">${h(Object.entries(b.counts || {}).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(" · ") || "—")}</td>
      <td>${b.undone_at ? `<span class="badge">${L("Undo ho chuka", "Undone")}</span>` : b.finished_at ? `<button class="btn sm danger" data-undo="${b.id}">↩ Undo</button>` : `<span class="badge warn">${L("adhoora", "incomplete")}</span> <button class="btn sm danger" data-undo="${b.id}">↩ Undo</button>`}</td></tr>`).join("")
      || `<tr><td colspan="6" class="empty">${L("Abhi tak koi import nahi", "No imports yet")}</td></tr>`}</tbody></table></div></div>`;
  const inp = $("#impF", el), drop = $("#drop", el);
  inp.onchange = () => inp.files[0] && loadFile(inp.files[0], el);
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("on"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("on"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("on"); const f = e.dataTransfer.files[0]; if (f) loadFile(f, el); });
  $$("[data-sample]", el).forEach((b) => b.onclick = () => sample(b.dataset.sample));
  $$("[data-undo]", el).forEach((b) => b.onclick = () => undo(+b.dataset.undo, el));
}

async function loadFile(f, el) {
  if (f.size > 15e6) return toast(L("File 15 MB se badi hai", "File is larger than 15 MB"), true);
  try {
    el.innerHTML = `<div class="empty">${L("File padh rahe hain…", "Reading file…")}</div>`;
    IM.file = f.name;
    if (/\.json$/i.test(f.name)) {
      const j = JSON.parse(await f.text());
      if (!Array.isArray(j.qt) && !Array.isArray(j.co)) throw new Error(L("Ye Calling Desk backup nahi lagta (co / qt nahi mila)", "This doesn't look like a Calling Desk backup (no co / qt)"));
      IM.kind = "erp_backup"; IM.erp = fromErpBackup(j);
      await prepareErp(); IM.step = "review"; return viewImport(el);
    }
    if (/\.xlsx$/i.test(f.name)) {
      if (!window.DecompressionStream) throw new Error(L("Ye browser purana hai — Chrome / Edge latest use karo, ya CSV upload karo", "This browser is too old — use the latest Chrome / Edge, or upload a CSV"));
      IM.sheets = await readXlsx(await f.arrayBuffer());
    } else if (/\.xls$/i.test(f.name)) throw new Error(L("Purana .xls format — Excel mein \"Save As → .xlsx\" karke upload karo", "Old .xls format — use \"Save As → .xlsx\" in Excel and upload again"));
    else IM.sheets = readDelimited(await f.text());
    IM.sheets = IM.sheets.filter((s) => s.rows.length > 1);
    if (!IM.sheets.length) throw new Error(L("File mein data nahi mila", "No data found in the file"));
    // pick the sheet whose header matches best
    let best = 0, bs = -1;
    IM.sheets.forEach((s, i) => { const hd = s.rows[headerRow(s.rows)]; const sc = Math.max(...["companies", "quotations", "rfqs"].map((k) => Object.keys(autoMap(k, hd)).length)); if (sc > bs) { bs = sc; best = i; } });
    selectSheet(best);
    IM.step = "map"; viewImport(el);
  } catch (e) { fail(e); reset(); viewImport(el); }
}
function selectSheet(i) {
  IM.sheet = i; const rows = IM.sheets[i].rows; IM.hdr = headerRow(rows);
  const hd = rows[IM.hdr]; IM.kind = detectKind(hd);
  const saved = (() => { try { return JSON.parse(localStorage.getItem("crm_impmap_" + IM.kind) || "null"); } catch { return null; } })();
  IM.map = autoMap(IM.kind, hd);
  if (saved && saved.sig === hd.join("|")) IM.map = saved.map;   // same file layout as last time → reuse the mapping
}

function mapStep(el) {
  const sh = IM.sheets[IM.sheet], hd = sh.rows[IM.hdr], data = sh.rows.slice(IM.hdr + 1);
  const sampleOf = (i) => data.slice(0, 3).map((r) => norm(r[i])).filter(Boolean).join(" · ").slice(0, 60);
  el.innerHTML = `
  <div class="row" style="margin-bottom:12px"><button class="btn" id="back">← ${L("Wapas", "Back")}</button><b data-raw>${h(IM.file)}</b><span class="mu">${num(data.length)} ${L("rows", "rows")}</span></div>
  <div class="card" style="padding:16px;margin-bottom:14px"><div class="grid3">
    <div><label class="f">${L("File mein kya hai?", "What's in the file?")}</label><select class="input" id="mKind">${["companies", "quotations", "rfqs"].map((k) => `<option value="${k}" ${k === IM.kind ? "selected" : ""}>${KIND[k][0]} ${h(KIND[k][1])}</option>`).join("")}</select></div>
    ${IM.sheets.length > 1 ? `<div><label class="f">Sheet</label><select class="input" id="mSheet">${IM.sheets.map((s, i) => `<option value="${i}" ${i === IM.sheet ? "selected" : ""}>${h(s.name)} (${s.rows.length})</option>`).join("")}</select></div>` : "<div></div>"}
    <div><label class="f">${L("Header row", "Header row")}</label><select class="input" id="mHdr">${sh.rows.slice(0, 10).map((r, i) => `<option value="${i}" ${i === IM.hdr ? "selected" : ""}>${i + 1}: ${h(r.filter(Boolean).slice(0, 4).join(", ").slice(0, 50))}</option>`).join("")}</select></div></div>
    <p class="mu" style="font-size:12.5px;margin:10px 0 0">✨ ${L(`${Object.keys(IM.map).length} columns apne aap match hue. Galat ho toh neeche badlo — agli baar same format ki file aane pe ye mapping yaad rahegi.`, `${Object.keys(IM.map).length} columns were matched automatically. Fix any below — this mapping is remembered for files with the same layout.`)}</p></div>
  <div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>${L("CRM field", "CRM field")}</th><th>${L("File ka column", "Column in your file")}</th><th>${L("Sample", "Sample")}</th></tr></thead><tbody>
    ${F[IM.kind].map(([k, label, , req]) => `<tr style="cursor:default"><td><b>${h(label)}</b></td><td><select class="input" data-mk="${k}" style="height:32px;${req && IM.map[k] == null ? "border-color:var(--bad)" : ""}"><option value="">— ${L("chhodo", "skip")} —</option>${hd.map((c, i) => `<option value="${i}" ${IM.map[k] === i ? "selected" : ""}>${h(c || L("(khaali header) col ", "(blank header) col ") + (i + 1))}</option>`).join("")}</select></td>
      <td class="sub" data-raw>${IM.map[k] != null ? h(sampleOf(IM.map[k])) : ""}</td></tr>`).join("")}</tbody></table></div></div>
  <div class="row sec"><span class="sp" style="flex:1"></span><button class="btn primary" id="toReview">${L("Preview dekho →", "Preview →")}</button></div>`;
  $("#back", el).onclick = () => { reset(); viewImport(el); };
  $("#mKind", el).onchange = (e) => { IM.kind = e.target.value; IM.map = autoMap(IM.kind, hd); mapStep(el); };
  $("#mSheet", el)?.addEventListener("change", (e) => { selectSheet(+e.target.value); mapStep(el); });
  $("#mHdr", el).onchange = (e) => { IM.hdr = +e.target.value; IM.map = autoMap(IM.kind, sh.rows[IM.hdr]); mapStep(el); };
  $$("[data-mk]", el).forEach((s) => s.onchange = () => { if (s.value === "") delete IM.map[s.dataset.mk]; else IM.map[s.dataset.mk] = +s.value; mapStep(el); });
  $("#toReview", el).onclick = (e) => busy(e.target, async () => {
    const miss = F[IM.kind].filter(([k, , , req]) => req && IM.map[k] == null).map(([, l]) => l);
    if (miss.length) return toast(L("Zaroori column chuno: ", "Map the required column: ") + miss.join(", "), true);
    try { localStorage.setItem("crm_impmap_" + IM.kind, JSON.stringify({ sig: hd.join("|"), map: IM.map })); } catch { /* ignore */ }
    IM.ex = await existingLeads();
    IM.recs = IM.kind === "companies" ? buildCompanies(data, IM.map, IM.ex) : IM.kind === "quotations" ? buildQuotes(data, IM.map, IM.ex) : buildRfqs(data, IM.map, IM.ex);
    if (IM.kind === "quotations") await markQuoteDups();
    IM.step = "review"; IM.filter = "all"; viewImport(el);
  });
}
async function markQuoteDups() {
  const nos = [...new Set(IM.recs.map((r) => r.quote_no).filter(Boolean))], have = new Set();
  for (let i = 0; i < nos.length; i += 150) {
    const { data } = await sb.from("quotations").select("quote_no").in("quote_no", nos.slice(i, i + 150));
    (data || []).forEach((x) => have.add(x.quote_no));
  }
  const seen = new Set();
  IM.recs.forEach((r) => {
    if (r.state_ === "error") return;
    if (have.has(r.quote_no)) { r.state_ = "dup"; r.warn.push(L("Ye quotation number CRM mein pehle se hai — skip hoga", "This quotation number already exists in the CRM — will be skipped")); }
    else if (seen.has(r.quote_no)) { r.state_ = "dupfile"; } else seen.add(r.quote_no);
  });
}
async function prepareErp() {
  IM.ex = await existingLeads();
  const co = IM.erp.co.map((r) => { r._p10 = p10(r.phone); if (!r.state && GST_RE.test(r.gstin)) r.state = GST_STATE[r.gstin.slice(0, 2)]; r.match = r.company ? IM.ex.find(r) : null; r.state_ = r.issues.length ? "error" : r.match ? "dup" : "new"; return r; });
  const cs = S.settings.company || {};
  const qt = IM.erp.qt.map((q) => {
    q.quote_no = q.version > 1 ? `${q.quote_no_raw}-V${q.version}` : q.quote_no_raw;
    let sub = 0, tax = 0; for (const it of q.items) { const t = Math.round(it.qty * it.price * 100) / 100; sub += t; tax += Math.round(t * it.tax) / 100; }
    q.subtotal = Math.round(sub * 100) / 100; q.tax_total = Math.round(tax * 100) / 100; q.grand = Math.round((sub + tax) * 100) / 100;
    q.inter = !!(cs.state && q.state && cs.state.toLowerCase() !== q.state.toLowerCase());
    q.match = q.customer ? IM.ex.find({ company: q.customer, gstin: q.gstin, _p10: p10(q.phone), email: q.email }) : null;
    q.state_ = q.issues.length ? "error" : "new"; return q;
  });
  IM.recs = co; IM.erpQuotes = qt;
  const save = IM.recs; IM.recs = qt; IM.kind = "quotations"; await markQuoteDups(); IM.erpQuotes = IM.recs; IM.recs = save; IM.kind = "erp_backup";
}

function reviewStep(el) {
  const isQ = IM.kind === "quotations", isR = IM.kind === "rfqs", isErp = IM.kind === "erp_backup";
  const recs = IM.recs, qs = isErp ? IM.erpQuotes : isQ ? recs : [];
  const cnt = (arr, s) => arr.filter((r) => (s === "warn" ? r.warn.length && r.state_ !== "error" : r.state_ === s)).length;
  const main = isErp ? recs : recs;
  const shown = main.filter((r) => IM.filter === "all" || (IM.filter === "warn" ? r.warn.length : r.state_ === IM.filter)).slice(0, 300);
  const st = { new: ["good", L("Naya", "New")], dup: ["warn", isQ ? L("Pehle se hai", "Exists") : L("Match mila", "Matched")], dupfile: ["", L("File mein dobara", "Repeated in file")], error: ["bad", L("Error", "Error")] };
  const unmatched = qs.filter((q) => q.state_ === "new" && !q.match).length;
  el.innerHTML = `
  <div class="row" style="margin-bottom:12px"><button class="btn" id="back">← ${L("Wapas", "Back")}</button><b data-raw>${h(IM.file)}</b><span class="badge acc">${KIND[IM.kind][0]} ${h(KIND[IM.kind][1])}</span></div>
  <div class="kpis">
    <div class="card kpi"><div class="l">${isErp ? L("Companies", "Companies") : L("Total", "Total")}</div><div class="v">${num(main.length)}</div></div>
    <div class="card kpi" data-f="new"><div class="l">✅ ${L("Naye banenge", "Will be created")}</div><div class="v">${num(cnt(main, "new"))}</div></div>
    <div class="card kpi" data-f="dup"><div class="l">🔁 ${isQ ? L("Pehle se hai (skip)", "Already exist (skip)") : L("CRM mein match", "Match in CRM")}</div><div class="v">${num(cnt(main, "dup"))}</div></div>
    <div class="card kpi" data-f="warn"><div class="l">⚠️ ${L("Warnings", "Warnings")}</div><div class="v">${num(cnt(main, "warn"))}</div></div>
    <div class="card kpi" data-f="error"><div class="l">⛔ ${L("Errors (skip)", "Errors (skipped)")}</div><div class="v">${num(cnt(main, "error"))}</div></div>
    ${isErp ? `<div class="card kpi"><div class="l">📄 ${L("Quotations", "Quotations")}</div><div class="v">${num(qs.length)}</div><div class="s">${num(cnt(qs, "new"))} ${L("naye", "new")} · ${num(cnt(qs, "dup"))} ${L("pehle se", "existing")}</div></div>` : ""}
  </div>
  <div class="card" style="padding:16px;margin-bottom:14px"><div class="grid3">
    ${!isQ && !isR ? `<div><label class="f">${L("CRM mein match mile toh", "When a match is found in the CRM")}</label><select class="input" id="oDup">
      <option value="merge" ${IM.dupMode === "merge" ? "selected" : ""}>${L("Sirf khaali fields bharo (safe)", "Fill only empty fields (safe)")}</option>
      <option value="overwrite" ${IM.dupMode === "overwrite" ? "selected" : ""}>${L("File ka data overwrite karo", "Overwrite with file data")}</option>
      <option value="skip" ${IM.dupMode === "skip" ? "selected" : ""}>${L("Skip karo", "Skip")}</option></select></div>
      <div><label class="f">${L("Naye companies kisko assign", "Assign new companies to")}</label><select class="input" id="oOwn"><option value="">— ${L("Free pool / file ka sales person", "Free pool / sales person in file")} —</option>${assignable().map((u) => `<option value="${u.id}" ${IM.owner === u.id ? "selected" : ""}>${h(u.full_name)}</option>`).join("")}</select></div>
      <div><label class="f">${L("Status (agar file mein nahi)", "Status (if not in file)")}</label><select class="input" id="oSt"><option value="">New</option><option value="won" ${IM.leadStatus === "won" ? "selected" : ""}>${L("Won — existing customer", "Won — existing customer")}</option><option value="contacted" ${IM.leadStatus === "contacted" ? "selected" : ""}>Contacted</option></select></div>` : ""}
    ${isQ || isR || isErp ? `<div style="grid-column:span 2"><label class="check" style="margin-top:6px"><input type="checkbox" id="oCreate" ${IM.createCustomers ? "checked" : ""}> ${L(`Jo customer CRM mein nahi hai (${unmatched}${isR ? "" : ""}), unki company bhi bana do`, `Create a company for customers not in the CRM (${unmatched})`)}</label>
      <div class="mu" style="font-size:12.5px">${L("Match: GSTIN → phone → email → company naam (Pvt/Ltd jaise words ignore). Quotation apne aap us company ki history mein jud jayegi.", "Matching: GSTIN → phone → email → company name (ignoring Pvt/Ltd etc.). Quotations are attached to that company's history automatically.")}</div></div>` : ""}
  </div></div>
  <div class="toolbar"><div class="chips">${[["all", L("Sab", "All")], ["new", "✅"], ["dup", "🔁"], ["warn", "⚠️"], ["error", "⛔"]].map(([k, l]) => `<button class="chip ${IM.filter === k ? "on" : ""}" data-f="${k}">${l}</button>`).join("")}</div>
    <span class="mu" style="font-size:12.5px">${L("Pehli 300 rows dikh rahi hain", "Showing the first 300 rows")}</span></div>
  <div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>${L("Status", "Status")}</th>${isQ ? `<th>No.</th><th>${L("Customer", "Customer")}</th><th>${L("Date", "Date")}</th><th class="num">Items</th><th class="num">${L("Total", "Total")}</th>` : isR ? `<th>${L("Company", "Company")}</th><th>${L("Product", "Product")}</th><th>${L("Contact", "Contact")}</th>` : `<th>${L("Company", "Company")}</th><th>${L("Phone", "Phone")}</th><th>GSTIN</th><th>${L("City", "City")}</th>`}<th>${L("Link / notes", "Link / notes")}</th></tr></thead><tbody>
    ${shown.map((r) => `<tr style="cursor:default"><td class="sub">${r._row}</td><td><span class="badge ${st[r.state_][0]}">${st[r.state_][1]}</span></td>
      ${isQ ? `<td class="mono" data-raw>${h(r.quote_no)}</td><td class="co">${h(r.customer)}</td><td class="sub">${h(r.quote_date || "")}</td><td class="num">${r.items.length}</td><td class="num">${inr(r.grand)}</td>`
        : isR ? `<td class="co">${h(r.company)}</td><td data-raw>${h(r.product)}</td><td class="sub" data-raw>${h(r.contact)}</td>`
        : `<td class="co">${h(r.company)}</td><td class="mono" data-raw>${h(r.phone)}</td><td class="mono" data-raw>${h(r.gstin)}</td><td data-raw>${h(r.city)}</td>`}
      <td class="sub">${r.match ? `🔗 <span data-raw>${h(r.match.company)}</span>` : (isQ || isR) && r.state_ === "new" ? (IM.createCustomers ? L("➕ nayi company", "➕ new company") : L("— bina company", "— no company")) : ""}${[...r.issues, ...r.warn].map((w) => `<div style="color:${r.issues.length ? "var(--bad)" : "var(--warn)"}">${h(w)}</div>`).join("")}</td></tr>`).join("")
      || `<tr><td colspan="8" class="empty">—</td></tr>`}</tbody></table></div></div>
  <div class="card sec" id="prog" hidden style="padding:16px"><b id="progT"></b><div class="meter" style="height:10px;margin-top:8px"><i id="progB" style="width:0"></i></div></div>
  <div class="row sec"><span class="sp" style="flex:1"></span><button class="btn primary" id="go">${ic("upload")} ${L("Import karo", "Import")} (${num(cnt(main, "new") + (isQ || isR ? 0 : IM.dupMode === "skip" ? 0 : cnt(main, "dup")) + (isErp ? cnt(qs, "new") : 0))})</button></div>`;
  $("#back", el).onclick = () => { if (IM.kind === "erp_backup") reset(); else IM.step = "map"; viewImport(el); };
  $$("[data-f]", el).forEach((b) => b.onclick = () => { IM.filter = b.dataset.f; reviewStep(el); });
  $("#oDup", el)?.addEventListener("change", (e) => { IM.dupMode = e.target.value; reviewStep(el); });
  $("#oOwn", el)?.addEventListener("change", (e) => { IM.owner = e.target.value; });
  $("#oSt", el)?.addEventListener("change", (e) => { IM.leadStatus = e.target.value; });
  $("#oCreate", el)?.addEventListener("change", (e) => { IM.createCustomers = e.target.checked; reviewStep(el); });
  $("#go", el).onclick = (e) => runImport(e.target, el);
}

// ---------------------------------------------------------------------
//  Import execution
// ---------------------------------------------------------------------
const leadRow = (r, batch) => {
  const o = {
    company: r.company.slice(0, 200), contact_name: r.contact_name?.slice(0, 120) || null, designation: r.designation?.slice(0, 120) || null,
    phone: r.phone?.slice(0, 40) || null, email: r.email || null, website: r.website?.slice(0, 300) || null,
    address: r.address?.slice(0, 500) || null, area: r.area?.slice(0, 120) || null, city: r.city?.slice(0, 80) || null, state: r.state?.slice(0, 60) || null,
    pincode: r.pincode?.slice(0, 12) || null, gstin: r.gstin || null, pan: r.pan?.slice(0, 20) || null,
    industry: r.industry?.slice(0, 80) || null, notes: r.notes?.slice(0, 5000) || null,
    alt_phones: r.alt_phone ? r.alt_phone.split(/[,;/]/).map(norm).filter(Boolean).slice(0, 3) : [],
    products: r.products ? r.products.split(/[,;|]/).map(norm).filter(Boolean).slice(0, 12) : [],
    tags: r.tags ? r.tags.split(/[,;|]/).map(norm).filter(Boolean).slice(0, 10) : [],
  };
  o.category = CATEGORIES.find((c) => c.toLowerCase() === String(r.category || "").toLowerCase()) || guessCat([r.industry, r.products, r.company].join(" "));
  o.status = mapSt(r.status, LEAD_ST, IM.leadStatus || "new");
  if (r.deal_value) o.deal_value = num0(r.deal_value) || null;
  if (r.next_follow_up) o.next_follow_up = r.next_follow_up + "T10:00:00+05:30";
  o.owner_id = ownerOf(r.owner) || IM.owner || null;
  o.source = "import"; o.import_batch = batch;
  return o;
};
async function insertChunks(table, rows, onProg, sel = "id") {
  const out = [];
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const { data, error } = await sb.from(table).insert(chunk).select(sel);
    if (!error) out.push(...data);
    else for (const r of chunk) {   // isolate the bad row, keep the rest
      const { data: d, error: e } = await sb.from(table).insert(r).select(sel).single();
      if (!e) out.push(d); else out.push({ _err: e.message, _src: r });
    }
    onProg(Math.min(rows.length, i + 100));
  }
  return out;
}
async function runImport(btn, el) {
  const isErp = IM.kind === "erp_backup";
  const { data: b, error } = await sb.from("import_batches").insert({ kind: IM.kind, file_name: IM.file?.slice(0, 300), created_by: S.me.id }).select("id").single();
  if (error) return fail(error);
  const batch = b.id, counts = { leads_created: 0, leads_updated: 0, quotations: 0, rfqs: 0, failed: 0 };
  btn.disabled = true; $("#prog", el).hidden = false;
  const prog = (t, done, total) => { $("#progT", el).textContent = `${t} ${done} / ${total}`; $("#progB", el).style.width = (total ? (done / total) * 100 : 100) + "%"; };
  try {
    // 1) companies
    const compRecs = isErp ? IM.recs : IM.kind === "companies" ? IM.recs : [];
    const fresh = compRecs.filter((r) => r.state_ === "new");
    const created = await insertChunks("leads", fresh.map((r) => leadRow(r, batch)), (d) => prog(L("Companies ban rahi hain…", "Creating companies…"), d, fresh.length), "id, company");
    counts.leads_created += created.filter((x) => !x._err).length; counts.failed += created.filter((x) => x._err).length;
    if (IM.dupMode !== "skip") {
      const dups = compRecs.filter((r) => r.state_ === "dup" && r.match);
      let i = 0;
      for (const r of dups) {
        const row = leadRow(r, null), upd = {};
        for (const [k, v] of Object.entries(row)) {
          if (["source", "import_batch", "owner_id", "status", "category"].includes(k) || v == null || (Array.isArray(v) && !v.length)) continue;
          if (IM.dupMode === "overwrite" || r.match[k] == null || r.match[k] === "") upd[k] = v;
        }
        if (Object.keys(upd).length) { const { error: e } = await sb.from("leads").update(upd).eq("id", r.match.id); if (e) counts.failed++; else counts.leads_updated++; }
        if (++i % 10 === 0) prog(L("Purani companies update…", "Updating existing companies…"), i, dups.length);
      }
    }
    // 2) customers for quotations / RFQs that are not in the CRM yet
    const qs = isErp ? IM.erpQuotes : IM.kind === "quotations" ? IM.recs : [], rs = IM.kind === "rfqs" ? IM.recs : [];
    const need = [...qs, ...rs].filter((r) => r.state_ === "new" && !r.match);
    const idByName = new Map(created.filter((x) => !x._err).map((x) => [keyName(x.company), x.id]));
    if (IM.createCustomers && need.length) {
      const uniq = new Map();
      for (const r of need) { const nm = r.customer || r.company, k = keyName(nm); if (k && !idByName.has(k) && !uniq.has(k)) uniq.set(k, { company: nm, contact_name: r.contact, phone: r.phone, email: EMAIL_RE.test(r.email || "") ? r.email : "", gstin: r.gstin, address: r.address, state: r.state, city: r.city, status: IM.kind === "rfqs" ? "" : r.status === "won" ? "won" : "quote_sent" }); }
      const made = await insertChunks("leads", [...uniq.values()].map((r) => ({ ...leadRow({ ...r, status: r.status }, batch) })), (d) => prog(L("Customers ban rahe hain…", "Creating customers…"), d, uniq.size), "id, company");
      made.filter((x) => !x._err).forEach((x) => idByName.set(keyName(x.company), x.id));
      counts.leads_created += made.filter((x) => !x._err).length; counts.failed += made.filter((x) => x._err).length;
    }
    const leadFor = (r) => r.match?.id || idByName.get(keyName(r.customer || r.company)) || null;
    // 3) quotations
    const qNew = qs.filter((r) => r.state_ === "new");
    if (qNew.length) {
      const rows = qNew.map((r) => ({
        quote_no: r.quote_no.slice(0, 60), version: r.version || 1, quote_date: r.quote_date || null,
        ...(r.quote_date ? { created_at: r.quote_date + "T10:00:00+05:30" } : {}),
        lead_id: leadFor(r), status: r.status, notes: r.notes || null, owner_id: ownerOf(r.owner) || S.me.id,
        to_party: { name: r.customer, contact: r.contact || "", email: r.email || "", address: r.address || r.city || "", state: r.state || "", gstin: r.gstin || "" },
        items: r.items, subtotal: r.subtotal, tax_total: r.tax_total, grand_total: r.grand, import_batch: batch,
      }));
      const res = await insertChunks("quotations", rows, (d) => prog(L("Quotations import…", "Importing quotations…"), d, rows.length));
      counts.quotations = res.filter((x) => !x._err).length; counts.failed += res.filter((x) => x._err).length;
      // bump deal value on won customers from their won quotations
      const won = qNew.filter((r) => r.status === "won" && leadFor(r));
      const wonIds = [...new Set(won.map(leadFor))];
      for (let i = 0; i < wonIds.length; i += 100) await sb.from("leads").update({ status: "won" }).in("id", wonIds.slice(i, i + 100)).neq("status", "won").then(() => {}, () => {});
    }
    // 4) RFQs
    const rNew = rs.filter((r) => r.state_ === "new");
    if (rNew.length) {
      const rows = rNew.map((r) => ({
        ...(r.rfq_no ? { rfq_no: r.rfq_no.slice(0, 60) } : {}), company: r.company.slice(0, 200), contact: r.contact || null, phone: r.phone || null, email: r.email || null, city: r.city || null,
        product: r.product.slice(0, 200), qty: r.qty || null, details: r.details?.slice(0, 5000) || null, due_date: r.due_date || null, status: r.status,
        quoted_value: num0(r.quoted_value) || null, lead_id: leadFor(r), source: "import", import_batch: batch,
        ...(r.created ? { created_at: r.created + "T10:00:00+05:30" } : {}), owner_id: null,
      }));
      const res = await insertChunks("rfqs", rows, (d) => prog(L("RFQs import…", "Importing RFQs…"), d, rows.length));
      counts.rfqs = res.filter((x) => !x._err).length; counts.failed += res.filter((x) => x._err).length;
    }
    await sb.from("import_batches").update({ counts, finished_at: new Date().toISOString() }).eq("id", batch);
    prog("✅", 1, 1);
    toast(L(`Import ho gaya ✔ — ${counts.leads_created} companies naye, ${counts.leads_updated} update, ${counts.quotations} quotations, ${counts.rfqs} RFQs${counts.failed ? `, ${counts.failed} fail` : ""}`,
      `Import done ✔ — ${counts.leads_created} new companies, ${counts.leads_updated} updated, ${counts.quotations} quotations, ${counts.rfqs} RFQs${counts.failed ? `, ${counts.failed} failed` : ""}`), !!counts.failed);
    reset(); HOOK.refreshBadges(); viewImport(el);
  } catch (e) {
    await sb.from("import_batches").update({ counts }).eq("id", batch);
    fail(e); btn.disabled = false;
  }
}
async function undo(id, el) {
  if (!(await confirmBox(L("Is import se BANI saari companies, quotations aur RFQs delete ho jayengi (update hui purani companies waisi hi rahengi). Continue?",
    "Everything CREATED by this import — companies, quotations and RFQs — will be deleted (existing companies that were updated stay as they are). Continue?"), L("Haan, undo karo", "Yes, undo")))) return;
  const { data, error } = await sb.rpc("undo_import", { p_batch: id });
  if (error) return fail(error);
  toast(data?.ok ? L(`↩ Undo ho gaya — ${data.leads} companies, ${data.quotations} quotations, ${data.rfqs} RFQs hataye`, `↩ Undone — removed ${data.leads} companies, ${data.quotations} quotations, ${data.rfqs} RFQs`) : L("Undo nahi hua", "Undo failed"), !data?.ok);
  viewImport(el);
}

// ---------------------------------------------------------------------
//  Sample files
// ---------------------------------------------------------------------
function sample(kind) {
  const S2 = {
    companies: [["Company Name", "Contact Person", "Designation", "Mobile", "Email", "Address", "Area", "City", "State", "Pincode", "GSTIN", "Industry", "Products", "Status", "Sales Person", "Remarks"],
      ["Sunrise Diagnostics Pvt Ltd", "Dr. Mehta", "Director", "+91 98330 12345", "it@sunrise.example", "201, Link Road", "Andheri West", "Mumbai", "Maharashtra", "400053", "27AAACS1234A1Z5", "Hospital", "Desktops; Servers", "Customer", "", "AMC due in March"]],
    quotations: [["Quotation No", "Date", "Customer", "Contact", "Email", "Customer GSTIN", "State", "Item Description", "HSN", "Qty", "Rate", "GST %", "Status", "Sales Person"],
      ["PR7701", "15-08-2026", "Sunrise Diagnostics Pvt Ltd", "Dr. Mehta", "it@sunrise.example", "27AAACS1234A1Z5", "Maharashtra", "HP Z2 G9 Workstation i7/32GB/1TB", "8471", "5", "142000", "18", "Won", ""],
      ["PR7701", "15-08-2026", "Sunrise Diagnostics Pvt Ltd", "", "", "", "", "Installation & configuration", "998713", "1", "5000", "18", "Won", ""],
      ["PR7702", "20-08-2026", "Atlas Architects", "Ms. Rao", "rao@atlas.example", "", "Karnataka", "AutoCAD LT annual subscription", "997331", "3", "52000", "18", "Sent", ""]],
    rfqs: [["Enquiry No", "Date", "Company", "Contact", "Mobile", "Email", "City", "Requirement", "Qty", "Details", "Due Date", "Status"],
      ["ENQ-101", "02-09-2026", "Gupta Logistics", "Vikas Gupta", "+91 98200 99999", "vikas@gupta.example", "Thane", "HP Laptops", "10", "i5, 16GB, 512GB SSD", "10-09-2026", "Quoted"]],
  }[kind];
  download(`genesis-crm-sample-${kind}.csv`, "﻿" + S2.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\n"));
}
