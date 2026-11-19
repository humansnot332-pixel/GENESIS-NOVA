// Public enquiry page → an RFQ in the CRM (edge function inbound-rfq).
// Shared as a link on WhatsApp (?src=whatsapp) and as a "Get a Quote" button on the website (?src=website).
import { CONFIG } from "./config.js";

const $ = (s) => document.querySelector(s);
const API = String(CONFIG.SUPABASE_URL || "").replace(/\/$/, "");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const src = (new URLSearchParams(location.search).get("src") || "").replace(/[^a-z0-9 _-]/gi, "").slice(0, 30);
let co = {};

// company name + contact from the CRM settings
fetch(API + "/rest/v1/rpc/public_branding", {
  method: "POST", body: "{}",
  headers: { apikey: CONFIG.SUPABASE_ANON_KEY, Authorization: "Bearer " + CONFIG.SUPABASE_ANON_KEY, "Content-Type": "application/json" },
}).then((r) => (r.ok ? r.json() : null)).then((b) => {
  co = b?.company || {};
  if (co.name) { $("#coName").textContent = co.name; document.title = "Get a quotation — " + co.name; }
  const site = co.website ? (/^https?:\/\//i.test(co.website) ? co.website : "https://" + co.website) : "";
  $("#coContact").innerHTML = [
    co.mobile && `📞 <a href="tel:${esc(String(co.mobile).replace(/[^\d+]/g, ""))}">${esc(co.mobile)}</a>`,
    co.email && `✉️ <a href="mailto:${esc(co.email)}">${esc(co.email)}</a>`,
    site && `🌐 <a href="${esc(site)}" target="_blank" rel="noopener noreferrer">${esc(site.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, ""))}</a>`,
  ].filter(Boolean).join(" &nbsp;·&nbsp; ");
}).catch(() => { /* the form works without it */ });

const LABEL = { company: "company", contact: "your name", phone: "mobile", email: "email", city: "city", product: "what you need" };
function say(text) { const m = $("#msg"); m.textContent = text; m.hidden = !text; if (text) m.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
const callUs = () => (co.mobile ? ` or call us on ${co.mobile}` : "");

$("#f").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = Object.fromEntries([...new FormData(e.target).entries()].map(([k, v]) => [k, String(v).trim()]));
  const missing = Object.keys(LABEL).filter((k) => !f[k]);
  if (missing.length) { say("Please fill in: " + missing.map((k) => LABEL[k]).join(", ")); $("#" + missing[0]).focus(); return; }
  if (f.phone.replace(/\D/g, "").length < 10) { say("Please enter a 10-digit mobile number"); $("#phone").focus(); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email)) { say("Please enter a valid email address"); $("#email").focus(); return; }
  if (src) f.details = (f.details ? f.details + "\n\n" : "") + "(via " + src + ")";
  say("");
  const btn = $("#go"); btn.disabled = true; btn.textContent = "Sending…";
  try {
    const r = await fetch(API + "/functions/v1/inbound-rfq", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.ok) {
      $("#formCard").hidden = true; $("#done").hidden = false;
      $("#doneText").textContent = (j.duplicate ? "We already have your enquiry" : "We have your enquiry") +
        (j.rfq_no ? ` (ref ${j.rfq_no})` : "") + ". Our team will call you shortly.";
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (r.status === 400 && Array.isArray(j.missing)) say("Please fill in: " + j.missing.map((k) => LABEL[k] || k).join(", "));
    else if (r.status === 429) say("Too many tries from this network — please wait a few minutes" + callUs() + ".");
    else say("Sorry, we couldn't send it right now — please try again" + callUs() + ".");
  } catch {
    say("No internet connection? Please try again" + callUs() + ".");
  } finally { btn.disabled = false; btn.textContent = "Send enquiry"; }
});
