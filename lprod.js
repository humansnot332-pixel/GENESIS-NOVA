// =====================================================================
//  Lead products → messages
//   • productPicker: pick a lead's products from the catalogue (search + groups), or type a new one
//   • productMessage: an email / WhatsApp built from the chosen products and their one-line pitch
//   • templateFit: how well a saved template's product tags match the lead's products
// =====================================================================
import { sb, h } from "./core.js";
import { L } from "./i18n.js";
import { PRODUCTS as FAMILIES } from "./data.js";
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];

let CAT = [], catAt = 0;
export async function loadCatalog(force = false) {
  if (!force && CAT.length && Date.now() - catAt < 5 * 60e3) return CAT;
  // our own short list only — the 1,000+ items of an imported ERP list stay on the price list / quotations, not in the lead picker
  const { data } = await sb.from("products").select("id, brand, name, model, category, pitch, pitch_hi, sell_price, gst_rate, hsn, unit").eq("active", true).is("import_batch", null).order("category").order("name");
  CAT = data || []; catAt = Date.now();
  return CAT;
}
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const sing = (s) => norm(s).replace(/(\w{3,})s\b/g, "$1");          // "Laptops" ~ "Laptop"
// the broad interests most leads carry (data.js families) — one line each, English + Hinglish
const FAMILY = {
  "Autodesk": ["genuine AutoCAD, Revit, 3ds Max and AEC Collection subscriptions with quick activation and renewal reminders", "genuine AutoCAD, Revit, 3ds Max, AEC Collection subscription — turant activation aur renewal reminder"],
  "Adobe": ["genuine Adobe Creative Cloud and Acrobat licences with easy user management", "genuine Adobe Creative Cloud aur Acrobat licence — aasaan user management"],
  "Trimble": ["SketchUp and Tekla licences for design and construction teams", "design aur construction teams ke liye SketchUp aur Tekla licence"],
  "Microsoft": ["Microsoft 365, Windows and server licensing with setup and migration support", "Microsoft 365, Windows aur server licensing — setup aur migration hum karte hain"],
  "Chaos (V-Ray)": ["V-Ray and Enscape for photo-real renders and walkthroughs", "photo-real renders aur walkthrough ke liye V-Ray aur Enscape"],
  "Lumion": ["beautiful architectural renders and videos in minutes", "minuton mein sundar architectural renders aur videos"],
  "D5 Render": ["fast real-time rendering and animation for architects", "architects ke liye fast real-time rendering aur animation"],
  "Antivirus / Endpoint": ["business antivirus and endpoint security with central control", "business antivirus aur endpoint security — ek jagah se control"],
  "Laptops": ["business and design laptops from Dell, HP and Lenovo at the best price, with warranty support", "Dell, HP, Lenovo ke business aur design laptops — best price, warranty support ke saath"],
  "Desktops & Workstations": ["office desktops and high-end workstations configured for AutoCAD, Revit and rendering", "office desktops aur AutoCAD / Revit / rendering ke liye high-end workstations"],
  "Servers": ["tower and rack servers for file, ERP and data, installed by our engineers", "file, ERP aur data ke liye tower / rack servers — installation hamare engineers"],
  "Storage & Backup": ["NAS storage and automatic backup so your files are always safe", "NAS storage aur automatic backup — files hamesha safe"],
  "Printers & Plotters": ["office printers, scanners and large-format plotters with service", "office printer, scanner aur large-format plotter — service ke saath"],
  "Monitors & Peripherals": ["monitors, keyboards, docking stations and graphic tablets", "monitor, keyboard, docking station aur graphic tablet"],
  "Networking": ["managed switches, Wi-Fi and cabling for a fast, reliable office network", "fast aur reliable office network — managed switch, Wi-Fi aur cabling"],
  "Firewall (appliance)": ["Fortinet, Sophos and SonicWall firewalls for safe office internet", "safe office internet ke liye Fortinet, Sophos, SonicWall firewall"],
  "CCTV & Surveillance": ["HD cameras with mobile viewing, NVR and biometric attendance, installed by our team", "mobile pe dikhne wale HD cameras, NVR aur biometric attendance — installation hamari team"],
  "UPS & Power": ["online / offline UPS and batteries that keep your systems running", "online / offline UPS aur battery — systems kabhi band nahi"],
  "Projectors & Displays": ["projectors, interactive displays and meeting-room screens", "projector, interactive display aur meeting room screens"],
  "Processors (CPU)": ["Intel and AMD processors for upgrades and new builds", "upgrade aur naye PC ke liye Intel / AMD processors"],
  "Motherboards": ["Intel and AMD motherboards from ASUS, Gigabyte and MSI", "ASUS, Gigabyte, MSI ke Intel / AMD motherboards"],
  "RAM / Memory": ["DDR4 / DDR5 memory upgrades for faster desktops, laptops and workstations", "DDR4 / DDR5 RAM upgrade — desktops, laptops, workstations fast"],
  "SSD & HDD (internal)": ["NVMe / SATA SSDs and hard disks from Samsung, WD and Seagate", "Samsung, WD, Seagate ke NVMe / SATA SSD aur hard disk"],
  "Graphics Cards (GPU)": ["NVIDIA RTX and AMD graphics cards for V-Ray, Lumion and design work", "V-Ray, Lumion aur design ke liye NVIDIA RTX / AMD graphics cards"],
  "Power Supply (SMPS)": ["branded power supplies from Corsair, Cooler Master and Antec", "Corsair, Cooler Master, Antec ke branded SMPS"],
  "Cabinets & Cooling": ["PC cabinets, CPU coolers and fans", "PC cabinet, CPU cooler aur fans"],
  "Cables & Accessories": ["HDMI, DisplayPort, LAN and power cables and converters", "HDMI, DisplayPort, LAN, power cables aur converters"],
  "Laptop Spares": ["laptop batteries, adapters, keyboards and screens", "laptop battery, adapter, keyboard aur screen"],
  "BIM Services": ["BIM modelling and coordination by our team", "hamari team se BIM modelling aur coordination"],
  "Training & Consultancy": ["software training and consultancy for your team", "team ke liye software training aur consultancy"],
  "AMC & IT Support": ["one fixed yearly cost for all your IT upkeep, with quick on-site support", "saal ka ek fixed kharcha — saara IT maintenance aur jaldi on-site support"],
  "Facility Management (FMS)": ["a dedicated on-site engineer for your office IT", "office IT ke liye dedicated on-site engineer"],
  "IT Security & Audit": ["network access control, email security and security audits", "network access control, email security aur security audit"],
  "Server Room & Board Room": ["server room and board room design and setup", "server room aur board room design aur setup"],
  "Email Server & Microsoft 365 Migration": ["professional email and smooth Microsoft 365 migration", "professional email aur Microsoft 365 migration bina tension"],
  "Thin Clients": ["low-cost desktops that run from a central server", "central server se chalne wale low-cost desktops"],
  "Laptop Repair": ["quick laptop repairs for all brands with genuine parts", "sab brands ke laptops ki jaldi repair, genuine parts ke saath"],
  "Audio Video Conferencing": ["Zoom / Teams meeting rooms with cameras and speakers", "Zoom / Teams meeting rooms — camera aur speakers ke saath"],
  "Data Recovery": ["data recovery from failed hard disks, SSDs and RAID", "kharab hard disk, SSD, RAID se data recovery"],
};
// short tags that mean one catalogue product
const ALIAS = { "microsoft 365": "Microsoft 365 Business Standard", "office 365": "Microsoft 365 Business Standard", "m365": "Microsoft 365 Business Standard", "sketchup": "SketchUp Pro", "v ray": "V-Ray Premium", "vray": "V-Ray Premium", "d5": "D5 Render Pro", "antivirus": "Endpoint security / antivirus", "cctv": "CCTV / IP camera installation", "firewall": "Firewall (UTM) supply & setup", "amc": "Annual Maintenance Contract (AMC)" };
const famOf = (tag) => { const t = sing(tag); if (!t) return null; return Object.keys(FAMILY).find((f) => sing(f) === t) || Object.keys(FAMILY).find((f) => sing(f).startsWith(t + " ")) || null; };
/** the catalogue product a lead's tag means ("SketchUp" → SketchUp Pro, "Autodesk AutoCAD LT" → AutoCAD LT) */
export function findCatalog(tag) {
  const t = norm(tag); if (!t) return null;
  const al = ALIAS[t] && norm(ALIAS[t]);
  return CAT.find((p) => norm(p.name) === t) || CAT.find((p) => norm(`${p.brand} ${p.name}`) === t) || (al && CAT.find((p) => norm(p.name) === al))
    || (famOf(tag) ? null : CAT.find((p) => t.length > 2 && norm(p.name).startsWith(t + " "))) || null;
}
/** the line a lead's product gets in the message */
export function pitchOf(tag, hinglish) {
  const c = findCatalog(tag);
  if (c) return { name: c.name, pitch: (hinglish ? c.pitch_hi : c.pitch) || "" };
  const f = famOf(tag);
  if (f) return { name: String(tag), pitch: FAMILY[f][hinglish ? 1 : 0] };
  return { name: String(tag), pitch: "" };
}
const catOf = (tag) => findCatalog(tag)?.category || "";

/** template product tags vs the lead's products → 0 (no match) … higher = better */
export function templateFit(t, products) {
  const tags = (t.products || []).map(norm).filter(Boolean); if (!tags.length || !products?.length) return 0;
  let s = 0;
  for (const p of products) {
    const np = norm(p), c = norm(catOf(p)), cp = norm(findCatalog(p)?.name);
    if (tags.includes(np) || (cp && tags.includes(cp))) s += 3;        // the product itself
    else if (c && tags.includes(c)) s += 1;                            // its category
  }
  return s;
}

// ---------------------------------------------------------------------
//  The message built from the products (subject + body, with {{variables}})
// ---------------------------------------------------------------------
const GENERIC = { en: "genuine product with setup and support from our engineers", hi: "genuine product — setup aur support hamare engineers ka" };
const andList = (a, last) => a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + ` ${last} ` + a[a.length - 1];
export function productMessage({ channel, hinglish, stage, products }) {
  const items = (products || []).filter(Boolean).slice(0, 6);
  const lines = items.map((p) => { const x = pitchOf(p, hinglish); return { name: x.name, pitch: x.pitch || (hinglish ? GENERIC.hi : GENERIC.en) }; });
  const nm = lines.map((x) => x.name), names = nm.length > 3 ? nm.slice(0, 3).join(", ") + (hinglish ? " aur baaki" : " and more") : andList(nm, hinglish ? "aur" : "and");
  const wa = channel === "whatsapp";
  const bullet = (x) => wa ? `✅ *${x.name}* — ${x.pitch}` : `• **${x.name}** — ${x.pitch}`;
  const st = ["followup", "interested"].includes(stage) ? stage : "new";
  if (wa) {
    const open = hinglish
      ? { new: "Main {{my_name}}, *Genesis Infoserve Pvt. Ltd.* se. {{company|Aapki company}} ke liye:", followup: "Pichhle message ka follow-up — {{company|aapki company}} ke liye:", interested: "Baat karke achha laga, dhanyavaad! Jaisa discuss hua, {{company|aapki company}} ke liye:" }[st]
      : { new: "This is {{my_name}} from *Genesis Infoserve Pvt. Ltd.* For {{company|your team}}:", followup: "Just following up on my earlier message — for {{company|your team}}:", interested: "Thank you for your time on the call! As discussed, for {{company|your team}}:" }[st];
    const ask = hinglish ? "Kitne users / machines chahiye, bata dijiye — best price ka quote turant bhej deta/deti hoon." : "Let me know how many users / machines you need and I'll send the best quote right away.";
    return { subject: "", body: `${hinglish ? "Namaste" : "Hello"} {{contact_name|Sir/Madam}} 🙏\n${open}\n${lines.map(bullet).join("\n")}\n${ask}\n🌐 {{our_website}}\n📞 {{my_phone}}` };
  }
  const subject = hinglish ? `${names} — {{company}} ke liye best price | Genesis Infoserve` : `${names} for {{company|your team}} — best price & quick activation | Genesis Infoserve`;
  const open = hinglish
    ? { new: "**Genesis Infoserve Pvt. Ltd.** (Mumbai) ki taraf se namaskar. {{company|Aapki company}} ke liye hum ye de sakte hain:", followup: "Mere pichhle mail ka chhota sa follow-up. {{company|Aapki company}} ke liye:", interested: "Aaj baat karne ke liye dhanyavaad! Jaisa discuss hua, {{company|aapki company}} ke liye:" }[st]
    : { new: "Greetings from **Genesis Infoserve Pvt. Ltd.**, Mumbai. For {{company|your team}} we can help with:", followup: "A quick follow-up on my earlier mail. For {{company|your team}}:", interested: "Thank you for your time today! As discussed, for {{company|your team}}:" }[st];
  const why = hinglish ? "**Genesis kyun:** genuine licence / products, turant activation, renewal reminders, aur Mumbai mein hamari apni support team."
    : "**Why Genesis:** genuine licences and products, quick activation, renewal reminders, and our own support team in Mumbai.";
  const ask = hinglish ? "Kitne users / machines chahiye, bata dijiye — main turant quotation bhej deta/deti hoon. Ya mujhe {{my_phone}} pe call kar sakte hain."
    : "Could you share how many users / machines you need? I'll send you a quotation right away — or call me on {{my_phone}}.";
  const sign = "Best Regards,\n\n{{my_name}}\n{{my_designation}}\nGENESIS INFOSERVE PVT. LTD.\n{{my_email}}\n{{my_phone}}";
  return { subject, body: `${hinglish ? "Namaste" : "Dear"} {{contact_name|Sir/Madam}},\n\n${open}\n\n${lines.map(bullet).join("\n")}\n\n${why}\n\n${ask}\n\n${sign}` };
}

// ---------------------------------------------------------------------
//  The picker (inline — it can live inside an open window without closing it)
// ---------------------------------------------------------------------
export async function productPicker(box, selected = [], onChange = () => {}, { cats = false } = {}) {
  await loadCatalog().catch(() => {});
  let sel = [...new Set((selected || []).filter(Boolean))], q = "";
  const groups = {};
  // templates can be tagged with a whole category ("Design software") as well as single products
  if (cats) { const c = [...new Set(CAT.map((p) => p.category).filter(Boolean))]; if (c.length) groups[L("Poori category", "Whole category")] = c; }
  CAT.forEach((p) => { (groups[p.category || L("Baaki", "Other")] ||= []).push(p.name); });
  const fam = Object.values(FAMILIES).flat().map((x) => x.n).filter((n) => !CAT.some((p) => norm(p.name) === norm(n)));
  if (fam.length) groups[L("Broad interest", "Broad interest")] = fam;
  const has = (n) => sel.some((s) => norm(s) === norm(n));
  const draw = () => {
    const nq = norm(q);
    const shown = Object.entries(groups).map(([g, list]) => [g, list.filter((n) => !nq || norm(n).includes(nq) || norm(g).includes(nq))]).filter(([, l]) => l.length);
    const exact = nq && Object.values(groups).flat().some((n) => norm(n) === nq);
    box.innerHTML = `<div class="ppick">
      <div class="ppick-sel">${sel.map((s) => `<span class="chip on" data-x="${h(s)}">${h(s)} <b aria-label="${h(L("Hatao", "Remove"))}">✕</b></span>`).join("") || `<span class="mu">${L("Abhi koi product nahi — neeche se chuno", "No products yet — pick below")}</span>`}</div>
      <input class="input ppick-q" type="search" placeholder="${h(L("Product dhoondo — AutoCAD, SketchUp, Microsoft 365, CCTV…", "Search — AutoCAD, SketchUp, Microsoft 365, CCTV…"))}" value="${h(q)}" maxlength="60" aria-label="${h(L("Product dhoondo", "Search products"))}">
      <div class="ppick-list">${shown.map(([g, l]) => `<div class="ppick-g"><div class="ppick-gt">${h(g)}</div><div class="chips">${l.map((n) => `<button type="button" class="chip ${has(n) ? "on" : ""}" data-p="${h(n)}" aria-pressed="${has(n)}">${has(n) ? "✓ " : ""}${h(n)}</button>`).join("")}</div></div>`).join("")}
        ${q.trim() && !exact ? `<button type="button" class="btn sm" data-add>＋ "${h(q.trim().slice(0, 60))}" ${L("jodo", "add")}</button>` : ""}
        ${!shown.length && !q.trim() ? `<div class="mu">${L("Products page par products daalo", "Add products on the Products page")}</div>` : ""}</div></div>`;
    const inp = $(".ppick-q", box);
    inp.oninput = () => { q = inp.value; const at = inp.selectionStart; draw(); const i2 = $(".ppick-q", box); i2.focus(); try { i2.setSelectionRange(at, at); } catch { /* ignore */ } };
    inp.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); $("[data-add]", box)?.click() || $("[data-p]", box)?.click(); } };
    $$("[data-p]", box).forEach((b) => b.onclick = () => { const n = b.dataset.p; sel = has(n) ? sel.filter((s) => norm(s) !== norm(n)) : [...sel, n].slice(0, 20); draw(); onChange(sel); });
    $$("[data-x]", box).forEach((b) => b.onclick = () => { sel = sel.filter((s) => s !== b.dataset.x); draw(); onChange(sel); });
    $("[data-add]", box)?.addEventListener("click", () => { const n = q.trim().slice(0, 60); if (n && !has(n)) sel = [...sel, n].slice(0, 20); q = ""; draw(); onChange(sel); });
  };
  draw();
  return { get: () => [...sel] };
}

// ---------------------------------------------------------------------
//  A customer's mail → the products + quantities it asks about
//   "please send price for 5 licenses of AutoCAD LT and 2 SketchUp" →
//   [{ desc: "Autodesk AutoCAD LT …", qty: 5, price, tax, hsn }, { desc: "Trimble SketchUp Pro …", qty: 2, … }]
// ---------------------------------------------------------------------
const HW = { laptop: "Laptops", laptops: "Laptops", desktop: "Desktops & Workstations", desktops: "Desktops & Workstations", workstation: "Desktops & Workstations",
  workstations: "Desktops & Workstations", printer: "Printers & Plotters", printers: "Printers & Plotters", plotter: "Printers & Plotters", cctv: "CCTV & Surveillance",
  server: "Servers", servers: "Servers", nas: "Storage & Backup", ups: "UPS & Power", projector: "Projectors & Displays", "graphics card": "Graphics Cards (GPU)" };
const UNIT = "(?:nos?|licen[cs]es?|users?|seats?|pcs|pieces|units?|copies|subscriptions?|machines?|systems?)";
const qtyNear = (t, i, len) => {
  const before = t.slice(Math.max(0, i - 32), i), after = t.slice(i + len, i + len + 44);
  const ok = (n) => n > 0 && n < 1000;                                     // never a year / version ("AutoCAD LT 2026")
  let m = before.match(new RegExp(`(?:^|\\s)(\\d{1,3})\\s*(?:${UNIT}\\s*)?(?:of\\s+)?(?:the\\s+)?(?:autodesk\\s+|microsoft\\s+|trimble\\s+|adobe\\s+)?$`));
  if (m && ok(+m[1])) return +m[1];
  m = after.match(new RegExp(`^\\s*(?:\\w+\\s+){0,3}?(?:x\\s*|qty\\s*|quantity\\s*|for\\s+)?(\\d{1,3})\\s*${UNIT}\\b`));
  if (m && ok(+m[1])) return +m[1];
  m = after.match(/^\s*(?:x|qty|quantity)\s*(\d{1,3})\b/);
  if (m && ok(+m[1])) return +m[1];
  return null;
};
export function detectItems(text) {
  const t = " " + norm(text) + " ";
  const cands = [];
  CAT.forEach((p) => { cands.push([norm(p.name), p]); if (p.brand) cands.push([norm(`${p.brand} ${p.name}`), p]); });
  Object.entries(ALIAS).forEach(([k, v]) => { const p = CAT.find((x) => norm(x.name) === norm(v)); if (p) cands.push([k, p]); });
  // short names people write: "autocad", "revit", "lumion" → the catalogue's main product of that name
  [["autocad", "AutoCAD"], ["revit", "Revit"], ["lumion", "Lumion Pro"], ["enscape", "Enscape"], ["3ds max", "3ds Max"], ["3dsmax", "3ds Max"], ["office 365", "Microsoft 365 Business Standard"],
   ["microsoft office", "Microsoft 365 Business Standard"], ["tekla", "Tekla Structures"], ["d5", "D5 Render Pro"], ["acrobat", "Acrobat Pro"], ["photoshop", "Photoshop (Teams)"]]
    .forEach(([k, v]) => { const p = CAT.find((x) => norm(x.name) === norm(v)); if (p) cands.push([norm(k), p]); });
  Object.entries(HW).forEach(([k, fam]) => cands.push([norm(k), { id: "fam:" + fam, name: fam, family: true }]));
  cands.sort((a, b) => b[0].length - a[0].length);
  let left = t; const found = [];
  for (const [k, p] of cands) {
    if (!k || k.length < 2) continue;
    // every mention of it (subject + body): blanked so "autocad lt" is never also read as "autocad";
    // the quantity comes from whichever mention has one ("5 licenses of AutoCAD LT")
    let i, at = -1, qty = null;
    while ((i = left.indexOf(" " + k + " ")) >= 0) {
      if (at < 0) at = i;
      if (qty == null) qty = qtyNear(t, i + 1, k.length);
      left = left.slice(0, i + 1) + "#".repeat(k.length) + left.slice(i + 1 + k.length);
    }
    if (at < 0) continue;
    const f = found.find((x) => x.p.id === p.id);
    if (f) { if (f.qty == null) f.qty = qty; continue; }
    found.push({ p, at, qty });
  }
  return found.sort((a, b) => a.at - b.at).slice(0, 8).map(({ p, qty }) => p.family
    ? { desc: p.name, qty: qty || 1, qtyKnown: !!qty, price: 0, tax: 18, hsn: "", name: p.name }
    : { desc: [p.brand, p.name, p.model].filter(Boolean).join(" "), qty: qty || 1, qtyKnown: !!qty, price: +p.sell_price || 0, tax: p.gst_rate ?? 18, hsn: p.hsn || "", name: p.name, product_id: p.id });
}

// ---------------------------------------------------------------------
//  Ready replies for a customer's mail (by what the mail says)
//   → { note, drafts: [{ key, label, body }], actions: ["quote" | "lost" | "fu3" | "fu90" | "fixmail"] }
// ---------------------------------------------------------------------
const SIGN = "Best Regards,\n\n{{my_name}}\n{{my_designation}}\nGENESIS INFOSERVE PVT. LTD.\n{{my_email}}\n{{my_phone}}";
const ASKS_PRICE = /\b(quot|quotation|price|pricing|rate|rates|cost|proforma|best offer|offer|budget|kitne ka|kitna)\b/i;
export const isHinglishText = (t) => /\b(hai|hain|kya|nahi|nahin|chahiye|bhejo|bhej|karo|kijiye|aap|kitna|kitne|dijiye|batao|mujhe|humein|hume)\b/i.test(String(t || ""));
export function replyDrafts({ intent, text, lead, items }) {
  const hi = isHinglishText(text), its = items || [];
  const list = its.map((x) => (x.qtyKnown ? `${x.qty} × ` : "") + x.name).join(", ");
  const needQty = its.some((x) => !x.qtyKnown);
  const prods = its.length ? its.map((x) => x.name) : (lead?.products || []);
  const bullets = prods.slice(0, 5).map((n) => { const x = pitchOf(n, hi); return `• **${x.name}** — ${x.pitch || (hi ? GENERIC.hi : GENERIC.en)}`; }).join("\n");
  const dear = hi ? "Namaste {{contact_name|Sir/Madam}}," : "Dear {{contact_name|Sir/Madam}},";
  const kind = intent === "quote_request" || ((!intent || intent === "other" || intent === "interested") && ASKS_PRICE.test(text || "")) ? "quote" : intent || "other";
  const out = { kind, drafts: [], actions: [], note: "" };
  const d = (key, label, body) => out.drafts.push({ key, label, body: `${dear}\n\n${body}\n\n${SIGN}` });
  if (kind === "quote") {
    d("quote", L("Quotation aa rahi hai", "Quotation coming"),
      hi ? `Enquiry ke liye dhanyavaad! ${list ? `**${list}**` : "Aapki requirement"} ki quotation main taiyar kar raha/rahi hoon — thodi der mein bhej deta/deti hoon.${needQty || !its.length ? "\n\nBest price ke liye kitne users / licences chahiye, ek baar confirm kar dijiye." : ""}`
         : `Thank you for your enquiry! I am preparing the quotation for ${list ? `**${list}**` : "your requirement"} and will share it with you shortly.${needQty || !its.length ? "\n\nCould you please confirm the number of users / licences, so that I can offer the best price?" : ""}`);
    d("details", L("Details poocho", "Ask for details"),
      hi ? `Enquiry ke liye dhanyavaad${list ? ` (**${list}**)` : ""}. Best price dene ke liye ye bata dijiye:\n• kitne users / licences\n• naya purchase hai ya renewal (renewal ho to current serial / contract no.)\n• billing naam aur GST number`
         : `Thank you for your enquiry${list ? ` for **${list}**` : ""}. To share the best price, could you please confirm:\n• the number of users / licences\n• new purchase or renewal (if renewal, your current serial / contract no.)\n• the billing name and GST number`);
    if (lead) out.actions.push("quote");
  } else if (kind === "interested") {
    d("thanks", L("Dhanyavaad + product details", "Thanks + product details"),
      hi ? `Interest dikhane ke liye dhanyavaad!${bullets ? `\n\n${bullets}` : ""}\n\nKitne users / machines chahiye, bata dijiye — main turant best price ki quotation bhej deta/deti hoon. Ya mujhe {{my_phone}} pe call kar lijiye.`
         : `Thank you for your interest!${bullets ? `\n\n${bullets}` : ""}\n\nCould you share how many users / machines you need? I'll send you the best quotation right away — or call me on {{my_phone}}.`);
    d("call", L("Call / demo fix karo", "Fix a call / demo"),
      hi ? "Interest ke liye dhanyavaad! Is hafte ek chhoti call ya demo rakh lein? Aapke liye kaunsa din aur time theek rahega, bata dijiye — ya {{my_phone}} pe call kar lijiye."
         : "Thank you for your interest! Could we schedule a short call or demo this week? Please let me know a convenient day and time — or call me on {{my_phone}}.");
    if (lead && its.length) out.actions.push("quote");
  } else if (kind === "not_interested") {
    d("close", L("Shukriya — aage ke liye", "Polite close"),
      hi ? "Batane ke liye dhanyavaad. Jab bhi licences, hardware ya IT support ki zaroorat ho, bejhijhak yaad kijiye — hum hamesha madad ke liye hain."
         : "Thank you for letting us know. Whenever you need licences, hardware or IT support, please feel free to reach out — we'll be glad to help.");
    if (lead) out.actions.push("lost", "fu90");
  } else if (kind === "auto_reply") {
    out.note = L("Ye automatic (out-of-office) reply hai — iska jawab dene ki zaroorat nahi.", "This is an automatic (out-of-office) reply — no answer needed.");
    if (lead) out.actions.push("fu3");
  } else if (kind === "bounce") {
    out.note = L("Mail customer tak nahi pahuncha — email address galat lagta hai.", "The mail did not reach the customer — the address looks wrong.");
    if (lead) out.actions.push("fixmail");
  } else {
    d("thanks", L("Dhanyavaad", "Thank you"),
      hi ? `Aapke reply ke liye dhanyavaad.${list ? ` **${list}** ki requirement note kar li hai — details ke saath jaldi wapas aata/aati hoon.` : ""} Aur kuch chahiye ho to zaroor bataiye.`
         : `Thank you for your reply.${list ? ` I have noted your requirement for **${list}** and will get back to you with the details shortly.` : ""} Please let me know if you need anything else.`);
    if (lead && its.length) out.actions.push("quote");
  }
  return out;
}
