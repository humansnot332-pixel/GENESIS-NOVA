// bkxl.js — backup → Excel workbook (shared with supabase/functions/backup/excel.js, keep them in step)
import { loadScript } from "./core.js";
// Turns the raw backup (table → rows) into an easy-to-read Excel workbook:
// an Overview sheet with the key numbers, then one clean sheet per section with
// plain-language column names, ₹ amounts, real dates, names instead of ids,
// coloured header row and filters. Technical tables stay in the JSON backup only.
// Plain JS so it runs in the edge function (Deno) and in local tests (Node).
// Needs a styling-capable SheetJS build (xlsx-js-style).

const BRAND = "0F766E", BRAND_SOFT = "E6F4F2", LINE = "D7DEE6", ZEBRA = "F7F9FB";

const LEAD_STATUS = { new: "New", contacted: "Contacted", interested: "Interested", quote_sent: "Quote sent", demo: "Demo / Meeting",
  negotiation: "Negotiation", won: "Won ✅", lost: "Lost", junk: "Junk" };
const SOURCE = { manual: "Added by team", import: "Excel import", legacy: "Old data", google_places: "Google Maps (auto)", osm: "OpenStreetMap (auto)",
  indiamart: "IndiaMART", webform: "Website form", webhook: "Webhook" };
const OUTCOME = { no_answer: "No answer", busy: "Busy — call later", not_interested: "Not interested", wrong_number: "Wrong number",
  interested: "Interested", quote: "Quote sent", demo: "Demo / meeting fixed", won: "Deal won 🎉" };
const KIND = { call: "📞 Call", note: "📝 Note", email: "✉️ Email", whatsapp: "💬 WhatsApp", meeting: "🤝 Meeting", status: "🔄 Status change",
  assign: "👤 Assigned / lock", system: "⚙️ System" };
const RFQ_STATUS = { new: "New", in_progress: "In progress", quoted: "Quoted", negotiating: "Negotiating", won: "Won ✅", lost: "Lost" };
const TICKET_STATUS = { open: "Open", in_progress: "In progress", waiting: "Waiting for customer", resolved: "Resolved ✅", closed: "Closed" };
const ROLE = { admin: "Admin", manager: "Manager", sales: "Sales Executive", telecaller: "Telecaller", presales: "Presales / Tech" };
const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1).replace(/_/g, " ") : "");

// ---------- value helpers ----------
const IST = 5.5 * 3600e3;
function serial(v, dateOnly) {          // ISO / date string → Excel date number in India time
  if (!v || v === "infinity") return null;
  const t = Date.parse(dateOnly && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v + "T00:00:00Z" : v);
  if (isNaN(t) || Math.abs(t) > 8e15) return null;
  return (dateOnly && /^\d{4}-\d{2}-\d{2}$/.test(v) ? t : t + IST) / 864e5 + 25569;
}
const yn = (b) => (b ? "Yes" : "No");
const list = (a) => (Array.isArray(a) ? a.filter(Boolean).join(", ") : a || "");
const clip = (s) => { s = s == null ? "" : String(s); return s.length > 32000 ? s.slice(0, 32000) + "…" : s; };

// column = [header, (row) => value, type, width]   type: t(text) | m(₹) | n(number) | p(%) | d(date) | dt(date+time)
const T = "t", M = "m", N = "n", P = "p", D = "d", DT = "dt";

export function buildWorkbook(XLSX, dump, meta) {
  const users = new Map((dump.profiles || []).map((u) => [u.id, u.full_name || u.email]));
  const leadsById = new Map((dump.leads || []).map((l) => [l.id, l]));
  const co = (id) => (id ? leadsById.get(id)?.company || "(deleted lead)" : "");
  const who = (id) => (id ? users.get(id) || "(removed user)" : "");
  const cost = new Map((dump.product_cost || []).map((c) => [c.product_id, c.cost_price]));
  const best = new Map();
  for (const v of dump.vendor_prices || []) { const b = best.get(v.product_id); if (!b || +v.price < +b.price) best.set(v.product_id, v); }
  const ordersById = new Map((dump.orders || []).map((o) => [o.id, o]));
  const invById = new Map((dump.invoices || []).map((i) => [i.id, i]));
  const paid = new Map();
  for (const p of dump.payments || []) paid.set(p.invoice_id, (paid.get(p.invoice_id) || 0) + (+p.amount || 0));
  const today = Date.now() + IST, day = (v) => Math.floor((Date.parse(v + "T00:00:00Z") - today) / 864e5) + 1;
  const newest = (a, k = "created_at") => [...(a || [])].sort((x, y) => String(y[k] || "").localeCompare(String(x[k] || "")));

  const invStatus = (i) => {
    if (i.cancelled) return "Cancelled";
    const bal = (+i.amount || 0) - (paid.get(i.id) || 0);
    if (bal <= 0.5) return "Paid ✅";
    if (i.due_date && day(i.due_date) < 0) return "Overdue ⚠️";
    return (paid.get(i.id) || 0) > 0 ? "Part paid" : "Due";
  };

  const SHEETS = [
    ["Leads", "All companies we are working on", newest(dump.leads), [
      ["Company", (r) => r.company, T, 32], ["Contact person", (r) => r.contact_name, T, 20], ["Designation", (r) => r.designation, T, 16],
      ["Phone", (r) => r.phone, T, 16], ["Email", (r) => r.email, T, 26], ["City", (r) => r.city, T, 13], ["Area", (r) => r.area, T, 16],
      ["Status", (r) => LEAD_STATUS[r.status] || cap(r.status), T, 14], ["Handled by", (r) => who(r.owner_id) || "Free pool", T, 16],
      ["Next follow-up", (r) => r.next_follow_up, DT, 17], ["Last contacted", (r) => r.last_contacted, DT, 17], ["Total calls", (r) => r.call_count, N, 9],
      ["Deal value", (r) => r.deal_value, M, 13], ["Category", (r) => r.category, T, 18], ["Interested in", (r) => list(r.products), T, 28],
      ["Industry", (r) => r.industry, T, 16], ["Lead source", (r) => SOURCE[r.source] || cap(r.source), T, 18], ["Website", (r) => r.website, T, 24],
      ["Address", (r) => r.address, T, 30], ["Pincode", (r) => r.pincode, T, 9], ["State", (r) => r.state, T, 13], ["GSTIN", (r) => r.gstin, T, 17],
      ["Tags", (r) => list(r.tags), T, 14], ["Notes", (r) => clip(r.notes), T, 40], ["Added on", (r) => r.created_at, DT, 17],
    ]],
    ["Calls & Notes", "Every call, note, email and update — newest first", newest(dump.activities), [
      ["When", (r) => r.created_at, DT, 17], ["Company", (r) => co(r.lead_id), T, 30], ["Type", (r) => KIND[r.kind] || cap(r.kind), T, 16],
      ["Call result", (r) => OUTCOME[r.outcome] || cap(r.outcome), T, 20], ["Note / details", (r) => clip(r.body), T, 60], ["By", (r) => who(r.user_id) || "System", T, 16],
    ]],
    ["Follow-ups & Tasks", "To-dos for the team", newest(dump.tasks, "due_at"), [
      ["Task", (r) => r.title, T, 40], ["Company", (r) => co(r.lead_id), T, 30], ["Assigned to", (r) => who(r.assignee_id), T, 16],
      ["Due", (r) => r.due_at, DT, 17], ["Done?", (r) => yn(r.done), T, 8], ["Done on", (r) => r.done_at, DT, 17], ["Created by", (r) => who(r.created_by), T, 16],
    ]],
    ["RFQs", "Requirements received from customers", newest(dump.rfqs), [
      ["RFQ no", (r) => r.rfq_no, T, 13], ["Received on", (r) => r.created_at, DT, 17], ["Company", (r) => r.company, T, 30], ["Contact", (r) => r.contact, T, 18],
      ["Phone", (r) => r.phone, T, 15], ["Email", (r) => r.email, T, 24], ["City", (r) => r.city, T, 12], ["Product needed", (r) => r.product, T, 28], ["Qty", (r) => r.qty, T, 8],
      ["Status", (r) => RFQ_STATUS[r.status] || cap(r.status), T, 13], ["Reply by", (r) => r.due_date, D, 12], ["Quoted value", (r) => r.quoted_value, M, 13],
      ["Handled by", (r) => who(r.owner_id), T, 16], ["Source", (r) => SOURCE[r.source] || cap(r.source), T, 15], ["Details", (r) => clip(r.details), T, 50],
    ]],
    ["Quotations", "All quotations sent", newest(dump.quotations), [
      ["Quote no", (r) => r.quote_no, T, 15], ["Date", (r) => r.quote_date || r.created_at, D, 12], ["Customer", (r) => r.to_party?.name || co(r.lead_id), T, 30],
      ["Contact", (r) => r.to_party?.contact, T, 18], ["Items", (r) => (r.items || []).length, N, 7], ["Amount (before GST)", (r) => r.subtotal, M, 15],
      ["GST", (r) => r.tax_total, M, 12], ["Total", (r) => r.grand_total, M, 14], ["Status", (r) => cap(r.status), T, 11],
      ["Customer response", (r) => (r.customer_response === "accepted" ? "Accepted ✅" : r.customer_response === "changes" ? "Wants changes" : r.view_count ? "Seen, no reply" : "Not opened yet"), T, 17],
      ["Times opened", (r) => r.view_count, N, 9], ["Customer note", (r) => clip(r.customer_note), T, 30], ["Made by", (r) => who(r.owner_id), T, 16],
    ]],
    ["Quotation Items", "Every line of every quotation", newest(dump.quotations).flatMap((q) => (q.items || []).map((it, i) => ({ q, it, i }))), [
      ["Quote no", (r) => r.q.quote_no, T, 15], ["Customer", (r) => r.q.to_party?.name || co(r.q.lead_id), T, 30], ["Line", (r) => r.i + 1, N, 6],
      ["Item / description", (r) => r.it.desc, T, 44], ["HSN/SAC", (r) => r.it.hsn, T, 10], ["Qty", (r) => +r.it.qty || 0, N, 7],
      ["Rate", (r) => +r.it.price || 0, M, 13], ["Amount", (r) => (+r.it.qty || 0) * (+r.it.price || 0), M, 14],
    ]],
    ["Orders", "Confirmed orders (POs)", newest(dump.orders), [
      ["Order no", (r) => r.order_no, T, 14], ["Customer", (r) => co(r.lead_id), T, 30], ["PO no", (r) => r.po_number, T, 16], ["PO date", (r) => r.po_date, D, 12],
      ["Amount", (r) => r.amount, M, 14], ["Status", (r) => cap(r.status), T, 12], ["Expected delivery", (r) => r.expected_delivery, D, 14],
      ["Delivered on", (r) => r.delivered_at, D, 13], ["Handled by", (r) => who(r.owner_id), T, 16], ["Notes", (r) => clip(r.notes), T, 30],
    ]],
    ["Invoices", "Bills raised and what is still to be collected", newest(dump.invoices, "invoice_date"), [
      ["Invoice no", (r) => r.invoice_no, T, 16], ["Date", (r) => r.invoice_date, D, 12], ["Customer", (r) => r.to_party?.name || co(r.lead_id), T, 30],
      ["Invoice amount", (r) => r.amount, M, 15], ["Received", (r) => paid.get(r.id) || 0, M, 14], ["Balance to collect", (r) => (r.cancelled ? 0 : (+r.amount || 0) - (paid.get(r.id) || 0)), M, 16],
      ["Status", invStatus, T, 13], ["Due date", (r) => r.due_date, D, 12], ["Order no", (r) => ordersById.get(r.order_id)?.order_no, T, 14],
      ["Made in", (r) => (r.source === "tally" ? "Tally" : "CRM"), T, 9], ["Handled by", (r) => who(r.owner_id), T, 16],
    ]],
    ["Payments", "Money received", newest(dump.payments, "paid_on"), [
      ["Date", (r) => r.paid_on, D, 12], ["Customer", (r) => { const i = invById.get(r.invoice_id); return i?.to_party?.name || co(i?.lead_id); }, T, 30],
      ["Invoice no", (r) => invById.get(r.invoice_id)?.invoice_no, T, 16], ["Amount", (r) => r.amount, M, 14], ["Mode", (r) => r.mode, T, 9],
      ["UTR / cheque no", (r) => r.reference, T, 18], ["Notes", (r) => clip(r.notes), T, 30], ["Entered by", (r) => who(r.created_by), T, 16],
    ]],
    ["Renewals & AMC", "Licences / AMCs that will renew — soonest first", [...(dump.renewals || [])].sort((a, b) => String(a.end_date).localeCompare(String(b.end_date))), [
      ["Customer", (r) => co(r.lead_id), T, 30], ["Product / service", (r) => r.product, T, 30], ["Type", (r) => cap(r.kind), T, 12], ["Qty / seats", (r) => r.qty, N, 9],
      ["Start", (r) => r.start_date, D, 12], ["Expiry", (r) => r.end_date, D, 12],
      ["Days left", (r) => (r.end_date && r.status === "active" ? day(r.end_date) : null), N, 9], ["Amount", (r) => r.amount, M, 13],
      ["Vendor", (r) => r.vendor, T, 14], ["Status", (r) => cap(r.status), T, 11], ["Handled by", (r) => who(r.owner_id), T, 16], ["Notes", (r) => clip(r.notes), T, 30],
    ]],
    ["Support Tickets", "Service / support complaints", newest(dump.tickets), [
      ["Ticket no", (r) => r.ticket_no, T, 11], ["Raised on", (r) => r.created_at, DT, 17], ["Customer", (r) => co(r.lead_id), T, 28], ["Problem", (r) => r.title, T, 36],
      ["Category", (r) => cap(r.category), T, 13], ["Priority", (r) => cap(r.priority), T, 10], ["Status", (r) => TICKET_STATUS[r.status] || cap(r.status), T, 16],
      ["Engineer", (r) => who(r.assignee_id), T, 16], ["Due by", (r) => r.due_at, DT, 17], ["Resolved on", (r) => r.resolved_at, DT, 17],
      ["Raised by", (r) => who(r.created_by), T, 16], ["Details", (r) => clip(r.description), T, 50],
    ]],
    ["Site Visits", "Field visits checked in with GPS", newest(dump.visits), [
      ["When", (r) => r.created_at, DT, 17], ["Company", (r) => co(r.lead_id), T, 30], ["By", (r) => who(r.user_id), T, 16], ["Note", (r) => clip(r.note), T, 40],
      ["Map", (r) => (r.lat != null ? `https://maps.google.com/?q=${r.lat},${r.lng}` : ""), T, 40],
    ]],
    ["Products", "Catalogue with selling price (🔒 cost & margin: management only)", [...(dump.products || [])].sort((a, b) => String(a.category).localeCompare(String(b.category)) || String(a.name).localeCompare(String(b.name))), [
      ["Brand", (r) => r.brand, T, 14], ["Product / service", (r) => r.name, T, 36], ["Model / edition", (r) => r.model, T, 18], ["Category", (r) => r.category, T, 22],
      ["HSN/SAC", (r) => r.hsn, T, 10], ["GST %", (r) => (r.gst_rate != null ? +r.gst_rate / 100 : null), P, 7], ["Unit", (r) => r.unit, T, 9],
      ["Selling price", (r) => r.sell_price, M, 14], ["🔒 Cost price", (r) => cost.get(r.id) ?? best.get(r.id)?.price, M, 14],
      ["🔒 Margin %", (r) => { const c = cost.get(r.id) ?? best.get(r.id)?.price; return c != null && +r.sell_price ? (r.sell_price - c) / r.sell_price : null; }, P, 10],
      ["🔒 Cheapest vendor", (r) => best.get(r.id)?.vendor, T, 16], ["In quotations?", (r) => yn(r.active !== false), T, 11], ["Notes", (r) => clip(r.notes), T, 30],
    ]],
    ["Team", "Users of the CRM", [...(dump.profiles || [])].sort((a, b) => String(a.full_name).localeCompare(String(b.full_name))), [
      ["Name", (r) => r.full_name, T, 22], ["Email", (r) => r.email, T, 28], ["Phone", (r) => r.phone, T, 15], ["Role", (r) => ROLE[r.role] || cap(r.role), T, 16],
      ["Designation", (r) => r.designation, T, 18], ["Active?", (r) => yn(r.active), T, 8], ["Daily call target", (r) => r.daily_target, N, 12], ["Last seen", (r) => r.last_seen, DT, 17],
    ]],
    ["Attendance", "When each person was active in the CRM", [...(dump.attendance || [])].sort((a, b) => String(b.day).localeCompare(String(a.day))), [
      ["Date", (r) => r.day, D, 12], ["Name", (r) => who(r.user_id), T, 22], ["First seen", (r) => r.first_seen, DT, 17], ["Last seen", (r) => r.last_seen, DT, 17],
      ["Active minutes", (r) => r.active_min, N, 12],
    ]],
  ];

  // ---------- styling ----------
  const border = { top: { style: "thin", color: { rgb: LINE } }, bottom: { style: "thin", color: { rgb: LINE } }, left: { style: "thin", color: { rgb: LINE } }, right: { style: "thin", color: { rgb: LINE } } };
  const sTitle = { font: { bold: true, sz: 15, color: { rgb: BRAND } } };
  const sSub = { font: { italic: true, sz: 10, color: { rgb: "6B7280" } } };
  const sHead = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: BRAND } }, alignment: { vertical: "center", wrapText: true }, border };
  // Indian grouping: ₹8,37,800 · ₹1,23,45,678
  const FMT = { m: '[>=10000000]"₹"##\\,##\\,##\\,##0;[>=100000]"₹"##\\,##\\,##0;"₹"##,##0', n: "#,##0", p: "0.0%", d: "dd-mmm-yyyy", dt: "dd-mmm-yyyy hh:mm" };

  const wb = XLSX.utils.book_new();
  const counts = [];
  for (const [name, desc, rows, cols] of SHEETS) {
    const aoa = [[name], [desc + " · " + rows.length + " rows"], cols.map((c) => c[0])];
    for (const r of rows) aoa.push(cols.map(([, fn, ty]) => {
      let v; try { v = fn(r); } catch { v = ""; }
      if (ty === D || ty === DT) return serial(v, ty === D);
      if (ty === M || ty === N || ty === P) return v === null || v === undefined || v === "" || isNaN(+v) ? null : +v;
      return v === null || v === undefined ? "" : clip(v);
    }));
    if (!rows.length) aoa.push(["(nothing here yet)"]);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["A1"].s = sTitle; ws["A2"].s = sSub;
    cols.forEach(([, , ty], c) => {
      const h = XLSX.utils.encode_cell({ r: 2, c }); ws[h].s = sHead;
      for (let r = 3; r < aoa.length; r++) {
        const a = XLSX.utils.encode_cell({ r, c });
        if (!ws[a]) ws[a] = { t: "s", v: "" };          // empty cells still get the grid + stripe
        const cell = ws[a];
        cell.s = { border, alignment: { vertical: "top" }, ...(r % 2 === 0 ? { fill: { fgColor: { rgb: ZEBRA } } } : {}) };
        if (FMT[ty] && cell.t === "n") cell.z = FMT[ty];
      }
    });
    ws["!cols"] = cols.map((c) => ({ wch: c[3] || 14 }));
    ws["!rows"] = [{ hpt: 22 }, { hpt: 16 }, { hpt: 30 }];
    if (rows.length) ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 2, c: 0 }, e: { r: aoa.length - 1, c: cols.length - 1 } }) };
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
    counts.push([name, rows.length]);
  }

  // ---------- Overview (first sheet) ----------
  const L = dump.leads || [], inv = (dump.invoices || []).filter((i) => !i.cancelled);
  const sum = (a, f) => a.reduce((s, x) => s + (+f(x) || 0), 0);
  const billed = sum(inv, (i) => i.amount), got = sum(inv, (i) => paid.get(i.id) || 0);
  const overdue = sum(inv.filter((i) => i.due_date && day(i.due_date) < 0), (i) => (+i.amount || 0) - (paid.get(i.id) || 0));
  const ren30 = (dump.renewals || []).filter((r) => r.status === "active" && r.end_date && day(r.end_date) <= 30);
  const ov = [
    ["Genesis Nova — Business backup"],
    [`Taken on ${new Date(Date.now() + IST).toISOString().slice(0, 16).replace("T", " ")} (India time) · ${meta.by === "nightly" ? "automatic nightly backup" : "taken by " + String(meta.by).replace("manual:", "")}`],
    [],
    ["📊 Key numbers", ""],
    ["Total leads", L.length], ["Open leads (still in progress)", L.filter((l) => !["won", "lost", "junk"].includes(l.status)).length],
    ["Deals won", L.filter((l) => l.status === "won").length], ["Follow-ups overdue", L.filter((l) => l.next_follow_up && Date.parse(l.next_follow_up) < Date.now() && !["won", "lost", "junk"].includes(l.status)).length],
    ["Calls logged (all time)", (dump.activities || []).filter((a) => a.kind === "call").length],
    ["Quotations sent", (dump.quotations || []).length], ["Quotation value", sum(dump.quotations || [], (q) => q.grand_total)],
    ["Orders received", (dump.orders || []).length], ["Order value", sum(dump.orders || [], (o) => o.amount)],
    ["Invoiced", billed], ["Money received", got], ["Still to collect", billed - got], ["Of which overdue", overdue],
    ["Renewals due in next 30 days", ren30.length], ["Renewal value (next 30 days)", sum(ren30, (r) => r.amount)],
    ["Open support tickets", (dump.tickets || []).filter((t) => ["open", "in_progress", "waiting"].includes(t.status)).length],
    [],
    ["📈 Leads by status", ""], ...Object.entries(LEAD_STATUS).map(([k, l]) => [l, L.filter((x) => x.status === k).length]),
    [],
    ["📑 Sheets in this file", "Rows"], ...counts,
    [],
    ["ℹ️ Full raw data (for restoring the CRM) is in the matching .json.gz backup file."],
  ];
  const ows = XLSX.utils.aoa_to_sheet(ov);
  ows["A1"].s = { font: { bold: true, sz: 18, color: { rgb: BRAND } } }; ows["A2"].s = sSub;
  const money = new Set(["Quotation value", "Order value", "Invoiced", "Money received", "Still to collect", "Of which overdue", "Renewal value (next 30 days)"]);
  ov.forEach((row, r) => {
    if (r < 3 || !row.length) return;
    const a = ows[XLSX.utils.encode_cell({ r, c: 0 })], b = ows[XLSX.utils.encode_cell({ r, c: 1 })];
    if (/^[📊📈📑]/u.test(String(row[0]))) { if (a) a.s = sHead; if (b) b.s = sHead; return; }
    if (a) a.s = { border, fill: { fgColor: { rgb: BRAND_SOFT } }, font: { bold: String(row[0]).startsWith("ℹ️") ? false : true } };
    if (b) { b.s = { border, alignment: { horizontal: "right" }, font: { bold: true } }; if (money.has(row[0])) b.z = FMT.m; }
  });
  ows["!cols"] = [{ wch: 36 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, ows, "Overview");
  wb.SheetNames = ["Overview", ...wb.SheetNames.filter((n) => n !== "Overview")];
  return { buffer: XLSX.write(wb, { type: "array", bookType: "xlsx", compression: true, cellStyles: true }), sheets: [["Overview", ov.length], ...counts] };
}

// ---------------------------------------------------------------------
//  In the CRM (Admin → Company settings → Backups): the nightly backup is one
//  gzipped JSON file; the readable Excel is made here, in the browser, on click
//  (edge functions only get 2 s of CPU — far too little for a big workbook).
// ---------------------------------------------------------------------

export async function backupToExcel(blob) {
  await loadScript("xlsx-style.min.js");
  const XLSX = window.XLSX;
  if (!XLSX?.utils) throw new Error("Excel library did not load");
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  const gz = head[0] === 0x1f && head[1] === 0x8b;                     // the browser may already have unzipped it
  const text = await new Response(gz ? blob.stream().pipeThrough(new DecompressionStream("gzip")) : blob).text();
  const j = JSON.parse(text);
  const xl = buildWorkbook(XLSX, j.data || {}, { taken_at: j.taken_at, by: j.by || "nightly" });
  return new Blob([xl.buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
