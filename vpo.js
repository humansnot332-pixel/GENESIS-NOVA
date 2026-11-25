// =====================================================================
//  Vendor POs — made by themselves when the Director approves an OBF
//  (one PO per vendor, at the OBF cost), mailed to the vendor from the
//  salesperson's Gmail; "Maal aa gaya" on every PO → the order is delivered.
// =====================================================================
import { sb, S, h, inr, ic, toast, fail, modal, closeModal, busy, isMgr, isAdmin, userName, dOnly, ago, confirmBox } from "./core.js";
import { L } from "./i18n.js";
import { dateState, dateBarHtml, wireDateBar, applyDates } from "./datebar.js";
const PD = dateState("vpo");

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const r2 = (n) => Math.round((+n + Number.EPSILON) * 100) / 100;
const ST = {
  draft: [L("Draft — bhejna hai", "Draft — to send"), "warn"], sent: [L("📧 Vendor ko gaya", "📧 Sent to vendor"), "info"],
  received: [L("✅ Maal aa gaya", "✅ Goods received"), "good"], cancelled: ["Cancelled", "bad"],
};
const badge = (s) => `<span class="badge ${ST[s]?.[1] || ""}">${h(ST[s]?.[0] || s)}</span>`;
// same maths as the server (obf_totals): line → paise, GST per rate → paise, total → rupee
function calc(items) {
  const base = {}; let sub = 0;
  (items || []).forEach((it) => { const a = r2((+it.qty || 0) * (+it.rate || 0)); sub += a; base[+it.tax || 0] = (base[+it.tax || 0] || 0) + a; });
  let tax = 0; Object.keys(base).forEach((k) => { if (+k) tax += r2((base[k] * +k) / 100); });
  sub = r2(sub); tax = r2(tax);
  return { sub, tax, grand: Math.round(sub + tax) };
}

// ---------------------------------------------------------------- list
export async function viewPurchase(el) {
  const f = el.dataset.f || "open";
  if (f === "vendors") return viewVendors(el);
  let q = sb.from("purchase_orders").select("id, po_no, vendor_name, status, grand_total, po_date, expected_at, sent_at, received_at, notes, owner_id").order("created_at", { ascending: false }).limit(300);
  if (f === "open") q = q.in("status", ["draft", "sent"]); else if (f === "received") q = q.eq("status", "received");
  q = applyDates(q, "created_at", PD, true);
  const { data, error } = await q; if (error) throw error;
  const today = new Date().toISOString().slice(0, 10);
  const late = (p) => p.status === "sent" && (p.expected_at || (p.sent_at && new Date(new Date(p.sent_at).getTime() + 7 * 864e5).toISOString().slice(0, 10))) < today;
  el.innerHTML = `<div class="toolbar"><div class="chips">${[["open", L("Khule", "Open")], ["received", L("Maal aa gaya", "Received")], ["all", L("Sab", "All")], ["vendors", "📇 " + L("Vendors", "Vendors")]].map(([k, l]) => `<button class="chip ${f === k ? "on" : ""}" data-pf="${k}">${h(l)}</button>`).join("")}</div>
    <span class="sp" style="flex:1"></span><span class="mu" style="font-size:12.5px">📦 ${L("OBF approve hote hi har vendor ka PO apne aap banta hai", "Every vendor gets a PO by itself when an OBF is approved")}</span></div>
  ${dateBarHtml("vpo", PD)}
  <div class="card"><div class="tbl-wrap">${!data.length ? `<div class="empty"><b>${L("Koi vendor PO nahi", "No vendor POs")}</b>${L("OBF mein vendor + cost bharo — approve hote hi PO yahan aa jayega.", "Fill vendor + cost in the OBF — the PO shows up here once it is approved.")}</div>`
    : `<table class="tbl"><thead><tr><th>PO</th><th>Vendor</th><th>Status</th><th class="num">Total</th><th>${L("Kiske liye", "For")}</th><th>${L("Kab tak", "Due")}</th></tr></thead><tbody>
    ${data.map((p) => `<tr data-po="${p.id}"><td class="mono">${h(p.po_no)}</td><td class="co">${h(p.vendor_name)}</td><td>${badge(p.status)}${late(p) ? ` <span class="badge bad">⏰ ${L("late", "late")}</span>` : ""}</td>
      <td class="num">${inr(p.grand_total)}</td><td class="sub">${h(String(p.notes || "").split(" · ")[0].replace(/^For /, ""))} · ${h(userName(p.owner_id))}</td>
      <td class="sub">${p.status === "received" ? "✅ " + h(ago(p.received_at)) : p.expected_at ? h(dOnly(p.expected_at)) : p.sent_at ? h(ago(p.sent_at)) : "—"}</td></tr>`).join("")}</tbody></table>`}</div></div>`;
  $$("[data-pf]", el).forEach((b) => b.onclick = () => { el.dataset.f = b.dataset.pf; viewPurchase(el); });
  wireDateBar(el, "vpo", PD, () => viewPurchase(el));
  $$("[data-po]", el).forEach((r) => r.onclick = () => openPo(+r.dataset.po, () => viewPurchase(el)));
}

// ---------------------------------------------------------------- vendor directory
// everyone can look a vendor up (call / mail); managers also see how many prices the CRM has learned from POs
const telOf = (p) => String(p || "").split(",")[0].replace(/[^\d+]/g, "");
async function viewVendors(el) {
  const mgr = isMgr(), q = (el.dataset.vq || "").toLowerCase().split(/\s+/).filter(Boolean);
  const [{ data, error }, { data: pos }, vp] = await Promise.all([
    sb.from("vendors").select("id, code, name, contact, email, phone, landline, gstin, pan, address, area, city, state, pincode, kind, active").order("name").limit(3000),
    sb.from("purchase_orders").select("vendor_id").limit(5000),
    mgr ? sb.from("vendor_prices").select("vendor").limit(20000) : Promise.resolve({ data: [] }),
  ]);
  if (error) throw error;
  const poN = {}; (pos || []).forEach((p) => { poN[p.vendor_id] = (poN[p.vendor_id] || 0) + 1; });
  const vk = (x) => String(x || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const prN = {}; (vp.data || []).forEach((r) => { prN[vk(r.vendor)] = (prN[vk(r.vendor)] || 0) + 1; });
  const rows = (data || []).filter((v) => !q.length || q.every((w) => [v.code, v.name, v.contact, v.email, v.phone, v.area, v.city, v.gstin].join(" ").toLowerCase().includes(w)));
  el.innerHTML = `<div class="toolbar"><div class="chips">${[["open", L("Khule", "Open")], ["received", L("Maal aa gaya", "Received")], ["all", L("Sab", "All")], ["vendors", "📇 " + L("Vendors", "Vendors")]].map(([k, l]) => `<button class="chip ${k === "vendors" ? "on" : ""}" data-pf="${k}">${h(l)}</button>`).join("")}</div>
    <input class="input" id="vq" placeholder="${h(L("Vendor / contact / area / GSTIN search…", "Search vendor / contact / area / GSTIN…"))}" value="${h(el.dataset.vq || "")}" style="max-width:300px">
    <span class="mu">${(rows.length).toLocaleString("en-IN")} vendors</span><span class="sp" style="flex:1"></span>
    ${mgr ? `<button class="btn" id="vErp">⬆️ ${L("ERP list", "ERP list")}</button>` : ""}<button class="btn primary" id="vAdd">＋ Vendor</button></div>
  <div class="card"><div class="tbl-wrap">${!rows.length ? `<div class="empty"><b>${L("Koi vendor nahi mila", "No vendor found")}</b></div>` : `<table class="tbl"><thead><tr><th>Vendor</th><th>${L("Phone", "Phone")}</th><th>Email</th><th>${L("Area", "Area")}</th><th>GSTIN</th><th class="num">POs</th>${mgr ? `<th class="num">🔒 ${L("Prices", "Prices")}</th>` : ""}</tr></thead><tbody>
    ${rows.slice(0, 500).map((v) => `<tr data-vd="${v.id}"><td><div class="co">${h(v.name)}${v.active === false ? ` <span class="badge bad">${L("Band", "Inactive")}</span>` : ""}</div><div class="sub">${h([v.code, v.contact].filter(Boolean).join(" · "))}</div></td>
      <td style="white-space:nowrap">${v.phone ? `<a href="tel:${h(telOf(v.phone))}" data-stop>${h(String(v.phone).split(",")[0])}</a>` : ""}${v.landline ? `<div class="sub">${h(v.landline)}</div>` : ""}</td>
      <td class="sub">${v.email ? `<a href="mailto:${h(v.email)}" data-stop>${h(v.email)}</a>` : "—"}</td>
      <td class="sub">${h([v.area, v.city && v.city !== v.area ? v.city : "", v.pincode].filter(Boolean).join(", ") || "—")}</td>
      <td class="mono sub">${h(v.gstin || "—")}</td><td class="num">${poN[v.id] || ""}</td>${mgr ? `<td class="num">${prN[vk(v.name)] || ""}</td>` : ""}</tr>`).join("")}</tbody></table>`}</div></div>
  <p class="mu" style="font-size:12.5px">💡 ${L("OBF mein vendor isi list se chuno — har PO ke baad us vendor ka rate apne aap yaad rehta hai, agli OBF mein cost aur margin khud bharte hain.", "Pick the OBF vendor from this list — after each PO the CRM remembers that vendor's rate, so the next OBF fills cost and margin by itself.")}</p>`;
  $$("[data-pf]", el).forEach((b) => b.onclick = () => { el.dataset.f = b.dataset.pf; viewPurchase(el); });
  const vq = $("#vq", el); let t;
  vq.oninput = () => { clearTimeout(t); t = setTimeout(() => { el.dataset.vq = vq.value; viewVendors(el).then(() => { const n = $("#vq", el); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }); }, 250); };
  $$("[data-stop]", el).forEach((a) => a.onclick = (e) => e.stopPropagation());
  $$("[data-vd]", el).forEach((r) => r.onclick = () => vendorForm((data || []).find((v) => v.id === +r.dataset.vd), () => viewVendors(el)));
  $("#vAdd", el).onclick = () => vendorForm({}, () => viewVendors(el));
  $("#vErp", el)?.addEventListener("click", () => import("./catimp.js").then((x) => x.openCatalogImport(() => viewVendors(el))));
}
function vendorForm(v, done) {
  const F = [["name", L("Vendor / company *", "Vendor / company *"), 120], ["contact", L("Contact person", "Contact person"), 120], ["phone", L("Mobile", "Mobile"), 120], ["landline", "Landline", 60],
    ["email", "Email", 200], ["gstin", "GSTIN", 15], ["pan", "PAN", 10], ["code", L("Vendor code", "Vendor code"), 20], ["area", L("Area", "Area"), 80], ["city", L("City", "City"), 80],
    ["state", L("State", "State"), 60], ["pincode", "Pincode", 10]];
  const m = modal({ title: v.id ? "🏭 " + v.name : L("🏭 Naya vendor", "🏭 New vendor"), wide: true,
    body: `<div class="grid3">${F.map(([k, l, n]) => `<div><label class="f" for="vf_${k}">${h(l)}</label><input class="input" id="vf_${k}" maxlength="${n}" value="${h(v[k] || "")}"></div>`).join("")}</div>
      <label class="f" for="vf_address">${L("Address", "Address")}</label><textarea class="input" id="vf_address" rows="2" maxlength="500">${h(v.address || "")}</textarea>
      ${v.id ? `<label class="qtdef" style="margin-top:8px"><input type="checkbox" id="vf_active"${v.active === false ? "" : " checked"}> ${L("Active (OBF / PO mein dikhe)", "Active (shown in OBF / PO)")}</label>` : ""}`,
    foot: `${v.id && isMgr() ? `<button class="btn danger" id="vfDel">${L("Delete", "Delete")}</button>` : ""}<span class="sp" style="flex:1"></span><button class="btn" data-close>Cancel</button><button class="btn primary" id="vfSave">Save</button>` });
  $("#vfSave", m).onclick = (e) => busy(e.target, async () => {
    const row = Object.fromEntries(F.map(([k]) => [k, $("#vf_" + k, m).value.trim() || null]));
    row.address = $("#vf_address", m).value.trim() || null;
    if (!row.name || !/[a-z]/i.test(row.name)) { $("#vf_name", m).focus(); return toast(L("Vendor ka sahi naam daalo", "Enter the vendor's name"), true); }
    if (row.gstin) row.gstin = row.gstin.toUpperCase();
    if (row.pan) row.pan = row.pan.toUpperCase();
    if (row.email) row.email = row.email.toLowerCase();
    if (v.id) row.active = $("#vf_active", m).checked;
    const res = v.id ? await sb.from("vendors").update({ ...row, updated_at: new Date().toISOString() }).eq("id", v.id) : await sb.from("vendors").insert(row);
    if (res.error) { if (res.error.code === "23505") return toast(L("Ye vendor code pehle se kisi aur ka hai", "That vendor code is already used"), true); throw res.error; }
    closeModal(); toast("Saved ✔"); done?.();
  });
  $("#vfDel", m)?.addEventListener("click", (e) => busy(e.target, async () => {
    if (!(await confirmBox(L(`"${v.name}" delete karna hai?`, `Delete "${v.name}"?`), "Delete"))) return;
    const { error } = await sb.from("vendors").delete().eq("id", v.id);
    if (error) return toast(L("Is vendor ke PO hain — delete nahi hoga, 'Active' hata do", "This vendor has POs — untick 'Active' instead"), true);
    closeModal(); done?.();
  }));
}

// ---------------------------------------------------------------- one PO
export async function openPo(id, done) {
  const { data: p0, error } = await sb.from("purchase_orders").select("*").eq("id", id).single();
  if (error) return fail(error);
  const p = structuredClone(p0); p.items ||= [];
  let v = {};
  if (p.vendor_id) { const { data } = await sb.from("vendors").select("*").eq("id", p.vendor_id).single(); v = data || {}; }
  const mine = p.owner_id === S.me.id || isMgr(), draft = p.status === "draft" && mine, open = ["draft", "sent"].includes(p.status) && mine;
  const dis = draft ? "" : " disabled";
  const ban = p.status === "sent" ? `<div class="obf-ban warn">📧 ${L("Vendor ko bheja", "Sent to the vendor")} ${h(ago(p.sent_at))} — ${L("maal aate hi", "when the goods arrive press")} <b>“${L("Maal aa gaya", "Goods received")}”</b></div>`
    : p.status === "received" ? `<div class="obf-ban good">✅ ${L("Maal aa gaya", "Goods received")} · ${h(dOnly(p.received_at))}</div>`
    : p.status === "cancelled" ? `<div class="obf-ban bad">${L("Ye PO cancel hai", "This PO is cancelled")}</div>`
    : `<div class="obf-ban warn">📝 ${v.email ? L("Draft — ek baar check karo aur “Vendor ko email” dabao", "Draft — check it once and press “Email the vendor”") : L("Draft — vendor ka email daalo aur bhejo", "Draft — add the vendor's email and send it")}</div>`;
  const m = modal({
    title: `${p.po_no} · ${p.vendor_name}`, wide: true,
    body: `${ban}
    <div class="obf-cust"><div><b>Vendor</b>
        <div class="obf-2"><div><label class="f">${L("Naam", "Name")}</label><input class="input" value="${h(p.vendor_name)}" disabled></div><div><label class="f">Contact</label><input class="input" data-v="contact" value="${h(v.contact || "")}" maxlength="120"${mine ? "" : " disabled"}></div>
        <div><label class="f">Email *</label><input class="input" type="email" data-v="email" value="${h(v.email || "")}" maxlength="200"${mine ? "" : " disabled"}></div><div><label class="f">Phone</label><input class="input" data-v="phone" value="${h(v.phone || "")}" maxlength="40"${mine ? "" : " disabled"}></div>
        <div><label class="f">GSTIN</label><input class="input" data-v="gstin" value="${h(v.gstin || "")}" maxlength="15"${mine ? "" : " disabled"}></div><div><label class="f">Address</label><input class="input" data-v="address" value="${h(v.address || "")}" maxlength="400"${mine ? "" : " disabled"}></div></div>
        <p class="mu" style="font-size:12px;margin:6px 0 0">${L("Vendor ki details ek baar bharo — agle PO mein apne aap aayengi.", "Fill the vendor's details once — the next PO picks them up by itself.")}</p></div>
      <div><b>PO</b>
        <div class="obf-2"><div><label class="f">PO date</label><input class="input" value="${h(dOnly(p.po_date))}" disabled></div><div><label class="f">${L("Maal kab tak chahiye", "Required by")}</label><input class="input" type="date" data-p="expected_at" value="${h(p.expected_at || "")}"${open ? "" : " disabled"}></div></div>
        <label class="f">${L("Kahan deliver karna hai", "Deliver to")}</label><textarea class="input" data-p="deliver_to" rows="2" maxlength="500"${dis}>${h(p.deliver_to || "")}</textarea>
        <label class="f">Payment terms</label><input class="input" data-p="terms" value="${h(p.terms || "")}" maxlength="1000"${dis}>
        <label class="f">Note</label><input class="input" data-p="notes" value="${h(p.notes || "")}" maxlength="1000"${mine ? "" : " disabled"}></div></div>
    <div class="sec tbl-wrap"><table class="tbl" id="poIt"><thead><tr><th>#</th><th>Description</th><th style="width:90px">HSN</th><th class="num" style="width:80px">Qty</th><th class="num" style="width:120px">Rate ₹</th><th class="num" style="width:80px">GST %</th><th class="num">Amount</th></tr></thead><tbody></tbody></table>
      <dl class="kv" id="poTot" style="max-width:360px;margin-left:auto"></dl></div>`,
    foot: `${isAdmin() ? `<button class="btn danger" id="poDel" title="${h(L("Admin: ye PO hamesha ke liye hatao", "Admin: delete this PO for good"))}">${ic("trash")}</button>` : ""}<button class="btn" id="poPr">${ic("print")} PDF</button>${open ? `<button class="btn" id="poMail">📧 ${L("Vendor ko email", "Email the vendor")}</button><button class="btn" id="poGot">✅ ${L("Maal aa gaya", "Goods received")}</button><button class="btn danger ghost" id="poCx">${L("Cancel PO", "Cancel PO")}</button>` : ""}
      <span style="flex:1"></span><button class="btn" data-close>${L("Band karo", "Close")}</button>${mine ? `<button class="btn primary" id="poSave">Save</button>` : ""}`,
  });
  const draw = () => {
    $("#poIt tbody", m).innerHTML = p.items.map((it, i) => `<tr style="cursor:default"><td>${i + 1}</td>
      <td><input class="input" data-i="${i}" data-k="desc" value="${h(it.desc || "")}" maxlength="400"${dis}>${draft || it.details ? `<textarea class="input" data-i="${i}" data-k="details" rows="2" maxlength="1000" style="margin-top:4px;font-size:12.5px"${dis}>${h(it.details || "")}</textarea>` : ""}</td>
      <td><input class="input" data-i="${i}" data-k="hsn" value="${h(it.hsn || "")}" maxlength="12"${dis}></td>
      <td><input class="input num" type="number" min="0" data-i="${i}" data-k="qty" value="${h(it.qty)}"${dis}></td><td><input class="input num" type="number" min="0" data-i="${i}" data-k="rate" value="${h(it.rate)}"${dis}></td>
      <td><input class="input num" type="number" min="0" data-i="${i}" data-k="tax" value="${h(it.tax)}"${dis}></td><td class="num pamt">${inr(r2((+it.qty || 0) * (+it.rate || 0)))}</td></tr>`).join("");
    tot();
  };
  const tot = () => { const c = calc(p.items); $("#poTot", m).innerHTML = `<dt>Subtotal</dt><dd>${inr(c.sub)}</dd><dt>GST</dt><dd>${inr(c.tax)}</dd><dt><b>Total</b></dt><dd><b style="font-size:17px">${inr(c.grand)}</b></dd>`; };
  draw();
  m.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.v) v[t.dataset.v] = t.value;
    if (t.dataset.p) p[t.dataset.p] = t.value;
    if (t.dataset.k) { const it = p.items[+t.dataset.i]; it[t.dataset.k] = ["qty", "rate", "tax"].includes(t.dataset.k) ? +t.value || 0 : t.value; if (["qty", "rate"].includes(t.dataset.k)) t.closest("tr").querySelector(".pamt").textContent = inr(r2((+it.qty || 0) * (+it.rate || 0))); tot(); }
  });
  const save = async () => {
    if (p.vendor_id) { const { error: e } = await sb.from("vendors").update({ contact: v.contact || null, email: (v.email || "").trim() || null, phone: v.phone || null, gstin: v.gstin || null, address: v.address || null, updated_at: new Date().toISOString() }).eq("id", p.vendor_id); if (e) throw e; }
    const c = calc(p.items);
    const row = { expected_at: p.expected_at || null, notes: p.notes || null, ...(draft ? { items: p.items, subtotal: c.sub, tax_total: c.tax, grand_total: c.grand, deliver_to: p.deliver_to || null, terms: p.terms || null } : {}) };
    const { error: e2 } = await sb.from("purchase_orders").update(row).eq("id", p.id); if (e2) throw e2;
  };
  const again = () => { done?.(); openPo(p.id, done); };
  $("#poSave", m)?.addEventListener("click", (e) => busy(e.target, async () => { await save(); toast(L("✔ Save ho gaya", "✔ Saved")); again(); }));
  $("#poMail", m)?.addEventListener("click", (e) => busy(e.target, async () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test((v.email || "").trim())) { $('[data-v="email"]', m).focus(); return toast(L("Pehle vendor ka email daalo", "Add the vendor's email first"), true); }
    await save();
    const { data: r, error: e2 } = await sb.rpc("vpo_send", { p_id: p.id }); if (e2) throw e2;
    if (r === "sent") { toast(L("📧 PO vendor ko chala gaya (aapke Gmail se)", "📧 PO sent to the vendor (from your Gmail)")); return again(); }
    if (r === "no_gmail") {
      toast(L("Aapka Gmail CRM se connect nahi — PDF bana ke mail se bhejo", "Your Gmail isn't connected to the CRM — send it as a PDF by mail"), true);
      printPo(p, v);
      location.href = `mailto:${encodeURIComponent(v.email.trim())}?subject=${encodeURIComponent("Purchase Order " + p.po_no)}&body=${encodeURIComponent(L("PO attach hai. Kripya order confirm karein aur delivery date batayein.", "Please find the PO attached. Kindly confirm the order and the delivery date."))}`;
      await sb.rpc("vpo_mark", { p_id: p.id, p_status: "sent" }); return again();
    }
    toast(r, true);
  }));
  $("#poGot", m)?.addEventListener("click", (e) => busy(e.target, async () => {
    const { error: e2 } = await sb.rpc("vpo_mark", { p_id: p.id, p_status: "received" }); if (e2) throw e2;
    toast(L("✅ Maal aa gaya — order ke saare PO aa gaye toh order apne aap delivered ho jayega", "✅ Received — when all POs of the order are in, the order is marked delivered")); again();
  }));
  $("#poCx", m)?.addEventListener("click", (e) => {
    const b = e.currentTarget;
    if (!b.dataset.sure) { b.dataset.sure = "1"; b.textContent = L("Pakka? Dobara dabao", "Sure? Click again"); setTimeout(() => { if (b.isConnected) { delete b.dataset.sure; b.textContent = L("Cancel PO", "Cancel PO"); } }, 4000); return; }
    busy(b, async () => { const { error: e2 } = await sb.rpc("vpo_mark", { p_id: p.id, p_status: "cancelled" }); if (e2) throw e2; toast(L("PO cancel ho gaya", "PO cancelled")); again(); });
  });
  $("#poPr", m).addEventListener("click", () => printPo(p, v));
  $("#poDel", m)?.addEventListener("click", async () => {
    if (!(await confirmBox(L(`PO ${p.po_no} permanently delete karna hai? Ye wapas nahi aayega.`, `Delete PO ${p.po_no} permanently? This cannot be undone.`), L("Haan, delete karo", "Yes, delete")))) return;
    const { data, error } = await sb.from("purchase_orders").delete().eq("id", p.id).select("id");
    if (error) return fail(error);
    if (!data?.length) return toast(L("Delete nahi hua — sirf Admin delete kar sakta hai", "Not deleted — only an Admin can delete it"), true);
    closeModal(); toast(L(`🗑 PO ${p.po_no} delete ho gaya`, `🗑 PO ${p.po_no} deleted`)); done?.();
  });
  return m;
}

// ---------------------------------------------------------------- print / PDF
export function printPo(p, v = {}) {
  const co = S.settings.company || {}, c = calc(p.items);
  let pr = document.getElementById("printRoot");
  if (!pr) { pr = document.createElement("div"); pr.id = "printRoot"; pr.className = "print-root"; document.body.append(pr); }
  pr.innerHTML = `<div class="qdoc">
    <div class="hd"><div><h2>${h(co.name || "")}</h2><div>${h(co.address || "")}</div><div>GSTIN: ${h(co.gstin || "")}${co.pan ? " · PAN: " + h(co.pan) : ""}</div></div>
      <div style="text-align:right"><h2>PURCHASE ORDER</h2><div>No: <b>${h(p.po_no)}</b></div><div>Date: ${h(dOnly(p.po_date))}</div>${p.expected_at ? `<div>Required by: ${h(dOnly(p.expected_at))}</div>` : ""}</div></div>
    <table class="qterms"><tbody><tr><th>Vendor</th><td><b>${h(p.vendor_name)}</b>${v.address ? "<br>" + h(v.address) : ""}${v.gstin ? "<br>GSTIN: " + h(v.gstin) : ""}${v.contact || v.phone || v.email ? "<br>" + h([v.contact, v.phone, v.email].filter(Boolean).join(" · ")) : ""}</td>
      <th>Deliver to</th><td>${h(p.deliver_to || "")}</td></tr></tbody></table>
    <table><thead><tr><th>#</th><th>Description</th><th>HSN/SAC</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">GST</th><th class="r">Amount</th></tr></thead><tbody>
    ${p.items.map((it, i) => `<tr><td>${i + 1}</td><td>${h(it.desc)}${it.details ? `<div class="qdt">${h(it.details)}</div>` : ""}</td><td>${h(it.hsn || "")}</td><td class="r">${h(it.qty)}</td><td class="r">${inr(it.rate)}</td><td class="r">${h(it.tax)}%</td><td class="r">${inr(r2((+it.qty || 0) * (+it.rate || 0)))}</td></tr>`).join("")}
    <tr><td colspan="6" class="r">Subtotal</td><td class="r">${inr(c.sub)}</td></tr><tr><td colspan="6" class="r">GST</td><td class="r">${inr(c.tax)}</td></tr>
    <tr><th colspan="6" class="r">Total</th><th class="r">${inr(c.grand)}</th></tr></tbody></table>
    <p><b>Payment terms:</b> ${h(p.terms || "As agreed")}${p.notes ? `<br><b>Note:</b> ${h(p.notes)}` : ""}</p>
    <p>Please confirm this order and the delivery date. Mention our PO number on your invoice and delivery challan.</p>
    <p>For <b>${h(co.name || "")}</b><br><br><br>Authorised Signatory</p></div>`;
  window.print();
}
