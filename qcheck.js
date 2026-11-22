// =====================================================================
//  Quotation input rules (pure functions — no DOM, testable)
//  phone = 10 digits · GSTIN = format + check digit + its state · state from
//  the GST list · email · HSN/SAC 4/6/8 digits · qty > 0 · rate ≥ 0 · validity
// =====================================================================
export const GST_STATES = {
  "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana",
  "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland",
  "14": "Manipur", "15": "Mizoram", "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal", "20": "Jharkhand",
  "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat", "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra", "29": "Karnataka", "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry",
  "35": "Andaman and Nicobar Islands", "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh", "97": "Other Territory",
};
export const STATE_NAMES = [...new Set(Object.values(GST_STATES))].sort();
const ALIAS = { mh: "Maharashtra", maha: "Maharashtra", gj: "Gujarat", ka: "Karnataka", tn: "Tamil Nadu", dl: "Delhi", "new delhi": "Delhi",
  up: "Uttar Pradesh", mp: "Madhya Pradesh", wb: "West Bengal", ap: "Andhra Pradesh", ts: "Telangana", tg: "Telangana", rj: "Rajasthan",
  hr: "Haryana", pb: "Punjab", kl: "Kerala", orissa: "Odisha", od: "Odisha", uk: "Uttarakhand", uttaranchal: "Uttarakhand", cg: "Chhattisgarh",
  tamilnadu: "Tamil Nadu", "jammu kashmir": "Jammu and Kashmir", "jammu & kashmir": "Jammu and Kashmir", andaman: "Andaman and Nicobar Islands", pondy: "Puducherry", jk: "Jammu and Kashmir", "j&k": "Jammu and Kashmir", hp: "Himachal Pradesh", pondicherry: "Puducherry", "daman and diu": "Dadra and Nagar Haveli and Daman and Diu",
  "dadra and nagar haveli": "Dadra and Nagar Haveli and Daman and Diu", dnh: "Dadra and Nagar Haveli and Daman and Diu" };
const squash = (s) => String(s || "").toLowerCase().replace(/[^a-z&]+/g, " ").replace(/\band\b/g, "and").trim();

/** "maharashtra", "MH", "Orissa" → the GST list's name; "" for empty; null when unknown */
export function canonState(v) {
  const s = squash(v); if (!s) return "";
  if (ALIAS[s]) return ALIAS[s];
  return STATE_NAMES.find((n) => squash(n) === s) || null;
}

/** "+91 98765-43210", "098765 43210" → "9876543210"; anything else → the digits as typed */
export function cleanPhone(v) {
  let d = String(v || "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d;
}
export const phoneOk = (v) => /^[1-9]\d{9}$/.test(cleanPhone(v));

export const emailOk = (v) => /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/i.test(String(v || "").trim());

const GST_RE = /^(\d{2})[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const CH = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
/** the 15th character every GSTIN must end with (official mod-36 check digit) */
export function gstinCheckChar(first14) {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const p = CH.indexOf(first14[i]) * (i % 2 ? 2 : 1);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return CH[(36 - (sum % 36)) % 36];
}
/** → { ok, state, why } (why: "format" | "state" | "check") */
export function gstinInfo(v) {
  const g = String(v || "").toUpperCase().replace(/\s+/g, "");
  const m = g.match(GST_RE);
  if (!m) return { ok: false, why: "format" };
  const state = GST_STATES[m[1]];
  if (!state) return { ok: false, why: "state" };
  if (gstinCheckChar(g.slice(0, 14)) !== g[14]) return { ok: false, why: "check", state };
  return { ok: true, state };
}

export const hsnOk = (v) => { const s = String(v || "").trim(); return !s || /^(\d{4}|\d{6}|\d{8})$/.test(s); };
const dec = (v, places) => new RegExp(`^\\d+(\\.\\d{1,${places}})?$`).test(String(v).trim());

/**
 * All the rules for one quotation → [{ k, i?, msg }]
 *  k = "name" | "contact" | "phone" | "email" | "gstin" | "state" | "items" | "desc" | "qty" | "price" | "hsn" | "date" | "validity"
 *  i = item row (for item fields)
 */
export function checkQuote(q, tp, { today = new Date().toISOString().slice(0, 10), keepDate = null } = {}) {
  const e = [], L2 = (h, en) => ({ h, en });
  const name = String(tp.name || "").trim();
  if (name.length < 2) e.push({ k: "name", ...L2("Customer ka naam daalo", "Enter the customer's name") });
  if (/\d{5,}/.test(String(tp.contact || ""))) e.push({ k: "contact", ...L2("Contact person mein naam likho — number Phone mein daalo", "Write a name in Contact person — numbers go in Phone") });
  if (String(tp.phone || "").trim() && !phoneOk(tp.phone)) e.push({ k: "phone", ...L2("Phone 10 digit ka hona chahiye (jaise 9876543210)", "Phone must be 10 digits (e.g. 9876543210)") });
  if (String(tp.email || "").trim() && !emailOk(tp.email)) e.push({ k: "email", ...L2("Email sahi nahi hai (jaise name@company.com)", "Email is not valid (e.g. name@company.com)") });
  const st = canonState(tp.state);
  if (st === null) e.push({ k: "state", ...L2("State GST list se chuno (jaise Maharashtra)", "Pick the state from the GST list (e.g. Maharashtra)") });
  if (String(tp.gstin || "").trim()) {
    const g = gstinInfo(tp.gstin);
    if (g.why === "format") e.push({ k: "gstin", ...L2("GSTIN 15 characters ka hota hai (jaise 27ABCDE1234F1Z5)", "A GSTIN has 15 characters (e.g. 27ABCDE1234F1Z5)") });
    else if (g.why === "state") e.push({ k: "gstin", ...L2("GSTIN ke pehle 2 digit kisi state ka code nahi hain", "The first 2 digits of the GSTIN are not a state code") });
    else if (g.why === "check") e.push({ k: "gstin", soft: true, ...L2("GSTIN ka aakhri (check) character match nahi karta — typing ki galti ho sakti hai", "The GSTIN's last (check) character doesn't match — it may be a typo") });
    if (g.why === "check" && st && g.state !== st) e.push({ k: "state", ...L2(`GSTIN ${g.state} ka hai, par state ${st} likha hai`, `The GSTIN is from ${g.state} but the state says ${st}`) });
    else if (st && g.state !== st) e.push({ k: "state", ...L2(`GSTIN ${g.state} ka hai, par state ${st} likha hai`, `The GSTIN is from ${g.state} but the state says ${st}`) });
  }
  const items = q.items || [];
  const used = items.filter((it) => !it.opt);
  if (!items.length) e.push({ k: "items", ...L2("Kam se kam 1 item daalo", "Add at least 1 item") });
  else if (!used.length) e.push({ k: "items", ...L2("Kam se kam 1 item total mein tick karo", "Tick at least 1 item into the total") });
  items.forEach((it, i) => {
    const n = i + 1;
    if (String(it.desc || "").trim().length < 2) e.push({ k: "desc", i, ...L2(`Item ${n}: product / description likho`, `Item ${n}: write the product / description`) });
    const qty = String(it.qty ?? "").trim();
    if (!dec(qty, 3) || +qty <= 0 || +qty > 100000) e.push({ k: "qty", i, ...L2(`Item ${n}: qty 0 se zyada honi chahiye (max 1,00,000)`, `Item ${n}: qty must be more than 0 (max 1,00,000)`) });
    const pr = String(it.price ?? "").trim();
    if (!dec(pr, 2) || +pr > 100000000) e.push({ k: "price", i, ...L2(`Item ${n}: rate 0 ya usse zyada, max 2 decimal`, `Item ${n}: rate must be 0 or more, max 2 decimals`) });
    if (!hsnOk(it.hsn)) e.push({ k: "hsn", i, ...L2(`Item ${n}: HSN/SAC 4, 6 ya 8 digit ka hota hai`, `Item ${n}: HSN/SAC has 4, 6 or 8 digits`) });
  });
  // an old quotation (e.g. from the ERP) keeps its own date — only a date typed now must be recent
  if (q.quote_date && q.quote_date !== keepDate) {
    const max = new Date(today + "T00:00:00"); max.setDate(max.getDate() + 30);
    const min = new Date(today + "T00:00:00"); min.setFullYear(min.getFullYear() - 1);
    const d = new Date(q.quote_date + "T00:00:00");
    if (isNaN(d) || d > max || d < min) e.push({ k: "date", ...L2("Date aaj se 1 saal pehle se 30 din aage tak ho sakti hai", "The date must be within the last year and the next 30 days") });
  }
  const v = Number(q.validity_days);
  if (!Number.isInteger(v) || v < 1 || v > 365) e.push({ k: "validity", ...L2("Validity 1 se 365 din", "Validity must be 1 to 365 days") });
  return e;
}
