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
  const { data } = await sb.from("products").select("id, brand, name, category, pitch, pitch_hi").eq("active", true).order("category").order("name");
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
