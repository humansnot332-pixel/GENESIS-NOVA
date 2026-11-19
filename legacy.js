// =====================================================================
//  Genesis CRM — extra import formats (loaded only when needed)
//  • Old Excel .xls (BIFF8 / BIFF5 inside an OLE compound file)
//  • ".xls" files that are really HTML tables or Excel 2003 XML
//  • vCard contacts (.vcf — phone / Google / Outlook export)
//  • Tally masters export (.xml — ERP 9 and Prime, UTF-8 or UTF-16)
//  Every reader returns [{ name, rows: string[][] }] like readXlsx, so the
//  normal mapping → preview → import → undo flow takes over from there.
// =====================================================================
import { L } from "./i18n.js";

const clean = (s) => String(s ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/\s+/g, " ").trim();
const nonEmpty = (rows) => rows.map((r) => Array.from(r || [], (x) => x ?? "")).filter((r) => r.some((c) => String(c).trim()));
const serialToISO = (v, d1904) => { const d = new Date(Math.round((v + (d1904 ? 1462 : 0) - 25569) * 864e5)); return isNaN(d) ? "" : d.toISOString().slice(0, 10); };
const numStr = (n) => (Number.isInteger(n) ? String(n) : String(+n.toPrecision(15)));
const isDateFmt = (id, code) => (id >= 14 && id <= 22) || (id >= 45 && id <= 47) || (id >= 27 && id <= 36) || (id >= 50 && id <= 58)
  || (!!code && /[dy]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, "")) && !/0\.0|#/.test(code));

// ---------------------------------------------------------------------
//  Text decoding: BOM / UTF-16 without BOM / UTF-8 / old Windows (ANSI)
// ---------------------------------------------------------------------
export function decodeText(buf) {
  const u8 = new Uint8Array(buf);
  if (u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf) return new TextDecoder("utf-8").decode(u8.subarray(3));
  if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder("utf-16le").decode(u8.subarray(2));
  if (u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder("utf-16be").decode(u8.subarray(2));
  // UTF-16 without a BOM: every other byte is 0 for plain English text
  let z0 = 0, z1 = 0; const n = Math.min(u8.length, 400);
  for (let i = 0; i < n; i++) if (!u8[i]) (i % 2 ? z1++ : z0++);
  if (z1 > n / 4 && !z0) return new TextDecoder("utf-16le").decode(u8);
  if (z0 > n / 4 && !z1) return new TextDecoder("utf-16be").decode(u8);
  try { return new TextDecoder("utf-8", { fatal: true }).decode(u8); }
  catch { return new TextDecoder("windows-1252").decode(u8); }   // Excel "CSV" saved in ANSI
}

// ---------------------------------------------------------------------
//  OLE compound file (the container of every real .xls)
// ---------------------------------------------------------------------
function cfbStream(buf, names) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf);
  const ss = 1 << dv.getUint16(30, true), mss = 1 << dv.getUint16(32, true);
  const dirStart = dv.getUint32(48, true), cutoff = dv.getUint32(56, true) || 4096, miniFatStart = dv.getUint32(60, true);
  const off = (id) => (id + 1) * ss;
  const END = 0xfffffffe;
  // sectors holding the FAT: 109 in the header, the rest in the DIFAT chain
  const fatSecs = [];
  for (let i = 0; i < 109; i++) { const s = dv.getUint32(76 + i * 4, true); if (s < END) fatSecs.push(s); }
  let dif = dv.getUint32(68, true), guard = 0;
  while (dif < END && off(dif) + ss <= buf.byteLength && guard++ < 10000) {
    for (let i = 0; i < ss / 4 - 1; i++) { const s = dv.getUint32(off(dif) + i * 4, true); if (s < END) fatSecs.push(s); }
    dif = dv.getUint32(off(dif) + ss - 4, true);
  }
  const fat = [];
  for (const s of fatSecs) for (let i = 0; i < ss / 4; i++) { const o = off(s) + i * 4; fat.push(o + 4 <= buf.byteLength ? dv.getUint32(o, true) : END); }
  const chain = (start, table) => { const out = []; let s = start; while (s < END && s < table.length && out.length <= table.length) { out.push(s); s = table[s]; } return out; };
  const readChain = (start, size) => {
    const secs = chain(start, fat), out = new Uint8Array(Math.min(size ?? secs.length * ss, secs.length * ss));
    secs.forEach((s, i) => { const from = off(s), n = Math.min(ss, out.length - i * ss); if (n > 0) out.set(u8.subarray(from, from + n), i * ss); });
    return out;
  };
  const dir = readChain(dirStart), dd = new DataView(dir.buffer, dir.byteOffset, dir.byteLength);
  const ents = [];
  for (let o = 0; o + 128 <= dir.length; o += 128) {
    const nl = dd.getUint16(o + 64, true);
    ents.push({ name: new TextDecoder("utf-16le").decode(dir.subarray(o, o + Math.max(0, nl - 2))), type: dir[o + 66], start: dd.getUint32(o + 116, true), size: dd.getUint32(o + 120, true) });
  }
  const ent = ents.find((e) => e.type === 2 && names.includes(e.name));
  if (!ent) return null;
  if (ent.size >= cutoff) return readChain(ent.start, ent.size);
  // small stream → lives in the mini stream
  const root = ents.find((e) => e.type === 5), mini = readChain(root.start, root.size);
  const mf = readChain(miniFatStart), mfv = new DataView(mf.buffer, mf.byteOffset, mf.byteLength), miniFat = [];
  for (let i = 0; i + 4 <= mf.length; i += 4) miniFat.push(mfv.getUint32(i, true));
  const secs = chain(ent.start, miniFat), out = new Uint8Array(ent.size);
  secs.forEach((s, i) => { const n = Math.min(mss, ent.size - i * mss); if (n > 0) out.set(mini.subarray(s * mss, s * mss + n), i * mss); });
  return out;
}

// ---------------------------------------------------------------------
//  BIFF records (.xls workbook stream)
// ---------------------------------------------------------------------
// reads across a record and its CONTINUE records; a string's characters that
// spill into a CONTINUE start with a fresh 1-byte "16-bit or 8-bit" flag
class Segs {
  constructor(segs) { this.s = segs; this.i = 0; this.o = 0; }
  fix() { while (this.i < this.s.length && this.o >= this.s[this.i].length) { this.i++; this.o = 0; } }
  u8() { this.fix(); if (this.i >= this.s.length) throw new Error("eof"); return this.s[this.i][this.o++]; }
  u16() { return this.u8() | (this.u8() << 8); }
  u32() { return (this.u16() | (this.u16() << 16)) >>> 0; }
  skip(n) { for (let k = 0; k < n; k++) this.u8(); }
  str8(n, cp) { const b = new Uint8Array(n); for (let k = 0; k < n; k++) b[k] = this.u8(); return cp.decode(b); }
  // BIFF8 unicode string: cch (8 or 16 bit), flags, [runs], [ext], chars
  ustr(lenBytes) {
    const cch = lenBytes === 1 ? this.u8() : this.u16(); let fl = this.u8();
    const runs = fl & 8 ? this.u16() : 0, ext = fl & 4 ? this.u32() : 0;
    let hi = fl & 1, out = "";
    for (let k = 0; k < cch; k++) {
      if (this.i < this.s.length && this.o >= this.s[this.i].length) { this.i++; this.o = 0; if (this.i < this.s.length) { fl = this.s[this.i][this.o++]; hi = fl & 1; } }
      out += String.fromCharCode(hi ? this.u16() : this.u8());   // 8-bit = Latin-1 in BIFF8
    }
    this.skip(runs * 4 + ext);
    return out;
  }
}
const CP = { 1252: "windows-1252", 1200: "utf-16le", 65001: "utf-8", 932: "shift_jis", 936: "gbk", 949: "euc-kr", 950: "big5", 1250: "windows-1250", 1251: "windows-1251", 1253: "windows-1253", 1254: "windows-1254", 1256: "windows-1256", 10000: "macintosh" };

export function readXls(buf) {
  const wbk = cfbStream(buf, ["Workbook", "Book", "WORKBOOK", "BOOK"]);
  if (!wbk) throw new Error(L("Is .xls mein data nahi mila — Excel mein kholke \"Save As → .xlsx\" karo", "No data found in this .xls — open it in Excel and \"Save As → .xlsx\""));
  const dv = new DataView(wbk.buffer, wbk.byteOffset, wbk.byteLength);
  const rec = (o) => (o + 4 <= wbk.length ? { t: dv.getUint16(o, true), n: dv.getUint16(o + 2, true), d: wbk.subarray(o + 4, o + 4 + dv.getUint16(o + 2, true)), next: o + 4 + dv.getUint16(o + 2, true) } : null);
  const with_cont = (r) => { const segs = [r.d]; let o = r.next, c; while ((c = rec(o)) && c.t === 0x003c) { segs.push(c.d); o = c.next; } return segs; };
  let biff = 8, cp = new TextDecoder("windows-1252"), d1904 = false;
  const sst = [], fmts = {}, xfFmt = [], sheets = [];
  // ---- workbook globals
  let o = 0, r = rec(0);
  if (!r || (r.t & 0xff) !== 0x09) throw new Error(L("Ye .xls file samajh nahi aayi — Excel mein \"Save As → .xlsx\" karo", "Couldn't read this .xls — use \"Save As → .xlsx\" in Excel"));
  biff = r.n >= 2 && (r.d[0] | (r.d[1] << 8)) === 0x0600 ? 8 : 5;
  while ((r = rec(o))) {
    const d = r.d, g = new DataView(d.buffer, d.byteOffset, d.byteLength);
    if (r.t === 0x000a) break;   // EOF of globals
    if (r.t === 0x002f) throw new Error(L("Ye .xls password se locked hai — Excel mein password hata ke save karo", "This .xls is password-protected — remove the password in Excel and save again"));
    if (r.t === 0x0042 && d.length >= 2) { const c = g.getUint16(0, true); try { cp = new TextDecoder(CP[c] || "windows-1252"); } catch { /* keep */ } }
    else if (r.t === 0x0022 && d.length >= 2) d1904 = g.getUint16(0, true) === 1;
    else if (r.t === 0x041e) {
      const S = new Segs([d]); const id = S.u16();
      try { fmts[id] = biff === 8 ? S.ustr(2) : S.str8(S.u8(), cp); } catch { /* ignore */ }
    } else if (r.t === 0x00e0 && d.length >= 4) xfFmt.push(g.getUint16(2, true));
    else if (r.t === 0x0085 && d.length >= 7) {
      const S = new Segs([d.subarray(6)]); let name = "";
      try { name = biff === 8 ? S.ustr(1) : S.str8(S.u8(), cp); } catch { /* ignore */ }
      if (d[5] === 0) sheets.push({ pos: g.getUint32(0, true), name: name || "Sheet" + (sheets.length + 1) });   // worksheets only
    } else if (r.t === 0x00fc) {
      const S = new Segs(with_cont(r)); S.skip(4); const unique = S.u32();
      for (let k = 0; k < unique; k++) { try { sst.push(S.ustr(2)); } catch { break; } }
    }
    o = r.next;
  }
  const isDateXf = (xf) => { const f = xfFmt[xf]; return f != null && isDateFmt(f, fmts[f]); };
  const val = (xf, n) => (isDateXf(xf) && n > 0 && n < 2958466 ? serialToISO(n, d1904) : numStr(n));
  const rk = (v) => { let n = v & 2 ? v >> 2 : (() => { const b = new DataView(new ArrayBuffer(8)); b.setUint32(4, v & 0xfffffffc, true); return b.getFloat64(0, true); })(); return v & 1 ? n / 100 : n; };
  const label = (d) => { const S = new Segs([d.subarray(6)]); try { return biff === 8 ? S.ustr(2) : S.str8(S.u16(), cp); } catch { return ""; } };
  // ---- each worksheet
  const out = [];
  for (const sh of sheets) {
    const rows = []; const put = (row, col, v) => { if (row > 200000 || col > 1000) return; (rows[row] ||= [])[col] = String(v ?? ""); };
    let pendingFormula = null;
    o = sh.pos; r = rec(o); if (!r) continue; o = r.next;   // skip the sheet's BOF
    let guard = 0;
    while ((r = rec(o)) && guard++ < 5e6) {
      const d = r.d, g = new DataView(d.buffer, d.byteOffset, d.byteLength), R = d.length >= 4 ? g.getUint16(0, true) : 0, C = d.length >= 4 ? g.getUint16(2, true) : 0;
      if (r.t === 0x000a) break;
      switch (r.t) {
        case 0x00fd: if (d.length >= 10) put(R, C, sst[g.getUint32(6, true)] ?? ""); break;                     // LABELSST
        case 0x0204: case 0x00d6: put(R, C, label(d)); break;                                                     // LABEL / RSTRING
        case 0x0203: if (d.length >= 14) put(R, C, val(g.getUint16(4, true), g.getFloat64(6, true))); break;      // NUMBER
        case 0x027e: if (d.length >= 10) put(R, C, val(g.getUint16(4, true), rk(g.getUint32(6, true)))); break;   // RK
        case 0x00bd: { const last = g.getUint16(d.length - 2, true);                                              // MULRK
          for (let c = C, p = 4; c <= last && p + 6 <= d.length - 2; c++, p += 6) put(R, c, val(g.getUint16(p, true), rk(g.getUint32(p + 2, true)))); break; }
        case 0x0205: if (d.length >= 8) put(R, C, d[7] ? "" : d[6] ? "TRUE" : "FALSE"); break;                    // BOOLERR
        case 0x0006: if (d.length >= 14) {                                                                        // FORMULA (cached result)
          if (g.getUint16(12, true) === 0xffff) { const k = d[6]; if (k === 0) pendingFormula = [R, C]; else if (k === 1) put(R, C, d[8] ? "TRUE" : "FALSE"); }
          else put(R, C, val(g.getUint16(4, true), g.getFloat64(6, true))); } break;
        case 0x0207: if (pendingFormula) { const S = new Segs(with_cont(r)); try { put(...pendingFormula, biff === 8 ? S.ustr(2) : S.str8(S.u16(), cp)); } catch { /* ignore */ } pendingFormula = null; } break;   // STRING
        case 0x0809: { let depth = 1; o = r.next; while (depth && (r = rec(o))) { if (r.t === 0x0809) depth++; else if (r.t === 0x000a) depth--; o = r.next; } continue; }  // embedded chart
      }
      o = r.next;
    }
    out.push({ name: sh.name, rows: nonEmpty(Array.from(rows, (x) => x || [])) });
  }
  return out;
}

// ---------------------------------------------------------------------
//  ".xls" that is really an HTML table (many portals / ERPs export this)
// ---------------------------------------------------------------------
export function readHtmlTables(text) {
  const doc = new DOMParser().parseFromString(text.replace(/<br\s*\/?>/gi, " "), "text/html");
  const out = [];
  [...doc.querySelectorAll("table")].forEach((t, ti) => {
    if (t.querySelector("table")) return;   // layout wrapper — its inner tables are read on their own
    const rows = [], span = [];             // span[col] = rows still covered by a rowspan above
    [...t.rows].forEach((tr, ri) => {
      const row = []; let c = 0;
      for (const td of tr.cells) {
        while (span[c] > 0) { row[c] = ""; span[c]--; c++; }
        const cs = Math.min(+td.colSpan || 1, 50), rs = Math.min(+td.rowSpan || 1, 500);
        row[c] = clean(td.textContent);
        for (let k = 0; k < cs; k++) { if (rs > 1) span[c + k] = rs - 1; if (k) row[c + k] = ""; }
        c += cs;
      }
      while (c < span.length) { if (span[c] > 0) { row[c] = ""; span[c]--; } c++; }
      rows[ri] = row;
    });
    const r = nonEmpty(rows); if (r.length > 1) out.push({ name: "Table " + (ti + 1), rows: r });
  });
  return out;
}

// ---------------------------------------------------------------------
//  Excel 2003 "XML Spreadsheet" (also often saved as .xls)
// ---------------------------------------------------------------------
export function readSpreadsheetML(text) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error(L("XML file kharab hai", "The XML file is damaged"));
  const loc = (el, n) => [...el.children].filter((x) => x.localName === n);
  const out = [];
  for (const ws of [...doc.getElementsByTagNameNS("*", "Worksheet")]) {
    const tbl = loc(ws, "Table")[0]; if (!tbl) continue;
    const rows = []; let ri = -1;
    for (const row of loc(tbl, "Row")) {
      const idx = row.getAttribute("ss:Index") || row.getAttributeNS("urn:schemas-microsoft-com:office:spreadsheet", "Index"); ri = idx ? +idx - 1 : ri + 1;
      const r = []; let ci = -1;
      for (const c of loc(row, "Cell")) {
        const cx = c.getAttribute("ss:Index") || c.getAttributeNS("urn:schemas-microsoft-com:office:spreadsheet", "Index"); ci = cx ? +cx - 1 : ci + 1;
        const d = loc(c, "Data")[0], t = d?.getAttribute("ss:Type") || d?.getAttributeNS("urn:schemas-microsoft-com:office:spreadsheet", "Type");
        let v = clean(d?.textContent);
        if (t === "DateTime") v = v.slice(0, 10);
        r[ci] = v;
        const across = +(c.getAttribute("ss:MergeAcross") || 0); for (let k = 0; k < across && k < 50; k++) r[++ci] = "";
      }
      if (ri < 200000) rows[ri] = r;
    }
    out.push({ name: ws.getAttribute("ss:Name") || ws.getAttributeNS("urn:schemas-microsoft-com:office:spreadsheet", "Name") || "Sheet", rows: nonEmpty(Array.from(rows, (x) => x || [])) });
  }
  return out;
}

// ---------------------------------------------------------------------
//  vCard (.vcf) — phone contacts, Google / Outlook / iPhone exports
// ---------------------------------------------------------------------
const COMPANY_HEAD = ["Company", "Contact person", "Designation", "Phone", "Alternate phone", "Email", "Website", "Address", "City", "State", "Pincode", "GSTIN", "PAN", "Status", "Tags", "Notes"];

function qpDecode(s, charset) {
  const bytes = []; s = s.replace(/=\r?\n/g, "");
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "=" && /^[0-9A-F]{2}$/i.test(s.substr(i + 1, 2))) { bytes.push(parseInt(s.substr(i + 1, 2), 16)); i += 2; }
    else { const b = new TextEncoder().encode(s[i]); bytes.push(...b); }
  }
  try { return new TextDecoder(charset || "utf-8").decode(new Uint8Array(bytes)); } catch { return new TextDecoder().decode(new Uint8Array(bytes)); }
}
const vUnesc = (s) => s.replace(/\\n/gi, " ").replace(/\\([,;:\\])/g, "$1");
const vSplit = (s) => { const out = []; let cur = ""; for (let i = 0; i < s.length; i++) { if (s[i] === "\\" && i + 1 < s.length) { cur += s[i] + s[i + 1]; i++; } else if (s[i] === ";") { out.push(cur); cur = ""; } else cur += s[i]; } out.push(cur); return out.map((x) => clean(vUnesc(x))); };

export function readVcf(text) {
  // join folded lines (a line starting with a space/tab continues the previous one)
  // and quoted-printable soft breaks (a line ending in "=")
  const lines = []; const raw = text.split(/\r\n|\r|\n/);
  for (let i = 0; i < raw.length; i++) {
    let l = raw[i];
    if (/^[ \t]/.test(l) && lines.length) { lines[lines.length - 1] += l.slice(1); continue; }
    while (/ENCODING=QUOTED-PRINTABLE/i.test(l.split(":")[0]) && /=$/.test(l) && i + 1 < raw.length) l = l.slice(0, -1) + raw[++i];
    lines.push(l);
  }
  const cards = []; let c = null;
  for (const l of lines) {
    if (/^BEGIN:VCARD/i.test(l)) { c = { tel: [], email: [], adr: null, url: "", note: [] }; continue; }
    if (/^END:VCARD/i.test(l)) { if (c) cards.push(c); c = null; continue; }
    if (!c) continue;
    const k = l.indexOf(":"); if (k < 0) continue;
    const head = l.slice(0, k), params = head.split(";"), prop = params[0].replace(/^.*\./, "").toUpperCase();
    let v = l.slice(k + 1);
    if (params.some((p) => /^ENCODING=QUOTED-PRINTABLE$|^QUOTED-PRINTABLE$/i.test(p))) v = qpDecode(v, (params.find((p) => /^CHARSET=/i.test(p)) || "").split("=")[1]);
    else if (params.some((p) => /^ENCODING=(B|BASE64)$/i.test(p))) continue;   // photos etc.
    const types = params.slice(1).join(";").toUpperCase();
    if (prop === "FN") c.fn = clean(vUnesc(v));
    else if (prop === "N") { const [last, first, mid, pre] = vSplit(v); c.n = clean([pre, first, mid, last].filter(Boolean).join(" ")); }
    else if (prop === "ORG") c.org = vSplit(v).filter(Boolean).join(", ");
    else if (prop === "TITLE" || prop === "ROLE") c.title ||= clean(vUnesc(v));
    else if (prop === "TEL") { const t = clean(v.replace(/^tel:/i, "")); if (t) c.tel[/CELL|MOBILE|IPHONE|PREF/.test(types) ? "unshift" : "push"](t); }
    else if (prop === "EMAIL") { const e = clean(v.replace(/^mailto:/i, "")); if (e) c.email.push(e); }
    else if (prop === "ADR" && !c.adr) { const [po, ext, street, city, region, pin, country] = vSplit(v); c.adr = { street: [po, ext, street].filter(Boolean).join(", "), city, region, pin, country }; }
    else if (prop === "URL") c.url ||= clean(vUnesc(v));
    else if (prop === "NOTE") c.note.push(clean(vUnesc(v)));
    else if (prop === "CATEGORIES") c.cat = vSplit(v.replace(/,/g, ";")).filter(Boolean).join(", ");
  }
  if (!cards.length) throw new Error(L("Is .vcf mein koi contact nahi mila", "No contacts found in this .vcf"));
  const rows = cards.filter((x) => x.org || x.fn || x.n || x.tel.length || x.email.length).map((x) => {
    const name = x.fn || x.n || "";
    const tels = [...new Set(x.tel.map((t) => t.replace(/[^\d+]/g, "")))].filter(Boolean);
    return [x.org || name || x.email[0] || tels[0] || "", name, x.title || "", tels[0] || "", tels.slice(1).join(", "), x.email[0] || "", x.url,
      x.adr?.street || "", x.adr?.city || "", x.adr?.region || "", x.adr?.pin || "", "", "", "", ["vcard", x.cat].filter(Boolean).join(", "),
      [x.org ? "" : L("Phone contact (company naam nahi tha)", "Phone contact (no company name)"), x.email.slice(1).join(", "), ...x.note].filter(Boolean).join(" · ").slice(0, 900)];
  });
  return [{ name: L("Contacts", "Contacts"), rows: [COMPANY_HEAD, ...rows] }];
}

// ---------------------------------------------------------------------
//  Tally masters export (Gateway of Tally → Export → Masters → XML)
// ---------------------------------------------------------------------
export function readTally(text) {
  // Tally writes control characters (&#4; etc.) that are not legal XML
  text = text.replace(/&#(x0*[0-8bcefBCEF]|x0*1[0-9a-fA-F]|0*(?:[0-8]|1[124-9]|2\d|3[01]));/g, "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error(L("Tally XML file kharab hai — Tally se dobara export karo", "The Tally XML file is damaged — export it from Tally again"));
  const kids = (el, n) => [...el.children].filter((x) => x.tagName.toUpperCase() === n);
  const first = (el, ...names) => { for (const n of names) { const x = el.getElementsByTagName(n)[0]; const v = clean(x?.textContent); if (v) return v; } return ""; };
  const nameOf = (el) => clean(el.getAttribute("NAME")) || clean(kids(el, "NAME")[0]?.textContent) || first(el, "NAME");
  // group tree, so ledgers in sub-groups of Sundry Debtors are found too
  const parent = {};
  for (const g of [...doc.getElementsByTagName("GROUP")]) { const n = nameOf(g); if (n) parent[n.toLowerCase()] = clean(kids(g, "PARENT")[0]?.textContent).toLowerCase(); }
  const rootOf = (p) => { const seen = new Set(); while (p && parent[p] && !seen.has(p)) { if (/sundry (debtors|creditors)/.test(p)) return p; seen.add(p); p = parent[p]; } return p; };
  const rows = [];
  for (const led of [...doc.getElementsByTagName("LEDGER")]) {
    const name = nameOf(led); if (!name) continue;
    const grp = clean(kids(led, "PARENT")[0]?.textContent || first(led, "PARENT")), root = rootOf(grp.toLowerCase());
    const debtor = /debtor|customer|client/.test(root) || /debtor|customer|client/i.test(grp), creditor = /creditor|supplier|vendor/.test(root) || /creditor|supplier|vendor/i.test(grp);
    const addr = [...new Set([...led.getElementsByTagName("ADDRESS")].map((a) => clean(a.textContent)).filter(Boolean))];
    const gstin = first(led, "PARTYGSTIN", "GSTIN").toUpperCase(), phone = first(led, "LEDGERMOBILE", "MOBILENUMBER"), land = first(led, "LEDGERPHONE", "PHONENUMBER");
    const email = first(led, "EMAIL", "LEDGEREMAIL").split(/[,;\s]+/)[0] || "";
    // only parties: Sundry Debtors / Creditors, or a ledger that has contact details
    if (!debtor && !creditor && !(gstin || phone || land || email || addr.length)) continue;
    const pin = first(led, "PINCODE"), state = first(led, "LEDSTATENAME", "STATENAME", "STATE");
    // Tally has no city field — the last address line usually is the city (unless it's just the pincode)
    const last = addr.length > 1 ? addr[addr.length - 1].replace(/[-–,\s]*\d{6}\s*$/, "").trim() : "";
    const city = last && last.length < 30 && !/\d{3}/.test(last) ? last : "";
    rows.push([first(led, "MAILINGNAME") || name, first(led, "LEDGERCONTACT", "CONTACTPERSON"), "", phone || land, phone && land ? land : "", email, first(led, "WEBSITE"),
      (city ? addr.slice(0, -1) : addr).join(", "), city, state, pin, gstin, first(led, "INCOMETAXNUMBER", "PANNUMBER").toUpperCase(),
      debtor ? "Customer" : "", ["tally", debtor ? "customer" : creditor ? "vendor" : ""].filter(Boolean).join(", "),
      [L("Tally group: ", "Tally group: ") + (grp || "—"), first(led, "NARRATION", "DESCRIPTION")].filter(Boolean).join(" · ")]);
  }
  if (!rows.length) throw new Error(L("Is Tally file mein party ledgers nahi mile. Tally mein: Export → Masters → Ledgers (XML) chuno.", "No party ledgers found in this Tally file. In Tally choose: Export → Masters → Ledgers (XML)."));
  return [{ name: "Tally ledgers", rows: [COMPANY_HEAD, ...rows] }];
}
