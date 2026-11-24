// =====================================================================
//  ERP product list + vendor list → the CRM (Products page → "⬆️ ERP list")
//   Drop the ERP's "Products" and / or "Vendor list" Excel. Each file is recognised by its columns.
//   Products: customer AMC / asset codes ("KNS_A/GIPL-AMC01", "TDS PC 01", "PROJECTS01") are left out,
//   every product gets a clean category + brand from its NAME (ERP categories are often wrong),
//   duplicates and products already in the CRM are skipped → preview → import → Undo.
//   Vendors: a vendor already in the CRM only gets its empty details filled (code, area, pincode,
//   landline, GST, PAN …); new ones are added; "vendors" that are only a number are removed.
// =====================================================================
import { sb, h, toast, toastAction, fail, modal, closeModal, busy, isMgr } from "./core.js";
import { L } from "./i18n.js";
import { readTableFile, headerRow } from "./import.js";
import { loadProducts } from "./biz.js";

const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const s = (v) => { const x = String(v ?? "").replace(/\s+/g, " ").trim(); return /^(na|n\/a|none|null|-)$/i.test(x) ? "" : x; };
const key = (x) => String(x || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const n0 = (n) => Number(n || 0).toLocaleString("en-IN");

// ---------------------------------------------------------------- products: rules
const CUSTOMER = /gipl|^tds (pc|lp) ?\d|^projects\d|^la-|^lspl|amc0\d|^tds\/|^geninfo\d|^gen-lap/i;   // customer AMC / asset codes, not products
const JUNK = ["buy back", "tds declaration", "sales person / sales manager-wise outstanding", "auto payment reminder plan", "conference"];
const HW = ["hp", "dell", "lenovo", "acer", "asus", "canon", "epson", "brother", "samsung", "lg", "cisco", "aruba", "kyocera", "ricoh", "richo", "apple", "toshiba",
  "sony", "intel", "amd", "nvidia", "jabra", "seagate", "wd", "gateway", "logitech", "tp-link", "d-link", "netgear", "sophos", "fortinet", "fortigate", "sonicwall",
  "gajshield", "seqrite", "quick heal", "bitdefender", "trend micro", "veritas", "acronis", "thecus", "omen", "olio", "microsoft", "xerox", "foxit", "zebra", "tvs"];
const HW_NAME = { richo: "Ricoh", fortigate: "Fortinet", omen: "HP", hp: "HP", lg: "LG", amd: "AMD", wd: "WD", "tp-link": "TP-Link", "d-link": "D-Link" };
const esc = (b) => b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const title = (b) => HW_NAME[b] || (b.length > 3 ? b.replace(/\b\w/g, (c) => c.toUpperCase()) : b.toUpperCase());
function hwBrand(name) {
  const n = name.toLowerCase(), first = n.split(" ")[0] || "";
  for (const b of HW) if (new RegExp(`^${esc(b)}\\b`).test(n) || new RegExp(`\\b${esc(b)}\\b`).test(first)) return title(b);
  for (const b of HW) if (new RegExp(`\\b${esc(b)}\\b`).test(n)) return title(b);
  return "";
}
// [category, brand] for a piece of text (lower case); first match wins
const RULES = [
  [/\btraining\b|handholding|consulting & technical/, "Training", ""],
  [/annual maintenance|\bamc\b|\bfms\b|resident(ial)? engineer|annual service contract/, "AMC & facility management", "Genesis"],
  [/installation charges|implementation charges|support charges|visit charges|repair|troubleshoot|crimping charges|punching charges|data recovery|rack dressing|resource augmentation|\bservices?\b$|customi[sz]ation service|ats - /, "Professional services", "Genesis"],
  [/carepack|care pack|support pack|warranty extension/, "Warranty & support packs", ""],
  [/foxit/, "Other software", "Foxit"],
  [/power cable|adapter cable|adaptor/, "Parts & peripherals", ""],
  [/v\s*-?\s*ray|\bcorona\b|\bchaos\b|enscape|phoenix|morphis|archviz/, "Rendering & visualisation", "Chaos"],
  [/lumion/, "Rendering & visualisation", "Lumion"],
  [/\bd5\b/, "Rendering & visualisation", "D5 Render"],
  [/twinmotion/, "Rendering & visualisation", "Epic Games"],
  [/keyshot|key shot/, "Rendering & visualisation", "KeyShot"],
  [/maxon|cinema 4d|red giant|zbrush/, "Rendering & visualisation", "Maxon"],
  [/itoo|forest pack|railclone/, "Rendering & visualisation", "iToo"],
  [/autodesk|autocad|\brevit\b|civil 3d|3ds ?max|\bmaya\b|navisworks|inventor|\bfusion\b|bim collaborate|\bforma\b|\bvred\b|mudbox|motionbuilder|\barnold\b|infraworks|recap|\bflame\b|collection|construction cloud|\bbuild - |advance steel|robot structural|powermill|power-mill/, "Design software", "Autodesk"],
  [/sketch ?up|trimble|\btekla\b|skelion/, "Design software", "Trimble"],
  [/bluebeam|nemetschek|vectorworks/, "Design software", "Nemetschek"],
  [/\brhino\b/, "Design software", "McNeel Rhino"],
  [/bentley|staad|stadd/, "Design software", "Bentley"],
  [/gstarcad|bricscad|cadmate|global mapper|pvsyst|fuzor|construction pro/, "Design software", ""],
  [/primavera|\boracle\b/, "Design software", "Oracle"],
  [/adobe|photoshop|illustrator|indesign|premier|acrobat|creative cloud|substance|xd for teams|generative credits/, "Creative software", "Adobe"],
  [/corel/, "Creative software", "Corel"],
  [/freepik|promeai|imagine art/, "Creative software", ""],
  [/surface|microsoft hardware/, "Desktops, laptops & servers", "Microsoft"],
  [/microsoft|\bms\b|power bi|office ?365|\bo365\b|\bm365\b|windows|azure|exchange online|\bexcel\b|visio|project plan|planner plan|copilot|sql server|entra|access ltsc|virtual machine|storage account/, "Microsoft & productivity", "Microsoft"],
  [/g ?suite|google workspace|business starter/, "Microsoft & productivity", "Google"],
  [/kofax|power ?pdf|nitro|team ?viewer|parallels|zoom|chatgpt|grammarly|tally/, "Other software", ""],
  [/antivirus|seqrite|quick heal|internet security|bitdefender|trend micro|firewall|sonicwall|gajshield|fortigate|sophos|\butm\b|endpoint/, "IT security", ""],
  [/acronis|veritas|backup|\bnas\b|\bsan\b|thecus|storage device|storge device|cloud storage|sharefile|aws storage/, "Storage & backup", ""],
  [/domain|webhosting|\bdns\b|\bssl\b|cloudmail|email|cloud support|baston host|bastion/, "Cloud, email & domains", ""],
  [/conference camera|web camera/, "Displays & AV", ""],
  [/switch|router|access point|wi-?fi|patch|\bcable|connector|convert|lan tester|crimping tool|\bpoe\b|load balancer|internet connectivity|networking|\bi\/o\b|face plate|railkit|rack\.?$|mounting kit/, "Networking", ""],
  [/camera|\bdvr\b|\bnvr\b|surveillance|biometric/, "CCTV & security systems", ""],
  [/printer|plotter|scanner|toner|cartridge|kyocera|pickup assembly|separation pad|card reader/, "Printers & scanners", ""],
  [/desktop|laptop|workstation|server|all in one|\bnuc\b|thin client|imac|\bipad\b|tablet|macbook|gwtn|lumion system/, "Desktops, laptops & servers", ""],
  [/monitor|display|projector|flat panel|portable screen|\btv\b|speaker|jabra|headphone|head set|remote/, "Displays & AV", ""],
  [/\bram\b|ddr\d|graphic|\bgpu\b|processor|ryzen|smps|power supply|cpu cooler|keyboard|mouse|adapt|\bups\b|battery|spike guard|dvd|bag ?pack|accessor|trolley|apple pencil|pen ?drive|hard disk|\bssd\b|usb|peripheral|tools?\b/, "Parts & peripherals", ""],
];
const rule = (t) => { for (const [re, c, b] of RULES) if (re.test(t)) return [c, b]; return ["Other", ""]; };
const SOFT = new Set(["Design software", "Rendering & visualisation", "Creative software", "Microsoft & productivity", "Other software"]);
const UNIT = { number: "Nos", months: "Month", year: "Year", "per page": "Per page" };

const PCOL = { id: /product id|^id$/i, name: /model name|product name|item name|^name$/i, oem: /oem/i, desc: /description/i, status: /^status$/i,
  category: /^category$|^category name$/i, brand: /^brand$/i, unit: /^unit$/i, sku: /sku|stock keeping/i };
const VCOL = { code: /^vendor code$/i, first: /first name/i, middle: /middle name/i, last: /last name/i, company: /company name/i, display: /display name/i,
  email: /^e-?mail$/i, wemail: /work e-?mail/i, mobile: /^mobile/i, landline: /landline/i, addr: /address line 1|^address$/i, pin: /pin ?code/i,
  area: /^city$/i, district: /district/i, state: /^state$/i, gst: /gst/i, pan: /pan/i, kind: /type of company/i };
const colsOf = (hd, spec) => Object.fromEntries(Object.entries(spec).map(([k, re]) => [k, hd.findIndex((c) => re.test(String(c || "").trim()))]).filter(([, i]) => i >= 0));
const kindOf = (hd) => { const p = colsOf(hd, PCOL), v = colsOf(hd, VCOL); return p.name != null && p.category != null ? "products" : v.company != null && (v.code != null || v.mobile != null) ? "vendors" : null; };

export function cleanProducts(rows, hd, existing) {
  const c = colsOf(hd, PCOL), g = (r, k) => (c[k] == null ? "" : s(r[c[k]]));
  const have = new Set((existing || []).map((p) => key(p.name))), haveErp = new Set((existing || []).map((p) => p.erp_id).filter(Boolean));
  const seen = new Set(), out = [], skip = { customer: [], junk: 0, dup: 0, have: 0 };
  for (const r of rows) {
    const name = g(r, "name"); if (!name) continue;
    if (CUSTOMER.test(name)) { skip.customer.push(name); continue; }
    if (JUNK.some((j) => name.toLowerCase().startsWith(j))) { skip.junk++; continue; }
    const k = key(name); if (seen.has(k)) { skip.dup++; continue; } seen.add(k);
    const erp = /^\d+$/.test(g(r, "id")) ? +g(r, "id") : null;
    if (have.has(k) || (erp && haveErp.has(erp))) { skip.have++; continue; }
    const cat0 = g(r, "category"), brand0 = g(r, "brand");
    let [cat, brand] = rule(name.toLowerCase());                              // the name decides first (ERP categories are often wrong)
    if (cat === "Other") [cat, brand] = rule(`${name} | ${cat0} | ${brand0}`.toLowerCase());
    if (!brand) brand = hwBrand(name);
    const oem = g(r, "oem"), desc = g(r, "desc"), sku = g(r, "sku");
    out.push({ erp_id: erp, brand: brand || null, name: name.slice(0, 300), model: oem && oem.toLowerCase() !== name.toLowerCase() ? oem.slice(0, 200) : null,
      category: cat, unit: UNIT[g(r, "unit").toLowerCase()] || "Nos", hsn: SOFT.has(cat) ? "997331" : cat === "Desktops, laptops & servers" ? "8471" : null,
      gst_rate: 18, active: g(r, "status").toLowerCase() !== "inactive", sku: sku && !/annual maintenance/i.test(sku) ? sku.slice(0, 80) : null,
      notes: desc && ![name, oem].some((x) => x && x.toLowerCase() === desc.toLowerCase()) ? desc.slice(0, 1000) : null, erp_category: cat0.slice(0, 120) || null });
  }
  return { rows: out, skip };
}

const phone = (v) => {
  const d = s(v).replace(/\D/g, "");
  if (d.length === 10 && /^[6-9]/.test(d)) return "+91 " + d;
  if (d.length === 12 && d.startsWith("91")) return "+91 " + d.slice(2);
  if (d.length === 8) return `+91 22 ${d.slice(0, 4)} ${d.slice(4)}`;
  return s(v) || null;
};
export function cleanVendors(rows, hd, existing) {
  const c = colsOf(hd, VCOL), g = (r, k) => (c[k] == null ? "" : s(r[c[k]]));
  const byName = new Map((existing || []).map((v) => [key(v.name), v])), byMail = new Map((existing || []).filter((v) => v.email).map((v) => [v.email.toLowerCase(), v]));
  const byCode = new Map((existing || []).filter((v) => v.code).map((v) => [v.code, v]));
  const out = []; let match = 0, fresh = 0;
  for (const r of rows) {
    const name = g(r, "company") || g(r, "display"); if (!/[a-z]/i.test(name)) continue;
    const gst = g(r, "gst").toUpperCase(), pan = g(r, "pan").toUpperCase(), email = (g(r, "email") || g(r, "wemail")).toLowerCase();
    const v = { code: g(r, "code") || null, name: name.slice(0, 120), contact: [g(r, "first"), g(r, "middle"), g(r, "last")].filter(Boolean).join(" ").slice(0, 120) || null,
      email: email.slice(0, 200) || null, mobile: phone(r[c.mobile]), landline: phone(r[c.landline]), address: g(r, "addr").slice(0, 500) || null,
      pincode: g(r, "pin") || null, area: g(r, "area") || null, city: g(r, "district") || null, state: g(r, "state") || null,
      gstin: /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/.test(gst) ? gst : null, pan: /^[A-Z]{5}\d{4}[A-Z]$/.test(pan) ? pan : null, kind: g(r, "kind") || null };
    if ((v.code && byCode.has(v.code)) || byName.has(key(v.name)) || (v.email && byMail.has(v.email))) match++; else fresh++;
    out.push(v);
  }
  const junk = (existing || []).filter((v) => !/[a-z]/i.test(v.name || "")).length;
  return { rows: out, match, fresh, junk };
}

// ---------------------------------------------------------------- the window
export async function openCatalogImport(done) {
  if (!isMgr()) return toast(L("Sirf Admin / Manager", "Admin / Manager only"), true);
  let P = null, V = null;   // { file, data, ... }
  const m = modal({
    title: L("⬆️ ERP ki product / vendor list", "⬆️ ERP product / vendor list"), wide: true,
    body: `<p class="mu" style="margin-top:0">${L("ERP se nikali <b>Products</b> aur / ya <b>Vendor list</b> Excel yahan daalo — dono ek saath bhi. CRM khud pehchanega kaunsi file kya hai, saaf karega, aur import se pehle dikhayega.",
      "Drop the <b>Products</b> and / or <b>Vendor list</b> Excel exported from the ERP — both at once is fine. The CRM recognises each file, cleans it and shows you everything before importing.")}</p>
      <label class="dropzone" id="ciDrop"><input type="file" id="ciF" accept=".xlsx,.xls,.csv" multiple hidden>📂 <b>${L("File chuno ya yahan chhodo", "Choose files or drop them here")}</b><span class="mu" style="font-size:12.5px">Products.xlsx · vender_list_data.xlsx</span></label>
      <div id="ciOut" aria-live="polite"></div>`,
    foot: `<button class="btn" data-close>${L("Band karo", "Close")}</button><span class="sp" style="flex:1"></span><button class="btn primary" id="ciGo" disabled>${L("Import karo", "Import")}</button>`,
  });
  const out = $("#ciOut", m), go = $("#ciGo", m);
  const draw = () => {
    const parts = [];
    if (P) {
      const by = {}; P.rows.forEach((p) => { by[p.category] = (by[p.category] || 0) + 1; });
      const cats = Object.entries(by).sort((a, b) => b[1] - a[1]);
      parts.push(`<div class="card ci-card"><div class="card-h"><h3>📦 ${L("Products", "Products")} <span class="mu" style="font-weight:400" data-raw>· ${h(P.file)}</span></h3></div><div class="card-b">
        <div class="ci-kpis"><div><b>${n0(P.rows.length)}</b><span>${L("naye products judenge", "new products to add")}</span></div>
          <div><b>${n0(P.skip.customer.length)}</b><span>${L("customer AMC / asset codes — chhode", "customer AMC / asset codes — left out")}</span></div>
          <div><b>${n0(P.skip.have)}</b><span>${L("pehle se CRM mein", "already in the CRM")}</span></div>
          <div><b>${n0(P.skip.dup + P.skip.junk)}</b><span>${L("duplicate / product nahi", "duplicate / not a product")}</span></div></div>
        <div class="chips" style="margin:10px 0">${cats.map(([c, n]) => `<span class="chip" style="cursor:default">${h(c)} <b style="margin-left:5px">${n}</b></span>`).join("")}</div>
        <details><summary>${L("Sample dekho", "See a sample")}</summary><div class="tbl-wrap" style="max-height:260px"><table class="tbl"><thead><tr><th>Product</th><th>Brand</th><th>Category</th><th>${L("ERP category", "ERP category")}</th></tr></thead><tbody>
          ${cats.flatMap(([c]) => P.rows.filter((p) => p.category === c).slice(0, 3)).map((p) => `<tr style="cursor:default"><td data-raw>${h(p.name.slice(0, 80))}</td><td>${h(p.brand || "—")}</td><td>${h(p.category)}</td><td class="sub" data-raw>${h(p.erp_category || "")}</td></tr>`).join("")}</tbody></table></div></details>
        ${P.skip.customer.length ? `<details><summary>${L("Chhode gaye customer codes", "Customer codes left out")} (${n0(P.skip.customer.length)})</summary><p class="sub" data-raw style="max-height:120px;overflow:auto">${h(P.skip.customer.slice(0, 400).join(" · "))}</p></details>` : ""}
        <p class="mu" style="font-size:12.5px;margin:8px 0 0">💡 ${L("Price ERP list mein nahi hai — har product ka pichhli quotations wala rate (kitni baar quote hua, last price) apne aap judega. Software ka HSN 997331, computers ka 8471; baaki HSN pehli quotation pe bhar lena.",
          "The ERP list has no prices — each product gets its quotation history (how often quoted, last price) automatically. HSN 997331 for software, 8471 for computers; fill the rest on the first quotation.")}</p></div></div>`);
    }
    if (V) parts.push(`<div class="card ci-card"><div class="card-h"><h3>🏭 ${L("Vendors", "Vendors")} <span class="mu" style="font-weight:400" data-raw>· ${h(V.file)}</span></h3></div><div class="card-b">
        <div class="ci-kpis"><div><b>${n0(V.rows.length)}</b><span>${L("vendors file mein", "vendors in the file")}</span></div>
          <div><b>${n0(V.match)}</b><span>${L("pehle se hain — khaali details bharenge", "already here — empty details get filled")}</span></div>
          <div><b>${n0(V.fresh)}</b><span>${L("naye judenge", "new ones added")}</span></div>
          <div><b>${n0(V.junk)}</b><span>${L("sirf number wale galat vendor hatenge", "number-only junk vendors removed")}</span></div></div>
        <p class="mu" style="font-size:12.5px;margin:8px 0 0">${L("Code, contact, mobile, landline, pura address, pincode, area, GST, PAN — jo CRM mein khaali hai sirf wahi bharega, kuch overwrite nahi hoga.", "Code, contact, mobile, landline, address, pincode, area, GST, PAN — only what is empty in the CRM gets filled, nothing is overwritten.")}</p></div></div>`);
    out.innerHTML = parts.join("");
    go.disabled = !(P?.rows.length || V?.rows.length);
  };
  const take = async (files) => {
    for (const f of files) {
      let sheets;
      try { sheets = await readTableFile(f); } catch (e) { toast(f.name + ": " + (e.message || e), true); continue; }
      let used = false;
      for (const sh of sheets) {
        const hi = headerRow(sh.rows), hd = (sh.rows[hi] || []).map((x) => String(x || "").trim()), data = sh.rows.slice(hi + 1), kind = kindOf(hd);
        if (kind === "products") { const ex = await loadProducts(true); P = { file: f.name, ...cleanProducts(data, hd, ex) }; used = true; break; }
        if (kind === "vendors") { const { data: ex } = await sb.from("vendors").select("id, name, code, email").limit(5000); V = { file: f.name, ...cleanVendors(data, hd, ex || []) }; used = true; break; }
      }
      if (!used) toast(L(`${f.name}: ye product ya vendor list nahi lagti`, `${f.name}: doesn't look like a product or vendor list`), true);
    }
    draw();
  };
  const inp = $("#ciF", m), drop = $("#ciDrop", m);
  inp.onchange = () => busy(drop, () => take([...inp.files]));
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); busy(drop, () => take([...e.dataTransfer.files])); });
  go.onclick = (e) => busy(e.target, async () => {
    const msgs = [], batches = [];
    if (P?.rows.length) {
      const { data, error } = await sb.rpc("catalog_import", { p_rows: P.rows, p_file: P.file, p_skipped: { customer_codes: P.skip.customer.length, duplicates: P.skip.dup, not_products: P.skip.junk } });
      if (error) return fail(error);
      batches.push(data.batch);
      msgs.push(L(`✔ ${n0(data.products)} products jude (${n0(data.quoted)} ka quotation history mila)`, `✔ ${n0(data.products)} products added (${n0(data.quoted)} with quotation history)`));
    }
    if (V?.rows.length) {
      const { data, error } = await sb.rpc("vendors_import", { p_rows: V.rows, p_file: V.file });
      if (error) return fail(error);
      batches.push(data.batch);
      msgs.push(L(`✔ Vendors: ${data.filled} ki details bhari, ${data.new} naye, ${data.junk_removed} galat hataye`, `✔ Vendors: ${data.filled} filled in, ${data.new} new, ${data.junk_removed} junk removed`));
    }
    closeModal();
    toastAction(msgs.join(" · "), "Undo", async () => {
      for (const b of batches) { const { error } = await sb.rpc("undo_import", { p_batch: b }); if (error) return fail(error); }
      toast(L("↩ Import wapas le liya", "↩ Import undone")); await loadProducts(true); done?.();
    }, 15000);
    await loadProducts(true); done?.();
  });
}
