// =====================================================================
//  First-login guide — a short spotlight tour of the CRM for a new employee.
//  Shows once per person (profiles.tour_done_at, + this device), replay from
//  "Mera profile → 🧭 Guide". Steps follow the person's role / pages: a step
//  whose part of the screen isn't there (no access, phone layout) is skipped
//  or shown as a centred card.
// =====================================================================
import { sb, S, h, isMgr } from "./core.js";
import { L } from "./i18n.js";

const nav = (r) => `.nav a[href="#/${r}"]`;
const STEPS = () => [
  { ic: "👋", t: L(`Namaste ${S.me.full_name.split(" ")[0]}! Genesis Nova mein swagat hai`, `Hi ${S.me.full_name.split(" ")[0]}! Welcome to Genesis Nova`),
    d: L("1 minute mein dekh lo kya kahan hai. Aage dabao — ya Skip, baad mein Profile se kabhi bhi dobara dekh sakte ho.",
      "One minute to see what's where. Press Next — or Skip; you can replay it any time from your profile.") },
  { sel: nav("today"), ic: "📞", t: L("Aaj ki calls — yahin se din shuru karo", "Today's calls — start your day here"),
    d: L("Aaj ke follow-ups, aapke naye leads aur free pool ek list mein. “Next lead” dabao aur call shuru.",
      "Today's follow-ups, your fresh leads and the free pool in one list. Press “Next lead” and start calling.") },
  { sel: nav("leads"), ic: "🔒", t: L("Leads + Lock", "Leads + Lock"),
    d: L("Lead kholo → “🔒 Lock karke shuru karo”. Jo lock karta hai wahi call / mail karta hai, number bhi usi ko dikhta hai. Kaam nahi hua toh Release karo — dusre ko mil jayega.",
      "Open a lead → “🔒 Lock & start”. Whoever locks it calls / mails it and only they see the number. Can't work it? Release it so someone else can.") },
  { sel: nav("rfqs"), ic: "📨", t: L("RFQs — customer ki maang", "RFQs — what customers ask for"),
    d: L("IndiaMART, website aur mail se aayi enquiries yahan apne aap aati hain. Jaldi jawab do — speed se deal banti hai.",
      "Enquiries from IndiaMART, the website and mail land here by themselves. Answer fast — speed wins deals.") },
  { sel: nav("quotes"), ic: "📄", t: L("Quotations", "Quotations"),
    d: L("Lead ya RFQ se “Quotation banao”. Email / WhatsApp se bhejo — customer online kholega toh 👁 dikhega, wo wahin accept bhi kar sakta hai.",
      "“Make quotation” from a lead or RFQ. Send it by email / WhatsApp — you'll see 👁 when the customer opens it, and they can accept it online.") },
  { sel: nav("inbox"), ic: "📩", t: L("Inbox — customer ke reply", "Inbox — customers' replies"),
    d: L("Jinhe aapne CRM se mail kiya, unke reply yahan aate hain — saath mein kaunsi quotation ka reply hai wo bhi.",
      "Replies from people you mailed from the CRM come here — with the quotation they're replying about.") },
  { sel: nav("tasks"), ic: "⏰", t: L("Follow-ups & tasks", "Follow-ups & tasks"),
    d: L("Har call ke baad agla follow-up set karo. Bhoolne wale kaam yahan yaad rehte hain.", "Set the next follow-up after every call. Nothing slips through.") },
  { sel: ".search-btn", ic: "🔍", t: L("Kuch bhi dhoondho — Ctrl K", "Find anything — Ctrl K"),
    d: L("Company, phone, RFQ ya quotation number — ek jagah se.", "Company, phone, RFQ or quotation number — from one place.") },
  { sel: '[data-act="history"]', ic: "↩️", t: L("Galti ho gayi? Undo", "Made a mistake? Undo"),
    d: L("Galat delete / badlaav — yahan se wapas. Ctrl+Z bhi chalta hai.", "Wrong delete or change — undo it here. Ctrl+Z works too.") },
  { sel: "#bellBtn", ic: "🔔", t: L("Notifications", "Notifications"),
    d: L("Naya RFQ, customer ne quotation kholi, reply aaya, ticket mila — sab yahan.", "New RFQ, a customer opened your quotation, a reply, a ticket for you — all here.") },
  { sel: nav("team"), mgr: true, ic: "👥", t: L("Team (Manager)", "Team (Manager)"),
    d: L("Naye log jodo, role aur pages do, target set karo.", "Add people, give roles and pages, set targets.") },
  { sel: nav("daily"), mgr: true, ic: "📊", t: L("Daily report + 5:50 summary", "Daily report + 5:50 summary"),
    d: L("Kaun kitni calls, quotations, kaun late — aur roz shaam 5:50 ka summary phone pe.", "Who made how many calls and quotations, who's behind — and a 5:50 pm summary on your phone.") },
  { sel: ".side-foot .me", ic: "📲", t: L("Aapka profile — phone notification ON karo", "Your profile — turn on phone notifications"),
    d: L("Naam, signature, password — aur “Notification ON karo” ek baar, taaki zaroori cheez phone pe aaye. Ye guide bhi yahin se dobara dekh sakte ho.",
      "Name, signature, password — and turn on notifications once so important things reach your phone. You can replay this guide from here too.") },
  { ic: "🚀", t: L("Bas! Ab shuru karo", "That's it — let's go"),
    d: L("Shuru karo “Aaj ki calls” se. Kuch samajh na aaye toh apne Manager se poochho.", "Start with “Today's calls”. Stuck? Ask your manager.") },
];

const visible = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth; };

export function startTour({ replay = false } = {}) {
  if (document.querySelector(".tour")) return;
  const steps = STEPS().filter((s) => (!s.mgr || isMgr()) && (!s.sel || document.querySelector(s.sel)));
  let i = 0;
  const root = document.createElement("div");
  root.className = "tour"; root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true"); root.setAttribute("aria-label", L("CRM guide", "CRM guide"));
  root.innerHTML = `<div class="tour-hole"></div><div class="tour-card" tabindex="-1"></div>`;
  document.body.append(root);
  const hole = root.querySelector(".tour-hole"), card = root.querySelector(".tour-card");
  const prevFocus = document.activeElement;

  const place = () => {
    const s = steps[i], el = s.sel && document.querySelector(s.sel), on = visible(el);
    root.classList.toggle("centre", !on);
    if (on) {
      const r = el.getBoundingClientRect(), pad = 6;
      Object.assign(hole.style, { left: r.left - pad + "px", top: r.top - pad + "px", width: r.width + pad * 2 + "px", height: r.height + pad * 2 + "px" });
      const cw = Math.min(360, innerWidth - 24), ch = card.offsetHeight || 200;
      let x = r.right + 16, y = r.top - 8;                                  // right of the item (sidebar)
      if (x + cw > innerWidth - 12) { x = Math.min(Math.max(12, r.left + r.width / 2 - cw / 2), innerWidth - cw - 12); y = r.bottom + 14; }   // below (top bar)
      if (y + ch > innerHeight - 12) y = Math.max(12, (x === r.right + 16 ? innerHeight - ch - 12 : r.top - ch - 14));
      Object.assign(card.style, { left: x + "px", top: Math.max(12, y) + "px", width: cw + "px" });
    } else {
      Object.assign(hole.style, { left: innerWidth / 2 + "px", top: innerHeight / 2 + "px", width: "0px", height: "0px" });
      card.style.left = card.style.top = card.style.width = "";
    }
  };
  const draw = () => {
    const s = steps[i], last = i === steps.length - 1;
    card.innerHTML = `<div class="tour-ic" aria-hidden="true">${s.ic}</div><div class="tour-t">${h(s.t)}</div><div class="tour-d">${h(s.d)}</div>
      <div class="tour-f"><div class="tour-dots" aria-hidden="true">${steps.map((_, k) => `<i class="${k === i ? "on" : k < i ? "done" : ""}"></i>`).join("")}</div>
        <span class="tour-n">${i + 1}/${steps.length}</span>
        ${last ? "" : `<button type="button" class="btn sm ghost" data-tour="skip">${L("Skip", "Skip")}</button>`}
        ${i ? `<button type="button" class="btn sm" data-tour="back">${L("Peeche", "Back")}</button>` : ""}
        <button type="button" class="btn sm primary" data-tour="next">${last ? L("Shuru karo 🚀", "Let's go 🚀") : L("Aage →", "Next →")}</button></div>`;
    card.classList.remove("in"); void card.offsetWidth; card.classList.add("in");
    place(); requestAnimationFrame(place);
    card.querySelector('[data-tour="next"]').focus();
  };
  const done = () => {
    removeEventListener("resize", place); removeEventListener("keydown", key, true);
    root.classList.add("out"); setTimeout(() => root.remove(), 220);
    try { localStorage.setItem("crm_tour_" + S.me.id, "1"); } catch { /* private mode */ }
    if (!replay || !S.me.tour_done_at) { S.me.tour_done_at = new Date().toISOString(); sb.from("profiles").update({ tour_done_at: S.me.tour_done_at }).eq("id", S.me.id).then(() => {}, () => {}); }
    prevFocus?.focus?.();
  };
  const go = (d) => { const n = i + d; if (n < 0) return; if (n >= steps.length) return done(); i = n; draw(); };
  const key = (e) => {
    if (e.key === "Escape") { e.preventDefault(); done(); }
    else if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); go(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
    else if (e.key === "Tab") { e.preventDefault(); const b = [...card.querySelectorAll("button")]; const k = b.indexOf(document.activeElement); b[(k + (e.shiftKey ? -1 : 1) + b.length) % b.length]?.focus(); }
  };
  root.addEventListener("click", (e) => { const a = e.target.closest("[data-tour]")?.dataset.tour; if (a === "next") go(1); else if (a === "back") go(-1); else if (a === "skip") done(); });
  addEventListener("resize", place); addEventListener("keydown", key, true);
  draw();
}

// first login (or first time on this device for someone who never saw it): wait for a calm screen, then start
export function maybeTour() {
  let seen = !!S.me?.tour_done_at;
  try { seen = seen || localStorage.getItem("crm_tour_" + S.me.id) === "1"; } catch { /* ignore */ }
  if (seen) return;
  let tries = 0;
  const t = setInterval(() => {
    if (++tries > 40) return clearInterval(t);
    if (document.querySelector("[data-modal], .drawer, .tour") || document.hidden || !document.querySelector(".app")) return;
    clearInterval(t); startTour();
  }, 1500);
}
