// =====================================================================
//  Genesis CRM — app shell, router and all screens
// =====================================================================
import {
  sb, S, STATUSES, STATUS, OPEN_STATUSES, CATEGORIES, RFQ_STATUSES, ROLES, ROLE, SOURCES, OUTCOMES, OUTCOME,
  isAdmin, isMgr, h, inr, inrShort, num, initials, ago, dt, dOnly, openTab, telHref, waHref, isMobile, statusBadge, rfqBadge,
  userName, online, followBadge, toLocalInput, ic, toast, fail, modal, closeModal, confirmBox, formData, busy,
  toCSV, download, parseCSV, callFn, loadTeam, assignable, toastAction, friendly,
  HOOK, lockOf, canWork, lockBadge, claim, claimFailMsg, claimOkMsg, lockHistoryHtml, maskPhone, maskEmail, bannerCfg, bannerHtml, bannerUrl,
} from "./core.js";
import {
  openComposer, ensureWork, viewInbox, viewTemplates, viewRequests, askRelease, releasedMsg, dropsUsed, openHandover, toggleNotifications, unreadCounts,
  requestAccess, startOutlookAutoSync, outlookForget, outlookConnect, outlookReady, openChip, gmailSetup,
} from "./comms.js";
import { startLoginFx, MODES as FX_MODES } from "./login-fx.js";
import {
  viewProducts, viewRenewals, viewOrders, viewSupport, viewDaily, viewDuplicates, leadPanel, loadProducts, productDatalist, findProduct, prodLabel, quotedHint,
  marginHtml, shareQuote, quoteTrackHtml, orderFromQuote, ticketForm, ticketView,
} from "./biz.js";
import { CONFIG } from "./config.js";
import { SCRIPTS, SCRIPTS_EN } from "./data.js";
import { L, isEn, getLang, setLang, tr } from "./i18n.js";
import { richEditor, renderRich, textToHtml, RICH_MAX } from "./rte.js";
import { viewObf, openObf } from "./obf.js";
import { viewPurchase, openPo } from "./vpo.js";
import { checkQuote, cleanPhone, phoneOk, canonState, gstinInfo, STATE_NAMES } from "./qcheck.js";
import { htmlToPdf, elementToPdf, saveBlob } from "./qpdf.js";
import { dateState, dateRange, dateActive, dateBarHtml, wireDateBar, applyDates } from "./datebar.js";
import { fmtIN, fmtRound, amountWords } from "./qpick.js";
import { pushCard, pushResync } from "./push.js";
import { productPicker } from "./lprod.js";

const $ = (s, r = document) => r.querySelector(s);
// ---------- brand ----------
const APP = "Genesis Nova";
const STAR = `<svg viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="nvg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5eead4"/><stop offset=".6" stop-color="#7cc4ff"/><stop offset="1" stop-color="#fbbf24"/></linearGradient></defs><path fill="url(#nvg)" d="M16 1.5c1.1 7.4 3.4 11.6 14.5 14.5C19.4 18.9 17.1 23.1 16 30.5 14.9 23.1 12.6 18.9 1.5 16 12.6 13.1 14.9 8.9 16 1.5z"/></svg>`;
const TAGLINES = ["From first call to final invoice.", "Smart IT. Smarter sales.", "Every lead. Every device. One place.", "Powering the people who power IT."];
const FX_NAMES = { network: "Live IT network", circuit: "Circuit board", globe: "Connected globe", server: "Data centre fly-through", radar: "Security radar", laptop: "Exploded laptop", hex: "Hex mesh", fiber: "Fiber optic" };
const EYE = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>`;
let fx = null;
const brandCache = () => { try { return JSON.parse(localStorage.getItem("crm_brand") || "{}"); } catch { return {}; } };
// ---------- PWA: installable app (only on https; never during local tests) ----------
let installEvt = null;
if ("serviceWorker" in navigator && location.protocol === "https:") {
  const hadSW = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then((r) => {
    r.update().catch(() => {});
    // a tab left open for hours / the installed phone app: look for a new version every 10 min
    // and whenever the app comes back to the front (at most once a minute)
    let last = Date.now();
    const check = () => { if (Date.now() - last > 60e3) { last = Date.now(); r.update().catch(() => {}); } };
    setInterval(() => { last = 0; check(); }, 10 * 60e3);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
    addEventListener("focus", check);
  }).catch(() => {});
  // a new version was deployed → load it (now if the user is idle, else ask + on the next page change)
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadSW) return;
    const busyNow = () => document.querySelector("[data-modal], .drawer") || document.activeElement?.matches("input, textarea, select");
    if (!busyNow()) return location.reload();
    toastAction(L("🔄 CRM ka naya version aa gaya", "🔄 A new version of the CRM is ready"), L("Abhi reload", "Reload now"), () => location.reload(), 60000);
    addEventListener("hashchange", () => location.reload(), { once: true });
  });
  // a phone notification was tapped while the app is open → go to that ticket
  navigator.serviceWorker.addEventListener("message", (e) => { const hsh = e.data?.type === "open" && String(e.data.hash || ""); if (hsh && /^#\/[a-z]/.test(hsh)) location.hash = hsh; });
}
addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; const b = document.getElementById("installBtn"); if (b) b.hidden = false; });
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const root = $("#root");

// ---------------------------------------------------------------------
//  Theme
// ---------------------------------------------------------------------
function applyTheme(t) {
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
}
try { applyTheme(localStorage.getItem("crm_theme")); } catch { /* storage blocked */ }
const isDark = () => document.documentElement.dataset.theme === "dark" ||
  (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
function toggleTheme() {
  const t = isDark() ? "light" : "dark"; applyTheme(t);
  try { localStorage.setItem("crm_theme", t); } catch { /* ignore */ }
  const b = $("#themeBtn"); if (b) b.innerHTML = ic(isDark() ? "sun" : "moon");
}

// ---------------------------------------------------------------------
//  Auth screens
// ---------------------------------------------------------------------
let loginMode = "login";
const langSwitch = () => `<div class="langsw" role="group" aria-label="Language"><button type="button" class="${isEn() ? "on" : ""}" data-act="lang" data-v="en">English</button><button type="button" class="${isEn() ? "" : "on"}" data-act="lang" data-v="hinglish">Hinglish</button></div>`;
function renderLogin(mode = "login", msg = "") {
  loginMode = mode;
  stopApp();
  const bc = brandCache(), tag = bc.tagline || TAGLINES[0];
  root.innerHTML = `
  <div class="auth nova-auth">
    <div class="auth-art">
      <canvas id="authFx" aria-hidden="true"></canvas>
      <div class="auth-brand">
        <div class="row" style="gap:12px"><div class="nlogo">${STAR}</div><span class="eyebrow">Genesis Infoserve</span></div>
        <h1 class="nword">GENESIS <span>NOVA</span></h1>
        <p class="ntag" id="authTag">${h(tag)}</p>
        <p class="nsub">${L("Leads, RFQs, quotations, orders aur support — poori Genesis team ka ek workspace.", "Leads, RFQs, quotations, orders and support — one workspace for the whole Genesis team.")}</p>
      </div>
      <small class="auth-copy">© ${new Date().getFullYear()} Genesis Infoserve Pvt. Ltd.</small>
    </div>
    <div class="auth-form"><div class="auth-lang">${langSwitch()}</div>
      ${mode === "login" ? `
      <form id="loginF" autocomplete="on">
        <h1>${L("Welcome back", "Welcome back")}</h1><p class="mu">${L("Apne office account se login karo.", "Sign in with your office account.")}</p>
        <label class="f" for="em">Email</label><input class="input" id="em" type="email" autocomplete="username" required maxlength="200">
        <label class="f" for="pw">Password</label><div class="pwf"><input class="input" id="pw" type="password" autocomplete="current-password" required maxlength="72"><button type="button" class="eye" id="eye" aria-label="Show password">${EYE}</button></div>
        <div class="err" id="err">${h(msg)}</div>
        <button class="btn primary nova-btn"><span>${L("Login karo", "Sign in")}</span></button>
        <p class="auth-links"><a href="#" id="forgot">${L("Password bhool gaye?", "Forgot password?")}</a></p>
        <p class="secure">🔒 ${L("Encrypted login · sirf Genesis team ke liye", "Encrypted sign-in · Genesis team only")}</p>
      </form>` : mode === "forgot" ? `
      <form id="forgotF">
        <h1>Password reset</h1><p class="mu">Email daalo — reset link bhejenge.</p>
        <label class="f" for="em">Email</label><input class="input" id="em" type="email" required>
        <div class="err" id="err">${h(msg)}</div>
        <button class="btn primary nova-btn"><span>Reset link bhejo</span></button>
        <p style="text-align:center;margin-top:14px"><a href="#" id="back">← Login</a></p>
      </form>` : `
      <form id="newPwF">
        <h1>Naya password</h1><p class="mu">Kam se kam 10 characters, letters + number.</p>
        <label class="f" for="pw">New password</label><input class="input" id="pw" type="password" autocomplete="new-password" required minlength="10">
        <label class="f" for="pw2">Confirm</label><input class="input" id="pw2" type="password" autocomplete="new-password" required>
        <div class="err" id="err">${h(msg)}</div>
        <button class="btn primary nova-btn"><span>Save password</span></button>
      </form>`}
    </div>
  </div>`;
  const err = (m) => { $("#err").textContent = m; };
  fx?.stop(); fx = null;
  const cv = $("#authFx");
  if (cv) { try { fx = startLoginFx(cv, bc.login_animation || "server"); } catch { /* old browser: static background */ } }
  (brandP ||= sb.rpc("public_branding").then((r) => r, () => ({}))).then(({ data }) => {
    if (!data) return;
    try { localStorage.setItem("crm_brand", JSON.stringify(data)); } catch { /* ignore */ }
    if (data.login_animation && data.login_animation !== (bc.login_animation || "server")) fx?.setMode(data.login_animation);
    const t = $("#authTag"); if (t && data.tagline) t.textContent = data.tagline;
  }, () => {});
  $("#eye")?.addEventListener("click", () => { const p = $("#pw"); p.type = p.type === "password" ? "text" : "password"; });
  $("#loginF")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const k = "crm_lock", lock = JSON.parse(sessionStorage.getItem(k) || '{"n":0,"t":0}');
    if (Date.now() < lock.t) return err(L(`Bahut galat attempts. ${Math.ceil((lock.t - Date.now()) / 1000)} sec ruko.`, `Too many wrong attempts. Wait ${Math.ceil((lock.t - Date.now()) / 1000)} seconds.`));
    const b = e.submitter; b.disabled = true;
    const { error } = await sb.auth.signInWithPassword({ email: $("#em").value.trim(), password: $("#pw").value });
    b.disabled = false;
    if (error) {
      lock.n++; if (lock.n >= 5) { lock.t = Date.now() + 60e3 * Math.min(10, lock.n - 4); }
      sessionStorage.setItem(k, JSON.stringify(lock));
      return err(/invalid/i.test(error.message) ? "Email ya password galat hai" : error.message);
    }
    sessionStorage.removeItem(k);
    fx?.surge();
  });
  $("#forgot")?.addEventListener("click", (e) => { e.preventDefault(); renderLogin("forgot"); });
  $("#back")?.addEventListener("click", (e) => { e.preventDefault(); renderLogin(); });
  $("#forgotF")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await sb.auth.resetPasswordForEmail($("#em").value.trim(), { redirectTo: location.origin + location.pathname });
    err(""); $("#forgotF").innerHTML = `<h1>Email check karo</h1><p class="mu">Agar ye email registered hai to reset link aa jayega.</p><p><a href="#" id="back">← Login</a></p>`;
    $("#back").onclick = (ev) => { ev.preventDefault(); renderLogin(); };
  });
  $("#newPwF")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const p = $("#pw").value;
    if (p !== $("#pw2").value) return err("Dono password same nahi hain");
    if (p.length < 10 || !/[a-z]/i.test(p) || !/\d/.test(p)) return err("10+ characters, letters aur number dono");
    const { error } = await sb.auth.updateUser({ password: p });
    if (error) return err(error.message);
    toast("Password update ho gaya ✔"); history.replaceState(null, "", location.pathname); start();
  });
}

function renderPending() {
  stopApp();
  root.innerHTML = `<div class="auth-form" style="min-height:100vh"><div style="max-width:420px;text-align:center">
    <div class="logo" style="margin:auto">G</div><h1>Account activate nahi hai</h1>
    <p class="mu">Aapka login ban gaya hai, par Admin ne abhi tak access nahi diya. Admin se bolo Team page se aapko activate kare.</p>
    <button class="btn" id="lo">${ic("logout")} Logout</button></div></div>`;
  $("#lo").onclick = () => sb.auth.signOut();
}

// ---------------------------------------------------------------------
//  App lifecycle
// ---------------------------------------------------------------------
let timers = [], channel = null, started = false;
let bootRest = null;   // team + settings, asked for together with my profile (one round trip instead of three)
const teamAndSettings = () => Promise.all([loadTeam().then(() => null, (e) => e), sb.from("settings").select("key, value")]);
function stopApp() {
  bootRest = null;
  timers.forEach(clearInterval); timers = [];
  if (channel) { sb.removeChannel(channel); channel = null; }
  started = false; closeModal(); closeDrawer();
}

let brandP = null; // the login screen can draw twice at boot → ask for the branding once
const ME_COLS = "id, email, full_name, role, active, daily_target, categories, phone, designation, signature, mail_provider, lang, last_seen, pages, mail_webapp";
async function start() {
  fx?.stop(); fx = null;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return renderLogin();
  S.session = session;
  // my profile, the team and the settings in one round trip (they used to load one after the other);
  // a second start() running at the same time shares the same request
  if (!started && bootRest?.uid !== session.user.id) bootRest = { uid: session.user.id, p: teamAndSettings() };
  const { data: me, error } = await sb.from("profiles").select(ME_COLS)
    .eq("id", session.user.id).single();
  if (error || !me) { bootRest = null; return renderLogin("login", "Profile load nahi hua: " + (error?.message || "")); }
  if (!me.active) { bootRest = null; return renderPending(); }
  S.me = me; meAt = Date.now(); // just loaded → the focus / visibility re-check can wait
  // language: an explicit choice on this device wins (and is saved); otherwise follow the profile
  let chosen = null; try { chosen = localStorage.getItem("crm_lang"); } catch { /* ignore */ }
  if (chosen && chosen !== me.lang) { me.lang = getLang(); sb.from("profiles").update({ lang: me.lang }).eq("id", me.id).then(() => {}, () => {}); }
  else if (!chosen && me.lang && me.lang !== getLang()) setLang(me.lang);
  if (started) return;
  started = true;
  const rest = bootRest?.uid === me.id ? bootRest.p : teamAndSettings();
  bootRest = null;
  const [teamErr, { data: st }] = await rest;
  if (teamErr) fail(teamErr);
  S.settings = Object.fromEntries((st || []).map((r) => [r.key, r.value]));
  renderShell();
  route();
  loadAnnouncement();
  const beat = () => sb.rpc("heartbeat").then(() => {}, () => {});
  beat();
  timers.push(setInterval(() => !document.hidden && beat(), 60e3));
  timers.push(setInterval(() => !document.hidden && loadTeam().then(updateOnline).catch(() => {}), 120e3));
  timers.push(setInterval(() => !document.hidden && refreshBadges(), 90e3));
  timers.push(setInterval(() => !document.hidden && reloadMe(), 120e3));      // safety net if the live signal was missed
  subscribeRealtime();
  startOutlookAutoSync();
  pushResync();            // this phone's notifications follow whoever is logged in now
}
HOOK.openLead = (id, o) => openLead(id, o);
HOOK.softRefresh = () => softRefresh();
HOOK.refreshBadges = () => refreshBadges();
HOOK.openRfq = (r) => rfqForm(r);
HOOK.newQuote = (q0) => quoteEditor(q0);
// Inbox → "Make ticket": the new ticket opens right away (with the mail's pictures / files)
HOOK.openTicket = (t) => ticketForm(t, (row) => row?.id && ticketView(row.id));
HOOK.go = (link) => { if (location.hash === link) route(); else location.hash = link; };

sb.auth.onAuthStateChange((ev, session) => {
  if (ev === "PASSWORD_RECOVERY") return renderLogin("newpw");
  if (ev === "SIGNED_OUT") outlookForget();
  if (ev === "SIGNED_OUT" || !session) { S.me = null; return renderLogin(); }
  if (ev === "SIGNED_IN" && !started) setTimeout(start, 0);
});

// idle auto-logout
let idleT;
const resetIdle = () => {
  clearTimeout(idleT);
  idleT = setTimeout(() => { if (S.me) { sb.auth.signOut(); toast("Inactivity ki wajah se logout"); } }, (CONFIG.IDLE_LOGOUT_MIN || 30) * 60e3);
};
["click", "keydown", "touchstart", "scroll"].forEach((e) => addEventListener(e, resetIdle, { passive: true }));
resetIdle();

// ---------------------------------------------------------------------
//  Shell
// ---------------------------------------------------------------------
const NAV = [
  ["Workspace"],
  ["dashboard", "Dashboard", "home"],
  ["today", "Aaj ki calling", "phone"],
  ["leads", "Leads", "list"],
  ["pipeline", "Pipeline", "kanban"],
  ["rfqs", "RFQs", "inbox"],
  ["inbox", "Inbox (replies)", "mail"],
  ["tasks", "Follow-ups & tasks", "check"],
  ["quotes", "Quotations", "file"],
  ["obf", "OBF (order booking)", "check"],
  ["orders", "Orders & payments", "rupee"],
  ["purchase", "Vendor POs", "tag"],
  ["renewals", "Renewals / AMC", "refresh"],
  ["support", "Support tickets", "tool"],
  ["products", "Products & prices", "tag"],
  ["templates", "Email / WA templates", "copy"],
  ["requests", "Locks & requests", "shield"],
  ["Insights"],
  ["reports", "Reports", "chart"],
  ["sales", "Customer sales", "rupee"],
  ["daily", "Daily report", "clock"],
  ["Admin", () => isMgr()],
  ["team", "Team", "users", () => isAdmin()],
  ["automation", "Automation", "bot", () => isMgr()],
  ["company", "Company settings", "file", () => isMgr()],
  ["import", "Data import", "upload", () => isMgr()],
  ["duplicates", "Duplicate cleaner", "merge", () => isMgr()],
  ["audit", "Audit log", "shield", () => isAdmin()],
];
const TITLES = Object.fromEntries(NAV.filter((n) => n.length >= 3 && typeof n[1] === "string").map((n) => [n[0], n[1]]));

// ---- page access: which menu pages a person can open ----
// pages any role can be given (the Admin section stays tied to the role)
const PAGEABLE = NAV.filter((n) => n.length >= 3 && typeof n[1] === "string" && !n[3]).map((n) => n[0]);
// default when an Admin hasn't picked pages for someone (profiles.pages is null)
const ROLE_PAGES = {
  telecaller: ["dashboard", "today", "leads", "tasks", "quotes", "obf", "templates", "requests", "inbox"],
  presales: ["dashboard", "today", "leads", "rfqs", "inbox", "tasks", "quotes", "obf", "support", "products", "templates", "requests"],
  sales: ["dashboard", "today", "leads", "pipeline", "rfqs", "inbox", "tasks", "quotes", "obf", "orders", "purchase", "renewals", "support", "products", "templates", "requests", "reports", "sales"],
};
const rolePages = (role) => (["admin", "manager"].includes(role) ? PAGEABLE : ROLE_PAGES[role] || PAGEABLE);
function canSee(r) {
  if (!PAGEABLE.includes(r) || isAdmin()) return true;
  return (S.me?.pages || rolePages(S.me?.role)).includes(r);
}
const firstPage = () => PAGEABLE.find(canSee) || "dashboard";

const navHtml = () => NAV.map((n) => {
          if (n.length <= 2 && typeof n[0] === "string" && !n[2]) return (n[1] && !n[1]()) ? "" : `<div class="nav-h">${h(n[0])}</div>`;
          if (n[3] && !n[3]()) return "";
          if (!canSee(n[0])) return "";
          return `<a href="#/${n[0]}" data-r="${n[0]}">${ic(n[2])}<span>${h(n[1])}</span>${n[0] === "rfqs" ? '<span class="badge info" id="rfqBadge" hidden></span>' : ""}${n[0] === "today" ? '<span class="badge warn" id="dueBadge" hidden></span>' : ""}${n[0] === "inbox" ? '<span class="badge acc" id="inboxBadge" hidden></span>' : ""}${n[0] === "requests" ? '<span class="badge warn" id="reqBadge" hidden></span>' : ""}${n[0] === "support" ? '<span class="badge warn" id="tktBadge" hidden></span>' : ""}${n[0] === "renewals" ? '<span class="badge bad" id="renBadge" hidden></span>' : ""}${n[0] === "obf" ? '<span class="badge warn" id="obfBadge" hidden></span>' : ""}</a>`;
        }).join("");
function tidyNav() {
  $$(".nav .nav-h").forEach((hd) => { hd.hidden = false; const nx = hd.nextElementSibling; if (!nx || nx.classList.contains("nav-h")) hd.hidden = true; });
  $$(".nav a").forEach((a) => a.classList.toggle("on", a.dataset.r === S.route));
}
// my own access (role / pages / target) was changed by an Admin → pick it up without a reload
let meAt = 0, meP = null;
async function reloadMe(force = false) {
  if (!S.me || (!force && Date.now() - meAt < 30000)) return;
  if (meP) return meP;
  meP = (async () => {
    const { data: me } = await sb.from("profiles").select(ME_COLS).eq("id", S.me.id).maybeSingle();
    if (!me) return;
    if (!me.active) return renderPending();
    const key = (x) => JSON.stringify([x.role, x.pages, x.categories, x.daily_target, x.full_name]);
    const changed = key(me) !== key(S.me);
    Object.assign(S.me, me);
    if (!changed) return;
    await loadTeam().catch(() => {});
    const nav = $(".nav"); if (nav) { nav.innerHTML = navHtml(); tidyNav(); }
    const rl = $(".side-foot .me small"); if (rl) rl.textContent = ROLE[S.me.role];
    refreshBadges();
    const navItem = NAV.find((n) => n[0] === S.route);
    if (!canSee(S.route) || (navItem?.[3] && !navItem[3]())) route(); else softRefresh(200);
  })().catch(() => {}).finally(() => { meP = null; meAt = Date.now(); });
  return meP;
}
addEventListener("visibilitychange", () => { if (!document.hidden) reloadMe(); });
addEventListener("focus", () => reloadMe());

function renderShell() {
  PAGE_CACHE.clear();
  root.innerHTML = `
  <div class="app">
    <aside class="side" id="side">
      <div class="brand"><div class="logo nlogo-s">${STAR}</div><div><b class="bword">GENESIS NOVA</b><small>by Genesis Infoserve</small></div></div>
      <nav class="nav" aria-label="Main">
        ${navHtml()}
      </nav>
      <div class="side-foot">
        <div class="me"><div class="avatar">${h(initials(S.me.full_name))}</div><div style="min-width:0;flex:1"><b>${h(S.me.full_name)}</b><small>${h(ROLE[S.me.role])}</small></div>
          <button class="btn ghost icon" data-act="profile" title="Profile" aria-label="Profile">${ic("users")}</button>
          <button class="btn ghost icon" data-act="logout" title="Logout" aria-label="Logout">${ic("logout")}</button></div>
      </div>
    </aside>
    <div class="main">
      <div id="nprog" aria-hidden="true"></div>
      <header class="top">
        <button class="btn ghost icon menu-btn" data-act="menu" aria-label="Menu">${ic("menu")}</button>
        <h1 id="title"></h1><div class="sp"></div>
        <button class="search-btn" data-act="palette">${ic("search")}<span>Search leads…</span><kbd>Ctrl K</kbd></button>
        <a class="lockchip" id="lockChip" href="#/requests" hidden title="${h(L("Mere active locks / limit", "My active locks / limit"))}">🔒 <b>0</b><span>/150</span><em hidden></em></a>
        <button class="btn ghost icon" data-act="history" title="${L("Undo / Recent changes (Ctrl+Z)", "Undo / Recent changes (Ctrl+Z)")}" aria-label="Undo and recent changes">${ic("history")}</button>
        <button class="btn ghost icon bell" id="bellBtn" data-act="bell" aria-label="Notifications">🔔<span class="badge bad" id="bellBadge" hidden></span></button>
        <button class="btn sm" id="installBtn" data-act="install" ${installEvt ? "" : "hidden"} title="${L("Phone / PC pe app install karo", "Install as an app on phone / PC")}">📲 ${L("App install", "Install app")}</button>
        ${langSwitch()}
        <button class="btn ghost icon" id="themeBtn" data-act="theme" aria-label="Toggle theme">${ic(isDark() ? "sun" : "moon")}</button>
      </header>
      <div id="banner"></div><div id="olBanner"></div>
      <main class="page" id="page" tabindex="-1"></main>
    </div>
  </div>`;
  tidyNav();      // hide menu headings left with no pages under them (page access)
  refreshBadges();
}

function updateOnline() { if (S.route === "team" || S.route === "dashboard") softRefresh(); }

// header badges: ONE server call (badge_counts) instead of seven; plain page changes reuse a result younger than 8 s
let badgeAt = 0, badgeP = null;
async function refreshBadges(force = true) {
  if (!S.me) return;
  if (!force && Date.now() - badgeAt < 8000) return;
  if (badgeP) return badgeP;
  badgeP = (async () => {
    const { data, error } = await sb.rpc("badge_counts");
    if (error || !data) return;
    const set = (id, n) => { const b = $(id); if (b) { b.hidden = !n; b.textContent = n > 99 ? "99+" : n || ""; } };
    set("#rfqBadge", data.rfqs); set("#dueBadge", data.due); set("#inboxBadge", data.replies); set("#bellBadge", data.notif);
    set("#reqBadge", data.requests); set("#tktBadge", data.tickets); set("#renBadge", data.renewals); set("#obfBadge", data.obf);
    const c = $("#lockChip");
    if (c) {
      c.hidden = !data.locks && !data.expiring; c.querySelector("b").textContent = data.locks || 0; c.querySelector("span").textContent = "/" + (data.lock_max || 150);
      c.classList.toggle("hot", data.locks >= (data.lock_max || 150) * 0.9);
      const e = c.querySelector("em"); e.hidden = !data.expiring; e.textContent = "⏳" + (data.expiring || "");
      c.title = L(`${data.locks || 0} / ${data.lock_max} active locks${data.expiring ? ` · ${data.expiring} kal tak khatam` : ""}`, `${data.locks || 0} / ${data.lock_max} active locks${data.expiring ? ` · ${data.expiring} expire within 24h` : ""}`);
    }
  })().catch(() => {}).finally(() => { badgeP = null; badgeAt = Date.now(); });
  return badgeP;
}

async function loadAnnouncement() {
  const { data } = await sb.from("announcements").select("id, body, created_at, created_by").order("created_at", { ascending: false }).limit(1);
  const a = data?.[0], el = $("#banner");
  if (!el) return;
  let dismissed = ""; try { dismissed = localStorage.getItem("crm_ann") || ""; } catch { /* ignore */ }
  if (!a || dismissed === a.created_at || Date.now() - new Date(a.created_at).getTime() > 3 * 864e5) { el.innerHTML = ""; return; }
  el.innerHTML = `<div class="banner">📢 <div><b>${h(a.created_by ? userName(a.created_by) : "System")}:</b> <span ${a.created_by ? "data-raw" : ""}>${h(a.body)}</span></div><span class="right row" style="gap:6px;flex-wrap:nowrap">${isMgr() ? `<button class="btn ghost sm" data-act="delAnn" data-id="${a.id}" title="${h(L("Sab ke liye hatao", "Remove for everyone"))}">${ic("trash")} ${L("Delete", "Delete")}</button>` : ""}<button class="btn ghost sm" data-act="dismissAnn" data-v="${h(a.created_at)}" title="${h(L("Sirf mere liye chhupao", "Hide just for me"))}">Dismiss</button></span></div>`;
}

// ---------------------------------------------------------------------
//  Router
// ---------------------------------------------------------------------
const VIEWS = {};
const PAGE_CACHE = new Map();      // route → last rendered HTML (shown instantly on the next visit while fresh data loads)
function route() {
  if (!S.me) return;
  const [r, ...rest] = (location.hash.replace(/^#\/?/, "") || "dashboard").split("/");
  S.route = VIEWS[r] ? r : "dashboard";
  S.params = { id: rest[0] };
  const navItem = NAV.find((n) => n[0] === S.route);
  if (navItem?.[3] && !navItem[3]()) { location.hash = "#/" + firstPage(); return; }
  if (!canSee(S.route)) { if (S.route !== firstPage() && Date.now() - (route.warned || 0) > 2000 && (route.warned = Date.now())) toast(L("Ye page aapke liye band hai — Admin se access maango", "You don't have access to this page — ask your Admin"), true); location.hash = "#/" + firstPage(); return; }
  $$(".nav a").forEach((a) => a.classList.toggle("on", a.dataset.r === S.route));
  $("#title").textContent = TITLES[S.route] || "";
  document.title = tr(TITLES[S.route] || APP) + " · " + APP;
  $("#side")?.classList.remove("open");
  // every page gets a fresh container: a slow page that finishes late writes into its own
  // (now detached) box and can never overwrite the page the user has moved on to
  const old = $("#page"), page = old.cloneNode(false);
  if (old.dataset.r && !old.querySelector(":scope > .empty:only-child, :scope > .skel") && old.innerHTML.length < 600000) PAGE_CACHE.set(old.dataset.r, old.innerHTML);
  const cached = !S.params.id && PAGE_CACHE.get(S.route);
  page.dataset.r = S.route; page.classList.toggle("stale", !!cached);
  page.innerHTML = cached || SKELETON;
  old.replaceWith(page);
  closeDrawer();
  refreshBadges(false);
  const bar = $("#nprog"), tok = (route.tok = (route.tok || 0) + 1);
  bar?.classList.remove("done"); bar?.classList.add("go");
  const barDone = () => { if (route.tok !== tok || !bar) return; bar.classList.replace("go", "done"); };
  Promise.resolve(VIEWS[S.route](page, false, S.params)).finally(barDone).then(() => {
    page.classList.remove("stale");
    if (!page.isConnected) return;
    if (!cached) enterAnim(page);
    if (S.params.id && S.route === "leads") openLead(+S.params.id);
    if (S.params.id && S.route === "rfqs") ACT.rfq({ dataset: { id: S.params.id } });
    if (S.params.id && S.route === "quotes") ACT.quote({ dataset: { id: S.params.id } });
    if (S.params.id && S.route === "obf") openObf(+S.params.id);
    if (S.params.id && S.route === "purchase") openPo(+S.params.id);
  }).catch((e) => { page.classList.remove("stale"); if (cached && page.isConnected) page.innerHTML = `<div class="empty">—</div>`; fail(e); });
}
addEventListener("hashchange", route);
// shown while a page loads for the first time: grey bars in the shape of a toolbar + table
const SKELETON = `<div class="skel" aria-busy="true" aria-label="Loading"><div class="sk-bar"><i></i><i></i><i></i></div>${'<div class="sk-row"><i></i><i></i><i></i><i></i></div>'.repeat(7)}</div>`;
// cards fade up in sequence and whole-number KPIs count up — only when a page is opened
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
function enterAnim(page) {
  if (reduceMotion()) return;
  page.classList.remove("enter"); void page.offsetWidth; page.classList.add("enter");
  setTimeout(() => page.classList.remove("enter"), 500);
  $$(".kpi .v", page).forEach((v) => {
    const m = v.textContent.trim().match(/^(₹?)([\d,]+)$/); if (!m) return;
    const to = +m[2].replace(/,/g, ""); if (!to || to > 1e7) return;
    const t0 = performance.now(), fmt = (n) => m[1] + n.toLocaleString("en-IN");
    const step = (t) => { const p = Math.min(1, (t - t0) / 450), e = 1 - Math.pow(1 - p, 3); v.textContent = fmt(Math.round(to * e)); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}

let softT;
// re-draw the open page quickly; if the user is typing / has a popup open, try again shortly
let softTries = 0;
function softRefresh(delay = 300) {
  clearTimeout(softT);
  softT = setTimeout(() => {
    if (document.querySelector("[data-modal], .drawer") || document.activeElement?.matches("input,textarea,select")) {
      if (softTries++ < 40) softRefresh(1500);
      return;
    }
    softTries = 0;
    const page = $("#page"); if (page && VIEWS[S.route]) Promise.resolve(VIEWS[S.route](page, true)).catch(() => {});
  }, delay);
}

// ---------------------------------------------------------------------
//  Realtime
// ---------------------------------------------------------------------
// table -> pages that show it (leads inserts/updates are handled in subscribeRealtime)
const LIVE = {
  tasks: ["tasks", "today", "dashboard"], quotations: ["quotes", "dashboard", "daily"], products: ["products"],
  orders: ["orders"], invoices: ["orders"], payments: ["orders", "daily"], renewals: ["renewals"], tickets: ["support"],
  message_templates: ["templates"], lock_requests: ["requests"], rfqs: ["rfqs", "dashboard"],
};
// a deleted row fades out at once on every screen (then the page re-draws with fresh numbers)
const GONE = {
  leads: (id) => `[data-act="lead"][data-id="${id}"]`, quotations: (id) => `[data-act="quote"][data-id="${id}"]`,
  rfqs: (id) => `[data-act="rfq"][data-id="${id}"]`, invoices: (id) => `[data-iid="${id}"]`, orders: (id) => `[data-oid="${id}"]`,
  products: (id) => `[data-pid="${id}"]`, renewals: (id) => `[data-rid="${id}"]`, tickets: (id) => `[data-tid="${id}"]`,
  tasks: (id) => `[data-tdone="${id}"]`,
};
function fadeOut(row) { row.classList.add("rt-gone"); setTimeout(() => row.parentNode && row.parentNode.removeChild(row), 320); }
// a change I just made in this tab comes back over realtime ~1 s later — don't redraw a second time
const myEcho = () => Date.now() - (window.__crmWriteAt || 0) < 2500;
// ---- realtime pacing: with the whole team working, changes arrive every few seconds.
// My own change shows at once; a teammate's change redraws only what it touches; summary pages
// (dashboard, pipeline) redraw at most every 20 s; nothing runs while the tab is in the background.
let bgDirty = false, lazyT = null, lazyAt = 0, badgeT = null;
function badgesSoon(ms = 1500) {
  if (document.hidden) { bgDirty = true; return; }
  if (!badgeT) badgeT = setTimeout(() => { badgeT = null; refreshBadges(); }, ms);
}
function lazyRefresh(gap = 20000) {
  if (document.hidden) { bgDirty = true; return; }
  if (lazyT) return;
  lazyT = setTimeout(() => { lazyT = null; lazyAt = Date.now(); softRefresh(0); }, Math.max(1500, gap - (Date.now() - lazyAt)));
}
function liveRefresh(ms) { if (document.hidden) { bgDirty = true; return; } softRefresh(ms); }
const onScreen = (table, id) => id != null && !!GONE[table] && !!document.querySelector(GONE[table](id));
const BADGE_TABLES = new Set(["rfqs", "lock_requests", "tickets", "renewals"]);
const SUMMARY = new Set(["dashboard", "pipeline", "daily", "reports"]);
addEventListener("visibilitychange", () => { if (!document.hidden && bgDirty) { bgDirty = false; softRefresh(150); refreshBadges(); } });
function onLive(table, routes, p) {
  if (p.eventType !== "DELETE" && myEcho()) { badgesSoon(400); return; }
  if (p.eventType === "DELETE") {
    const id = p.old?.id;
    const sel = id == null ? null : GONE[table]?.(id);
    if (sel) $$(sel).forEach((n) => {
      const row = n.tagName === "TR" || n.classList.contains("pitem") ? n : n.closest("tr, .row, .pitem") || n;
      if (!row.closest(".drawer, [data-modal]")) fadeOut(row);
    });
    const d = document.querySelector(".drawer");
    if (table === "leads" && d && id != null && +d.dataset.id === id) { closeDrawer(); toast(L("🗑 Ye lead delete ho gaya", "🗑 This lead was deleted")); }
    if (table === "quotations" && document.querySelector(`[data-modal] [data-act="delQuote"][data-id="${id}"]`)) { closeModal(); toast(L("🗑 Ye quotation delete ho gayi", "🗑 This quotation was deleted")); }
    if (table === "leads" && ["leads", "today", "pipeline", "dashboard", "tasks"].includes(S.route)) liveRefresh(450);
  }
  if (routes.includes(S.route)) { if (SUMMARY.has(S.route)) lazyRefresh(); else liveRefresh(600); }
  if (BADGE_TABLES.has(table) || table === "leads") badgesSoon();
}
function subscribeRealtime() {
  channel = sb.channel("crm")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "rfqs" }, (p) => {
      toast(`📨 Naya RFQ: ${p.new.company} — ${p.new.product || ""}`); badgesSoon(300);
      if (["rfqs", "dashboard"].includes(S.route)) liveRefresh(300);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, (p) => {
      const d = document.querySelector(".drawer");
      if (myEcho()) { badgesSoon(400); return; }     // my own change coming back: already on screen
      // someone else took / released the lead that is open on my screen → refresh it
      if (p.eventType === "UPDATE" && d && +d.dataset.id === p.new.id && p.old && "owner_id" in p.old && p.old.owner_id !== p.new.owner_id
          && !document.activeElement?.matches(".drawer input, .drawer textarea") && !document.querySelector("[data-modal]")) {
        if (p.new.owner_id && p.new.owner_id !== S.me.id) toast(`🔒 ${userName(p.new.owner_id)} ne ye lead lock kar liya`);
        openLead(p.new.id, { queue: d.dataset.queue === "1" });
      }
      // mine (now or before) → redraw at once; a teammate's → only if it is on my screen, summaries every 20 s
      const id = p.new?.id ?? p.old?.id, mine = [p.new?.owner_id, p.old?.owner_id].includes(S.me.id);
      if (mine) { badgesSoon(); if (["leads", "today", "pipeline", "dashboard", "tasks"].includes(S.route)) liveRefresh(300); return; }
      if (SUMMARY.has(S.route)) lazyRefresh();
      else if (["leads", "today", "tasks"].includes(S.route) && (onScreen("leads", id) || (S.route === "leads" && p.eventType === "INSERT"))) liveRefresh(1500);
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${S.me.id}` }, (p) => {
      toast(p.new.title + (p.new.body ? " — " + p.new.body : ""));
      badgesSoon(300);
      if (p.new.kind === "access") reloadMe(true);
      if (p.new.kind === "mail_open" && S.route === "inbox") liveRefresh(300);
      if (S.route === "requests" && p.new.kind === "lock_request") softRefresh();
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "email_messages", filter: `user_id=eq.${S.me.id}` }, () => {
      if (["inbox", "dashboard"].includes(S.route)) liveRefresh(300);
      badgesSoon(300);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "announcements" }, () => loadAnnouncement())
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "email_outbox", filter: `user_id=eq.${S.me.id}` }, (p) => {
      if (p.new.status === "sent") toast(L(`✅ Mail chala gaya: ${p.new.subject}`, `✅ Mail sent: ${p.new.subject}`));
      else if (p.new.status === "failed") toast(L(`❌ Mail nahi gaya: ${p.new.subject} — ${p.new.error || ""}`, `❌ Mail failed: ${p.new.subject} — ${p.new.error || ""}`), true);
    });
  // everything else: any add / edit / delete on another device shows up here within a second or two
  for (const [table, routes] of Object.entries(LIVE)) {
    channel.on("postgres_changes", { event: "*", schema: "public", table }, (p) => onLive(table, routes, p));
  }
  channel.on("postgres_changes", { event: "DELETE", schema: "public", table: "leads" }, (p) => onLive("leads", [], p));
  channel.subscribe();
}

// ---------------------------------------------------------------------
//  Global click delegation
// ---------------------------------------------------------------------
const ACT = {};
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-act]");
  if (!t || !ACT[t.dataset.act]) return;
  e.preventDefault();
  try { ACT[t.dataset.act](t, e); } catch (x) { fail(x); }
});
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k" && S.me) { e.preventDefault(); ACT.palette(); }
  if (e.key === "Escape") { if (document.querySelector("[data-modal]")) closeModal(); else closeDrawer(); }
});
ACT.theme = toggleTheme;

// ---------------------------------------------------------------------
//  UNDO / REDO  (server keeps the history; see migration 017)
// ---------------------------------------------------------------------
const afterUndo = () => { closeDrawer(); softRefresh(150); refreshBadges(); };
const undoMsg = (r, verb) => `${verb}: ${String(r?.summary || "").split("\n")[0]}${r?.conflicts ? " · " + L(`${r.conflicts} field baad mein badle gaye the, wo nahi chhede`, `${r.conflicts} field(s) changed later were left as they are`) : ""}`;
async function doUndo(tx) {
  const { data, error } = tx ? await sb.rpc("undo_tx", { p_tx: tx }) : await sb.rpc("undo_mine");
  if (error) return toast(friendly(error), true);
  toastAction("↩ " + undoMsg(data, L("Undo ho gaya", "Undone")), "↪ Redo", () => doRedo(data.tx));
  afterUndo(); return data;
}
async function doRedo(tx) {
  const { data, error } = tx ? await sb.rpc("redo_tx", { p_tx: tx }) : await sb.rpc("redo_mine");
  if (error) return toast(friendly(error), true);
  toastAction("↪ " + undoMsg(data, L("Redo ho gaya", "Redone")), "↩ Undo", () => doUndo(data.tx));
  afterUndo(); return data;
}
// after a delete / merge / bulk assign: offer Undo for a few seconds
let undoT;
addEventListener("crm:undoable", (e) => {
  if (!S.me) return;
  clearTimeout(undoT);
  undoT = setTimeout(() => {
    const k = e.detail?.kind, msg = k === "merge_leads" ? L("🔗 Merge ho gaya", "🔗 Merged") : k === "assign_leads" ? L("👤 Leads assign ho gaye", "👤 Leads assigned") : k === "undo_import" ? L("Import hata diya", "Import removed") : L("🗑 Delete ho gaya", "🗑 Deleted");
    toastAction(msg, "↩ Undo", () => doUndo());
  }, 250);
});
// Ctrl+Z / Ctrl+Y (or Ctrl+Shift+Z) — not while typing in a field
document.addEventListener("keydown", (e) => {
  if (!S.me || !(e.ctrlKey || e.metaKey) || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k !== "z" && k !== "y") return;
  if (document.activeElement?.matches("input, textarea, select, [contenteditable]")) return;
  e.preventDefault();
  if (k === "y" || e.shiftKey) doRedo(); else doUndo();
});
ACT.history = () => historyPanel("mine");
async function historyPanel(scope) {
  const mgr = isMgr();
  const m = modal({
    title: L("↶ Undo · Recent changes", "↶ Undo · Recent changes"), wide: true,
    body: `<div class="chips" style="margin:8px 0 12px"><button class="chip ${scope === "mine" ? "on" : ""}" data-hs="mine">${L("Mere changes (24 ghante)", "My changes (24 hours)")}</button>
      ${mgr ? `<button class="chip ${scope === "team" ? "on" : ""}" data-hs="team">${L("Poori team (30 din)", "Whole team (30 days)")}</button><button class="chip ${scope === "bin" ? "on" : ""}" data-hs="bin">🗑 Recycle bin</button>` : ""}</div>
      <div id="hList"><div class="empty">Loading…</div></div>
      <p class="mu" style="font-size:12.5px;margin-top:12px">⌨️ <b>Ctrl+Z</b> = ${L("apna aakhri change undo", "undo your last change")} · <b>Ctrl+Y</b> = redo. ${L("Undo kabhi kisi aur ka baad wala change overwrite nahi karta.", "Undo never overwrites a change someone made later.")}</p>`,
  });
  $$("[data-hs]", m).forEach((b) => b.onclick = () => historyPanel(b.dataset.hs));
  const { data, error } = await sb.rpc("recent_changes", { p_scope: scope, p_limit: 60 });
  const box = $("#hList", m); if (!box) return;
  if (error) { box.innerHTML = `<div class="empty">${h(friendly(error))}</div>`; return; }
  if (!data?.length) { box.innerHTML = `<div class="empty"><b>${scope === "bin" ? L("Recycle bin khaali hai", "Recycle bin is empty") : L("Abhi koi change nahi", "No changes yet")}</b></div>`; return; }
  // grouped by day (Aaj / Kal / weekday / date); title in bold, details below in plain words
  const dayOf = (t) => {
    const d = new Date(t), t0 = new Date(); t0.setHours(0, 0, 0, 0); const d0 = new Date(d); d0.setHours(0, 0, 0, 0);
    const diff = Math.round((t0 - d0) / 864e5);
    return diff <= 0 ? L("Aaj", "Today") : diff === 1 ? L("Kal", "Yesterday") : d0.toLocaleDateString("en-IN", diff < 7 ? { weekday: "long" } : { day: "numeric", month: "short" });
  };
  const time = (t) => new Date(t).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
  let lastDay = "";
  box.innerHTML = `<div class="hlist">${data.map((r) => {
    const [title, det] = String(r.summary || "—").split("\n"), dd = dayOf(r.at);
    const head = dd !== lastDay ? `<div class="hday">${h(dd)}</div>` : ""; lastDay = dd;
    return `${head}<div class="hrow ${r.undone ? "undone" : ""}">
      <div class="hmain"><div class="hsum">${h(title)}</div>${det ? `<div class="hdet">${h(det)}</div>` : ""}
        <div class="hmeta">${h(time(r.at))} · ${h(ago(r.at))}${scope !== "mine" ? " · " + h(r.actor ? userName(r.actor) : L("System", "System")) : ""}${r.undone ? ` · <span class="badge">${L("undo kiya hua", "undone")}</span>` : ""}</div></div>
      ${r.can ? `<button class="btn sm ${r.undone ? "" : scope === "bin" ? "primary" : ""}" data-htx="${r.tx}" data-hdo="${r.undone ? "redo" : "undo"}">${r.undone ? "↪ Redo" : scope === "bin" ? "♻️ " + L("Wapas lao", "Restore") : "↩ Undo"}</button>`
        : `<span class="mu" style="font-size:12px" title="${h(r.why || "")}">🔒</span>`}</div>`;
  }).join("")}</div>`;
  $$("[data-htx]", box).forEach((b) => b.onclick = () => busy(b, async () => {
    const ok = b.dataset.hdo === "redo" ? await doRedo(+b.dataset.htx) : await doUndo(+b.dataset.htx);
    if (ok) historyPanel(scope);
  }));
}
ACT.install = async (t) => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice.catch(() => {}); installEvt = null; t.hidden = true; };
HOOK.canInstall = () => !!installEvt;
HOOK.install = async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice.catch(() => {}); installEvt = null; const b = document.getElementById("installBtn"); if (b) b.hidden = true; };
ACT.lang = (t) => {
  const v = t.dataset.v; if (v === getLang()) return;
  setLang(v);
  if (!S.me) return renderLogin(loginMode === "newpw" ? "newpw" : loginMode);
  S.me.lang = v;
  sb.from("profiles").update({ lang: v }).eq("id", S.me.id).then(() => {}, () => {});
  closeModal(); closeDrawer(); renderShell(); route(); loadAnnouncement();
  toast(v === "en" ? "Language: English" : "Language: Hinglish");
};
ACT.menu = () => $("#side").classList.toggle("open");
ACT.logout = async () => { if (await confirmBox("Logout karna hai?", "Logout")) sb.auth.signOut(); };
async function deleteAnnouncement(id) {
  if (!(await confirmBox(L("Ye announcement sab ke liye delete karna hai?", "Delete this announcement for everyone?"), "Delete"))) return false;
  const { data, error } = await sb.from("announcements").delete().eq("id", id).select("id");
  if (error) { fail(error); return false; }
  if (!data?.length) { toast(L("Delete nahi hua — sirf Manager / Admin kar sakte hain", "Not deleted — only Managers / Admins can"), true); return false; }
  toast(L("🗑 Announcement delete ho gaya", "🗑 Announcement deleted")); loadAnnouncement(); return true;
}
ACT.delAnn = (t) => deleteAnnouncement(+t.dataset.id);
ACT.dismissAnn = (t) => { try { localStorage.setItem("crm_ann", t.dataset.v); } catch { /* ignore */ } $("#banner").innerHTML = ""; };
ACT.lead = (t) => openLead(+t.dataset.id);
ACT.bell = (t) => toggleNotifications(t);
VIEWS.inbox = (el, soft, params) => viewInbox(el, params || { id: location.hash.split("/")[2] });
VIEWS.templates = (el) => viewTemplates(el);
VIEWS.import = async (el) => (await import("./import.js")).viewImport(el);
VIEWS.requests = (el) => viewRequests(el);
VIEWS.products = (el) => viewProducts(el);
VIEWS.renewals = (el) => viewRenewals(el);
VIEWS.orders = (el) => viewOrders(el);
VIEWS.obf = (el) => viewObf(el);
VIEWS.purchase = (el) => viewPurchase(el);
VIEWS.support = (el, soft, params) => viewSupport(el, soft, params);
VIEWS.daily = (el) => viewDaily(el);
VIEWS.sales = (el) => import("./sales.js").then((x) => x.viewSales(el, { barChart, openLead }));
VIEWS.duplicates = (el) => viewDuplicates(el);
ACT.go = (t) => { location.hash = "#/" + t.dataset.go; };

// ---------------------------------------------------------------------
//  Small chart helpers (single-series, hover tooltip)
// ---------------------------------------------------------------------
function barChart(data, { height = 190, fmt = num, label = "", hiLast = false } = {}) {
  if (!data.length) return `<div class="empty">Data nahi hai</div>`;
  const W = 640, H = height, pb = 24, pt = 18, max = Math.max(0, ...data.map((d) => d.v));
  // whole-number axis with at most ~4 steps: 0,1,2 / 0,5,10 / 0,25,50 …
  const ints = data.every((d) => Number.isInteger(d.v));
  const raw = Math.max(ints ? 1 : 0.0001, max / 4), mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= raw && (!ints || Number.isInteger(x))) || 10 * mag;
  const top = Math.max(step, Math.ceil(max / step) * step), ticks = [...Array(Math.round(top / step) + 1)].map((_, i) => i * step);
  const pl = Math.max(30, Math.ceil(Math.max(...ticks.map((t) => String(fmt(t)).length)) * 6.3) + 10);   // room for "₹1.5 Cr"
  const bw = (W - pl) / data.length, gap = Math.min(12, bw * 0.28), y = (v) => pt + (H - pt - pb) * (1 - v / top);
  const every = Math.ceil(data.length / 14), showVals = data.length <= 31, last = data.length - 1;
  const showLab = (i) => i === last || (i % every === 0 && last - i >= every);
  // value labels only where they don't run into each other — the biggest bars first, the rest in the tooltip
  const valOn = new Set();
  if (showVals) {
    const boxes = [];
    const tiny = data.length > 16 ? max * 0.06 : 0;   // many months: tiny bars keep their amount in the tooltip
    data.map((d, i) => ({ d, i })).filter((o) => o.d.v > tiny).sort((a, b) => b.d.v - a.d.v).forEach(({ d, i }) => {
      const cx = pl + i * bw + bw / 2, w2 = (String(fmt(d.v)).length * 7.2) / 2 + 5, yy = y(d.v) - 5;
      if (cx - w2 < pl - 4 || cx + w2 > W + 4) return;
      if (boxes.some((b) => cx - w2 < b.r && cx + w2 > b.l && Math.abs(yy - b.y) < 13)) return;
      boxes.push({ l: cx - w2, r: cx + w2, y: yy }); valOn.add(i);
    });
  }
  return `<div class="chart" role="img" aria-label="${h(label)}"><svg viewBox="0 0 ${W} ${H}">
    <g class="grid">${ticks.map((t) => `<line x1="${pl}" x2="${W}" y1="${y(t)}" y2="${y(t)}"/>`).join("")}</g>
    <g class="axis">${ticks.map((t) => `<text x="${pl - 6}" y="${y(t) + 4}" text-anchor="end">${h(fmt(t))}</text>`).join("")}
      ${data.map((d, i) => showLab(i) ? `<text x="${pl + i * bw + bw / 2}" y="${H - 6}" text-anchor="middle" class="${hiLast && i === last ? "today" : ""}">${h(hiLast && i === last ? L("Aaj", "Today") : d.l)}</text>` : "").join("")}</g>
    ${data.map((d, i) => {
      const x = pl + i * bw + gap / 2, w = bw - gap, yy = y(d.v), hh = Math.max(0, H - pb - yy), r = Math.min(5, w / 2, hh);
      const path = hh > 0 ? `M${x},${H - pb} V${yy + r} Q${x},${yy} ${x + r},${yy} H${x + w - r} Q${x + w},${yy} ${x + w},${yy + r} V${H - pb} Z` : `M${x},${H - pb - 2} H${x + w} V${H - pb} H${x} Z`;
      const cls = (hh > 0 ? "bar" : "bar zero") + (hiLast && i === last ? " now" : "");
      return `<g class="col" tabindex="0" data-tip="${h(d.t || d.l)}" data-tv="${h(fmt(d.v))}"><rect class="hit" x="${pl + i * bw}" y="${pt - 14}" width="${bw}" height="${H - pt - pb + 14}"/><path class="${cls}" d="${path}"/>${valOn.has(i) ? `<text class="val" x="${x + w / 2}" y="${yy - 5}" text-anchor="middle">${h(fmt(d.v))}</text>` : ""}</g>`;
    }).join("")}
  </svg></div>`;
}
function hbars(rows, fmt = num) {
  const max = Math.max(1, ...rows.map((r) => r.v));
  return rows.map((r) => `<div class="hbar" title="${h(r.l)}: ${h(fmt(r.v))}"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h(r.l)}</span><span class="trk"><i style="width:${(r.v / max) * 100}%"></i></span><span class="n">${h(fmt(r.v))}</span></div>`).join("") || `<div class="mu">—</div>`;
}
// chart tooltip: hover on PC, tap on phone; sits above the bar, never on top of it
function chartTip(col) {
  $$(".chart .tip").forEach((x) => x.parentNode && x.parentNode.removeChild(x)); $$(".chart .col.on").forEach((x) => x.classList.toggle("on", false));
  const c = col?.closest(".chart"); if (!col || !c) return;
  col.classList.add("on");
  const bar = col.querySelector(".bar") || col, r = bar.getBoundingClientRect(), hr = col.querySelector(".hit").getBoundingClientRect(), cr = c.getBoundingClientRect();
  const tip = document.createElement("div"); tip.className = "tip";
  tip.innerHTML = `<b>${h(col.dataset.tv)}</b>${h(col.dataset.tip)}`; c.append(tip);
  const tw = tip.offsetWidth, cx = hr.left - cr.left + hr.width / 2;
  tip.style.left = Math.min(Math.max(cx, tw / 2 + 4), cr.width - tw / 2 - 4) + "px";
  tip.style.top = Math.max(tip.offsetHeight + 4, r.top - cr.top - 10) + "px";
}
// hover only for a real mouse — on phones a tap fires stray mouse events that would close the tip again
document.addEventListener("pointerover", (e) => { if (e.pointerType !== "mouse") return; const col = e.target.closest?.(".chart .col"); if (col || e.target.closest?.(".chart")) chartTip(col); else if (document.querySelector(".chart .tip")) chartTip(null); });
document.addEventListener("click", (e) => { const col = e.target.closest?.(".chart .col"); if (col || document.querySelector(".chart .tip")) chartTip(col || null); });
document.addEventListener("focusin", (e) => { const col = e.target.closest?.(".chart .col"); if (col) chartTip(col); });

// ---------------------------------------------------------------------
//  DASHBOARD
// ---------------------------------------------------------------------
/** calls per day for a date range (one bar per day up to ~2 months, else one per month) */
function callSeries(calls, from, to) {
  const dmap = {}; (calls || []).forEach((c) => { dmap[c.day] = (dmap[c.day] || 0) + +c.calls; });
  // one bar per day (up to ~2 months), else one bar per month
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const firstDay = Object.keys(dmap).sort()[0];
  const d0 = new Date((from || firstDay || today) + "T00:00:00"), d1 = new Date((to || today) + "T00:00:00");
  const spanDays = Math.max(1, Math.round((d1 - d0) / 864e5) + 1), byMonth = spanDays > 62;
  const series = [];
  if (!byMonth) for (let i = 0; i < spanDays; i++) { const d = new Date(d0); d.setDate(d0.getDate() + i); const k = d.toLocaleDateString("en-CA"); series.push({ l: d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }), v: dmap[k] || 0, t: d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }) }); }
  else { const mm = {}; Object.entries(dmap).forEach(([k, v]) => { mm[k.slice(0, 7)] = (mm[k.slice(0, 7)] || 0) + v; });
    for (let d = new Date(d0.getFullYear(), d0.getMonth(), 1); d <= d1; d.setMonth(d.getMonth() + 1)) { const k = d.toLocaleDateString("en-CA").slice(0, 7); series.push({ l: d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }), v: mm[k] || 0, t: d.toLocaleDateString("en-IN", { month: "long", year: "numeric" }) }); } }
  series.endsToday = !byMonth && (!to || to === today);   // only then is the last bar "Today"
  return series;
}
const DD = dateState("dash", "month");
VIEWS.dashboard = async (el) => {
  const { from, to, label } = dateRange(DD), isToday = DD.p === "today";
  const [{ data: st }, { data: calls }, { data: fu }, { data: rf }] = await Promise.all([
    sb.rpc("dashboard_stats"),
    sb.rpc("calls_report_range", { p_from: from, p_to: to }),
    sb.from("leads").select("id, company, next_follow_up, status, owner_id").in("status", OPEN_STATUSES).not("next_follow_up", "is", null)
      .or(isMgr() ? "owner_id.not.is.null,owner_id.is.null" : `owner_id.eq.${S.me.id}`).order("next_follow_up").limit(8),
    applyDates(sb.from("rfqs").select("id, rfq_no, company, product, status, due_date, created_at").order("created_at", { ascending: false }).limit(6), "created_at", DD, true),
  ]);
  const { data: rg } = await sb.rpc("dashboard_range", { p_from: from, p_to: to });
  const s = st || {}, r = rg || {}, target = S.me.daily_target || 40, mine = s.my_calls_today || 0;

  // calls in the chosen dates
  const myCalls = (calls || []).filter((c) => isMgr() || c.user_id === S.me.id);
  const perDay = callSeries(myCalls, from, to), callsN = myCalls.reduce((a, c) => a + Number(c.calls), 0);
  const lb = isMgr() ? S.team.filter((u) => u.active && u.role !== "admin").map((u) => ({ u, c: myCalls.filter((c) => c.user_id === u.id).reduce((a, c) => a + Number(c.calls), 0) })).sort((a, b) => b.c - a.c) : [];
  const lbMax = Math.max(1, ...lb.map((x) => x.c));
  const drOn = dateActive(DD), bs = drOn ? r.by_status || {} : s.by_status || {};

  el.innerHTML = `
  <div class="row" style="margin-bottom:16px"><div><h2 style="margin:0;font-size:20px">${L("Namaste", "Hello")}, ${h(S.me.full_name.split(" ")[0])} 👋</h2><div class="mu">${new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</div></div>
    <div class="right row">${isMgr() ? `<button class="btn" data-act="announce">📢 Announcement</button>` : ""}<a class="btn primary" href="#/today">${ic("phone")} Calling shuru karo</a></div></div>
  <div class="kpis">
    <div class="card kpi" data-act="go" data-go="today"><div class="l">Meri calls aaj</div><div class="v">${num(mine)}<span class="mu" style="font-size:15px;font-weight:500"> / ${target}</span></div><div class="meter"><i style="width:${Math.min(100, (mine / Math.max(1, target)) * 100)}%"></i></div></div>
    ${isMgr() ? `<div class="card kpi"><div class="l">Team calls aaj</div><div class="v">${num(s.team_calls_today)}</div><div class="s">${S.team.filter(online).length} log online</div></div>` : ""}
    <div class="card kpi" data-act="go" data-go="tasks"><div class="l">Follow-ups (24 ghante)</div><div class="v">${num(s.followups_due)}</div><div class="s" style="color:${s.overdue ? "var(--bad)" : ""}">${num(s.overdue)} overdue</div></div>
    <div class="card kpi" data-act="go" data-go="rfqs"><div class="l">Open RFQs</div><div class="v">${num(s.rfqs_open)}</div><div class="s">${num(s.rfqs_new)} ${L("naye", "new")}</div></div>
    <div class="card kpi" data-act="go" data-go="leads"><div class="l">${isMgr() ? "Total leads" : "Mere active leads"}</div><div class="v">${num(isMgr() ? s.leads_total : s.my_leads)}</div><div class="s">${num(s.pool_free)} free pool mein · +${num(s.leads_new_week)} is hafte</div></div>
    <div class="card kpi" data-act="go" data-go="inbox"><div class="l">Unread replies</div><div class="v">${num(s.replies_unread)}</div><div class="s">${num(s.emails_today)} emails aaj bheje</div></div>
    ${s.requests_pending ? `<div class="card kpi" data-act="go" data-go="requests" style="border-color:var(--warn)"><div class="l">🙋 Lock requests</div><div class="v">${num(s.requests_pending)}</div><div class="s">Koi aapka lead maang raha hai</div></div>` : ""}
    <div class="card kpi" data-act="go" data-go="pipeline"><div class="l">Pipeline value</div><div class="v">${inrShort(s.pipeline_value)}</div><div class="s">Won (month): ${inrShort(s.won_value_month)}</div></div>
  </div>
  ${dateBarHtml("dash", DD)}
  <div class="kpis dr-kpis">
    <div class="card kpi" data-act="go" data-go="reports"><div class="l">${isMgr() ? L("Team calls", "Team calls") : L("Meri calls", "My calls")} · ${h(label)}</div><div class="v">${num(callsN)}</div><div class="s">${num(r.emails_sent)} ${L("emails bheje", "emails sent")}</div></div>
    <div class="card kpi" data-act="go" data-go="leads"><div class="l">${L("Naye leads", "New leads")} · ${h(label)}</div><div class="v">${num(r.leads_new)}</div></div>
    <div class="card kpi" data-act="go" data-go="rfqs"><div class="l">${L("RFQs aaye", "RFQs received")} · ${h(label)}</div><div class="v">${num(r.rfqs_new)}</div></div>
    <div class="card kpi" data-act="go" data-go="quotes"><div class="l">${L("Quotations", "Quotations")} · ${h(label)}</div><div class="v">${num(r.quotes)}</div><div class="s">${inrShort(r.quotes_value)} ${L("ki value", "value")}</div></div>
    <div class="card kpi" data-act="go" data-go="quotes"><div class="l">Won · ${h(label)}</div><div class="v" style="color:var(--good)">${inrShort(r.won_value)}</div><div class="s">${num(r.quotes_won)} ${L("quotations won", "quotations won")}</div></div>
    ${isMgr() ? `<div class="card kpi" data-act="go" data-go="orders"><div class="l">${L("Payment aaya", "Received")} · ${h(label)}</div><div class="v">${inrShort(r.received)}</div></div>` : ""}
  </div>
  <div class="cols">
    <div class="stack">
      <div class="card"><div class="card-h"><h3>${isMgr() ? "Team calls" : "Meri calls"} · ${h(label)}</h3></div><div class="card-b">${barChart(perDay, { label: "Calls per day", hiLast: perDay.endsToday })}</div></div>
      <div class="card"><div class="card-h"><h3>Lead status${drOn ? ` <span class="mu" style="font-weight:500">· ${h(L("is range mein aaye leads", "leads added in range"))}</span>` : ""}</h3><span class="sp"></span><a href="#/pipeline" class="mu">Pipeline →</a></div><div class="card-b">${hbars(STATUSES.map(([k, l]) => ({ l, v: bs[k] || 0 })))}</div></div>
    </div>
    <div class="stack">
      ${isMgr() ? `<div class="card"><div class="card-h"><h3>🏆 ${isToday ? "Aaj ka leaderboard" : `Leaderboard · ${h(label)}`}</h3></div><div class="card-b" style="padding-top:6px">
        ${lb.map(({ u, c }) => `<div class="row" style="padding:7px 0;border-bottom:1px solid var(--line);flex-wrap:nowrap"><span class="dot ${online(u) ? "on" : ""}"></span><b style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h(u.full_name)}</b><span class="meter" style="width:80px;margin:0"><i style="width:${Math.min(100, (c / (isToday ? Math.max(1, u.daily_target) : lbMax)) * 100)}%"></i></span><span class="mono" style="width:52px;text-align:right">${isToday ? `${c}/${u.daily_target}` : num(c)}</span></div>`).join("") || '<div class="mu">Abhi koi employee nahi</div>'}
      </div></div>` : ""}
      <div class="card"><div class="card-h"><h3>Aane wale follow-ups</h3></div><div class="card-b" style="padding:4px 16px">
        ${(fu || []).map((l) => `<div class="row" style="padding:9px 0;border-bottom:1px solid var(--line);cursor:pointer;flex-wrap:nowrap" data-act="lead" data-id="${l.id}"><b style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h(l.company)}</b>${followBadge(l.next_follow_up)}</div>`).join("") || '<div class="empty" style="padding:20px">Koi follow-up pending nahi 🎉</div>'}
      </div></div>
      <div class="card"><div class="card-h"><h3>Latest RFQs${drOn ? ` <span class="mu" style="font-weight:500">· ${h(label)}</span>` : ""}</h3><span class="sp"></span><a href="#/rfqs" class="mu">Sab →</a></div><div class="card-b" style="padding:4px 16px">
        ${(rf || []).map((r) => `<div style="padding:9px 0;border-bottom:1px solid var(--line);cursor:pointer" data-act="rfq" data-id="${r.id}"><div class="row" style="flex-wrap:nowrap"><b style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h(r.company)}</b>${rfqBadge(r.status)}</div><div class="mu" style="font-size:12.5px">${h(r.product || "")} · ${h(ago(r.created_at))}</div></div>`).join("") || '<div class="empty" style="padding:20px">Abhi koi RFQ nahi</div>'}
      </div></div>
    </div>
  </div>`;
  wireDateBar(el, "dash", DD, () => VIEWS.dashboard(el));
};
ACT.announce = () => {
  const m = modal({ title: "📢 Sab ko announcement", body: `<label class="f">Message (500 chars)</label><textarea class="input" id="annT" maxlength="500"></textarea>
    <div class="sec-t" style="margin-top:16px">${L("Pichhle announcements", "Recent announcements")}</div><div id="annList"><div class="empty">Loading…</div></div>`,
    foot: `<button class="btn" data-close>Cancel</button><button class="btn primary" id="annS">Send</button>` });
  const drawList = async () => {
    const box = $("#annList", m); if (!box) return;
    const { data } = await sb.from("announcements").select("id, body, created_at, created_by").order("created_at", { ascending: false }).limit(20);
    if (!$("#annList", m)) return;
    box.innerHTML = !data?.length ? `<div class="empty">${L("Koi announcement nahi", "No announcements")}</div>` : `<div class="hlist">${data.map((a) => `<div class="hrow">
        <div class="hmain"><div class="hdet" style="color:var(--tx)">${h(a.body)}</div><div class="hmeta">${h(a.created_by ? userName(a.created_by) : "System")} · ${h(ago(a.created_at))}</div></div>
        <button class="btn sm ghost icon" data-anndel="${a.id}" title="${h(L("Delete", "Delete"))}" aria-label="Delete announcement">${ic("trash")}</button></div>`).join("")}</div>`;
    $$("[data-anndel]", box).forEach((b) => b.onclick = async () => { if (await deleteAnnouncement(+b.dataset.anndel)) drawList(); });
  };
  drawList();
  m.querySelector("#annS").onclick = (e) => busy(e.target, async () => {
    const body = $("#annT").value.trim(); if (!body) return;
    const { error } = await sb.from("announcements").insert({ body, created_by: S.me.id, expires_at: new Date(Date.now() + 3 * 864e5).toISOString() });
    if (error) throw error; closeModal(); toast("Announcement bhej diya ✔");
  });
};

// ---------------------------------------------------------------------
//  TODAY — calling queue
// ---------------------------------------------------------------------
let queueIds = [];
VIEWS.today = async (el) => {
  const end = new Date(); end.setHours(23, 59, 59, 999);
  const cols = "id, company, contact_name, phone, city, area, industry, category, status, score, next_follow_up, call_count, last_contacted, source";
  const [{ data: due }, { data: fresh }, { data: pool }, { data: st }] = await Promise.all([
    sb.from("leads").select(cols).eq("owner_id", S.me.id).in("status", OPEN_STATUSES).lte("next_follow_up", end.toISOString()).order("next_follow_up").limit(100),
    sb.from("leads").select(cols).eq("owner_id", S.me.id).eq("status", "new").is("next_follow_up", null).order("score", { ascending: false }).order("created_at", { ascending: false }).limit(60),
    sb.from("leads").select(cols).is("owner_id", null).eq("status", "new").order("score", { ascending: false }).order("created_at", { ascending: false }).limit(30),
    sb.rpc("dashboard_stats"),
  ]);
  const target = S.me.daily_target || 40, done = st?.my_calls_today || 0;
  queueIds = [...(due || []), ...(fresh || [])].map((l) => l.id);
  poolIds = (pool || []).map((l) => l.id);
  const card = (l) => `
    <div class="card qi" data-act="lead" data-id="${l.id}">
      <div style="min-width:0"><h4>${h(l.company)} ${l.score >= 70 ? '<span class="badge good">🔥 Hot</span>' : ""}</h4>
        <div class="meta"><span>${h([l.area, l.city].filter(Boolean).join(", "))}</span><span>${h(l.industry || l.category)}</span>${statusBadge(l.status)}${followBadge(l.next_follow_up)}${l.call_count ? `<span>${l.call_count} calls</span>` : ""}${l.source === "google_places" || l.source === "indiamart" ? '<span class="badge acc">🆕 Auto</span>' : ""}</div></div>
      <div class="acts">${l.owner_id ? (l.phone ? `<a class="btn" href="${h(telHref(l.phone))}" data-stop>${ic("phone")} ${h(l.phone)}</a>` : "") : `<span class="badge">🔓 Free</span>`}<button class="btn primary" data-act="lead" data-id="${l.id}">${l.owner_id ? "Open" : "🔒 Lock & open"}</button></div>
    </div>`;
  el.innerHTML = `
  <div class="card" style="padding:16px;margin-bottom:16px"><div class="row"><div><div class="mu">Aaj ka target</div><div style="font-size:24px;font-weight:700">${done} / ${target} calls</div></div>
    <div style="flex:1;min-width:160px"><div class="meter" style="height:10px"><i style="width:${Math.min(100, (done / target) * 100)}%"></i></div></div>
    <button class="btn primary" data-act="callNext" ${queueIds.length || poolIds.length ? "" : "disabled"}>${ic("next")} Next lead call karo</button></div></div>
  <div class="sec-t">⏰ Follow-ups due (${(due || []).length})</div>
  <div class="queue">${(due || []).map(card).join("") || '<div class="card empty">Koi follow-up due nahi</div>'}</div>
  <div class="sec-t" style="margin-top:22px">🆕 Fresh leads (${(fresh || []).length})</div>
  <div class="queue">${(fresh || []).map(card).join("") || `<div class="card empty"><b>${L("Aapke naam koi fresh lead nahi", "No fresh leads assigned to you")}</b>${L('Neeche free pool se lo — ya "Next lead" dabao, system apne aap agla free lead lock kar dega.', 'Pick one from the free pool below — or press "Call next lead" and the system locks the next free lead for you.')}</div>`}</div>
  <div class="sec-t" style="margin-top:22px">🔓 Free pool — jo pehle lock kare uska (${st?.pool_free ?? (pool || []).length})</div>
  <div class="queue">${(pool || []).map(card).join("") || `<div class="card empty">Pool khaali hai${isMgr() ? " — Automation se naye leads lao" : ""}</div>`}</div>`;
  $$("[data-stop]", el).forEach((a) => a.addEventListener("click", (e) => e.stopPropagation()));
};
let poolIds = [];
ACT.callNext = (b) => busy(b, async () => {
  if (queueIds.length) return openLead(queueIds[0], { queue: true });
  for (const id of poolIds.slice(0, 15)) {                 // grab the next free lead nobody else took
    const r = await claim("lead", id);
    if (r.ok) { poolIds = poolIds.filter((x) => x !== id); softRefresh(); return openLead(id, { queue: true }); }
    if (r.reason === "limit") return toast(claimFailMsg(r), true);
  }
  toast("Abhi koi free lead nahi mila — refresh karke dekho", true);
});

// ---------------------------------------------------------------------
//  LEAD DRAWER
// ---------------------------------------------------------------------
function closeDrawer() { $$(".drawer, .scrim:not(.m)").forEach((n) => n.remove()); }

let leadSeq = 0;   // only the latest openLead() call may draw (stops two drawers stacking on double-click / double route)
// a lock's end: a won customer's lock never ends ("infinity" in the database)
const lockTill = (u) => { const d = u ? new Date(u) : null; return !d || isNaN(d) || d.getFullYear() > 9000 ? L("hamesha ke liye (won)", "permanently (won)") : L("till ", "until ") + dt(u); };
async function openLead(id, opt = {}) {
  const seq = ++leadSeq;
  const [{ data: l, error }, { data: acts }, { data: tasks }, { data: lhist }, { data: mails }] = await Promise.all([
    sb.from("leads").select("*").eq("id", id).single(),
    sb.from("activities").select("*").eq("lead_id", id).order("created_at", { ascending: false }).limit(100),
    sb.from("tasks").select("*").eq("lead_id", id).eq("done", false).order("due_at"),
    sb.from("lock_history").select("*").eq("entity", "lead").eq("entity_id", id).order("at", { ascending: false }).limit(30),
    sb.from("email_messages").select("id, direction, counterpart, subject, snippet, intent, created_at, user_id").eq("lead_id", id).order("created_at", { ascending: false }).limit(20),
  ]);
  const lastDrop = (lhist || []).find((x) => !x.to_user && x.reason);
  if (error?.code === "PGRST116") return toast(L("Ye lead nahi mila — shayad delete ho gaya hai ya aapke access mein nahi hai", "Lead not found — it may have been deleted or is outside your access"), true);
  if (error) return fail(error);
  if (seq !== leadSeq) return;
  const SC = isEn() ? SCRIPTS_EN : SCRIPTS, sc = SC[l.category] || SC["IT Hardware"];
  const name = S.me.full_name.split(" ")[0];
  const lk = lockOf(l), canEdit = canWork(l), see = canEdit;     // only the holder (or a manager) sees full contact
  // same lead already open (after a call / status change)? swap the content in place — no flicker, keep scroll
  const prevD = document.querySelector(".drawer"), same = prevD && +prevD.dataset.id === l.id;
  const keepTop = same ? prevD.querySelector(".drawer-b")?.scrollTop || 0 : 0;
  closeDrawer();
  const scrim = document.createElement("div"); scrim.className = "scrim" + (same ? " still" : ""); scrim.onclick = closeDrawer;
  const d = document.createElement("aside"); d.className = "drawer" + (same ? " still" : ""); d.setAttribute("role", "dialog"); d.setAttribute("aria-label", l.company);
  d.dataset.id = l.id; d.dataset.queue = opt.queue ? "1" : "";
  const actIc = { call: "📞", note: "📝", email: "✉️", whatsapp: "💬", meeting: "🤝", status: "🔁", assign: "👤", system: "⚙️" };
  d.innerHTML = `
    <div class="drawer-h">
      <div class="row" style="flex-wrap:nowrap;align-items:flex-start"><div style="min-width:0;flex:1"><h2>${h(l.company)}</h2>
        <div class="mu" style="font-size:13px">${h([l.contact_name, l.designation].filter(Boolean).join(" · "))}${l.contact_name ? " · " : ""}${h([l.area, l.city].filter(Boolean).join(", "))}</div></div>
        <button class="btn ghost icon" data-dclose aria-label="Close">${ic("x")}</button></div>
      <div class="row" style="margin-top:8px">${statusBadge(l.status)}<span class="badge">${h(l.category)}</span><span class="badge ${l.score >= 70 ? "good" : ""}">Score ${l.score}</span><span class="badge">${h(SOURCES[l.source] || l.source)}</span>${followBadge(l.next_follow_up)}</div>
      ${lk.mine ? `<div class="lockbar mine">🔒 <div><b>Aap is lead pe kaam kar rahe ho</b><small>Lock ${lk.until && new Date(lk.until).getFullYear() > 9000 ? "permanent (won)" : h(lockTill(lk.until))} · har call / email pe apne aap badhta hai</small></div><button class="btn sm" data-lk="release">🔓 Release</button></div>`
      : lk.other ? `<div class="lockbar other">🔒 <div><b>${h(lk.holder)} is lead pe kaam kar raha/rahi hai</b><small>${L(`Locked ${h(ago(l.locked_at))} · ${h(lockTill(lk.until))}. Aap dekh sakte ho, par call / email / edit sirf ${h(lk.holder)} karega.`, `Locked ${h(ago(l.locked_at))} · ${h(lockTill(lk.until))}. You can view it, but only ${h(lk.holder)} can call / email / edit.`)}</small></div>
          ${isMgr() ? `<button class="btn sm" data-lk="force">Force release</button>` : `<button class="btn sm primary" data-lk="request">🙋 Request access</button>`}</div>`
      : `<div class="lockbar free">🔓 <div><b>Free lead</b><small>Jo pehle lock karega, wahi kaam karega. Lock karte hi number dikhega.</small>${lastDrop ? `<small class="lastdrop">↩ ${L("Pichhli baar", "Last time")}: ${h(userName(lastDrop.from_user))} ${L("ne chhoda", "dropped it")} — “${h(lastDrop.reason)}” · ${h(ago(lastDrop.at))}</small>` : ""}</div><button class="btn sm primary" data-lk="claim">🔒 Lock karke shuru karo</button></div>`}
      <div class="contact">
        ${l.phone ? (see ? `<a class="btn primary" href="${h(telHref(l.phone))}">${ic("phone")} ${h(l.phone)}</a><button class="btn icon" data-copy="${h(l.phone)}" title="Copy" aria-label="Copy number">${ic("copy")}</button>`
          : lk.free ? `<button class="btn primary" data-lk="claimcall">${ic("phone")} Lock & call</button>` : `<span class="btn" aria-disabled="true">${ic("phone")} ${h(maskPhone(l.phone))}</span>`) : ""}
        ${see || lk.free ? `<button class="btn" data-comp="email">${ic("mail")} Email</button><button class="btn" data-comp="whatsapp">${ic("wa")} WhatsApp</button>` : ""}
        ${see ? (l.alt_phones || []).map((p) => `<a class="btn sm" href="${h(telHref(p))}">${h(p)}</a>`).join("") : ""}
      </div>
    </div>
    <div class="drawer-b">
      <div class="lsales" id="lSales" hidden></div>
      ${canEdit || (l.products || []).length ? `<div class="lprods" id="lProds"></div>` : ""}
      ${canEdit ? `<div class="card" style="padding:14px">
        <div class="sec-t" style="margin:0 0 8px">Call ka result</div>
        <textarea class="input" id="callNote" placeholder="${h(L("Short note (optional) — kisse baat hui, kya bola…", "Short note (optional) — who you spoke to, what they said…"))}" maxlength="1000" style="min-height:56px;margin-bottom:8px"></textarea>
        <div class="outcomes">${OUTCOMES.map(([k, lab, tone]) => `<button class="btn ${tone === "good" ? "primary" : ""} ${tone === "bad" ? "danger" : ""}" data-out="${k}">${h(lab)}</button>`).join("")}</div>
        <div class="row" style="margin-top:12px"><span class="mu" style="font-size:12.5px">Follow-up:</span>
          ${[["+3h", 3], ["Kal", 24], ["+3 din", 72], ["+1 hafta", 168]].map(([lab, hr]) => `<button class="chip" data-fu="${hr}">${lab}</button>`).join("")}
          <input type="datetime-local" class="input" id="fuAt" style="width:auto;height:28px" value="${h(toLocalInput(l.next_follow_up))}" aria-label="Follow-up date"><button class="btn sm" data-fu="custom">Set</button>
          ${l.next_follow_up ? `<button class="btn sm ghost" data-fu="clear">Clear</button>` : ""}</div>
        ${opt.queue ? `<div class="row" style="margin-top:12px"><button class="btn right" data-next>${ic("next")} Skip → next lead</button></div>` : ""}
      </div>` : ""}

      <details class="card sec" ${l.call_count ? "" : "open"}><summary>🎯 Call script — ${h(l.category)}</summary><div class="card-b"><div class="script">
        <p><b>Intro:</b> ${L(`Namaste, main ${h(name)} bol raha/rahi hoon ${h(CONFIG.COMPANY)} se.`, `Hello, this is ${h(name)} from ${h(CONFIG.COMPANY)}.`)} ${h(sc.open)}</p>
        <p><b>Poocho:</b> ${h(sc.ask)}</p><p><b>Value:</b> ${h(sc.value)}</p><p><b>Close:</b> ${h(sc.close)}</p></div></div></details>

      <div class="card sec"><div class="card-h"><h3>Details</h3><span class="sp"></span>${canEdit ? `<button class="btn sm" data-edit>Edit</button>` : ""}</div><div class="card-b" id="ldet">
        <dl class="kv">
          <dt>Owner</dt><dd>${isMgr() ? `<select class="input" id="ownSel" style="height:30px">${'<option value="">— Unassigned —</option>' + assignable().map((u) => `<option value="${u.id}" ${u.id === l.owner_id ? "selected" : ""}>${h(u.full_name)} (${h(ROLE[u.role])})</option>`).join("")}</select>` : h(userName(l.owner_id))}</dd>
          <dt>Status</dt><dd>${canEdit ? `<select class="input" id="stSel" style="height:30px">${STATUSES.map(([k, lab]) => `<option value="${k}" ${k === l.status ? "selected" : ""}>${lab}</option>`).join("")}</select>` : statusBadge(l.status)}</dd>
          <dt>Deal value</dt><dd>${l.deal_value ? inr(l.deal_value) : "—"}</dd>
          <dt>Industry</dt><dd>${h(l.industry || "—")}</dd>
          ${l.gstin || l.address || l.state ? `<dt>GSTIN</dt><dd class="mono" data-raw>${h(l.gstin || "—")}</dd><dt>Address</dt><dd data-raw>${h([l.address, l.state, l.pincode].filter(Boolean).join(", ") || "—")}</dd>` : ""}
          <dt>Products</dt><dd>${(l.products || []).map((p) => `<span class="badge" style="margin:0 4px 4px 0">${h(p)}</span>`).join("") || "—"}</dd>
          <dt>Email</dt><dd>${h(see ? l.email || "—" : l.email ? maskEmail(l.email) : "—")}</dd>
          <dt>Emails</dt><dd>${l.email_count || 0} bheje · ${l.reply_count || 0} replies${l.last_reply_at ? " · last reply " + h(ago(l.last_reply_at)) : ""}</dd>
          <dt>Website</dt><dd>${l.website && /^https?:\/\//i.test(l.website) ? `<a href="${h(l.website)}" target="_blank" rel="noopener noreferrer">${h(l.website)}</a>` : h(l.website || "—")}</dd>
          <dt>Calls</dt><dd>${l.call_count} · last ${h(ago(l.last_contacted))}</dd>
          <dt>Added</dt><dd>${h(dOnly(l.created_at))} · ${h(SOURCES[l.source] || l.source)}</dd>
          <dt>Notes</dt><dd style="white-space:pre-wrap">${h(l.notes || "—")}</dd>
        </dl></div></div>

      <div class="card sec"><div class="card-h"><h3>Tasks</h3><span class="sp"></span>${canEdit ? `<button class="btn sm" data-task>${ic("plus")} Task</button>` : ""}</div><div class="card-b" style="padding:6px 16px">
        ${(tasks || []).map((t) => `<label class="row check" style="padding:6px 0"><input type="checkbox" data-tdone="${t.id}"> <span style="flex:1">${h(t.title)}</span> ${followBadge(t.due_at)}</label>`).join("") || '<div class="mu" style="padding:8px 0">Koi open task nahi</div>'}
      </div></div>

      <div id="lpanel"></div>

      <div class="row sec">
        ${canEdit ? `<button class="btn" data-note>${ic("file")} Note add karo</button>
        <button class="btn" data-mkrfq>${ic("inbox")} RFQ banao</button>
        <button class="btn" data-mkq>${ic("file")} Quotation banao</button>` : ""}
        ${isAdmin() ? `<button class="btn danger right" data-del>${ic("trash")} Delete</button>` : ""}
      </div>

      ${(mails || []).length ? `<div class="card sec"><div class="card-h"><h3>✉️ Emails</h3><span class="sp"></span><a href="#/inbox" class="mu">Inbox →</a></div><div class="card-b" style="padding:4px 16px">
        ${mails.map((e) => `<div class="row" style="padding:8px 0;border-bottom:1px solid var(--line);flex-wrap:nowrap;cursor:${e.direction === "in" ? "pointer" : "default"}" ${e.direction === "in" ? `data-mail="${e.id}"` : ""}>
          <span>${e.direction === "in" ? "📩" : "📤"}</span><div style="min-width:0;flex:1"><div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><b>${h(e.subject || "(no subject)")}</b></div>
          <div class="mu" style="font-size:12px">${e.direction === "in" ? "From " : "To "}${h(e.counterpart)} · ${h(ago(e.created_at))} · ${h(userName(e.user_id))}</div></div></div>`).join("")}
      </div></div>` : ""}

      <details class="card sec"><summary>🔐 ${L("Lock history", "Lock history")} (${(lhist || []).length})</summary><div class="card-b" style="padding:4px 16px">${lockHistoryHtml(lhist)}</div></details>

      <div class="card sec"><div class="card-h"><h3>Activity</h3></div><div class="card-b" style="padding:4px 16px">
        <ul class="timeline">${(acts || []).map((a) => `<li><span class="ic">${actIc[a.kind] || "•"}</span><div><div>${a.outcome ? `<b>${h(OUTCOME[a.outcome]?.[1] || a.outcome)}</b> ` : ""}${h(a.body || (a.kind === "call" ? "" : a.kind))}</div><div class="t">${h(userName(a.user_id))} · ${h(dt(a.created_at))}</div></div></li>`).join("") || '<li><span></span><span class="mu">Abhi koi activity nahi</span></li>'}</ul>
      </div></div>
    </div>`;
  document.body.append(scrim, d);
  if (keepTop) { const b = d.querySelector(".drawer-b"); if (b) b.scrollTop = keepTop; }
  const reopen = () => openLead(id, opt);
  leadPanel($("#lpanel", d), l, reopen).catch(() => {});
  const after = () => { softRefresh(); refreshBadges(); };
  d.querySelector("[data-dclose]").onclick = closeDrawer;
  $$("[data-mail]", d).forEach((x) => x.onclick = () => { closeDrawer(); location.hash = "#/inbox/" + x.dataset.mail; });
  drawLeadProducts($("#lProds", d), l, canEdit, reopen);
  import("./sales.js").then((x) => x.leadSalesLine($("#lSales", d), l.id)).catch(() => {});
  $$("[data-comp]", d).forEach((b) => b.onclick = async () => {
    if (!(await ensureWork("lead", l))) return;
    openComposer({ channel: b.dataset.comp, lead: l, onSent: reopen });
  });
  $$("[data-lk]", d).forEach((b) => b.onclick = () => busy(b, async () => {
    const a = b.dataset.lk;
    if (a === "claim" || a === "claimcall") {
      const r = await claim("lead", id);
      if (!r.ok) {
        if (r.reason === "company" && r.lead_id) toastAction(claimFailMsg(r), L("Wo lead kholo", "Open that lead"), () => openLead(r.lead_id), 9000);
        else toast(claimFailMsg(r), true);
        return reopen();
      }
      toast(claimOkMsg(r)); after();
      if (a === "claimcall" && l.phone) location.href = telHref(l.phone);
      return reopen();
    }
    if (a === "release" || a === "force") {
      const why = await askRelease({ force: a === "force", holder: lk.holder, used: dropsUsed(lhist) });
      if (why === false) return;
      const { data, error: e1 } = await sb.rpc("release", { p_entity: "lead", p_id: id, p_reason: why });
      if (e1) throw e1;
      toast(a === "force" ? (data?.ok ? L("🔓 Lock hata diya — lead pool mein hai", "🔓 Lock removed — lead is in the pool") : L("Release nahi hua", "Couldn't release")) : releasedMsg(data), !data?.ok || !!data?.banned_until); after();
      return opt.queue ? nextInQueue(id) : reopen();
    }
    if (a === "request") return requestAccess("lead", l);
  }));
  d.querySelector("[data-copy]")?.addEventListener("click", (e) => { navigator.clipboard?.writeText(e.currentTarget.dataset.copy); toast("Copied"); });

  const setFollow = async (at) => {
    const { data: ok, error: e } = await sb.from("leads").update({ next_follow_up: at }).eq("id", id).select("id");
    if (e) return fail(e);
    if (!ok?.length) { toast("Lead ab aapke paas locked nahi hai", true); return reopen(); }
    toast(at ? "Follow-up set: " + dt(at) : "Follow-up hata diya"); after(); reopen();
  };
  $$("[data-fu]", d).forEach((b) => b.onclick = () => {
    const v = b.dataset.fu;
    if (v === "clear") return setFollow(null);
    if (v === "custom") { const x = $("#fuAt", d).value; return x ? setFollow(new Date(x).toISOString()) : toast("Date choose karo", true); }
    setFollow(new Date(Date.now() + +v * 3600e3).toISOString());
  });

  $$("[data-out]", d).forEach((b) => b.onclick = () => busy(b, async () => {
    const [k, lab, , st, hrs] = OUTCOME[b.dataset.out];
    let value = null;
    if (k === "won") {
      const v = prompt("Deal value (₹) — optional", l.deal_value || "");
      if (v === null) return;
      value = Number(String(v).replace(/[^\d.]/g, "")) || null;
    }
    const { error: e1 } = await sb.from("activities").insert({ lead_id: id, kind: "call", outcome: k, body: $("#callNote", d).value.trim() || null });
    if (e1) throw e1;
    const upd = {};
    if (st) upd.status = st;
    if (hrs) upd.next_follow_up = new Date(Date.now() + hrs * 3600e3).toISOString();
    else if (st) upd.next_follow_up = null;
    if (value) upd.deal_value = value;
    if (Object.keys(upd).length) { const { error: e2 } = await sb.from("leads").update(upd).eq("id", id).select("id"); if (e2) throw e2; }
    toast("✔ " + lab + (hrs ? L(" · follow-up " + (hrs < 24 ? hrs + " ghante" : Math.round(hrs / 24) + " din") + " baad", " · follow-up in " + (hrs < 24 ? hrs + " hours" : Math.round(hrs / 24) + " days")) : ""));
    after();
    if (opt.queue) return nextInQueue(id);
    reopen();
  }));
  d.querySelector("[data-next]")?.addEventListener("click", () => nextInQueue(id));

  $("#stSel", d)?.addEventListener("change", async (e) => {
    const v = e.target.value;
    const { data: ok, error: e1 } = await sb.from("leads").update({ status: v }).eq("id", id).select("id");
    if (e1) return fail(e1);
    if (!ok?.length) { toast("Lead ab aapke paas locked nahi hai", true); return reopen(); }
    await sb.from("activities").insert({ lead_id: id, kind: "status", body: `Status → ${STATUS[v].l}` });
    toast("Status updated"); after(); reopen();
  });
  $("#ownSel", d)?.addEventListener("change", async (e) => {
    const { error: e1 } = await sb.rpc("assign_leads", { ids: [id], owner: e.target.value || null });
    if (e1) return fail(e1);
    toast("Assigned to " + userName(e.target.value || null)); after(); reopen();
  });
  d.querySelector("[data-edit]")?.addEventListener("click", () => leadForm(l, reopen));
  d.querySelector("[data-note]")?.addEventListener("click", () => {
    const m = modal({ title: "Note", body: `<textarea class="input" id="nt" maxlength="4000" style="min-height:120px"></textarea>`, foot: `<button class="btn" data-close>Cancel</button><button class="btn primary" id="ns">Save</button>` });
    m.querySelector("#ns").onclick = (e) => busy(e.target, async () => {
      const body = $("#nt").value.trim(); if (!body) return;
      const { error: e1 } = await sb.from("activities").insert({ lead_id: id, kind: "note", body }); if (e1) throw e1;
      closeModal(); reopen();
    });
  });
  d.querySelector("[data-task]")?.addEventListener("click", () => taskForm({ lead_id: id, title: "Call back: " + l.company }, reopen));
  $$("[data-tdone]", d).forEach((c) => c.onchange = async () => {
    await sb.from("tasks").update({ done: true, done_at: new Date().toISOString() }).eq("id", c.dataset.tdone); toast("Task done ✔"); reopen();
  });
  d.querySelector("[data-mkrfq]")?.addEventListener("click", () => rfqForm({ lead_id: id, company: l.company, contact: l.contact_name, phone: l.phone, email: l.email, city: l.city }));
  d.querySelector("[data-mkq]")?.addEventListener("click", () => quoteEditor({ lead_id: id, to_party: { name: l.company, contact: l.contact_name, email: l.email, address: l.address || [l.area, l.city].filter(Boolean).join(", "), state: l.state || "Maharashtra", gstin: l.gstin || "" }, items: [] }));
  d.querySelector("[data-del]")?.addEventListener("click", async () => {
    if (!(await confirmBox(L(`"${l.company}" ko permanently delete karna hai?`, `Permanently delete "${l.company}"?`), "Delete"))) return;
    const { error: e1 } = await sb.from("leads").delete().eq("id", id); if (e1) return fail(e1);
    closeDrawer(); toast("Deleted"); after();
  });
}

function nextInQueue(cur) {
  queueIds = queueIds.filter((x) => x !== cur);
  if (queueIds.length) openLead(queueIds[0], { queue: true });
  else { closeDrawer(); toast("🎉 Queue khatam!"); }
}

function leadForm(l = {}, done) {
  const isNew = !l.id;
  const m = modal({
    title: isNew ? "Naya lead" : "Edit lead", wide: true,
    body: `<form id="lf"><div class="ldup" id="lDup" aria-live="polite" hidden></div><div class="grid2">
      <div><label class="f">Company *</label><input class="input" name="company" required maxlength="200" value="${h(l.company || "")}"></div>
      <div><label class="f">Contact person</label><input class="input" name="contact_name" maxlength="120" value="${h(l.contact_name || "")}"></div>
      <div><label class="f">Phone</label><input class="input" name="phone" maxlength="40" value="${h(l.phone || "")}" inputmode="tel"></div>
      <div><label class="f">Email</label><input class="input" name="email" type="email" maxlength="200" value="${h(l.email || "")}"></div>
      <div><label class="f">Designation</label><input class="input" name="designation" maxlength="120" value="${h(l.designation || "")}"></div>
      <div><label class="f">Website</label><input class="input" name="website" maxlength="300" value="${h(l.website || "")}"></div>
      <div><label class="f">Area</label><input class="input" name="area" maxlength="120" value="${h(l.area || "")}"></div>
      <div><label class="f">City</label><input class="input" name="city" maxlength="80" value="${h(l.city || "Mumbai")}"></div>
      <div><label class="f">Industry / type</label><input class="input" name="industry" maxlength="80" value="${h(l.industry || "")}" placeholder="Architect, CA firm, Hospital…"></div>
      <div><label class="f">Category</label><select class="input" name="category">${CATEGORIES.map((c) => `<option ${c === l.category ? "selected" : ""}>${c}</option>`).join("")}</select></div>
      <div><label class="f">Deal value (₹)</label><input class="input" name="deal_value" type="number" min="0" step="1" value="${h(l.deal_value || "")}"></div>
      <div><label class="f">Tags (comma)</label><input class="input" name="tags" maxlength="200" value="${h((l.tags || []).join(", "))}"></div>
      <div><label class="f">GSTIN</label><input class="input" name="gstin" maxlength="15" value="${h(l.gstin || "")}" style="text-transform:uppercase"></div>
      <div><label class="f">State</label><input class="input" name="state" maxlength="60" value="${h(l.state || "")}"></div>
      <div><label class="f">Address</label><input class="input" name="address" maxlength="500" value="${h(l.address || "")}"></div>
      <div><label class="f">Pincode</label><input class="input" name="pincode" maxlength="12" value="${h(l.pincode || "")}"></div>
    </div>
    <label class="f">${L("Products (jo customer ko chahiye) — email / WhatsApp inhi ke hisaab se banega", "Products (what the customer needs) — the email / WhatsApp is written from these")}</label><div id="lpP"></div>
    <label class="f">Notes</label><textarea class="input" name="notes" maxlength="5000">${h(l.notes || "")}</textarea>
    ${isNew && isMgr() ? `<label class="f">${L("Ye lead kisko?", "Who gets this lead?")}</label><select class="input" name="give_to">
      <option value="pool">🔓 ${L("Free pool mein daalo (koi bhi telecaller le sakta hai)", "Free pool (any telecaller can take it)")}</option>
      <option value="me">🔒 ${L("Mere paas rakho", "Keep it with me")}</option>
      ${assignable().filter((u) => u.id !== S.me.id).map((u) => `<option value="${u.id}">👤 ${h(u.full_name)} ${L("ko assign karo", "")}</option>`).join("")}</select>` : ""}</form>`,
    foot: `<button class="btn" data-close>Cancel</button><button class="btn primary" id="lsave">Save</button>`,
  });
  const pp = productPicker($("#lpP", m), l.products || []);
  // ---- "this lead is already in the CRM": checked while typing (company, phone, email, GSTIN) and again on Save
  const WHY = { gstin: L("GSTIN same", "Same GSTIN"), phone: L("Phone same", "Same phone"), email: L("Email same", "Same email"), name: L("Company naam same", "Same company name"),
    domain: L("Same company email domain", "Same company email domain"), similar: L("Naam milta-julta", "Similar name") };
  let dupes = [], dupT = 0, dupSeq = 0;
  const dupArgs = () => { const f = formData($("#lf", m)); return { p_company: f.company || null, p_phone: f.phone || null, p_email: f.email || null, p_gstin: f.gstin || null, p_exclude: l.id || null }; };
  const checkDupes = async () => {
    const seq = ++dupSeq, a = dupArgs();
    if (!a.p_company && !a.p_phone && !a.p_email && !a.p_gstin) { dupes = []; drawDupes(); return dupes; }
    const { data, error } = await sb.rpc("lead_dupes", a);
    if (seq !== dupSeq || !m.isConnected) return dupes;      // an older answer
    dupes = error ? [] : data || []; drawDupes(); return dupes;
  };
  const drawDupes = () => {
    const box = $("#lDup", m); if (!box) return;
    box.hidden = !dupes.length;
    if (!dupes.length) { box.innerHTML = ""; return; }
    const strong = dupes.some((d) => d.strong);
    box.className = "ldup " + (strong ? "bad" : "warn");
    box.innerHTML = `<div class="ldup-h">${strong ? "⚠️ " + L("Ye lead pehle se CRM mein hai", "This lead is already in the CRM") : "🔎 " + L("Milte-julte leads pehle se hain — check kar lo", "Similar leads already exist — please check")}</div>
      ${dupes.map((d) => `<div class="ldup-r"><div><b>${h(d.company)}</b> <span class="mu">${h([d.city, String(d.status || "").replace(/_/g, " ")].filter(Boolean).join(" · "))}</span>
        <div class="ldup-w">${(d.why || []).map((w) => `<span class="badge ${["gstin", "phone", "email", "name"].includes(w) ? "bad" : "warn"}">${h(WHY[w] || w)}</span>`).join("")}
          <span class="mu">${d.mine ? L("· aapki lead", "· your lead") : d.owner ? `· ${d.locked ? "🔒 " : ""}${h(d.owner)}` : L("· free pool", "· free pool")}</span></div></div>
        <button type="button" class="btn sm" data-dopen="${d.id}">${L("Kholo", "Open")}</button></div>`).join("")}`;
    $$("[data-dopen]", box).forEach((b) => b.onclick = () => { closeModal(); openLead(+b.dataset.dopen); });
  };
  ["company", "phone", "email", "gstin"].forEach((n) => $(`[name="${n}"]`, m)?.addEventListener("input", () => { clearTimeout(dupT); dupT = setTimeout(checkDupes, 450); }));
  if (!isNew) setTimeout(checkDupes, 300);
  m.querySelector("#lsave").onclick = (e) => busy(e.target, async () => {
    const f = formData($("#lf", m));
    if (!f.company) return toast("Company naam zaroori hai", true);
    // the final check, with what is in the form right now
    const ds = await checkDupes(), byPhone = ds.find((d) => (d.why || []).includes("phone"));
    if (byPhone) { $(`[name="phone"]`, m)?.focus(); return toast(L(`Ye phone number pehle se "${byPhone.company}" lead mein hai — wahi lead kholo (upar "Kholo")`, `This phone number is already on the lead "${byPhone.company}" — open that lead (above, "Open")`), true); }
    const hard = ds.find((d) => d.strong);
    // a strong match: say so in the form and ask for a second Save (the form stays as typed)
    const dupKey = JSON.stringify(ds.filter((d) => d.strong).map((d) => d.id));
    if (hard && isNew && m.dataset.dupOk !== dupKey) {
      m.dataset.dupOk = dupKey;
      const why = (hard.why || []).map((w) => WHY[w] || w).join(", ");
      $("#lDup", m)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      e.target.dataset.l = "⚠️ " + L("Haan, phir bhi naya banao", "Yes, add it anyway");
      return toast(L(`"${hard.company}" pehle se CRM mein hai (${why}) — upar "Kholo" dabao, ya pakka naya hai toh Save dobara dabao`,
        `"${hard.company}" is already in the CRM (${why}) — press "Open" above, or press Save again if it really is new`), true, 8000);
    }
    f.products = (await pp).get();
    if (f.gstin) f.gstin = f.gstin.toUpperCase().replace(/\s/g, "");
    f.tags = f.tags ? f.tags.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 10) : [];
    f.deal_value = f.deal_value ? Number(f.deal_value) : null;
    let res;
    const give = f.give_to; delete f.give_to;
    if (isNew) {
      // telecaller: always their own. manager/admin: pool (default), self, or a chosen person
      const mine = !isMgr() || give === "me";
      res = await sb.from("leads").insert({ ...f, source: "manual", created_by: S.me.id, owner_id: mine ? S.me.id : null,
        ...(mine && isMgr() ? { locked_at: new Date().toISOString(), lock_until: new Date(Date.now() + 3 * 864e5).toISOString() } : {}) }).select("id").single();
      if (!res.error && give && give !== "pool" && give !== "me") {
        const { error } = await sb.rpc("assign_leads", { ids: [res.data.id], owner: give });
        if (error) toast(L("Lead bana, par assign nahi hua: ", "Lead saved, but not assigned: ") + friendly(error), true);
      }
    } else res = await sb.from("leads").update(f).eq("id", l.id).select("id").single();
    if (res.error) throw res.error;
    closeModal(); toast(isNew ? (give === "pool" ? L("Lead pool mein add ho gaya ✔", "Lead added to the pool ✔") : "Lead add ho gaya ✔") : "Saved ✔"); softRefresh();
    if (isNew) openLead(res.data.id); else done?.();
  });
}

// products a lead of this category usually needs — one tap adds them
const PROD_HINTS = {
  "Design software": ["AutoCAD LT", "SketchUp Pro", "Revit", "Lumion Pro", "Enscape", "AEC Collection"],
  "Security": ["Endpoint security / antivirus", "Firewall (UTM) supply & setup", "CCTV / IP camera installation", "Email security"],
  "IT Hardware": ["Laptops", "Desktops & Workstations", "Servers", "Printers & Plotters", "UPS & Power"],
  "Networking & CCTV": ["Networking", "CCTV & Surveillance", "Structured cabling", "Firewall (appliance)"],
};
// the strip at the top of the lead: its products + one-tap suggestions + the full picker
function drawLeadProducts(box, l, canEdit, reopen) {
  if (!box) return;
  const list = l.products || [];
  const has = (n) => list.some((x) => x.toLowerCase() === n.toLowerCase());
  const hints = canEdit ? (PROD_HINTS[l.category] || PROD_HINTS["Design software"]).filter((n) => !has(n)).slice(0, list.length ? 3 : 4) : [];
  box.classList.toggle("none", !list.length);
  box.innerHTML = `<div class="lprods-h"><span class="lprods-t">🏷️ ${L("Customer ko kya chahiye", "What the customer needs")}</span>
      ${canEdit ? `<button type="button" class="btn sm ${list.length ? "" : "primary"}" data-pedit>${list.length ? "✏️ " + L("Badlo", "Change") : "＋ " + L("Product jodo", "Add products")}</button>` : ""}</div>
    <div class="lprods-c">${list.map((p) => `<span class="pchip">${h(p)}${canEdit ? `<button type="button" data-pdel="${h(p)}" aria-label="${h(L("Hatao", "Remove") + " " + p)}">✕</button>` : ""}</span>`).join("")}
      ${hints.map((n) => `<button type="button" class="pchip add" data-padd="${h(n)}">＋ ${h(n)}</button>`).join("")}</div>
    ${list.length ? `<div class="lprods-f">✨ ${L("Email / WhatsApp inhi products ke hisaab se apne aap banega", "Email / WhatsApp are written for these products")}</div>`
      : canEdit ? `<div class="lprods-f">${L("Product chuno — Email / WhatsApp message unhi ke hisaab se apne aap banega", "Pick the products — the Email / WhatsApp message is written for them")}</div>` : ""}`;
  const save = async (products, btn) => {
    btn?.setAttribute("disabled", "");
    const { error } = await sb.from("leads").update({ products }).eq("id", l.id);
    if (error) { btn?.removeAttribute("disabled"); return fail(error); }
    l.products = products; drawLeadProducts(box, l, canEdit, reopen); softRefresh();
  };
  box.querySelector("[data-pedit]")?.addEventListener("click", () => editLeadProducts(l, reopen));
  box.querySelectorAll("[data-padd]").forEach((b) => b.onclick = () => save([...list, b.dataset.padd].slice(0, 20), b));
  box.querySelectorAll("[data-pdel]").forEach((b) => b.onclick = () => save(list.filter((x) => x !== b.dataset.pdel), b));
}

// the lead's products, changed from the drawer — the composer writes the email / WhatsApp from these
function editLeadProducts(l, done) {
  const m = modal({
    title: `${L("Products", "Products")} — ${l.company}`, wide: true,
    body: `<p class="mu" style="margin:0 0 10px;font-size:13px">${L("Jo customer ko chahiye wo chuno. Email / WhatsApp mein inhi products ki lines apne aap aayengi.", "Pick what the customer needs. The email / WhatsApp gets a line for each of these products.")}</p><div id="lpQ"></div>`,
    foot: `<button class="btn" data-close>Cancel</button><button class="btn primary" id="lpGo">Save</button>`,
  });
  const pp = productPicker($("#lpQ", m), l.products || []);
  setTimeout(() => $(".ppick-q", m)?.focus(), 50);
  $("#lpGo", m).onclick = (e) => busy(e.target, async () => {
    const products = (await pp).get();
    const { error } = await sb.from("leads").update({ products }).eq("id", l.id);
    if (error) throw error;
    closeModal(); toast(L("Products saved ✔", "Products saved ✔")); softRefresh(); done?.();
  });
}

// ---------------------------------------------------------------------
//  LEADS table
// ---------------------------------------------------------------------
const LF = { q: "", status: "", category: "", owner: "", source: "", city: "", page: 0, sort: "created_at", asc: false, sel: new Set() };
// Source filter: only sources that really have leads (a new one shows up with its first lead); the CRM's own lead finder = one option
const AUTO_SRC = ["osm", "google_places"];
let srcCounts = null;
function sourceOptions() {
  const c = srcCounts || {}, groups = new Map(); let auto = 0;
  for (const [k, n] of Object.entries(c)) {
    if (!n) continue;
    if (AUTO_SRC.includes(k)) { auto += n; continue; }
    const lab = SOURCES[k] || k, g = groups.get(lab) || { keys: [], n: 0 };
    g.keys.push(k); g.n += n; groups.set(lab, g);
  }
  const opt = (v, label, n) => `<option value="${h(v)}" ${LF.source === v ? "selected" : ""}>${h(label)}${n != null ? " · " + num(n) : ""}</option>`;
  const list = [...groups.entries()].sort((a, b) => b[1].n - a[1].n);
  let html = opt("", L("Sab sources", "All sources")) + (auto ? opt("auto", L("🤖 CRM (apne aap mili)", "🤖 CRM (found automatically)"), auto) : "")
    + list.map(([lab, g]) => opt(g.keys.sort().join(","), lab, g.n)).join("");
  // the chosen filter stays in the list even when it has no leads right now
  if (LF.source && !html.includes(`value="${h(LF.source)}"`)) html += opt(LF.source, LF.source === "auto" ? L("🤖 CRM (apne aap mili)", "🤖 CRM (found automatically)") : LF.source.split(",").map((k) => SOURCES[k] || k).join(" / "), 0);
  return html;
}
async function fillSources(el) {
  const { data } = await sb.rpc("lead_source_counts");
  if (!data) return;
  srcCounts = data;
  const x = $("#lsrc", el); if (x && document.activeElement !== x) x.innerHTML = sourceOptions();
}
const PAGE = 50;
const LD = dateState("leads");
function leadQuery(sel, count) {
  let q = sb.from("leads").select(sel, count ? { count: "exact" } : undefined);
  q = applyDates(q, "created_at", LD, true);
  const s = LF.q.replace(/[%,()*"\\]/g, " ").trim();
  if (s) {
    const d = s.replace(/\D/g, "");
    q = q.or([`company.ilike.%${s}%`, `contact_name.ilike.%${s}%`, `city.ilike.%${s}%`, `area.ilike.%${s}%`, `email.ilike.%${s}%`, ...(d.length >= 4 ? [`phone_norm.like.%${d}%`] : [])].join(","));
  }
  if (LF.status === "open") q = q.in("status", OPEN_STATUSES); else if (LF.status) q = q.eq("status", LF.status);
  if (LF.category) q = q.eq("category", LF.category);
  if (LF.source === "auto") q = q.in("source", AUTO_SRC);
  else if (LF.source.includes(",")) q = q.in("source", LF.source.split(","));
  else if (LF.source) q = q.eq("source", LF.source);
  if (LF.city) q = q.ilike("city", LF.city.replace(/[%_\\]/g, ""));
  if (LF.owner === "none") q = q.is("owner_id", null);
  else if (LF.owner === "me") q = q.eq("owner_id", S.me.id);
  else if (LF.owner === "others") q = q.not("owner_id", "is", null).neq("owner_id", S.me.id);
  else if (LF.owner) q = q.eq("owner_id", LF.owner);
  return q;
}
VIEWS.leads = async (el, soft) => {
  if (!soft || !$("#ltb", el)) {
    el.innerHTML = `
    <div class="toolbar">
      <input class="input grow" id="lq" placeholder="Search company, contact, phone, city…" value="${h(LF.q)}" aria-label="Search">
      <div class="tb-acts">
        ${isMgr() ? `<button class="btn" data-act="exportLeads">${ic("download")} Export</button>` : ""}
        <button class="btn" data-act="importLeads">${ic("upload")} Import</button>
        <button class="btn primary" data-act="newLead">${ic("plus")} Lead</button>
      </div>
    </div>
    <div class="filters" id="lfil">
      <select class="input" id="lst" aria-label="Status"><option value="">All status</option><option value="open" ${LF.status === "open" ? "selected" : ""}>Open (active)</option>${STATUSES.map(([k, l]) => `<option value="${k}" ${LF.status === k ? "selected" : ""}>${l}</option>`).join("")}</select>
      <select class="input" id="lcat" aria-label="Category"><option value="">All categories</option>${CATEGORIES.map((c) => `<option ${LF.category === c ? "selected" : ""}>${c}</option>`).join("")}</select>
      <select class="input" id="lcity" aria-label="City"><option value="">${L("Sab cities", "All cities")}</option>${LF.city ? `<option selected value="${h(LF.city)}">${h(LF.city)}</option>` : ""}</select>
      <select class="input" id="lsrc" aria-label="Source">${sourceOptions()}</select>
      <select class="input" id="lown" aria-label="Lock"><option value="">Sab leads</option><option value="me" ${LF.owner === "me" ? "selected" : ""}>🔒 Mere (locked by me)</option><option value="none" ${LF.owner === "none" ? "selected" : ""}>🔓 Free pool</option><option value="others" ${LF.owner === "others" ? "selected" : ""}>🔒 Doosron ke paas</option>${isMgr() ? assignable().map((u) => `<option value="${u.id}" ${LF.owner === u.id ? "selected" : ""}>👤 ${h(u.full_name)}</option>`).join("") : ""}</select>
      <button class="btn ghost" id="lclr" ${LF.status || LF.category || LF.city || LF.source || LF.owner ? "" : "hidden"}>✕ ${L("Filters hatao", "Clear filters")}</button>
    </div>
    ${dateBarHtml("leads", LD)}
    <div class="card"><div class="tbl-wrap" id="ltb"></div><div class="pager" id="lpg"></div></div>
    <div id="lbulk"></div>`;
    let t;
    $("#lq", el).oninput = (e) => { clearTimeout(t); t = setTimeout(() => { LF.q = e.target.value; LF.page = 0; drawLeads(el); }, 300); };
    const FIL = [["#lst", "status"], ["#lcat", "category"], ["#lcity", "city"], ["#lsrc", "source"], ["#lown", "owner"]];
    const markClr = () => { const c = $("#lclr", el); if (c) c.hidden = !FIL.some(([, k]) => LF[k]); FIL.forEach(([sel, k]) => $(sel, el)?.classList.toggle("on", !!LF[k])); };
    FIL.forEach(([s, k]) => { const x = $(s, el); if (x) x.onchange = () => { LF[k] = x.value; LF.page = 0; LF.sel.clear(); markClr(); drawLeads(el); }; });
    $("#lclr", el).onclick = () => { FIL.forEach(([sel, k]) => { LF[k] = ""; const x = $(sel, el); if (x) x.value = ""; }); LF.page = 0; LF.sel.clear(); markClr(); drawLeads(el); };
    markClr();
    wireDateBar(el, "leads", LD, () => { LF.page = 0; LF.sel.clear(); drawLeads(el); });
    fillSources(el).catch(() => {});
    // City list (with lead counts) — filled after the page shows
    loadCities().then(({ data }) => {
      const x = $("#lcity", el); if (!x || !data) return;
      x.innerHTML = `<option value="">${L("Sab cities", "All cities")}</option>` + data.map((c) =>
        `<option value="${h(c.city)}" ${LF.city.toLowerCase() === c.city.toLowerCase() ? "selected" : ""}>${h(c.city)} (${num(c.n)})</option>`).join("");
    }, () => {});
  }
  await drawLeads(el);
};
let citiesAt = 0, citiesData = null;
const loadCities = () => (citiesData && Date.now() - citiesAt < 300e3 ? Promise.resolve({ data: citiesData })
  : sb.rpc("lead_cities").then((r) => { if (r.data) { citiesData = r.data; citiesAt = Date.now(); } return r; }));
let drawSeq = 0;
async function drawLeads(el) {
  const my = ++drawSeq;
  const { data, count, error } = await leadQuery("id, company, contact_name, phone, email, city, area, category, status, score, owner_id, lock_until, next_follow_up, last_contacted, deal_value, source, created_at, email_count, reply_count", true)
    .order(LF.sort, { ascending: LF.asc, nullsFirst: false }).order("id", { ascending: false }).range(LF.page * PAGE, LF.page * PAGE + PAGE - 1);
  if (my !== drawSeq) return;   // a newer search / filter already asked again
  if (error) return fail(error);
  if (!$("#ltb", el)) return;   // user already moved to another page while this was loading
  const th = (k, l, cls = "") => `<th class="${cls}" data-sort="${k}" aria-sort="${LF.sort === k ? (LF.asc ? "ascending" : "descending") : "none"}">${l}${LF.sort === k ? (LF.asc ? " ↑" : " ↓") : ""}</th>`;
  $("#ltb", el).innerHTML = !data.length ? `<div class="empty"><b>Koi lead nahi mila</b>Filters badal ke dekho</div>` : `
    <table class="tbl"><thead><tr><th style="width:34px"><input type="checkbox" id="lall" aria-label="Select all"></th>
      ${th("company", "Company")}<th>Phone</th>${th("city", "City")}${th("status", "Status")}${th("score", "Score", "num")}<th>Lock</th>${th("next_follow_up", "Follow-up")}${th("deal_value", "Value", "num")}${th("created_at", "Added")}</tr></thead>
    <tbody>${data.map((l) => `<tr data-act="lead" data-id="${l.id}">
      <td data-nolink><input type="checkbox" data-sel="${l.id}" ${LF.sel.has(l.id) ? "checked" : ""} aria-label="Select"></td>
      <td><div class="co">${h(l.company)}${l.reply_count ? ` <span title="${L("Reply aaya", "Reply received")}">📩</span>` : l.email_count ? ` <span title="${L("Email bheja", "Email sent")}">📤</span>` : ""}</div><div class="sub">${h(l.contact_name || l.category)}</div></td>
      <td class="mono">${h(canWork(l) ? l.phone || "" : l.phone ? maskPhone(l.phone) : "")}</td><td>${h(l.city || "")}<div class="sub">${h(l.area || "")}</div></td>
      <td>${statusBadge(l.status)}</td><td class="num">${l.score}</td>
      <td>${lockBadge(l)}</td>
      <td>${followBadge(l.next_follow_up) || '<span class="mu">—</span>'}</td>
      <td class="num">${l.deal_value ? inrShort(l.deal_value) : ""}</td>
      <td class="sub">${h(ago(l.created_at))}<div>${h(SOURCES[l.source] || l.source)}</div></td></tr>`).join("")}</tbody></table>`;
  const pages = Math.max(1, Math.ceil((count || 0) / PAGE));
  $("#lpg", el).innerHTML = `<span>${num(count)} leads</span><button class="btn sm" id="pp" ${LF.page ? "" : "disabled"}>‹ Prev</button><span>Page ${LF.page + 1} / ${pages}</span><button class="btn sm" id="pn" ${LF.page + 1 < pages ? "" : "disabled"}>Next ›</button>`;
  $("#pp", el).onclick = () => { LF.page--; drawLeads(el); };
  $("#pn", el).onclick = () => { LF.page++; drawLeads(el); };
  $$("th[data-sort]", el).forEach((t) => t.onclick = () => { const k = t.dataset.sort; LF.asc = LF.sort === k ? !LF.asc : k === "company" || k === "city"; LF.sort = k; drawLeads(el); });
  $$("[data-nolink]", el).forEach((td) => td.addEventListener("click", (e) => e.stopPropagation(), true));
  $$("[data-sel]", el).forEach((c) => c.onchange = () => { c.checked ? LF.sel.add(+c.dataset.sel) : LF.sel.delete(+c.dataset.sel); drawBulk(el); });
  const all = $("#lall", el); if (all) all.onchange = () => { data.forEach((l) => all.checked ? LF.sel.add(l.id) : LF.sel.delete(l.id)); drawLeads(el); };
  drawBulk(el);
}
function drawBulk(el) {
  const b = $("#lbulk", el); if (!b) return;
  if (!LF.sel.size) { b.innerHTML = ""; return; }
  b.innerHTML = `<div class="bulk"><b>${LF.sel.size} selected</b>
    <button class="btn sm" id="bMail">✉️ Bulk email</button>
    ${isMgr() ? `<select class="input" id="bOwn" aria-label="Assign to"><option value="">Assign to…</option><option value="__pool">— Free pool —</option>${assignable().map((u) => `<option value="${u.id}">${h(u.full_name)}</option>`).join("")}</select>
    <select class="input" id="bSt" aria-label="Set status"><option value="">Status set…</option>${STATUSES.map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select>` : ""}
    <button class="btn sm" id="bClr">Clear</button></div>`;
  $("#bClr", b).onclick = () => { LF.sel.clear(); drawLeads(el); };
  $("#bMail", b).onclick = (e) => busy(e.target, async () => {
    const ids = [...LF.sel];
    if (ids.length > 50) return toast("Ek baar mein max 50 companies ko bulk email (Gmail limit) — kam select karo", true);
    const { data, error } = await sb.from("leads").select("id, company, email, owner_id, lock_until, status, email_count, reply_count").in("id", ids);
    if (error) throw error;
    const ok = data.filter((l) => canWork(l)), locked = data.length - ok.length;
    if (!ok.length) return toast("Bulk email sirf apne locked leads ko — pehle lock karo", true);
    if (!ok.some((l) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(l.email || ""))) return toast("Selected leads mein kisi ka email address nahi hai", true);
    if (locked) toast(`${locked} leads skip (doosron ke / free) — sirf aapke ${ok.length} leads ko jayega`);
    openComposer({ channel: "email", bulk: ok, onSent: () => { LF.sel.clear(); drawLeads(el); } });
  });
  $("#bOwn", b)?.addEventListener("change", async (e) => {
    const v = e.target.value; if (!v) return;
    const { data: n, error } = await sb.rpc("assign_leads", { ids: [...LF.sel], owner: v === "__pool" ? null : v });
    if (error) return fail(error);
    toast(`${n} leads assign ho gaye ✔`); LF.sel.clear(); drawLeads(el);
  });
  $("#bSt", b)?.addEventListener("change", async (e) => {
    const v = e.target.value; if (!v) return;
    const { error } = await sb.from("leads").update({ status: v }).in("id", [...LF.sel]);
    if (error) return fail(error);
    toast("Status updated ✔"); LF.sel.clear(); drawLeads(el);
  });
}
ACT.newLead = () => leadForm({});
ACT.exportLeads = (b) => busy(b, async () => {
  const rows = [];
  for (let p = 0; p < 40; p++) {
    const { data, error } = await leadQuery("*").order("id").range(p * 1000, p * 1000 + 999);
    if (error) throw error; rows.push(...data); if (data.length < 1000) break;
  }
  download(`leads-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(rows, [
    ["company", "Company"], ["contact_name", "Contact"], ["designation", "Designation"], ["phone", "Phone"], ["email", "Email"], ["website", "Website"],
    ["area", "Area"], ["city", "City"], ["industry", "Industry"], ["category", "Category"], ["products", "Products"], ["status", "Status"], ["score", "Score"],
    [(r) => userName(r.owner_id), "Owner"], ["deal_value", "Deal value"], ["next_follow_up", "Next follow-up"], ["call_count", "Calls"], ["source", "Source"], ["notes", "Notes"], ["created_at", "Created"],
  ]));
  toast(`${rows.length} leads export ✔`);
});
ACT.importLeads = () => {
  const m = modal({
    title: "CSV se leads import", wide: true,
    body: `<p class="mu">Excel mein <b>File → Save As → CSV</b> karo. Columns (header row mein): <span class="mono">Company, Contact, Phone, Email, Area, City, Industry, Category, Products, Notes, Website</span>. Duplicate phone numbers apne aap skip honge.</p>
      <input type="file" id="csvF" accept=".csv,text/csv" class="input" style="padding:6px">
      ${isMgr() ? `<label class="f">Assign to</label><select class="input" id="csvOwn"><option value="">— Unassigned pool —</option>${assignable().map((u) => `<option value="${u.id}">${h(u.full_name)}</option>`).join("")}</select>` : ""}
      <div id="csvPrev" class="sec"></div>`,
    foot: `<button class="btn" data-close>Cancel</button><button class="btn primary" id="csvGo" disabled>Import</button>`,
  });
  let rows = [];
  const MAP = { company: /company|firm|name|organi/i, contact_name: /contact|person/i, phone: /phone|mobile|number|tel/i, email: /mail/i, area: /area|locality/i, city: /city/i, industry: /industry|type|segment/i, category: /category/i, products: /product/i, notes: /note|remark/i, website: /web|site|url/i };
  $("#csvF", m).onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > 5e6) return toast("File 5MB se badi hai", true);
    const g = parseCSV(await f.text()); if (g.length < 2) return toast("CSV khaali hai", true);
    const head = g[0].map((x) => x.trim()), idx = {};
    for (const [k, re] of Object.entries(MAP)) { const i = head.findIndex((x, j) => re.test(x) && !Object.values(idx).includes(j)); if (i >= 0) idx[k] = i; }
    if (idx.company == null) return toast("Company column nahi mila", true);
    rows = g.slice(1, 5001).map((r) => {
      const o = {}; for (const k in idx) o[k] = (r[idx[k]] || "").trim() || null;
      o.category = CATEGORIES.find((c) => c.toLowerCase() === String(o.category || "").toLowerCase()) || "IT Hardware";
      o.products = o.products ? o.products.split(/[;|]/).map((s) => s.trim()).filter(Boolean) : [];
      if (o.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email)) o.email = null;
      for (const k of ["company", "contact_name", "area", "city", "industry", "website"]) if (o[k]) o[k] = o[k].slice(0, 200);
      if (o.notes) o.notes = o.notes.slice(0, 5000);
      return o;
    }).filter((o) => o.company);
    $("#csvPrev", m).innerHTML = `<b>${rows.length} rows ready.</b> Mapped: ${Object.keys(idx).map((k) => `<span class="badge">${k} ← ${h(head[idx[k]])}</span>`).join(" ")}`;
    $("#csvGo", m).disabled = !rows.length;
  };
  $("#csvGo", m).onclick = (e) => busy(e.target, async () => {
    const own = $("#csvOwn", m)?.value || null;
    let ok = 0, dup = 0;
    const seen = new Set();
    rows = rows.filter((r) => { const k = String(r.phone || "").replace(/\D/g, "").slice(-10); if (k.length === 10) { if (seen.has(k)) { dup++; return false; } seen.add(k); } return true; });
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200).map((r) => ({ ...r, source: "import", owner_id: isMgr() ? own : S.me.id }));
      const { data, error } = await sb.from("leads").insert(chunk).select("id");
      if (!error) { ok += data.length; continue; }
      for (const r of chunk) { const { error: e2 } = await sb.from("leads").insert(r); if (e2) dup++; else ok++; }
    }
    closeModal(); toast(`${ok} imported, ${dup} duplicate/skip`); softRefresh();
  });
};

// ---------------------------------------------------------------------
//  PIPELINE (kanban, drag & drop)
// ---------------------------------------------------------------------
const PCOLS = ["new", "contacted", "interested", "quote_sent", "demo", "negotiation", "won"];
// a second scroll bar ABOVE the board (stays in view at the top while the page scrolls) — moves with the one below
function boardTopBar(el) {
  const top = $(".board-top", el), board = $(".board", el); if (!top || !board) return;
  const fit = () => { top.firstElementChild.style.width = board.scrollWidth + "px"; top.hidden = board.scrollWidth <= board.clientWidth + 2; };
  let lock = false;
  top.onscroll = () => { if (lock) return; lock = true; board.scrollLeft = top.scrollLeft; requestAnimationFrame(() => { lock = false; }); };
  board.addEventListener("scroll", () => { if (lock) return; lock = true; top.scrollLeft = board.scrollLeft; requestAnimationFrame(() => { lock = false; }); }, { passive: true });
  fit(); if (window.ResizeObserver) new ResizeObserver(fit).observe(board);
}
VIEWS.pipeline = async (el) => {
  const mineOnly = el.dataset.mine === "1" || !isMgr();
  let q = sb.from("leads").select("id, company, city, deal_value, status, owner_id, lock_until, next_follow_up, score").in("status", PCOLS).order("score", { ascending: false }).limit(700);
  if (mineOnly) q = q.eq("owner_id", S.me.id);
  const { data, error } = await q; if (error) throw error;
  const by = Object.fromEntries(PCOLS.map((k) => [k, []])); data.forEach((l) => by[l.status]?.push(l));
  el.innerHTML = `
    <div class="toolbar">${isMgr() ? `<div class="chips"><button class="chip ${mineOnly ? "" : "on"}" data-pm="0">Team</button><button class="chip ${mineOnly ? "on" : ""}" data-pm="1">Mine</button></div>` : ""}
      <span class="mu">Card ko drag karke status badlo · har column max 100 dikhte hain</span></div>
    <div class="board-top" aria-hidden="true"><div></div></div>
    <div class="board">${PCOLS.map((k) => `<div class="col" data-col="${k}">
      <div class="col-h">${statusBadge(k)} <span>${by[k].length}</span><small>${inrShort(by[k].reduce((a, l) => a + Number(l.deal_value || 0), 0))}</small></div>
      ${by[k].slice(0, 100).map((l) => `<div class="card kc" draggable="${canWork(l)}" data-id="${l.id}" data-act="lead"><b>${h(l.company)}</b><div class="sub">${h(l.city || "")}${l.deal_value ? " · " + inrShort(l.deal_value) : ""}</div><div class="row" style="margin-top:6px;gap:6px">${followBadge(l.next_follow_up)}${isMgr() ? `<span class="sub">${h(userName(l.owner_id))}</span>` : ""}</div></div>`).join("")}
    </div>`).join("")}</div>`;
  $$("[data-pm]", el).forEach((b) => b.onclick = () => { el.dataset.mine = b.dataset.pm; VIEWS.pipeline(el); });
  boardTopBar(el);
  let dragId = null;
  $$(".kc", el).forEach((c) => {
    c.addEventListener("dragstart", (e) => { dragId = +c.dataset.id; c.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; });
    c.addEventListener("dragend", () => c.classList.remove("dragging"));
  });
  $$(".col", el).forEach((col) => {
    col.addEventListener("dragover", (e) => { e.preventDefault(); col.classList.add("drop"); });
    col.addEventListener("dragleave", () => col.classList.remove("drop"));
    col.addEventListener("drop", async (e) => {
      e.preventDefault(); col.classList.remove("drop");
      const st = col.dataset.col, l = data.find((x) => x.id === dragId); if (!l || l.status === st) return;
      if (!canWork(l)) return toast("Ye lead aapke paas locked nahi hai", true);
      const from = PCOLS.indexOf(l.status), to = PCOLS.indexOf(st), patch = { status: st };
      // someone else's lead (manager view) → make sure
      if (l.owner_id && l.owner_id !== S.me.id && !(await confirmBox(L(`"${l.company}" ${userName(l.owner_id)} ka lead hai. Status ${STATUS[l.status].l} → ${STATUS[st].l} karna hai?`, `"${l.company}" belongs to ${userName(l.owner_id)}. Change ${STATUS[l.status].l} → ${STATUS[st].l}?`), L("Haan, badlo", "Yes, change")))) return;
      // closing a deal: confirm + deal value
      if (st === "won") {
        const v = prompt(L(`🎉 "${l.company}" — deal pakki? Deal value (₹) daalo (optional):`, `🎉 "${l.company}" — deal won? Enter the deal value (₹) (optional):`), l.deal_value || "");
        if (v === null) return;
        const n = Number(String(v).replace(/[^\d.]/g, "")); if (n) patch.deal_value = n;
      } else if (l.status === "won") {
        if (!isMgr()) return toast(L("Won deal ko wapas sirf Manager le ja sakta hai", "Only a Manager can move a won deal back"), true);
        if (!(await confirmBox(L(`"${l.company}" Won tha — wapas ${STATUS[st].l} karna hai?`, `"${l.company}" was Won — move it back to ${STATUS[st].l}?`), L("Haan", "Yes")))) return;
      } else if (to - from > 2 && !(await confirmBox(L(`${STATUS[l.status].l} se seedha ${STATUS[st].l}? (${to - from - 1} steps chhod rahe ho)`, `Jump from ${STATUS[l.status].l} straight to ${STATUS[st].l}? (skipping ${to - from - 1} steps)`), L("Haan, badlo", "Yes, move")))) return;
      const { data: upd, error: e1 } = await sb.from("leads").update(patch).eq("id", dragId).select("id");
      if (e1) return fail(e1);
      if (!upd?.length) { toast("Lock badal gaya — status update nahi hua", true); return VIEWS.pipeline(el); }
      sb.from("activities").insert({ lead_id: dragId, kind: "status", body: `Status → ${STATUS[st].l} (pipeline)${patch.deal_value ? " · " + inr(patch.deal_value) : ""}` }).then(() => {});
      toastAction(`${l.company} → ${STATUS[st].l}`, "↩ Undo", () => doUndo().then(() => VIEWS.pipeline(el)));
      VIEWS.pipeline(el);
    });
  });
};

// ---------------------------------------------------------------------
//  RFQs
// ---------------------------------------------------------------------
const RF = { st: "open", q: "" };
const RQD = dateState("rfqs");
VIEWS.rfqs = async (el) => {
  let q = applyDates(sb.from("rfqs").select("*").order("created_at", { ascending: false }).limit(300), "created_at", RQD, true);
  if (RF.st === "open") q = q.in("status", ["new", "in_progress", "quoted", "negotiating"]); else if (RF.st !== "all") q = q.eq("status", RF.st);
  const s = RF.q.replace(/[%,()*"\\]/g, " ").trim();
  if (s) q = q.or(`company.ilike.%${s}%,product.ilike.%${s}%,rfq_no.ilike.%${s}%,city.ilike.%${s}%`);
  const { data, error } = await q; if (error) throw error;
  const today = new Date(new Date().toDateString());
  el.innerHTML = `
    <div class="toolbar"><div class="chips">${[["open", "Open"], ...RFQ_STATUSES.map(([k, l]) => [k, l]), ["all", "All"]].map(([k, l]) => `<button class="chip ${RF.st === k ? "on" : ""}" data-rs="${k}">${l}</button>`).join("")}</div>
      <input class="input grow" id="rq" placeholder="Search RFQ…" value="${h(RF.q)}" aria-label="Search RFQs">
      <button class="btn" data-act="rfqHook">🔗 ${L("Enquiry link", "Enquiry link")}</button>
      <button class="btn primary" data-act="newRfq">${ic("plus")} RFQ</button></div>
    ${dateBarHtml("rfqs", RQD)}
    <div class="card"><div class="tbl-wrap">${!data.length ? `<div class="empty"><b>Koi RFQ nahi</b>IndiaMART / website se naye RFQ apne aap yahan aayenge.</div>` : `
      <table class="tbl"><thead><tr><th>RFQ</th><th>Company</th><th>Requirement</th><th>Due</th><th>Status</th><th>Lock</th><th class="num">Quoted</th><th>Source</th></tr></thead><tbody>
      ${data.map((r) => {
        const dd = r.due_date ? Math.round((new Date(r.due_date) - today) / 864e5) : null;
        const open = !["won", "lost"].includes(r.status);
        return `<tr data-act="rfq" data-id="${r.id}"><td class="mono">${h(r.rfq_no)}<div class="sub">${h(ago(r.created_at))}</div></td>
        <td><div class="co">${h(r.company)}</div><div class="sub">${h([r.contact, r.city].filter(Boolean).join(" · "))}</div></td>
        <td>${h(r.product || "")}${r.qty ? ` <span class="sub">× ${h(r.qty)}</span>` : ""}<div class="sub" style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h(r.details || "")}</div></td>
        <td>${dd === null ? "—" : open ? `<span class="badge ${dd < 0 ? "bad" : dd <= 2 ? "warn" : ""}">${dd < 0 ? "Overdue " + -dd + "d" : dd === 0 ? L("Aaj", "Today") : dd + L(" din", " days")}</span>` : h(dOnly(r.due_date))}</td>
        <td>${rfqBadge(r.status)}</td><td>${lockBadge(r)}</td>
        <td class="num">${r.quoted_value ? inrShort(r.quoted_value) : ""}</td><td class="sub">${h(SOURCES[r.source] || r.source)}</td></tr>`;
      }).join("")}</tbody></table>`}</div></div>`;
  $$("[data-rs]", el).forEach((b) => b.onclick = () => { RF.st = b.dataset.rs; VIEWS.rfqs(el); });
  wireDateBar(el, "rfqs", RQD, () => VIEWS.rfqs(el));
  let t; $("#rq", el).oninput = (e) => { clearTimeout(t); t = setTimeout(() => { RF.q = e.target.value; VIEWS.rfqs(el).then(() => { const i = $("#rq", el); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 350); };
};
ACT.newRfq = () => rfqForm({});
ACT.rfq = async (t) => {
  const { data, error } = await sb.from("rfqs").select("*").eq("id", +t.dataset.id).single();
  if (error) return fail(error); rfqForm(data);
};
// ---- public enquiry page (website "Get a Quote" button / WhatsApp link) → RFQs
const enquiryUrl = (src) => new URL("enquiry.html", location.href.split("#")[0]).href + (src ? "?src=" + src : "");
function enquiryShareHtml() {
  const plain = enquiryUrl(""), wa = enquiryUrl("whatsapp"), web = enquiryUrl("website");
  const btn = `<a href="${web}" target="_blank" rel="noopener" style="display:inline-block;padding:12px 22px;border-radius:10px;background:#0f766e;color:#fff;font:600 15px Arial,sans-serif;text-decoration:none">Get a Quote</a>`;
  const waText = encodeURIComponent(L("Quotation ke liye apni requirement yahan bhejiye 👇\n", "Send us your requirement for a quotation 👇\n") + wa);
  return `<div class="row" style="gap:8px;flex-wrap:nowrap;margin-top:6px"><input class="input mono" readonly value="${h(plain)}" style="flex:1;min-width:0" aria-label="Enquiry link"><button class="btn sm primary" type="button" data-eqc="${h(plain)}">📋 Copy</button></div>
    <div class="row" style="gap:8px;margin-top:8px"><a class="btn sm" href="https://wa.me/?text=${waText}" target="_blank" rel="noopener noreferrer">💬 ${L("WhatsApp pe bhejo", "Share on WhatsApp")}</a><a class="btn sm" href="${h(plain)}" target="_blank" rel="noopener noreferrer">👀 ${L("Page dekho", "Open the page")}</a></div>
    <label class="f" style="margin-top:12px">${L("Website pe “Get a Quote” button — ye code website banane wale ko do", "“Get a Quote” button for your website — give this code to whoever runs the site")}</label>
    <pre class="log" style="white-space:pre-wrap;word-break:break-all;max-height:110px;margin:0">${h(btn)}</pre>
    <button class="btn sm" type="button" data-eqc="${h(btn)}" style="margin-top:6px">📋 ${L("Code copy karo", "Copy code")}</button>`;
}
function wireEnquiryShare(root) {
  root.querySelectorAll("[data-eqc]").forEach((b) => b.onclick = async () => {
    try { await navigator.clipboard.writeText(b.dataset.eqc); toast(L("Copied ✔", "Copied ✔")); }
    catch { toast(L("Copy nahi hua — select karke copy karo", "Couldn't copy — select it and copy"), true); }
  });
}
ACT.rfqHook = () => {
  const url = CONFIG.SUPABASE_URL + "/functions/v1/inbound-rfq";
  const m = modal({ title: L("Enquiry link — form bharte hi RFQ", "Enquiry link — every form becomes an RFQ"), wide: true, body: `
    <p style="margin-top:0">${L("Customer ye form bharta hai → CRM mein turant RFQ + lead ban jaata hai, sabko notification jaata hai. Same customer 3 din mein dobara bhare toh naya RFQ nahi banta.", "The customer fills this form → an RFQ + lead appears in the CRM at once and everyone is notified. The same customer filling it again within 3 days doesn't make a second RFQ.")}</p>
    ${enquiryShareHtml()}
    <details style="margin-top:14px"><summary class="mu">${L("Website developer ke liye (apna form / Zapier)", "For the website developer (own form / Zapier)")}</summary>
    <p>${L("Apni website ke enquiry form ko is URL pe <b>POST</b> karo. RFQ + lead apne aap ban jayega aur sabko live notification jayega.", "<b>POST</b> your website's enquiry form to this URL. An RFQ + lead is created automatically and everyone gets a live notification.")}</p>
    <div class="script mono" style="word-break:break-all">${h(url)}</div>
    <p class="mu">Fields: <span class="mono">company*, product*, contact, phone, email, city, qty, details, due_date</span>. ${L('Bot se bachne ke liye ek hidden field <span class="mono">website_url</span> khaali rakho. Website ka domain <span class="mono">ALLOWED_ORIGINS</span> secret mein hona chahiye; server-to-server (Zapier / Apps Script) ke liye header <span class="mono">x-webhook-secret</span> bhejo.', 'To stop bots, keep a hidden field <span class="mono">website_url</span> empty. Your website\'s domain must be in the <span class="mono">ALLOWED_ORIGINS</span> secret; for server-to-server (Zapier / Apps Script) send the header <span class="mono">x-webhook-secret</span>.')}</p>
    <pre class="log">&lt;form method="post" action="${h(url)}"&gt;
  &lt;input name="company" required&gt; &lt;input name="contact"&gt; &lt;input name="phone"&gt;
  &lt;input name="email" type="email"&gt; &lt;input name="product" required&gt; &lt;input name="qty"&gt;
  &lt;textarea name="details"&gt;&lt;/textarea&gt;
  &lt;input name="website_url" style="display:none" tabindex="-1" autocomplete="off"&gt;
  &lt;button&gt;Send enquiry&lt;/button&gt;
&lt;/form&gt;</pre></details>` });
  wireEnquiryShare(m);
};
function rfqForm(r) {
  const isNew = !r.id;
  const lk = lockOf(r), work = isNew || canWork(r);
  const m = modal({
    title: isNew ? "Naya RFQ" : `${r.rfq_no} · ${r.company}`, wide: true,
    body: `${isNew ? "" : lk.mine ? `<div class="lockbar mine" style="margin-top:12px">🔒 <div><b>Ye RFQ aapke paas hai</b><small>Lock ${h(lockTill(lk.until))}</small></div><button type="button" class="btn sm" id="rfRel">🔓 Release</button></div>`
      : lk.other ? `<div class="lockbar other" style="margin-top:12px">🔒 <div><b>${h(lk.holder)} is RFQ pe kaam kar raha/rahi hai</b><small>${L(`Aap dekh sakte ho, edit / quote / email sirf ${h(lk.holder)} karega.`, `You can view it, but only ${h(lk.holder)} can edit / quote / email.`)}</small></div>${isMgr() ? `<button type="button" class="btn sm" id="rfRel">Force release</button>` : `<button type="button" class="btn sm primary" id="rfReq">🙋 Request access</button>`}</div>`
      : `<div class="lockbar free" style="margin-top:12px">🔓 <div><b>Free RFQ</b><small>Lock karo — phir sirf aap is pe kaam karoge.</small></div><button type="button" class="btn sm primary" id="rfClaim">🔒 Lock karo</button></div>`}
    ${isNew ? "" : '<div id="rfMails"></div>'}
    <form id="rf"><fieldset ${work ? "" : "disabled"} style="border:0;padding:0;margin:0"><div class="grid2">
      <div><label class="f">Company *</label><input class="input" name="company" required maxlength="200" value="${h(r.company || "")}"></div>
      <div><label class="f">Contact</label><input class="input" name="contact" maxlength="120" value="${h(r.contact || "")}"></div>
      <div><label class="f">Phone</label><input class="input" name="phone" maxlength="40" value="${h(r.phone || "")}"></div>
      <div><label class="f">Email</label><input class="input" name="email" type="email" maxlength="200" value="${h(r.email || "")}"></div>
      <div><label class="f">Product *</label><input class="input" name="product" maxlength="200" value="${h(r.product || "")}"></div>
      <div class="grid2" style="gap:0 8px"><div><label class="f">Qty</label><input class="input" name="qty" maxlength="40" value="${h(r.qty || "")}"></div><div><label class="f">City</label><input class="input" name="city" maxlength="80" value="${h(r.city || "")}"></div></div>
      <div><label class="f">Due date</label><input class="input" name="due_date" type="date" value="${h(r.due_date || new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10))}"></div>
      <div><label class="f">Status</label><select class="input" name="status">${RFQ_STATUSES.map(([k, l]) => `<option value="${k}" ${k === (r.status || "new") ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div><label class="f">Quoted value (₹)</label><input class="input" name="quoted_value" type="number" min="0" value="${h(r.quoted_value || "")}"></div>
      <div><label class="f">Lock / owner</label>${isMgr() ? `<select class="input" name="owner_id"><option value="">— Free pool —</option>${assignable().map((u) => `<option value="${u.id}" ${u.id === r.owner_id ? "selected" : ""}>${h(u.full_name)}</option>`).join("")}</select>` : `<input class="input" disabled value="${h(isNew ? "Aap (save pe)" : lk.free ? "Free" : lk.holder)}">`}</div>
    </div><label class="f">Details</label><textarea class="input" name="details" maxlength="5000">${h(r.details || "")}</textarea></fieldset>
    ${r.source && r.source !== "manual" ? `<p class="mu">Source: ${h(SOURCES[r.source] || r.source)} ${r.source_ref ? "· " + h(r.source_ref) : ""}</p>` : ""}</form>
    ${isNew ? "" : `<details class="card sec" id="rfH"><summary>🔐 ${L("Lock history", "Lock history")}</summary><div class="card-b" style="padding:4px 16px"><div class="mu">…</div></div></details>`}`,
    foot: `${!isNew && isAdmin() ? `<button class="btn danger" id="rfDel" title="${h(L("Admin: ye RFQ hamesha ke liye hatao", "Admin: delete this RFQ for good"))}">${ic("trash")}</button>` : ""}${r.lead_id ? `<button class="btn" id="rfLead">Lead kholo</button>` : ""}${!isNew && work && r.phone ? `<a class="btn primary" id="rfCall" href="${h(telHref(r.phone))}">${ic("phone")} Call</a>` : ""}${!isNew && (work || lk.free) ? `<button class="btn" id="rfMail">${ic("mail")} Email</button><button class="btn" id="rfWa">${ic("wa")} WhatsApp</button><button class="btn" id="rfQ">${ic("file")} Quotation</button>` : ""}<span class="sp" style="flex:1"></span><button class="btn" data-close>Cancel</button>${work ? `<button class="btn primary" id="rfS">Save</button>` : ""}`,
  });
  const reload = async () => { const { data } = await sb.from("rfqs").select("*").eq("id", r.id).single(); if (data) rfqForm(data); };
  $("#rfClaim", m)?.addEventListener("click", (e) => busy(e.target, async () => {
    const x = await claim("rfq", r.id); if (!x.ok) toast(claimFailMsg(x), true); else toast(claimOkMsg(x, "RFQ")); refreshBadges(); reload(); if (S.route === "rfqs") softRefresh();
  }));
  $("#rfRel", m)?.addEventListener("click", (e) => busy(e.target, async () => {
    const why = await askRelease({ force: !lk.mine, holder: lk.holder }); if (why === false) return;
    const { data: rd, error } = await sb.rpc("release", { p_entity: "rfq", p_id: r.id, p_reason: why }); if (error) throw error;
    toast(lk.mine ? releasedMsg(rd) : "🔓 Released", !!rd?.banned_until); reload(); if (S.route === "rfqs") softRefresh();
  }));
  $("#rfReq", m)?.addEventListener("click", () => requestAccess("rfq", r));
  $("#rfCall", m)?.addEventListener("click", () => { sb.rpc("touch_rfq", { p_id: r.id }).then(() => {}); });   // counts as "worked" for the 15-min rule
  $("#rfH", m)?.addEventListener("toggle", async (e) => {
    if (!e.target.open || e.target.dataset.done) return; e.target.dataset.done = "1";
    const { data } = await sb.from("lock_history").select("*").eq("entity", "rfq").eq("entity_id", r.id).order("at", { ascending: false }).limit(30);
    e.target.querySelector(".card-b").innerHTML = lockHistoryHtml(data);
  });
  const outreach = async (channel) => { if (!(await ensureWork("rfq", r))) return; openComposer({ channel, rfq: r, onSent: () => S.route === "rfqs" && softRefresh() }); };
  // last mails sent for this RFQ — and whether the customer opened them
  if (!isNew) sb.from("email_messages").select("id, subject, created_at, track_token, open_count, click_count, opened_at, last_open_at, open_via, receipt_at")
    .eq("rfq_id", r.id).eq("direction", "out").order("created_at", { ascending: false }).limit(3).then(({ data }) => {
      const box = $("#rfMails", m); if (!box || !data?.length) return;
      box.innerHTML = `<div class="card" style="padding:8px 12px;margin:10px 0 0">${data.map((e) => `<div class="row" style="gap:6px;font-size:12.5px;padding:3px 0;flex-wrap:nowrap">📧 <span class="mu" style="white-space:nowrap">${h(ago(e.created_at))}</span><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h(e.subject || "")}</span>${openChip(e) || `<span class="badge">${L("Bheja", "Sent")}</span>`}</div>`).join("")}</div>`;
    }, () => {});
  $("#rfMail", m)?.addEventListener("click", () => outreach("email"));
  $("#rfWa", m)?.addEventListener("click", () => outreach("whatsapp"));
  $("#rfLead", m)?.addEventListener("click", () => { closeModal(); openLead(r.lead_id); });
  $("#rfDel", m)?.addEventListener("click", async () => {
    if (!(await confirmBox(L(`RFQ ${r.rfq_no} (${r.company}) permanently delete karna hai? Lead aur quotations rahenge. Ye wapas nahi aayega.`,
      `Delete RFQ ${r.rfq_no} (${r.company}) permanently? The lead and quotations stay. This cannot be undone.`), L("Haan, delete karo", "Yes, delete")))) return;
    const { data, error } = await sb.from("rfqs").delete().eq("id", r.id).select("id");
    if (error) return fail(error);
    if (!data?.length) return toast(L("Delete nahi hua — sirf Admin delete kar sakta hai", "Not deleted — only an Admin can delete it"), true);
    closeModal(); history.replaceState(null, "", "#/rfqs"); toast(L(`🗑 RFQ ${r.rfq_no} delete ho gaya`, `🗑 RFQ ${r.rfq_no} deleted`)); softRefresh();
  });
  $("#rfQ", m)?.addEventListener("click", async () => { if (!(await ensureWork("rfq", r))) return; quoteEditor({ rfq_id: r.id, lead_id: r.lead_id, to_party: { name: r.company, contact: r.contact, email: r.email, address: r.city, state: "Maharashtra" }, items: [{ desc: [r.product, r.details].filter(Boolean).join(" — ").slice(0, 300), hsn: "", qty: parseFloat(r.qty) || 1, price: 0, tax: 18 }] }); });
  $("#rfS", m)?.addEventListener("click", (e) => busy(e.target, async () => {
    const f = formData($("#rf", m));
    if (!f.company || !f.product) return toast("Company aur product zaroori", true);
    f.quoted_value = f.quoted_value ? Number(f.quoted_value) : null;
    if (!isMgr()) delete f.owner_id; else if (!f.owner_id) f.owner_id = null;
    const res = isNew ? await sb.from("rfqs").insert({ ...f, lead_id: r.lead_id || null, source: "manual" }).select("id")
      : await sb.from("rfqs").update(f).eq("id", r.id).select("id");
    if (res.error) throw res.error;
    if (!res.data?.length) return toast("Save nahi hua — RFQ ab aapke paas locked nahi hai", true);
    closeModal(); toast("RFQ saved ✔"); refreshBadges(); if (S.route === "rfqs") VIEWS.rfqs($("#page"));
  }));
}

// ---------------------------------------------------------------------
//  TASKS
// ---------------------------------------------------------------------
VIEWS.tasks = async (el) => {
  const all = el.dataset.all === "1" && isMgr();
  let q = sb.from("tasks").select("*, leads(company)").eq("done", false).order("due_at").limit(300);
  if (!all) q = q.eq("assignee_id", S.me.id);
  const now = new Date(), end = new Date(); end.setHours(23, 59, 59, 999);
  const [{ data: tasks, error }, { data: fus }] = await Promise.all([q,
    sb.from("leads").select("id, company, next_follow_up, owner_id, status").in("status", OPEN_STATUSES).not("next_follow_up", "is", null)
      .lte("next_follow_up", new Date(Date.now() + 7 * 864e5).toISOString()).or(all ? "owner_id.not.is.null,owner_id.is.null" : `owner_id.eq.${S.me.id}`).order("next_follow_up").limit(300)]);
  if (error) throw error;
  const items = [
    ...(tasks || []).map((t) => ({ k: "t", id: t.id, at: t.due_at, title: t.title, sub: t.leads?.company, lead: t.lead_id, who: t.assignee_id })),
    ...(fus || []).map((l) => ({ k: "f", id: l.id, at: l.next_follow_up, title: "Follow-up call", sub: l.company, lead: l.id, who: l.owner_id })),
  ].sort((a, b) => new Date(a.at) - new Date(b.at));
  const grp = { "🔴 Overdue": [], "🟡 Aaj": [], "📅 Aage": [] };
  items.forEach((i) => { const t = new Date(i.at); (t < now ? grp["🔴 Overdue"] : t <= end ? grp["🟡 Aaj"] : grp["📅 Aage"]).push(i); });
  el.innerHTML = `<div class="toolbar">${isMgr() ? `<div class="chips"><button class="chip ${all ? "" : "on"}" data-ta="0">Mere</button><button class="chip ${all ? "on" : ""}" data-ta="1">Team</button></div>` : ""}<span class="sp" style="flex:1"></span><button class="btn primary" data-act="newTask">${ic("plus")} Task</button></div>
    ${Object.entries(grp).map(([g, list]) => `<div class="sec-t" style="margin-top:16px">${g} (${list.length})</div><div class="card">${list.map((i) => `
      <div class="row" style="padding:11px 16px;border-bottom:1px solid var(--line);flex-wrap:nowrap">
        ${i.k === "t" ? `<input type="checkbox" data-tdone="${i.id}" aria-label="Done" style="width:16px;height:16px;accent-color:var(--accent)">` : `<span>📞</span>`}
        <div style="flex:1;min-width:0"><b>${h(i.title)}</b> ${i.sub ? `<a href="#" data-act="lead" data-id="${i.lead}">${h(i.sub)}</a>` : ""}${all ? `<div class="mu" style="font-size:12px">${h(userName(i.who))}</div>` : ""}</div>${followBadge(i.at)}</div>`).join("") || '<div class="empty" style="padding:18px">—</div>'}</div>`).join("")}`;
  $$("[data-ta]", el).forEach((b) => b.onclick = () => { el.dataset.all = b.dataset.ta; VIEWS.tasks(el); });
  $$("[data-tdone]", el).forEach((c) => c.onchange = async () => { await sb.from("tasks").update({ done: true, done_at: new Date().toISOString() }).eq("id", c.dataset.tdone); toast("Done ✔"); VIEWS.tasks(el); });
};
ACT.newTask = () => taskForm({});
function taskForm(t, done) {
  const m = modal({
    title: "Naya task",
    body: `<label class="f">Kya karna hai *</label><input class="input" id="tt" maxlength="200" value="${h(t.title || "")}">
      <label class="f">Kab</label><input class="input" id="td" type="datetime-local" value="${h(toLocalInput(new Date(Date.now() + 864e5)))}">
      ${isMgr() ? `<label class="f">Kisko</label><select class="input" id="tw">${assignable().map((u) => `<option value="${u.id}" ${u.id === S.me.id ? "selected" : ""}>${h(u.full_name)}</option>`).join("")}</select>` : ""}`,
    foot: `<button class="btn" data-close>Cancel</button><button class="btn primary" id="ts">Save</button>`,
  });
  $("#ts", m).onclick = (e) => busy(e.target, async () => {
    const title = $("#tt", m).value.trim(), at = $("#td", m).value;
    if (!title || !at) return toast("Title aur time daalo", true);
    const { error } = await sb.from("tasks").insert({ title, due_at: new Date(at).toISOString(), lead_id: t.lead_id || null, assignee_id: $("#tw", m)?.value || S.me.id, created_by: S.me.id });
    if (error) throw error; closeModal(); toast("Task added ✔"); done ? done() : softRefresh();
  });
}

// ---------------------------------------------------------------------
//  QUOTATIONS (GST)
// ---------------------------------------------------------------------
const r2 = (n) => Math.round((+n + Number.EPSILON) * 100) / 100;
function qCalc(q) {          // only ticked items count; unticked ones ("opt") are optional
  const co = S.settings.company || {}; let sub = 0, optSub = 0, optN = 0; const base = {};
  (q.items || []).forEach((it) => { const t = r2((+it.qty || 0) * (+it.price || 0)); if (it.opt) { optSub += t; optN++; return; } sub += t; base[+it.tax || 0] = (base[+it.tax || 0] || 0) + t; });
  const a = String(co.state || "").trim().toLowerCase(), b = String(q.to_party?.state || "").trim().toLowerCase();
  const inter = !!(a && b && a !== b); const lines = []; let tax = 0;
  Object.keys(base).map(Number).sort((x, y) => x - y).forEach((rt) => {
    if (!rt) return; const t = r2(base[rt] * rt / 100); tax += t;
    if (inter) lines.push([`IGST ${rt}%`, t]); else { const c = r2(t / 2); lines.push([`CGST ${rt / 2}%`, c], [`SGST ${rt / 2}%`, r2(t - c)]); }
  });
  const raw = r2(r2(sub) + r2(tax)), grand = q.round_off === false ? raw : Math.round(raw);
  return { sub: r2(sub), tax: r2(tax), grand, round: r2(grand - raw), lines, inter, optSub: r2(optSub), optN };
}
// ---- quotation helpers: payment / delivery presets, valid-till, AMC wording
const PAY_TERMS = ["100% advance", "50% advance, 50% on delivery", "Against delivery", "Within 7 days", "Within 15 days", "Within 30 days", "Within 45 days", "Within 60 days"];
const DELIVERY = ["Immediate", "2–5 working days (electronic delivery)", "3–5 working days", "7–10 working days", "2–3 weeks", "As per the AMC schedule", "As per schedule", "Open order (as and when required)"];
const AMC_PM = ["Quarterly", "Monthly", "Half-yearly", "Yearly", "On call only"];
const AMC_BILL = ["Yearly in advance", "Half-yearly in advance", "Quarterly in advance", "Monthly in advance", "Quarterly in arrears", "Monthly in arrears"];
const AMC_COVER = ["Comprehensive — spares + labour", "Non-comprehensive — labour only"];
const isoDay = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const niceDay = (s) => s ? new Date(s + (String(s).length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "";
const addDaysIso = (s, n) => { const d = new Date((s || isoDay()) + "T00:00:00"); d.setDate(d.getDate() + n); return isoDay(d); };
const amcEnd = (a) => { if (!a?.start) return ""; const d = new Date(a.start + "T00:00:00"); d.setMonth(d.getMonth() + (+a.months || 12)); d.setDate(d.getDate() - 1); return isoDay(d); };
const isAmcText = (t) => /(^|[^a-z])(amc|annual maintenance|maintenance contract|fms|facility management|resident engineer)([^a-z]|$)/i.test(t || "");
// the commercial terms box (print + online page use the same rows)
function quoteTermRows(q) {
  const rows = [["Quotation date", niceDay(q.quote_date || isoDay(new Date(q.created_at || Date.now())))],
    ["Valid till", niceDay(addDaysIso(q.quote_date || isoDay(new Date(q.created_at || Date.now())), +q.validity_days || 7))],
    ["Payment terms", q.payment_terms], ["Delivery", q.delivery], ["Your reference", q.ref]];
  if (q.amc?.start) rows.push(["AMC period", `${niceDay(q.amc.start)} – ${niceDay(amcEnd(q.amc))} (${+q.amc.months || 12} months)`],
    ["Coverage", q.amc.coverage], ["Preventive visits", q.amc.pm], ["Standby", q.amc.standby],
    ["Billing", q.amc.billing + (/monthly|quarterly/i.test(q.amc.billing || "") && q.amc.bill_day ? `, bill on day ${q.amc.bill_day}` : "")]);
  return rows.filter(([, v]) => v);
}
const W1 = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"], W2 = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const w2 = (n) => n < 20 ? W1[n] : W2[Math.floor(n / 10)] + (n % 10 ? " " + W1[n % 10] : "");
const w3 = (n) => (n >= 100 ? W1[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " : "") : "") + (n % 100 ? w2(n % 100) : "");
function wInt(n) { if (!n) return "Zero"; const p = [], cr = Math.floor(n / 1e7); n %= 1e7; const la = Math.floor(n / 1e5); n %= 1e5; const th = Math.floor(n / 1e3); n %= 1e3; if (cr) p.push(wInt(cr) + " Crore"); if (la) p.push(w2(la) + " Lakh"); if (th) p.push(w2(th) + " Thousand"); if (n) p.push(w3(n)); return p.join(" "); }
const rupeesWords = (v) => { v = r2(v); const r = Math.floor(v), ps = Math.round((v - r) * 100); return wInt(r) + " Rupees" + (ps ? " and " + w2(ps) + " Paise" : "") + " Only"; };

// Quotations page: search (number / customer), status, CRM vs ERP history, one customer, 100 at a time
const QF = { q: "", st: "", src: "", lead: null, leadName: "", n: 100 };
const QD = dateState("quotes");
let qSeq = 0;
HOOK.quotesFor = (id, name) => {
  Object.assign(QF, { lead: id, leadName: name || "", q: "", st: "", src: "", n: 100 });
  closeDrawer();
  if (S.route === "quotes") VIEWS.quotes($("#page")); else location.hash = "#/quotes";
};
const erpBy = (q) => (String(q.note_internal || "").match(/Banayi: ([^·]+)/) || [])[1]?.trim() || "";
VIEWS.quotes = async (el, soft) => {
  if (!soft || !$("#qtb", el)) {
    const ST = [["", L("Sab", "All")], ["draft", "Draft"], ["sent", "Sent"], ["won", "Won"], ["lost", "Lost"], ["proforma", "📄 Proforma"]];
    el.innerHTML = `<div class="toolbar" id="qtb">
      <input class="input grow" id="qq" type="search" maxlength="80" autocomplete="off" value="${h(QF.q)}" aria-label="${h(L("Quotation dhoondo", "Search quotations"))}"
        placeholder="${h(L("Quotation no. ya customer ka naam…", "Quotation no. or customer name…"))}">
      <div class="chips" id="qst" role="group" aria-label="Status">${ST.map(([k, t]) => `<button class="chip ${QF.st === k ? "on" : ""}" data-st="${k}" aria-pressed="${QF.st === k}">${h(t)}</button>`).join("")}</div>
      <select class="input" id="qsrc" style="width:auto" aria-label="${h(L("Kahan se", "Source"))}">
        <option value="">CRM + ERP</option><option value="crm" ${QF.src === "crm" ? "selected" : ""}>${L("Sirf CRM", "CRM only")}</option><option value="erp" ${QF.src === "erp" ? "selected" : ""}>${L("Sirf ERP (purani)", "ERP only (old)")}</option></select>
      <span class="sp" style="flex:1"></span><button class="btn primary" data-act="newQuote">${ic("plus")} Quotation</button></div>
    ${dateBarHtml("quotes", QD)}
    <div id="qlead"></div>
    <div class="card"><div class="tbl-wrap" id="qbody"><div class="empty">Loading…</div></div><div id="qfoot"></div></div>`;
    let t;
    $("#qq", el).oninput = (e) => { clearTimeout(t); t = setTimeout(() => { QF.q = e.target.value.trim(); QF.n = 100; loadQuotes(el); }, 280); };
    $$("#qst .chip", el).forEach((b) => b.onclick = () => {
      QF.st = b.dataset.st; QF.n = 100;
      $$("#qst .chip", el).forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", x === b); });
      loadQuotes(el);
    });
    $("#qsrc", el).onchange = (e) => { QF.src = e.target.value; QF.n = 100; loadQuotes(el); };
    wireDateBar(el, "quotes", QD, () => { QF.n = 100; loadQuotes(el); });
  }
  await loadQuotes(el);
};
async function loadQuotes(el) {
  const seq = ++qSeq;
  if (QF.st === "proforma") return loadProformas(el, seq);
  let q = sb.from("quotations").select("id, quote_no, to_party, status, grand_total, quote_date, created_at, owner_id, lead_id, view_count, customer_response, import_batch, note_internal", { count: "exact" })
    .order("created_at", { ascending: false }).order("id", { ascending: false }).range(0, QF.n - 1);
  if (QF.st) q = q.eq("status", QF.st);
  q = applyDates(q, "quote_date", QD);
  if (QF.src === "erp") q = q.not("import_batch", "is", null); else if (QF.src === "crm") q = q.is("import_batch", null);
  if (QF.lead) q = q.eq("lead_id", QF.lead);
  // words only (punctuation → "anything"): "dr. mahinder" finds "DR. MAHINDER WATSA", "7737" finds "PR/26/7737"
  const term = QF.q.split(/[^\p{L}\p{N}&/-]+/u).filter(Boolean).join("*");
  if (term) q = q.or(`quote_no.ilike."*${term}*",to_party->>name.ilike."*${term}*"`);
  const { data, error, count } = await q;
  if (seq !== qSeq || !$("#qbody", el)) return;
  if (error) throw error;
  $("#qlead", el).innerHTML = QF.lead ? `<div class="row" style="margin:0 0 10px"><span class="badge info" style="height:28px;padding:0 10px">🏢 ${h(L("Sirf", "Only"))}: ${h(QF.leadName || "#" + QF.lead)}</span><button class="btn sm" id="qlx">✕ ${L("Sab customers", "All customers")}</button></div>` : "";
  if (QF.lead) $("#qlx", el).onclick = () => { QF.lead = null; QF.leadName = ""; QF.n = 100; loadQuotes(el); };
  const filtered = QF.q || QF.st || QF.src || QF.lead;
  $("#qbody", el).innerHTML = !data.length ? (filtered ? `<div class="empty"><b>${L("Kuch nahi mila", "Nothing found")}</b>${L("Search ya filter badal ke dekho", "Try another search or filter")}</div>`
      : `<div class="empty"><b>Abhi koi quotation nahi</b>Lead ya RFQ se “Quotation banao” dabao.</div>`)
    : `<table class="tbl"><thead><tr><th>No.</th><th>Customer</th><th>Status</th><th class="num">Total</th><th>Owner</th><th>Date</th><th></th></tr></thead><tbody>
  ${data.map((q) => `<tr data-act="quote" data-id="${q.id}"><td class="mono">${h(q.quote_no)}${q.import_batch ? ` <span class="badge" title="${h(L("Purane ERP (ant.myerp) se aayi", "Brought in from the old ERP (ant.myerp)"))}">ERP</span>` : ""}</td><td class="co">${h(q.to_party?.name || "")}</td><td><span class="badge ${q.status === "won" ? "good" : q.status === "lost" ? "bad" : q.status === "sent" ? "info" : ""}">${h(q.status)}</span>${q.customer_response === "accepted" ? ' <span class="badge good" title="Customer accepted online">✅</span>' : q.customer_response === "changes" ? ' <span class="badge warn" title="Customer requested changes">✏️</span>' : ""}${q.view_count ? ` <span class="badge info" title="${L("Customer ne online dekhi", "Viewed online by customer")}">👁 ${q.view_count}</span>` : ""}</td><td class="num">${inr(q.grand_total)}</td><td>${h(q.owner_id ? userName(q.owner_id) : erpBy(q) || "—")}</td><td class="sub">${h(dOnly(q.quote_date || q.created_at))}</td><td style="width:44px">${isMgr() || q.owner_id === S.me.id ? `<button class="btn ghost icon sm danger" data-act="delQuote" data-id="${q.id}" data-no="${h(q.quote_no)}" data-co="${h(q.to_party?.name || "")}" title="${L("Delete karo", "Delete")}" aria-label="Delete">${ic("trash")}</button>` : ""}</td></tr>`).join("")}</tbody></table>`;
  const total = count ?? data.length;
  $("#qfoot", el).innerHTML = data.length ? `<div class="row" style="padding:10px 16px;border-top:1px solid var(--line)"><span class="mu">${L(`${num(data.length)} / ${num(total)} dikh rahi hain`, `Showing ${num(data.length)} of ${num(total)}`)}</span><span class="sp" style="flex:1"></span>${total > data.length ? `<button class="btn sm" id="qmore">${L("100 aur dikhao", "Show 100 more")}</button>` : ""}</div>` : "";
  const more = $("#qmore", el);
  if (more) more.onclick = () => busy(more, async () => { QF.n += 100; await loadQuotes(el); });
}
// Quotations → 📄 Proforma: the approved-items quotations made from customers' replies (same number as the quotation)
async function loadProformas(el, seq) {
  let q = sb.from("proformas").select("id, pi_no, picked, items, grand_total, status, sent_at, created_at, owner_id, lead_id, quotation_id, email_id, to_party", { count: "exact" })
    .order("id", { ascending: false }).range(0, QF.n - 1);
  if (QF.lead) q = q.eq("lead_id", QF.lead);
  q = applyDates(q, "created_at", QD, true);
  const term = QF.q.split(/[^\p{L}\p{N}&/-]+/u).filter(Boolean).join("*");
  if (term) q = q.or(`pi_no.ilike."*${term}*",to_party->>name.ilike."*${term}*"`);
  const { data, error, count } = await q;
  if (seq !== qSeq || !$("#qbody", el)) return;
  if (error) throw error;
  $("#qlead", el).innerHTML = QF.lead ? `<div class="row" style="margin:0 0 10px"><span class="badge info" style="height:28px;padding:0 10px">🏢 ${h(L("Sirf", "Only"))}: ${h(QF.leadName || "#" + QF.lead)}</span><button class="btn sm" id="qlx">✕ ${L("Sab customers", "All customers")}</button></div>` : "";
  if (QF.lead) $("#qlx", el).onclick = () => { QF.lead = null; QF.leadName = ""; QF.n = 100; loadQuotes(el); };
  const itemsOf = (p) => (p.items || []).map((it) => `#${it.sr} ${it.desc}`).join(" · ");
  $("#qbody", el).innerHTML = !data.length
    ? `<div class="empty"><b>${L("Abhi koi proforma nahi", "No proformas yet")}</b>${L("Inbox mein customer ka \"approved\" wala reply kholo — wahin \"Proforma bana do\" card aata hai.", "Open a customer's \"approved\" reply in the Inbox — the \"Make the proforma\" card is there.")}</div>`
    : `<table class="tbl"><thead><tr><th>No.</th><th>Customer</th><th>${L("Approved items", "Approved items")}</th><th class="num">${L("Total (GST ke saath)", "Total (incl. GST)")}</th><th>Status</th><th>${L("Kisne", "By")}</th><th>Date</th><th></th></tr></thead><tbody>
    ${data.map((p) => `<tr data-act="quote" data-id="${p.quotation_id || ""}" title="${h(L("Quotation kholo", "Open the quotation"))}">
      <td class="mono">${h(p.pi_no)}</td><td class="co">${h(p.to_party?.name || "")}</td>
      <td class="sub" style="max-width:320px">${h(itemsOf(p).slice(0, 160))}</td><td class="num">${h(inr(+p.grand_total))}</td>
      <td>${p.status === "sent" ? `<span class="badge good">🏆 ${L("Bheja · Won", "Sent · Won")}</span>` : p.status === "cancelled" ? `<span class="badge">Cancelled</span>` : `<span class="badge warn">${L("Draft — bheja nahi", "Draft — not sent")}</span>`}</td>
      <td class="sub">${h(userName(p.owner_id))}</td><td class="sub">${h(dOnly(p.sent_at || p.created_at))}</td>
      <td style="white-space:nowrap"><button class="btn sm" data-pfv="${p.id}" title="PDF">👁</button> <button class="btn sm" data-pfm="${p.id}">✉️ ${L("Mail", "Mail")}</button>${p.status === "draft" ? ` <button class="btn sm" data-pfs="${p.id}" title="${h(L("Customer ko bhej diya (WhatsApp / haath se) — quotation Won karo", "Sent to the customer (WhatsApp / by hand) — mark the quotation Won"))}">✅ ${L("Bhej diya", "Mark sent")}</button>` : ""}</td></tr>`).join("")}</tbody></table>`;
  const total = count ?? data.length;
  $("#qfoot", el).innerHTML = data.length ? `<div class="row" style="padding:10px 16px;border-top:1px solid var(--line)"><span class="mu">${L(`${num(data.length)} / ${num(total)} dikh rahe hain · bhejte hi quotation apne aap Won`, `Showing ${num(data.length)} of ${num(total)} · sending one marks its quotation Won`)}</span></div>` : "";
  const pf = (id) => data.find((x) => x.id === +id);
  const quoteOf = async (p) => { const { data: qq, error: e } = await sb.from("quotations").select("*").eq("id", p.quotation_id).single(); if (e) throw e; return qq; };
  $$("[data-pfv]", el).forEach((b) => b.onclick = (e) => { e.stopPropagation(); busy(b, async () => {
    const p = pf(b.dataset.pfv), a = await HOOK.proformaPdf(p, await quoteOf(p));
    const u = URL.createObjectURL(a.blob); if (!openTab(u)) saveBlob(a.blob, a.name); setTimeout(() => URL.revokeObjectURL(u), 60000);
  }); });
  $$("[data-pfm]", el).forEach((b) => b.onclick = (e) => { e.stopPropagation(); busy(b, async () => {
    const p = pf(b.dataset.pfm), qq = await quoteOf(p);
    const { data: lead } = p.lead_id ? await sb.from("leads").select("*").eq("id", p.lead_id).single() : { data: null };
    if (lead && !(await ensureWork("lead", lead))) return;
    const { data: mail } = p.email_id ? await sb.from("email_messages").select("*").eq("id", p.email_id).maybeSingle() : { data: null };
    const { proformaMail } = await import("./proforma.js");
    proformaMail({ pi: p, q: qq, lead: lead || undefined, reply: mail && mail.user_id === S.me.id ? mail : null, mailAt: mail?.created_at, openComposer, refresh: () => loadQuotes(el) });
  }); });
  $$("[data-pfs]", el).forEach((b) => b.onclick = (e) => { e.stopPropagation(); (async () => {
    const p = pf(b.dataset.pfs);
    if (!(await confirmBox(L(`${p.pi_no} customer ko bhej diya? Quotation aur lead Won ho jayenge.`, `Was ${p.pi_no} sent to the customer? The quotation and the lead become Won.`), L("Haan, Won karo", "Yes, mark Won")))) return;
    busy(b, async () => { const { error: e2 } = await sb.rpc("proforma_sent", { p_id: p.id }); if (e2) throw e2; toast(L(`🏆 Quotation ${p.pi_no} Won`, `🏆 Quotation ${p.pi_no} Won`)); softRefresh(); loadQuotes(el); });
  })().catch(fail); });
}
ACT.newQuote = () => quoteEditor({ to_party: { state: "Maharashtra" }, items: [] });
ACT.delQuote = async (t) => {
  const no = t.dataset.no || "", co = t.dataset.co || "";
  const { data: obs } = await sb.from("obfs").select("obf_no, status").eq("quotation_id", +t.dataset.id);
  const ob = (obs || []).map((o) => `OBF ${o.obf_no || "(draft)"}`).join(", ");
  if (!(await confirmBox(L(`Quotation ${no}${co ? " (" + co + ")" : ""} permanently delete karni hai?${ob ? ` Iska ${ob} bhi delete hoga.` : ""} Ye wapas nahi aayegi.`,
    `Delete quotation ${no}${co ? " (" + co + ")" : ""} permanently?${ob ? ` Its ${ob} is deleted too.` : ""} This cannot be undone.`), L("Haan, delete karo", "Yes, delete")))) return;
  const { data, error } = await sb.from("quotations").delete().eq("id", +t.dataset.id).select("id, lead_id, quote_no");
  if (error) return fail(error);
  if (!data?.length) return toast(L("Delete nahi hui — sirf banane wala ya Manager delete kar sakta hai", "Not deleted — only its creator or a Manager can delete it"), true);
  const d = data[0];
  if (d.lead_id) sb.from("activities").insert({ lead_id: d.lead_id, kind: "system", body: `🗑 Quotation ${d.quote_no} delete ki` }).then(() => {}, () => {});
  closeModal(); toast(L(`🗑 Quotation ${no} delete ho gayi`, `🗑 Quotation ${no} deleted`));
  if (S.route === "quotes") loadQuotes($("#page")).catch(() => {});
};
ACT.quote = async (t) => { const { data, error } = await sb.from("quotations").select("*").eq("id", +t.dataset.id).single(); if (error) return fail(error); quoteEditor(data); };

// ---- quotation Terms & Conditions / Annexure templates (migration 050)
let QTPL = null, QTPL_AT = 0;
async function loadQTpl(force = false) {
  if (QTPL && !force && Date.now() - QTPL_AT < 300000) return QTPL;
  const { data, error } = await sb.from("quote_templates").select("id, kind, name, body, categories, keywords, is_default, sort").eq("active", true).order("sort").order("name");
  if (error) throw error;
  QTPL = data || []; QTPL_AT = Date.now(); return QTPL;
}
const reEsc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const kwRe = (kws) => (kws || []).length ? new RegExp("(^|[^a-z0-9])(" + kws.map(reEsc).join("|") + ")(?=$|[^a-z0-9])", "i") : null;
// every product picks its own best template (keyword in the item = 2 points, product category = 1);
// the result is all templates the products need, most important first (none → default T&C / no annexure)
function autoTpls(kind, items) {
  const list = (QTPL || []).filter((t) => t.kind === kind);
  const res = list.map((t) => ({ t, re: kwRe(t.keywords), cats: (t.categories || []).map((c) => c.toLowerCase()) }));
  const total = new Map(), order = [];
  for (const it of items || []) {
    const p = findProduct(it.desc), text = [it.desc, p && prodLabel(p)].filter(Boolean).join(" ").toLowerCase(), cat = (p?.category || "").toLowerCase();
    if (!text.trim()) continue;
    let best = null, top = 0;
    for (const x of res) { const sc = (cat && x.cats.includes(cat) ? 1 : 0) + (x.re && x.re.test(text) ? 2 : 0); if (sc > top) { best = x.t; top = sc; } }
    if (!best) continue;
    if (!total.has(best.id)) order.push(best);
    total.set(best.id, (total.get(best.id) || 0) + top);
  }
  order.sort((a, b) => total.get(b.id) - total.get(a.id) || a.sort - b.sort);
  if (!order.length && kind === "terms") { const d = list.find((t) => t.is_default); if (d) order.push(d); }
  return order;
}
// several T&C templates → one list: same clause once; a clause with the same heading but other wording keeps
// the product type in its heading ("Delivery (Hardware Supply): …"); the jurisdiction line stays last
function mergeTerms(tpls, fill) {
  const out = [], tail = [], labels = new Set(), keys = new Set();
  const key = (x) => x.toLowerCase().replace(/\bgovt\b\.?/g, "government").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 34);
  for (const t of tpls) {
    const doc = new DOMParser().parseFromString(fill(t.body), "text/html");
    for (const li of doc.querySelectorAll("li")) {
      const txt = li.textContent.replace(/\s+/g, " ").trim(); if (!txt) continue;
      const b = li.firstElementChild?.tagName === "B" && /^<b>/i.test(li.innerHTML.trim()) ? li.firstElementChild : null;
      if (b) {
        const label = b.textContent.replace(/:\s*$/, "").trim().toLowerCase(), k = label + "|" + key(txt.slice(b.textContent.length));
        if (keys.has(k)) continue;
        keys.add(k);
        if (labels.has(label)) b.textContent = b.textContent.replace(/:\s*$/, "").trim() + ` (${t.name.split(/\s+—\s+/)[0]}):`;
        labels.add(label);
      } else { const k = key(txt); if (keys.has(k)) continue; keys.add(k); }
      (/jurisdiction/i.test(txt) ? tail : out).push(li.innerHTML.trim());
    }
  }
  return "<ol>\n" + out.concat(tail.slice(0, 1)).map((x) => `<li>${x}</li>`).join("\n") + "\n</ol>";
}
const qtOptions = (kind) => `<option value="auto">✨ Auto — ${L("products ke hisaab se", "from the products")}</option><option value="">${kind === "terms" ? L("— Koi T&C nahi —", "— No terms —") : L("— Koi annexure nahi —", "— No annexure —")}</option>` +
  (QTPL || []).filter((t) => t.kind === kind).map((t) => `<option value="${t.id}">${h(t.name)}</option>`).join("");
function qtBox(kind, q) {
  const isT = kind === "terms";
  return `<div class="qtbox" data-qk="${kind}">
    <div class="qth"><label class="f" for="qt_${kind}">${isT ? "Terms &amp; Conditions" : "Annexure"}</label>
      ${isMgr() ? `<button type="button" class="btn ghost icon sm" data-tnew="${kind}" title="${L("Naya template banao", "New template")}" aria-label="${L("Naya template banao", "New template")}">${ic("plus")}</button><button type="button" class="btn ghost icon sm" data-tedit="${kind}" title="${L("Chuna hua template edit karo", "Edit the selected template")}" aria-label="${L("Template edit karo", "Edit template")}">${ic("edit")}</button>` : ""}
      <span class="badge info qtauto" hidden title="${L("Quotation ke products dekh ke apne aap chuna", "Picked automatically from the products in this quotation")}">✨ Auto</span></div>
    <select class="input" id="qt_${kind}" aria-label="${isT ? "Terms & Conditions template" : "Annexure template"}">${qtOptions(kind)}</select>
    <div class="rte-host" id="qe_${kind}"></div></div>`;
}

async function quoteEditor(q0) {
  await Promise.all([loadProducts().catch(() => {}), loadQTpl().catch(() => {})]);
  const q = structuredClone(q0); q.items = q.items?.length ? q.items : [{ desc: "", hsn: "", qty: 1, price: 0, tax: 18 }]; q.to_party ||= {};
  const tp = q.to_party;
  const m = modal({
    title: q.id ? `Quotation ${q.quote_no}` : "Nayi quotation", wide: true,
    body: `<div class="grid3 qcust">
      <div class="qcs"><label class="f" for="qcn">Customer * <span class="lbl-hint" id="qlinked">${q.lead_id ? "🔗 " + L("customer record se juda", "linked to the customer record") : L("— naam, phone ya GSTIN likho", "— type a name, phone or GSTIN")}</span></label>
        <input class="input" id="qcn" data-tp="name" value="${h(tp.name || "")}" maxlength="200" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="qcsL"><div class="qcs-list" id="qcsL" role="listbox" hidden></div></div>
      <div><label class="f">Contact person</label><input class="input" data-tp="contact" value="${h(tp.contact || "")}" maxlength="120"></div>
      <div><label class="f">Phone</label><input class="input" data-tp="phone" value="${h(tp.phone || "")}" maxlength="16" inputmode="tel" placeholder="${h(L("10 digit mobile", "10-digit mobile"))}"></div>
      <div><label class="f">Email</label><input class="input" data-tp="email" type="email" inputmode="email" value="${h(tp.email || "")}" maxlength="200" placeholder="name@company.com"></div>
      <div><label class="f">Billing address</label><input class="input" data-tp="address" value="${h(tp.address || "")}" maxlength="300"></div>
      <div><label class="f">State (GST)</label><input class="input" data-tp="state" value="${h(tp.state || "")}" maxlength="60" list="stateDL" autocomplete="off"><datalist id="stateDL">${STATE_NAMES.map((n) => `<option value="${h(n)}">`).join("")}</datalist><datalist id="unitDL">${["Number", "Nos", "Set", "Licence", "User", "Seat", "Month", "Year", "Box", "Metre", "Lot"].map((u) => `<option value="${u}">`).join("")}</datalist><datalist id="warDL">${["1 Year", "2 Years", "3 Years", "5 Years", "6 Months", "As per OEM", "N/A"].map((u) => `<option value="${u}">`).join("")}</datalist></div>
      <div><label class="f">GSTIN</label><input class="input mono" data-tp="gstin" value="${h(tp.gstin || "")}" maxlength="24" autocomplete="off" spellcheck="false" placeholder="27ABCDE1234F1Z5"></div>
      <div class="qsite"><label class="f" for="qsite">Delivery / site address <span class="lbl-hint">— ${L("khali = billing address", "empty = same as billing")}</span></label><input class="input" id="qsite" value="${h(q.site?.address || "")}" maxlength="300"></div></div>
    <div class="qbar sec">
      <div><label class="f" for="qdate">Date</label><input class="input" type="date" id="qdate" value="${h(q.quote_date || isoDay())}"></div>
      <div><label class="f" for="qval">Validity <span class="lbl-hint" id="qvt"></span></label><div class="qval"><input class="input" type="number" id="qval" min="1" max="365" value="${h(q.validity_days || 7)}"><span class="qval-d">${L("din", "days")}</span>${[7, 15, 30].map((d) => `<button type="button" class="chip" data-val="${d}">${d}</button>`).join("")}</div></div>
      <div><label class="f" for="qpay">Payment terms</label><input class="input" id="qpay" list="payDL" value="${h(q.payment_terms || "")}" maxlength="200" autocomplete="off"></div>
      <div><label class="f" for="qdel">Delivery</label><input class="input" id="qdel" list="delDL" value="${h(q.delivery || "")}" maxlength="200" autocomplete="off"></div>
      <div><label class="f" for="qref">Customer ref / PO</label><input class="input" id="qref" value="${h(q.ref || "")}" maxlength="200" placeholder="${h(L("Enquiry / RFQ / PO no.", "Enquiry / RFQ / PO no."))}"></div></div>
    <datalist id="payDL">${PAY_TERMS.map((x) => `<option value="${h(x)}"></option>`).join("")}</datalist><datalist id="delDL">${DELIVERY.map((x) => `<option value="${h(x)}"></option>`).join("")}</datalist>
    <div class="qamc sec" id="qamc" hidden><div class="qamc-h">🛠 AMC details <span class="lbl-hint">— ${L("quotation, OBF aur renewal reminder mein apne aap jaate hain", "go to the quotation, the OBF and the renewal reminder by themselves")}</span></div>
      <div class="qamc-g">
        <div><label class="f" for="amS">Start</label><input class="input" type="date" id="amS"></div>
        <div><label class="f" for="amM">Period <span class="lbl-hint" id="amE"></span></label><select class="input" id="amM">${[3, 6, 12, 24, 36].map((n) => `<option value="${n}">${n} ${L("mahine", "months")}</option>`).join("")}</select></div>
        <div><label class="f" for="amC">Coverage</label><select class="input" id="amC">${AMC_COVER.map((x) => `<option>${h(x)}</option>`).join("")}</select></div>
        <div><label class="f" for="amP">Preventive visits</label><select class="input" id="amP">${AMC_PM.map((x) => `<option>${h(x)}</option>`).join("")}</select></div>
        <div><label class="f" for="amSb">Standby</label><select class="input" id="amSb"><option>Not applicable</option><option>Standby unit during repair</option></select></div>
        <div><label class="f" for="amB">Billing</label><select class="input" id="amB">${AMC_BILL.map((x) => `<option>${h(x)}</option>`).join("")}</select></div>
        <div id="amDW"><label class="f" for="amD">Bill on day</label><input class="input" type="number" id="amD" min="1" max="28" value="1"></div></div></div>
    ${quoteTrackHtml(q)}${productDatalist()}
    <div class="sec tbl-wrap"><table class="tbl" id="qi"><thead><tr><th class="qchk"><input type="checkbox" id="qall" title="${h(L("Sab items total mein", "All items in the total"))}" aria-label="${h(L("Sab items total mein", "All items in the total"))}"></th><th>Description</th><th style="width:100px">HSN/SAC</th><th style="width:80px">Qty</th><th style="width:120px">Rate ₹</th><th style="width:96px">GST %</th><th class="num" style="width:110px">Amount</th><th></th></tr></thead><tbody></tbody></table>
      <div class="qadd-row"><button class="btn sm" id="qadd">${ic("plus")} Item</button>${["Transportation", "Courier charges", "Installation"].map((c) => `<button type="button" class="btn sm ghost" data-chg="${c}">＋ ${c}</button>`).join("")}</div>
      <p class="qtickhint mu">✓ ${L("Sirf tick kiye items total mein judte hain. Untick = Optional (total mein nahi).", "Only ticked items make the total. Unticked = Optional (not in the total).")}</p>
      <label class="qso" id="qsoW" hidden><input type="checkbox" id="qso"${q.show_optional === false ? "" : " checked"}> ${L("Optional items quotation pe alag dikhao (total mein nahi judte)", "Show optional items on the quotation (not added to the total)")}</label></div>
    <div class="grid2 sec"><div><label class="f" for="qs">Status</label><select class="input" id="qs">${["draft", "sent", "won", "lost"].map((x) => `<option ${x === (q.status || "draft") ? "selected" : ""}>${x}</option>`).join("")}</select></div>
      <div id="qt" style="padding-top:28px"></div></div>
    <div class="grid2 sec">
      <div><label class="f" for="qnc">Customer note <span class="lbl-hint">— ${L("quotation pe print hoga", "printed on the quotation")}</span></label><textarea class="input" id="qnc" maxlength="3000" rows="3" placeholder="${h(L("Jaise: Delivery 2 din mein · Prices 1 saal ke liye", "e.g. Delivery in 2 days · Prices are for 1 year"))}">${h(q.note_customer || "")}</textarea></div>
      <div><label class="f" for="qni">Internal note <span class="lbl-hint">🔒 ${L("sirf team — kabhi print nahi hota", "team only — never printed")}</span></label><textarea class="input" id="qni" maxlength="3000" rows="3" placeholder="${h(L("Jaise: discount approve hua · vendor price · follow-up", "e.g. discount approved · vendor price · follow-up"))}">${h(q.note_internal || "")}</textarea></div></div>
    <div class="grid2 sec qtc">${qtBox("annexure", q)}${qtBox("terms", q)}</div>
    <div id="qtplEd"></div>`,
    foot: `${q.id ? `<button class="btn" id="qp">${ic("print")} Print / PDF</button><button class="btn" id="qlink" title="${L("Online link copy karo", "Copy online link")}">🔗 Link</button><button class="btn" id="qmail">${ic("mail")} Email</button><button class="btn" id="qwa">${ic("wa")} WhatsApp</button><button class="btn" id="qcopy" title="${h(L("Isi jaisi nayi quotation", "A new quotation like this one"))}">📄 Copy</button>${q.status !== "lost" ? `<button class="btn" id="qobf" title="${h(L("Customer ne approve kiya → Order Booking Form", "Customer approved → Order Booking Form"))}">📋 OBF</button>` : ""}${q.status !== "lost" && isMgr() ? `<button class="btn" id="qord">📦 ${L("Order banao", "Create order")}</button>` : ""}` : ""}${q.id && (isMgr() || q.owner_id === S.me.id) ? `<button class="btn danger" data-act="delQuote" data-id="${q.id}" data-no="${h(q.quote_no || "")}" data-co="${h(q.to_party?.name || "")}">${ic("trash")} Delete</button>` : ""}<span style="flex:1"></span><button class="btn" data-close>Cancel</button><button class="btn primary" id="qsave">Save</button>`,
  });
  const hooks = { items: () => {} };
  const amtHtml = (it) => inr(r2((+it.qty || 0) * (+it.price || 0))) + (it.opt ? `<div class="opt-tag">Optional</div>` : "");
  const syncTicks = () => {
    const n = q.items.filter((x) => !x.opt).length, all = $("#qall", m);
    all.checked = n === q.items.length; all.indeterminate = n > 0 && n < q.items.length;
    $("#qsoW", m).hidden = n === q.items.length;
  };
  const drawItems = () => {
    $("#qi tbody", m).innerHTML = q.items.map((it, i) => `<tr style="cursor:default"${it.opt ? ' class="opt"' : ""}>
      <td class="qchk"><input type="checkbox" data-inc data-i="${i}"${it.opt ? "" : " checked"} title="${h(L("Total mein shamil", "Included in the total"))}" aria-label="${h(L("Total mein shamil: ", "Included in the total: ") + (it.desc || "item " + (i + 1)))}"></td>
      <td><input class="input" data-i="${i}" data-k="desc" value="${h(it.desc)}" maxlength="400" list="prodDL" placeholder="${h(L("Product list se chuno ya likho…", "Pick from product list or type…"))}">
        <div class="qdet"${it.details ? "" : " hidden"}><textarea class="input" data-i="${i}" data-k="details" rows="${Math.max(2, Math.min(6, String(it.details || "").split("\n").length))}" maxlength="1000" placeholder="${h(L("Specs / configuration — product ke neeche chhapega", "Specs / configuration — printed under the product"))}">${h(it.details || "")}</textarea></div>
        <div class="qmeta"><label>Unit <input class="input" data-i="${i}" data-k="unit" value="${h(it.unit || "")}" maxlength="20" list="unitDL" placeholder="Number"></label>
          <label>Lic. Qty <input class="input" data-i="${i}" data-k="lic" value="${h(it.lic || "")}" maxlength="20" placeholder="N/A"></label>
          <label>Warranty <input class="input" data-i="${i}" data-k="warranty" value="${h(it.warranty || "")}" maxlength="40" list="warDL" placeholder="1 Year"></label></div>
        <div class="qrow-x"><button type="button" class="linkbtn" data-det="${i}"${it.details ? " hidden" : ""}>＋ ${L("details / specs", "details / specs")}</button>${it._hint ? `<span class="qhint">↺ ${h(it._hint)}</span>` : ""}</div></td><td><input class="input" data-i="${i}" data-k="hsn" value="${h(it.hsn)}" maxlength="8" inputmode="numeric"></td>
      <td><input class="input" type="number" min="0" data-i="${i}" data-k="qty" value="${h(it.qty)}"></td><td><input class="input" type="number" min="0" data-i="${i}" data-k="price" value="${h(it.price)}"></td>
      <td><select class="input" data-i="${i}" data-k="tax">${[0, 5, 12, 18, 28].map((t) => `<option ${+it.tax === t ? "selected" : ""}>${t}</option>`).join("")}</select></td>
      <td class="num qamt">${amtHtml(it)}</td><td><button class="btn ghost icon sm" data-rm="${i}" aria-label="Remove">${ic("x")}</button></td></tr>`).join("");
    syncTicks(); drawTotals(); hooks.items();
  };
  const drawTotals = () => {
    const c = qCalc(q);
    $("#qt", m).innerHTML = `<dl class="kv"><dt>Subtotal</dt><dd class="num">${inr(c.sub)}</dd>${c.lines.map(([l, v]) => `<dt>${h(l)}</dt><dd>${inr(v)}</dd>`).join("")}<dt><label class="qro"><input type="checkbox" id="qro"${q.round_off === false ? "" : " checked"}> Round off</label></dt><dd>${c.round ? (c.round > 0 ? "+" : "−") + Math.abs(c.round).toFixed(2) : "0.00"}</dd><dt><b>Grand total</b></dt><dd><b style="font-size:18px">${inr(c.grand)}</b></dd></dl><p class="mu" style="font-size:12px">${h(rupeesWords(c.grand))} · ${c.inter ? "Inter-state (IGST)" : "Intra-state (CGST+SGST)"}</p>${c.optN ? `<p class="opt-sum">➕ ${c.optN} optional item${c.optN > 1 ? "s" : ""} · ${inr(c.optSub)} + GST <span class="mu">${L("— total mein nahi", "— not in the total")}</span></p>` : ""}${marginHtml(q.items.filter((x) => !x.opt))}`;
  };
  // typing rules: phone = digits only, GSTIN = capitals without spaces, HSN = digits; a red field turns normal again
  m.addEventListener("input", (e) => {
    const t = e.target; t.classList.remove("bad"); t.removeAttribute("aria-invalid");
    const fix = (v) => { if (v !== t.value) { const at = t.selectionStart - (t.value.length - v.length); t.value = v; try { t.setSelectionRange(at, at); } catch { /* number inputs */ } } };
    if (t.dataset.tp === "phone") fix(t.value.replace(/[^\d+\- ]/g, ""));
    if (t.dataset.tp === "gstin") fix(t.value.toUpperCase().replace(/[^0-9A-Z]/g, ""));
    if (t.dataset.k === "hsn") fix(t.value.replace(/\D/g, ""));
  }, true);
  // leaving a field: tidy it (phone → 10 digits, state → GST name, GSTIN → fills the state)
  m.addEventListener("change", (e) => {
    const t = e.target, k = t.dataset.tp; if (!k) return;
    if (k === "phone" && phoneOk(t.value)) t.value = tp.phone = cleanPhone(t.value);
    if (k === "email") t.value = tp.email = t.value.trim().toLowerCase();
    if (k === "state") { const c = canonState(t.value); if (c) { t.value = tp.state = c; drawTotals(); } }
    if (k === "gstin" && t.value) {
      const g = gstinInfo(t.value), se = $('[data-tp="state"]', m);
      if (g.state && canonState(tp.state) !== g.state) {
        se.value = tp.state = g.state; se.classList.remove("bad"); drawTotals();
        toast(L(`State GSTIN se: ${g.state} (GST usi hisaab se)`, `State taken from the GSTIN: ${g.state} (GST follows it)`));
      }
    }
  }, true);
  m.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.tp) { tp[t.dataset.tp] = t.value; if (t.dataset.tp === "state") drawTotals(); }
    if (t.dataset.k) { q.items[+t.dataset.i][t.dataset.k] = t.value; if (!["desc", "hsn", "details", "unit", "lic", "warranty"].includes(t.dataset.k)) { const it = q.items[+t.dataset.i]; t.closest("tr").querySelector(".qamt").innerHTML = amtHtml(it); drawTotals(); } }
  });
  m.addEventListener("change", (e) => {
    if (e.target.matches("[data-inc]")) {           // tick / untick one item
      const it = q.items[+e.target.dataset.i], row = e.target.closest("tr");
      if (e.target.checked) delete it.opt; else it.opt = true;
      row.classList.toggle("opt", !!it.opt); row.querySelector(".qamt").innerHTML = amtHtml(it);
      syncTicks(); drawTotals(); hooks.items(); return;
    }
    if (e.target.id === "qro") { q.round_off = e.target.checked; drawTotals(); return; }
    if (e.target.id === "qall") { const on = e.target.checked; q.items.forEach((x) => { if (on) delete x.opt; else x.opt = true; }); drawItems(); return; }
    if (e.target.dataset.k === "tax") { q.items[+e.target.dataset.i].tax = +e.target.value; drawTotals(); }
    if (e.target.dataset.k === "desc") {      // picked from the product list → fill HSN, GST and price
      const it = q.items[+e.target.dataset.i], p = findProduct(e.target.value);
      if (p && (it._pid !== p.id)) {
        it._pid = p.id; if (!it.hsn) it.hsn = p.hsn || ""; it.tax = +p.gst_rate; it.unit = p.unit || it.unit || "";
        if (!it.details && p.notes) it.details = p.notes;
        const last = lastPrice(it.desc);                 // what this customer was quoted before wins over the list price
        if (last) { it._hint = `${L("pichhli baar", "last quoted")} ${inr(last.price)} · ${last.no} · ${niceDay(isoDay(new Date(last.at)))}`; if (!+it.price) it.price = last.price; }
        if (!+it.price && p.sell_price != null) it.price = +p.sell_price;
        // no list price → what it was last quoted at (to anyone) in the ERP + CRM quotations
        if (!+it.price && p.quoted_last) { it.price = +p.quoted_last; it._hint ||= quotedHint(p).replace(/^📈 /, ""); }
        setTimeout(drawItems, 0);
      }
      else { drawTotals(); hooks.items(); }
    }
  });
  m.addEventListener("click", (e) => {
    const dt = e.target.closest("[data-det]"); if (dt) { const td = dt.closest("td"); td.querySelector(".qdet").hidden = false; dt.hidden = true; td.querySelector("textarea").focus(); return; }
    const cg = e.target.closest("[data-chg]"); if (cg) { q.items.push({ desc: cg.dataset.chg, hsn: "", qty: 1, price: 0, tax: 18 }); drawItems(); $(`[data-i="${q.items.length - 1}"][data-k="price"]`, m)?.focus(); return; }
    const r = e.target.closest("[data-rm]"); if (r) { q.items.splice(+r.dataset.rm, 1); if (!q.items.length) q.items.push({ desc: "", hsn: "", qty: 1, price: 0, tax: 18 }); drawItems(); } });
  $("#qadd", m).onclick = () => { q.items.push({ desc: "", hsn: "", qty: 1, price: 0, tax: 18 }); drawItems(); };
  drawItems();

  // ---- customer note, internal note, annexure, terms & conditions
  const coName = S.settings.company?.name || CONFIG.COMPANY || "";
  const fill = (body) => String(body || "").replaceAll("{{company}}", h(coName)).replaceAll("{{customer}}", h(tp.name || "the customer"));
  const KINDS = ["annexure", "terms"];
  // "auto" = the text follows the products (saved as the ids of the templates used); it stops when the person picks a
  // template or writes their own text, and comes back by choosing "✨ Auto" in the list
  const tplOf = (id) => (QTPL || []).find((t) => t.id === +id) || null;
  const auto = { terms: q.id ? q.terms_auto != null : !q.terms_html, annexure: q.id ? q.annexure_auto != null : !q.annexure_html };
  const sig = { terms: q.terms_auto || "", annexure: q.annexure_auto || "" };
  const used = {
    terms: (q.terms_auto ? q.terms_auto.split("+").map(tplOf) : [tplOf(q.terms_tpl)]).filter(Boolean),
    annexure: (q.annexure_auto ? q.annexure_auto.split("+").map(tplOf) : [tplOf(q.annexure_tpl)]).filter(Boolean),
  };
  const ed = {}, applied = {}, picked = {};
  const shortName = (t) => t.name.split(/\s+—\s+/)[0];
  const showAuto = (k) => {
    const b = $(`[data-qk="${k}"] .qtauto`, m); if (!b) return;
    b.hidden = !auto[k]; b.textContent = "✨ " + (used[k].length ? used[k].map(shortName).join(" + ") : L("koi product match nahi", "no product match yet"));
  };
  const selVal = (k, v) => {
    const sel = $(`#qt_${k}`, m);
    if (v === "custom" && !sel.querySelector('option[value="custom"]')) sel.insertAdjacentHTML("beforeend", `<option value="custom">✏️ ${L("Apna likha hua text", "Your own text")}</option>`);
    sel.value = v; picked[k] = sel.value;
  };
  for (const k of KINDS) {
    ed[k] = richEditor($(`#qe_${k}`, m), {
      html: k === "terms" ? (q.terms_html || textToHtml(q.notes)) : (q.annexure_html || ""),
      label: k === "terms" ? "Terms & Conditions" : "Annexure",
      placeholder: k === "terms" ? L("Products daalo — T&C apne aap aa jayenge, ya yahan khud likho", "Add products — the terms come by themselves, or type your own here")
        : L("Products daalo — har product type ka annexure apne aap aa jayega", "Add products — each product type's annexure comes by itself"),
      onInput: () => { if (auto[k]) { auto[k] = false; selVal(k, "custom"); showAuto(k); } },
    });
    applied[k] = ed[k].html;
    selVal(k, auto[k] ? "auto" : used[k][0] ? String(used[k][0].id) : ed[k].html ? "custom" : "");
  }
  const offerUndo = (k, prev) => {
    const bar = $(`[data-qk="${k}"] .qth`, m); bar.querySelector(".qtundo")?.remove();
    const b = document.createElement("button"); b.type = "button"; b.className = "btn ghost sm qtundo"; b.textContent = "↩ " + L("Pehle wala text", "Undo");
    b.onclick = () => { Object.assign(used, { [k]: prev.used }); sig[k] = prev.sig; auto[k] = prev.auto; ed[k].html = prev.html; applied[k] = prev.html; selVal(k, prev.id); showAuto(k); b.remove(); };
    bar.append(b); setTimeout(() => b.remove(), 15000);
  };
  const applyAuto = (k, ts) => {
    used[k] = ts; sig[k] = ts.map((t) => t.id).join("+");
    ed[k].html = !ts.length ? "" : k === "terms" ? (ts.length > 1 ? mergeTerms(ts, fill) : fill(ts[0].body)) : ts.map((t) => fill(t.body)).join("<hr>");
    applied[k] = ed[k].html; auto[k] = true; selVal(k, "auto"); showAuto(k);
  };
  const applyTpl = (k, t) => {            // the person picked one template (or none)
    const prev = { html: ed[k].html, id: picked[k], auto: auto[k], used: used[k], sig: sig[k] };
    used[k] = t ? [t] : []; ed[k].html = t ? fill(t.body) : ""; applied[k] = ed[k].html; auto[k] = false;
    selVal(k, t ? String(t.id) : ""); showAuto(k);
    if (prev.html && prev.html !== applied[k]) offerUndo(k, prev);
  };
  hooks.items = () => {
    const main = q.items.some((x) => !x.opt) ? q.items.filter((x) => !x.opt) : q.items;
    for (const k of KINDS) if (auto[k]) { const ts = autoTpls(k, main), s2 = ts.map((t) => t.id).join("+"); if (s2 !== sig[k]) applyAuto(k, ts); }
  };
  hooks.items();
  KINDS.forEach(showAuto);
  for (const k of KINDS) $(`#qt_${k}`, m).addEventListener("change", (e) => {
    const v = e.target.value;
    if (v === "auto") { auto[k] = true; sig[k] = null; hooks.items(); }
    else if (v !== "custom") applyTpl(k, tplOf(v));
  });

  // ---- Admin / Manager: add or edit the shared templates right here
  const tplEd = async (kind, t) => {
    const box = $("#qtplEd", m), isT = kind === "terms";
    const prods = await loadProducts().catch(() => []);
    const cats = [...new Set([...(prods || []).map((p) => p.category), ...(QTPL || []).flatMap((x) => x.categories || [])].filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const on = new Set(t?.categories || []);
    box.innerHTML = `<div class="card qtpl"><div class="card-h"><h3>${t ? "✏️ " + L("Template edit karo", "Edit template") : "➕ " + L("Naya template", "New template")} — ${isT ? "Terms &amp; Conditions" : "Annexure"}</h3><span class="sp"></span><button type="button" class="btn ghost icon sm" data-tpx aria-label="Close">${ic("x")}</button></div><div class="card-b">
      <label class="f" for="tpN">${L("Template ka naam", "Template name")} *</label><input class="input" id="tpN" maxlength="120" value="${h(t?.name || "")}" placeholder="${h(isT ? L("Jaise: Software Licence — Terms", "e.g. Software Licence — Terms") : L("Jaise: AMC — Services covered", "e.g. AMC — Services covered"))}">
      <label class="f">${L("Kin products pe apne aap lage", "Pick it automatically for these products")}</label>
      <div class="chips" id="tpC">${cats.map((c) => `<button type="button" class="chip${on.has(c) ? " on" : ""}" data-cat="${h(c)}" aria-pressed="${on.has(c)}">${h(c)}</button>`).join("") || `<span class="mu">${L("Products mein category daalo", "Add categories to your products")}</span>`}</div>
      <input class="input" id="tpK" style="margin-top:8px" maxlength="1500" value="${h((t?.keywords || []).join(", "))}" placeholder="${h(L("Aur keywords, comma se alag — jaise: autocad, revit, laptop", "More keywords, comma separated — e.g. autocad, revit, laptop"))}" aria-label="Keywords">
      ${isT ? `<label class="qtdef"><input type="checkbox" id="tpD"${t?.is_default ? " checked" : ""}> ${L("Default — jab koi product match na kare", "Default — used when no product matches")}</label>` : ""}
      <label class="f">Text <span class="lbl-hint">— {{company}} = ${L("company ka naam", "company name")}, {{customer}} = ${L("customer ka naam", "customer name")}</span></label>
      <div class="rte-host" id="tpE"></div>
      <div class="row" style="margin-top:12px"><button type="button" class="btn primary" id="tpSave">${L("Template save karo", "Save template")}</button><button type="button" class="btn" data-tpx>Cancel</button>${t ? `<span class="sp" style="flex:1"></span><button type="button" class="btn danger" id="tpDel">${ic("trash")} ${L("Template delete karo", "Delete template")}</button>` : ""}</div>
    </div></div>`;
    const te = richEditor($("#tpE", box), { html: t?.body || "", label: L("Template ka text", "Template text") });
    $("#tpC", box).onclick = (e) => { const c = e.target.closest("[data-cat]"); if (!c) return; c.classList.toggle("on"); c.setAttribute("aria-pressed", String(c.classList.contains("on"))); };
    box.querySelectorAll("[data-tpx]").forEach((b) => b.onclick = () => { box.innerHTML = ""; });
    box.scrollIntoView({ block: "start", behavior: "smooth" }); $("#tpN", box).focus({ preventScroll: true });
    $("#tpSave", box).onclick = (e) => busy(e.target, async () => {
      const row = { kind, name: $("#tpN", box).value.trim(), body: te.html,
        categories: $$("#tpC .chip.on", box).map((c) => c.dataset.cat),
        keywords: $("#tpK", box).value.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean).slice(0, 80),
        is_default: isT && !!$("#tpD", box)?.checked };
      if (!row.name) { $("#tpN", box).focus(); return toast(L("Template ka naam daalo", "Give the template a name"), true); }
      if (!row.body) return toast(L("Template ka text khali hai", "The template text is empty"), true);
      if (row.body.length > RICH_MAX) return toast(L("Text bahut lamba hai", "The text is too long"), true);
      if (row.is_default) { const { error } = await sb.from("quote_templates").update({ is_default: false }).eq("kind", kind).eq("is_default", true).neq("id", t?.id || 0); if (error) throw error; }
      const res = t ? await sb.from("quote_templates").update(row).eq("id", t.id).select("id").single() : await sb.from("quote_templates").insert(row).select("id").single();
      if (res.error) { if (res.error.code === "23505") return toast(L("Is naam ka template pehle se hai", "A template with this name already exists"), true); throw res.error; }
      await loadQTpl(true);
      const sel = $(`#qt_${kind}`, m), keep = picked[kind];
      sel.innerHTML = qtOptions(kind); selVal(kind, ["auto", "custom", ""].includes(keep) || tplOf(keep) ? keep : "");
      // a new template is used right away; an edited one refreshes this quotation if its text was not changed here
      if (!t) applyTpl(kind, tplOf(res.data.id));
      else if (auto[kind]) { sig[kind] = null; hooks.items(); }
      else if (+picked[kind] === t.id && ed[kind].html === applied[kind]) applyTpl(kind, tplOf(t.id));
      box.innerHTML = ""; toast(L("✔ Template save ho gaya — sabki quotations ke liye", "✔ Template saved for everyone's quotations"));
    });
    $("#tpDel", box)?.addEventListener("click", (e) => {
      const b = e.currentTarget;
      if (!b.dataset.sure) {
        b.dataset.sure = "1"; b.textContent = L("Pakka? Dobara dabao", "Sure? Click again");
        setTimeout(() => { if (b.isConnected && b.dataset.sure) { delete b.dataset.sure; b.innerHTML = `${ic("trash")} ${L("Template delete karo", "Delete template")}`; } }, 4000);
        return;
      }
      busy(b, async () => {
        const { error } = await sb.from("quote_templates").delete().eq("id", t.id); if (error) throw error;
        await loadQTpl(true);
        const sel = $(`#qt_${kind}`, m), keep = picked[kind];
        sel.innerHTML = qtOptions(kind); selVal(kind, +keep === t.id ? "" : keep);
        used[kind] = used[kind].filter((x) => x.id !== t.id); if (auto[kind]) { sig[kind] = null; hooks.items(); }
        box.innerHTML = ""; toast(L("Template delete ho gaya", "Template deleted"));
      });
    });
  };
  m.addEventListener("click", (e) => {
    const n = e.target.closest("[data-tnew]"), te = e.target.closest("[data-tedit]");
    if (n) tplEd(n.dataset.tnew, null);
    if (te) { const k = te.dataset.tedit, t = tplOf(picked[k]) || used[k][0]; if (!t) return toast(L("Pehle list se template chuno", "Pick a template in the list first"), true); tplEd(k, t); }
  });
  // ---- customer search: type a name / phone / GSTIN → pick → contact, address, GST state, GSTIN fill themselves
  let PAST = [], csT = 0, csRows = [];
  const lastPrice = (desc) => {
    const d = String(desc || "").trim().toLowerCase(); if (!d) return null;
    for (const x of PAST) { const it = (x.items || []).find((i) => String(i.desc || "").trim().toLowerCase() === d && +i.price > 0); if (it) return { price: +it.price, no: x.quote_no, at: x.created_at }; }
    return null;
  };
  const touched = { pay: !!q.payment_terms, del: !!q.delivery, val: !!q.id };
  const loadPast = async () => {
    if (!q.lead_id) { PAST = []; return; }
    const { data } = await sb.from("quotations").select("id, quote_no, created_at, items, payment_terms").eq("lead_id", q.lead_id).neq("id", q.id || 0).order("created_at", { ascending: false }).limit(20);
    PAST = data || [];
    const lp = PAST.find((x) => x.payment_terms);          // this customer's usual payment terms
    if (lp && !touched.pay) { $("#qpay", m).value = lp.payment_terms; touched.pay = true; }
  };
  const csList = $("#qcsL", m), csIn = $("#qcn", m);
  const csClose = () => { csList.hidden = true; csIn.setAttribute("aria-expanded", "false"); };
  const pickLead = (l) => {
    q.lead_id = l.id;
    Object.assign(tp, { name: l.company || tp.name, contact: l.contact_name || "", phone: l.phone || "", email: l.email || "",
      address: l.address || [l.area, l.city].filter(Boolean).join(", "), state: l.state || tp.state || "Maharashtra", gstin: l.gstin || "" });
    for (const k of ["name", "contact", "phone", "email", "address", "state", "gstin"]) { const el = $(`[data-tp="${k}"]`, m); if (el) el.value = tp[k] || ""; }
    $("#qlinked", m).textContent = "🔗 " + L("customer record se juda", "linked to the customer record");
    csClose(); drawTotals(); loadPast().catch(() => {});
  };
  csIn.addEventListener("input", () => {
    clearTimeout(csT); const t = csIn.value.trim();
    if (t.length < 2) return csClose();
    csT = setTimeout(async () => {
      const s2 = t.replace(/[,()*%\\.:"']/g, " ").trim(), d = t.replace(/\D/g, "");
      const ors = [`company.ilike.*${s2}*`, ...(d.length >= 4 ? [`phone_norm.ilike.*${d.slice(-10)}*`] : []), ...(/^[0-9a-z]{5,15}$/i.test(t) ? [`gstin.ilike.*${t}*`] : [])];
      const { data } = await sb.from("leads").select("id, company, contact_name, phone, email, address, area, city, state, gstin").or(ors.join(",")).order("updated_at", { ascending: false }).limit(8);
      if (csIn.value.trim() !== t) return;
      csRows = data || [];
      csList.innerHTML = csRows.map((l) => `<button type="button" class="qcs-i" role="option" data-lid="${l.id}"><b>${h(l.company)}</b><span>${h([l.contact_name, l.city || l.area, l.phone, l.gstin].filter(Boolean).join(" · "))}</span></button>`).join("")
        || `<div class="qcs-e">${L("Koi customer nahi mila — naya naam likh do, chalega", "No customer found — just type the new name")}</div>`;
      csList.hidden = false; csIn.setAttribute("aria-expanded", "true");
    }, 220);
  });
  csList.addEventListener("mousedown", (e) => { const b = e.target.closest("[data-lid]"); if (!b) return; e.preventDefault(); pickLead(csRows.find((x) => x.id === +b.dataset.lid)); });
  csIn.addEventListener("keydown", (e) => { if (e.key === "Escape") csClose(); if (e.key === "Enter" && !csList.hidden && csRows.length) { e.preventDefault(); pickLead(csRows[0]); } });
  csIn.addEventListener("blur", () => setTimeout(csClose, 150));
  if (q.lead_id) loadPast().catch(() => {});

  // ---- validity, payment, delivery: sensible defaults by product type until the person changes them
  const vtShow = () => { $("#qvt", m).textContent = "→ " + niceDay(addDaysIso($("#qdate", m).value, +$("#qval", m).value || 0)); };
  $("#qval", m).addEventListener("input", () => { touched.val = true; vtShow(); });
  $("#qdate", m).addEventListener("input", vtShow);
  $$("[data-val]", m).forEach((b) => b.onclick = () => { $("#qval", m).value = b.dataset.val; touched.val = true; vtShow(); });
  $("#qpay", m).addEventListener("input", () => { touched.pay = true; });
  $("#qdel", m).addEventListener("input", () => { touched.del = true; });
  const DEL_BY = { Software: DELIVERY[1], Hardware: DELIVERY[3], AMC: DELIVERY[5], Networking: DELIVERY[3], Services: DELIVERY[6] };
  const amcOn = () => !!q.amc || used.terms.some((t) => /^AMC/i.test(t.name)) || q.items.some((it) => !it.opt && (isAmcText(it.desc) || /amc|facility/i.test(findProduct(it.desc)?.category || "")));
  const amcFill = () => {
    const a = q.amc || {}, nm = new Date(); nm.setMonth(nm.getMonth() + 1, 1);
    $("#amS", m).value = a.start || isoDay(nm); $("#amM", m).value = String(a.months || 12);
    $("#amC", m).value = a.coverage || AMC_COVER[0]; $("#amP", m).value = a.pm || AMC_PM[0];
    $("#amSb", m).value = a.standby || "Not applicable"; $("#amB", m).value = a.billing || AMC_BILL[0]; $("#amD", m).value = a.bill_day || 1;
  };
  const amcShow = () => {
    $("#amE", m).textContent = "→ " + niceDay(amcEnd({ start: $("#amS", m).value, months: +$("#amM", m).value }));
    $("#amDW", m).hidden = !/monthly|quarterly/i.test($("#amB", m).value);
  };
  amcFill(); amcShow();
  $("#qamc", m).addEventListener("input", amcShow); $("#qamc", m).addEventListener("change", amcShow);
  const syncAuto = () => {
    const amc = amcOn(); $("#qamc", m).hidden = !amc;
    const kind = (used.terms[0]?.name || "").split(/[ ,—]/)[0];
    if (!touched.del) $("#qdel", m).value = amc ? DELIVERY[5] : DEL_BY[kind] || DELIVERY[3];
    if (!touched.val) { $("#qval", m).value = amc ? 30 : 7; }
    if (!touched.pay && !$("#qpay", m).value) $("#qpay", m).value = PAY_TERMS[0];
    vtShow();
  };
  const tcItems = hooks.items; hooks.items = () => { tcItems(); syncAuto(); };
  $("#qt_terms", m).addEventListener("change", syncAuto);
  syncAuto();

  const syncAll = () => {
    syncNotes();
    q.quote_date = $("#qdate", m).value || null; q.validity_days = Math.max(1, Math.min(365, Math.round(+$("#qval", m).value) || 7));
    q.payment_terms = $("#qpay", m).value.trim() || null; q.delivery = $("#qdel", m).value.trim() || null; q.ref = $("#qref", m).value.trim() || null;
    const sa = $("#qsite", m).value.trim(); q.site = sa ? { address: sa } : null;
    q.amc = $("#qamc", m).hidden ? null : { start: $("#amS", m).value, months: +$("#amM", m).value, coverage: $("#amC", m).value, pm: $("#amP", m).value,
      standby: $("#amSb", m).value, billing: $("#amB", m).value, ...(!$("#amDW", m).hidden ? { bill_day: Math.max(1, Math.min(28, +$("#amD", m).value || 1)) } : {}) };
  };
  $("#qcopy", m)?.addEventListener("click", () => {
    syncAll();
    const c = structuredClone(q);
    for (const k of ["id", "quote_no", "share_token", "view_count", "first_viewed_at", "last_viewed_at", "customer_response", "customer_note", "customer_response_at", "customer_options", "created_at", "updated_at", "owner_id", "status", "quote_date", "rfq_id", "version", "import_batch"]) delete c[k];
    c.items = c.items.map(({ _pid, _hint, ...it }) => it);
    quoteEditor(c); toast(L("📄 Copy ban gayi — customer / items badlo aur Save karo", "📄 Copy ready — change the customer / items and Save"));
  });
  $("#qobf", m)?.addEventListener("click", (e) => busy(e.target, async () => {
    const { data: id, error } = await sb.rpc("obf_from_quote", { p_quote: q.id }); if (error) throw error;
    openObf(id);
  }));
  const syncNotes = () => {
    q.note_customer = $("#qnc", m).value.trim() || null; q.note_internal = $("#qni", m).value.trim() || null;
    q.terms_html = ed.terms.html || null; q.annexure_html = ed.annexure.html || null;
    q.show_optional = $("#qso", m).checked;
  };

  // what the customer gets (PDF + online link) is the SAVED quotation → unsaved edits must be saved first
  const saveSig = () => JSON.stringify([q.items, q.to_party, q.terms_html, q.annexure_html, q.note_customer, q.quote_date, q.validity_days, q.payment_terms, q.delivery, q.ref, q.site, q.amc, q.round_off, q.show_optional]);
  let savedSig = null;
  if (q.id) requestAnimationFrame(() => { try { syncAll(); savedSig = saveSig(); } catch { /* editor closed */ } });
  // a quotation that has gone to the customer (sent / won / lost, or a PDF / link was made) is locked:
  // only its status and the internal note change; "Revise" makes a new version (… -R1) to change anything
  let locked = !!(q.id && (q.status !== "draft" || q.sent_at));
  const shared = async (ch) => {
    if (!locked && ch && q.id && savedSig != null) {
      syncAll();
      if (saveSig() !== savedSig) return toast(L("Pehle Save dabao — customer ko saved quotation hi jaati hai (PDF + online link)", "Press Save first — the customer gets the saved quotation (PDF + online link)"), true);
    }
    const link = await shareQuote(q, ch, ch === "email" ? { attach: (url) => ({ name: pdfName(q), make: () => quotePdf(q, url) }) } : undefined);
    if (link && !q.share_token) { q.share_token = link.split("#")[1]; const t = $(".qtrack", m); if (t) t.outerHTML = quoteTrackHtml(q); }
    if (link && !locked && m.isConnected) { locked = true; q.sent_at ||= new Date().toISOString(); lockQuote(); }   // it has left now
  };
  $("#qlink", m)?.addEventListener("click", (e) => busy(e.target, () => shared(null)));
  // download the same PDF the customer gets by email (ticks + totals that change)
  // Print / PDF = the customer's PDF with tick boxes (totals change when items are ticked); it opens in a new tab,
  // where it can be printed or saved — if the browser blocks the tab, it is downloaded instead
  $("#qp", m)?.addEventListener("click", (e) => {
    syncAll();
    if (!locked && savedSig != null && saveSig() !== savedSig) return toast(L("Pehle Save dabao — PDF saved quotation ka banta hai", "Press Save first — the PDF is made from the saved quotation"), true);
    const tab = window.open("", "_blank");          // opened now (while it is still a click), filled when the PDF is ready
    if (tab) { try { tab.document.title = "PDF…"; tab.document.body.innerHTML = `<p style="font:16px system-ui;padding:24px">📄 ${L("PDF ban raha hai…", "Making the PDF…")}</p>`; } catch { /* ignore */ } }
    busy(e.target, async () => {
      try {
        const { data: token, error } = await sb.rpc("share_quote", { p_id: q.id });
        if (error) throw error;
        if (!q.share_token) { q.share_token = token; const t = $(".qtrack", m); if (t) t.outerHTML = quoteTrackHtml(q); }
        if (!locked && m.isConnected) { locked = true; q.sent_at ||= new Date().toISOString(); lockQuote(); }
        const a = await quotePdf(q, "#" + token);
        const url = URL.createObjectURL(a.blob);
        if (tab && !tab.closed) { tab.location.href = url; setTimeout(() => URL.revokeObjectURL(url), 10 * 60e3); }
        else { saveBlob(a.blob, a.name); URL.revokeObjectURL(url); }
        toast(L("📄 PDF khul gaya — wahan se Print / Save karo.", "📄 PDF opened — print or save it from there."), false, 5000);
      } catch (err) { if (tab && !tab.closed) tab.close(); throw err; }
    });
  });
  $("#qmail", m)?.addEventListener("click", (e) => busy(e.target, () => shared("email")));
  $("#qwa", m)?.addEventListener("click", (e) => busy(e.target, () => shared("whatsapp")));
  $("#qord", m)?.addEventListener("click", () => orderFromQuote(q, () => { if (S.route === "quotes") VIEWS.quotes($("#page")); }));
  function lockQuote() {
    if (m.classList.contains("qlocked")) return;
    m.classList.add("qlocked");
    $(".modal-b", m).insertAdjacentHTML("afterbegin", `<div class="qlockbar" role="note"><span class="qlk-i">🔒</span><div class="qlk-t"><b>${L("Ye quotation customer ko ja chuki hai — isme badlaav nahi ho sakta.", "This quotation has gone to the customer — it can't be changed.")}</b>
      <span>${L("Kuch badalna hai? <b>↻ Revise</b> dabao — nayi version banegi, ye wali record ke liye waisi hi rahegi. Status aur internal note badal sakte ho.", "Need a change? Press <b>↻ Revise</b> — a new version is made and this one stays as it was, for the record. Status and the internal note can still change.")}</span>
      <span class="qlk-rev" id="qrevs"></span></div><button type="button" class="btn sm primary" id="qrev">↻ Revise</button></div>`);
    [".qcust", ".qbar", "#qamc", "#qi", ".qadd-row", ".qtickhint", "#qsoW", ".qtc", "#qnc", "#qt"].forEach((sel) => $$(sel, m).forEach((x) => { x.inert = true; x.classList.add("qlk-ro"); }));
    const qs = $("#qs", m); if (qs.value === "draft") qs.value = "sent";   // a link / mail already went out — it is "sent" now
    [...qs.options].forEach((o) => { if (o.value === "draft") o.disabled = true; });
    $("#qrev", m).onclick = (e) => busy(e.target, async () => {
      const { data: nid, error } = await sb.rpc("quote_revise", { p_id: q.id }); if (error) throw error;
      const { data: nq, error: e2 } = await sb.from("quotations").select("*").eq("id", nid).single(); if (e2) throw e2;
      closeModal(); toast(L(`↻ ${nq.quote_no} bani — isme badlaav karke customer ko bhejo`, `↻ ${nq.quote_no} created — make your changes and send it`));
      quoteEditor(nq); if (S.route === "quotes") VIEWS.quotes($("#page"));
    });
    // the versions around this one (made from it / it was made from)
    Promise.all([sb.from("quotations").select("id, quote_no, status").eq("revision_of", q.id).order("id"),
      q.revision_of ? sb.from("quotations").select("id, quote_no").eq("id", q.revision_of).maybeSingle() : Promise.resolve({ data: null })])
      .then(([{ data: kids }, { data: mom }]) => {
        const box = $("#qrevs", m); if (!box) return;
        const a = (x) => `<a href="#/quotes/${x.id}" data-qrv="${x.id}">${h(x.quote_no)}</a>`;
        box.innerHTML = [mom ? L(`Ye ${a(mom)} ki nayi version hai.`, `A new version of ${a(mom)}.`) : "", kids?.length ? L(`Nayi version: ${kids.map(a).join(", ")}`, `Newer version: ${kids.map(a).join(", ")}`) : ""].filter(Boolean).join(" · ");
        $$("[data-qrv]", box).forEach((x) => x.onclick = (e) => { e.preventDefault(); closeModal(); ACT.quote({ dataset: { id: x.dataset.qrv } }); });
      }, () => {});
  }
  if (locked) lockQuote();
  $("#qsave", m).onclick = (e) => busy(e.target, async () => {
    if (locked) {      // only the status and the internal note — the rest is locked (the database refuses it too)
      const res = await sb.from("quotations").update({ status: $("#qs", m).value, note_internal: ($("#qni", m).value || "").trim().slice(0, 3000) || null }).eq("id", q.id).select("*").single();
      if (res.error) throw res.error;
      toast(`Quotation ${res.data.quote_no} saved ✔`); closeModal(); quoteEditor(res.data);
      if (S.route === "quotes") VIEWS.quotes($("#page"));
      return;
    }
    syncAll();
    // fully empty rows (no product, no rate) are just dropped
    const before = q.items.length;
    q.items = q.items.filter((it) => String(it.desc || "").trim() || +it.price || String(it.details || "").trim());
    if (q.items.length !== before) drawItems();
    $$(".bad", m).forEach((x) => { x.classList.remove("bad"); x.removeAttribute("aria-invalid"); });
    const errs = checkQuote(q, tp, { keepDate: q0.id ? q0.quote_date : null }), hard = errs.filter((x) => !x.soft);
    const where = (x) => x.i != null ? $(`[data-i="${x.i}"][data-k="${x.k}"]`, m)
      : ({ name: $("#qcn", m), date: $("#qdate", m), validity: $("#qval", m), items: $("#qadd", m) })[x.k] || $(`[data-tp="${x.k}"]`, m);
    errs.forEach((x) => { const el = where(x); if (el && !x.soft) { el.classList.add("bad"); el.setAttribute("aria-invalid", "true"); el.title = L(x.h, x.en); } });
    if (hard.length) {
      const el = where(hard[0]); el?.focus(); el?.scrollIntoView({ block: "center", behavior: "smooth" });
      return toast(L(hard[0].h, hard[0].en) + (hard.length > 1 ? L(` (+${hard.length - 1} aur — laal box dekho)`, ` (+${hard.length - 1} more — see the red boxes)`) : ""), true);
    }
    // a doubtful but possible value (GSTIN check digit): warn once in place — pressing Save again saves it
    const soft = errs.filter((y) => y.soft), softKey = soft.map((x) => x.k + ":" + (tp[x.k] || "")).join("|");
    if (soft.length && softKey !== m.dataset.softOk) {
      m.dataset.softOk = softKey;
      soft.forEach((x) => { const el = where(x); if (el) { el.classList.add("bad"); el.title = L(x.h, x.en); } });
      where(soft[0])?.focus();
      return toast(L(soft[0].h, soft[0].en) + L(" — sahi hai toh Save dobara dabao", " — if it is right, press Save again"), true);
    }
    if (tp.phone && phoneOk(tp.phone)) tp.phone = cleanPhone(tp.phone);
    if (canonState(tp.state)) tp.state = canonState(tp.state);
    if (tp.gstin) tp.gstin = String(tp.gstin).toUpperCase().replace(/\s+/g, "");
    if ((q.terms_html || "").length > RICH_MAX || (q.annexure_html || "").length > RICH_MAX) return toast(L("T&C / Annexure bahut lamba hai — thoda chhota karo", "Terms / annexure are too long — please shorten them"), true);
    const c = qCalc(q);
    const row = { to_party: tp, items: q.items.map((i) => ({ desc: String(i.desc || "").slice(0, 400), hsn: String(i.hsn || "").slice(0, 12), qty: +i.qty || 0, price: +i.price || 0, tax: +i.tax || 0, ...(i.opt ? { opt: true } : {}), ...(i.details ? { details: String(i.details).slice(0, 1000) } : {}), ...(i.unit ? { unit: String(i.unit).slice(0, 20) } : {}), ...(String(i.lic || "").trim() ? { lic: String(i.lic).trim().slice(0, 20) } : {}), ...(String(i.warranty || "").trim() ? { warranty: String(i.warranty).trim().slice(0, 40) } : {}) })),
      show_optional: q.show_optional, notes: null, quote_date: q.quote_date, validity_days: q.validity_days, payment_terms: q.payment_terms, delivery: q.delivery,
      ref: q.ref, site: q.site, amc: q.amc, round_off: q.round_off !== false, round_amt: c.round, note_customer: q.note_customer, note_internal: q.note_internal, terms_html: q.terms_html, annexure_html: q.annexure_html,
      terms_tpl: used.terms[0]?.id || null, annexure_tpl: used.annexure[0]?.id || null,
      terms_auto: auto.terms ? sig.terms || "" : null, annexure_auto: auto.annexure ? sig.annexure || "" : null,
      status: $("#qs", m).value, subtotal: c.sub, tax_total: c.tax, grand_total: c.grand, lead_id: q.lead_id || null, rfq_id: q.rfq_id || null };
    const res = q.id ? await sb.from("quotations").update(row).eq("id", q.id).select("*").single() : await sb.from("quotations").insert(row).select("*").single();
    if (res.error) throw res.error;
    if (q.rfq_id && !q.id) await sb.from("rfqs").update({ status: "quoted", quoted_value: c.grand }).eq("id", q.rfq_id);
    if (q.lead_id && !q.id) { await sb.from("activities").insert({ lead_id: q.lead_id, kind: "system", body: `Quotation ${res.data.quote_no} banayi — ${inr(c.grand)}` }); }
    toast(`Quotation ${res.data.quote_no} saved ✔`); closeModal(); quoteEditor(res.data);
    if (S.route === "quotes") VIEWS.quotes($("#page"));
  });
}
// who made the quotation (its owner) — for "Prepared by" on the document; an old-ERP one has only the ERP name
const repCache = new Map();
async function quoteRep(q) {
  if (q.owner_id) {
    if (!repCache.has(q.owner_id)) {
      const { data } = await sb.from("profiles").select("full_name, designation, phone, email").eq("id", q.owner_id).maybeSingle();
      repCache.set(q.owner_id, data ? { name: data.full_name, designation: data.designation, phone: data.phone, email: data.email } : null);
    }
    if (repCache.get(q.owner_id)) return repCache.get(q.owner_id);
  }
  const erp = String(q.note_internal || "").match(/Banayi:\s*([^·]+)/);
  return erp ? { name: erp[1].trim() } : null;
}
const pdfName = (q) => `Quotation ${String(q.quote_no || "draft").replace(/[\\/:*?"<>|]+/g, "-")}.pdf`;
/** the quotation as a PDF that looks exactly like the customer's online page (quote.html, drawn in a hidden
 *  frame in preview mode — no view counted); the customer ticks / unticks items and the totals with GST
 *  change inside the PDF → { blob, name, pages, bytes } */
async function quotePdf(q, link) {
  const tok = String(link || "").split("#")[1];
  if (!tok) return quotePdfPrint(q);
  const W = 1040, fr = document.createElement("iframe");
  fr.className = "pdf-stage"; fr.setAttribute("aria-hidden", "true"); fr.tabIndex = -1;
  fr.style.cssText = `width:${W}px;height:1400px;border:0`;
  fr.src = new URL("quote.html#" + tok + "&pdf=1", location.href.split("#")[0]).href;
  document.body.append(fr);
  try {
    await new Promise((ok, no) => {
      const t0 = Date.now();
      const tick = () => {
        let ready = false, err = null;
        try { ready = !!fr.contentWindow?.__pdfReady; err = fr.contentWindow?.__pdfError || null; } catch { /* not loaded yet / blocked */ }
        if (ready) return ok();
        if (err) return no(new Error(err));
        if (Date.now() - t0 > 25000) return no(new Error("quotation page did not load"));
        setTimeout(tick, 150);
      };
      tick();
    });
    const w = fr.contentWindow, root = w.document.getElementById("app"), p = w.__pick;
    if (!p) throw new Error("no items");
    // never cut anything off: a table wider than its card (long words, many columns) → widen the frame until it fits
    let full = W;
    for (let i = 0; i < 4; i++) {
      const card = w.document.querySelector(".card"), cs = card && w.getComputedStyle(card);
      const inner = card ? card.getBoundingClientRect().right - parseFloat(cs.paddingRight || 0) : full;
      const right = Math.max(0, ...[...w.document.querySelectorAll(".card table")].map((t) => t.getBoundingClientRect().right));
      const over = Math.ceil(right - inner);
      if (over <= 0) break;
      full += over + 12; fr.style.width = full + "px";
      await new Promise((r) => setTimeout(r, 60));
    }
    fr.style.height = Math.ceil(root.scrollHeight + 40) + "px";
    await new Promise((r) => setTimeout(r, 80));
    // a plain PDF: the customer cannot tick / untick items (they accept the offer or ask us for a revision)
    const r = await elementToPdf(root, { width: full, title: "Quotation " + (q.quote_no || "") });
    return { blob: r.blob, pages: r.pages, bytes: r.blob.size, name: pdfName(q) };
  } finally { fr.remove(); }
}
// fallback (no online link): the print layout, plain (no tick boxes for the customer)
async function quotePdfPrint(q) {
  const rep = await quoteRep(q);
  const r = await htmlToPdf((root) => quoteDoc(q, root, { rep }), { title: "Quotation " + (q.quote_no || "") });
  return { blob: r.blob, pages: r.pages, bytes: r.blob.size, name: pdfName(q) };
}
// ---- Proforma Invoice: the approved lines of a quotation, same layout, its own number (PI/26/0001)
// the customer approved some lines → the SAME quotation (same number, same layout) with only those lines
HOOK.proformaPdf = async (pi, q, { mailAt = null } = {}) => {
  const day = (v) => (v ? niceDay(String(v).slice(0, 10)) : "");
  const doc = { ...q, items: (pi.items || []).map(({ sr, ...it }) => ({ ...it, opt: false })), show_optional: false };
  const ref = `Approved item${pi.picked.length > 1 ? "s" : ""} <b>${h(pi.picked.join(", "))}</b> of this quotation${mailAt ? ", as per your mail of " + h(day(mailAt)) : ""}.`;
  const rep = await quoteRep(q);
  const r = await htmlToPdf((root) => quoteDoc(doc, root, { rep, ref }), { title: "Quotation " + (q.quote_no || "") });
  return { blob: r.blob, pages: r.pages, bytes: r.blob.size, name: pdfName(q) };
};
// the quotation document (Print / PDF): fills `pr`
function quoteDoc(q, pr, { link = null, pick = null, rep = null, title = "QUOTATION", ref = "" } = {}) {
  const co = S.settings.company || {}, c = qCalc(q), tp = q.to_party || {};
  const inc = (q.items || []).filter((it) => !it.opt), opt = q.show_optional === false ? [] : (q.items || []).filter((it) => it.opt);
  // line table like the reference: Sr | Description | Taxation | HSN/SAC | Qty | Lic. Qty | Warranty | Price(Unit) | Taxable Value | Tax Amount | Total
  const n2 = (v) => (+v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const head = `<thead><tr>${pick ? `<th class="c tk" title="Tick">✓</th>` : ""}<th>Sr.<br>No.</th><th>Description</th><th>Taxation</th><th>HSN/SAC Code</th><th class="c">Qty.</th><th class="c">Lic. Qty.</th><th class="c">Warranty</th><th class="r">Price(Unit)</th><th class="r">Taxable Value</th><th class="r">Tax Amount</th><th class="r">Total</th></tr></thead>`;
  const rowHtml = (it, i, idx) => { const tv = r2((+it.qty || 0) * (+it.price || 0)), ta = r2(tv * (+it.tax || 0) / 100);
    return `<tr>${pick ? `<td class="c tk" data-pi="${idx}"></td>` : ""}<td class="c">${i + 1}</td><td><b>${h(it.desc)}</b>${pick && it.opt ? ` <span class="qopt-tag">Optional</span>` : ""}${it.details ? `<div class="qdt">${h(it.details)}</div>` : ""}</td><td>GST @${h(+it.tax || 0)}%</td><td class="c">${h(it.hsn || "------")}</td>
      <td class="c">${h(it.qty)}(${h(it.unit || "Number")})</td><td class="c">${h(it.lic || "N/A")}</td><td class="c">${h(it.warranty || "-----")}</td><td class="r">${n2(it.price)}</td><td class="r">${n2(tv)}</td><td class="r">${n2(ta)}</td><td class="r">${n2(tv + ta)}</td></tr>`; };
  const tot = (l, v, strong, key) => `<tr class="qtot"><td colspan="${pick ? 9 : 8}" class="nob"></td><td colspan="2" class="r">${strong ? `<b>${l}</b>` : l}</td><td class="r"${key ? ` data-tot="${key}"` : ""}>${strong ? `<b>${v}</b>` : v}</td></tr>`;
  // PDF with ticks: every item in one table (optional ones unticked), a tax row for every GST rate in it, totals as boxes the PDF updates
  const pickBody = () => `${pick.N.map((idx, k) => rowHtml(q.items[idx], k, idx)).join("")}
    ${tot("Sub Total", fmtIN(pick.T.sub), false, "sub")}${pick.labels.map((l, k) => tot(h(l), fmtIN(pick.T.lines[k]), false, "l" + k)).join("")}
    ${pick.O ? tot("Round off", fmtRound(pick.T.round), false, "round") : ""}
    ${tot("Grand Total", fmtIN(pick.T.grand), true, "grand")}`;
  pr.innerHTML = `<div class="qdoc">
    <div class="hd"><div><h2>${h(co.name || CONFIG.COMPANY)}</h2><div>${h(co.address || "")}</div><div>GSTIN: ${h(co.gstin || "")} · PAN: ${h(co.pan || "")}</div></div>
      <div style="text-align:right"><h2>${h(title)}</h2><div>No: <b>${h(q.quote_no || "")}</b></div><div>Date: ${h(q.quote_date ? niceDay(q.quote_date) : dOnly(q.created_at || new Date()))}</div></div></div>
    <p><b>To:</b> ${h(tp.name || "")}<br>${h(tp.address || "")}${tp.state ? ", " + h(tp.state) : ""}${tp.gstin ? "<br>GSTIN: " + h(tp.gstin) : ""}${tp.contact ? "<br>Kind Attn: " + h(tp.contact) : ""}${tp.phone ? " · " + h(tp.phone) : ""}</p>
    ${q.site?.address ? `<p><b>Delivery / site:</b> ${h(q.site.address)}</p>` : ""}
    ${ref ? `<p class="qref">${ref}</p>` : ""}
    ${link ? `<div class="qlinkbox">✅ <b>View this quotation online</b> and accept it in one click:<br><a href="${h(link)}">${h(link)}</a></div>` : ""}
    ${pick ? `<div class="qlinkbox qpickbox">☑ <b>Choose your items here:</b> tick / untick the first column — Sub Total, GST and Grand Total change by themselves. Save the PDF and reply with it to confirm. <span class="qpick-note">(Open in Google Chrome or Adobe Acrobat Reader — Microsoft Edge, Mac Preview, Safari and phone viewers don't update the total.)</span></div>` : ""}
    <table class="qterms"><tbody>${(() => { const r = title === "QUOTATION" ? quoteTermRows(q)
      : quoteTermRows(q).filter(([k]) => k !== "Valid till").map(([k, v]) => [k === "Quotation date" ? (title === "PROFORMA INVOICE" ? "Proforma date" : "Date") : k, v]), out = []; for (let i = 0; i < r.length; i += 2) out.push(`<tr>${r.slice(i, i + 2).map(([k, v]) => `<th>${h(k)}</th><td>${h(v)}</td>`).join("")}${i + 1 >= r.length ? "<th></th><td></td>" : ""}</tr>`); return out.join(""); })()}</tbody></table>
    <table class="qlines">${head}<tbody>
    ${pick ? pickBody() : `${inc.map((it, i) => rowHtml(it, i)).join("")}
    ${tot("Sub Total", n2(c.sub))}${c.lines.map(([l, v]) => tot(h(l), n2(v))).join("")}
    ${c.round ? tot("Round off", (c.round > 0 ? "+" : "−") + Math.abs(c.round).toFixed(2)) : ""}
    ${tot("Grand Total", inr(c.grand), true)}`}</tbody></table>
    <p class="qwords"><b>Amount in words:</b> <span${pick ? ` data-tot="words"` : ""}>${h(pick ? amountWords(pick.T.grand) : rupeesWords(c.grand))}</span></p>
    ${opt.length && !pick ? `<div class="qopt"><h4>Optional items <span>— not included in the total above; tell us to add any of them</span></h4><table class="qlines">${head}<tbody>${opt.map((it, i) => rowHtml(it, i)).join("")}</tbody></table></div>` : ""}
    ${q.note_customer ? `<p style="white-space:pre-wrap"><b>Note:</b> ${h(q.note_customer)}</p>` : ""}
    <div class="qsec" data-pr="terms"><h4>Terms &amp; Conditions</h4><div class="rich"></div></div>
    <p><b>Bank:</b> ${h(co.bank || "")} · A/c ${h(co.acno || "")} · ${h(co.branch || "")} · IFSC ${h(co.ifsc || "")}</p>
    ${rep?.name ? `<p class="qrep"><b>Prepared by:</b> ${h(rep.name)}${rep.designation ? ", " + h(rep.designation) : ""}${rep.phone ? " · 📞 " + h(rep.phone) : ""}${rep.email ? " · ✉ " + h(rep.email) : ""}</p>` : ""}
    <p>For <b>${h(co.name || "")}</b><br><br>Authorised Signatory<br><span style="font-size:11px">Contact: ${h(co.contact || "")} ${h(co.mobile || "")} · ${h(co.email || "")}</span></p>
    <div class="qannex" data-pr="annex"><div class="hd2"><b>ANNEXURE</b><span>Quotation No. ${h(q.quote_no || "")} · ${h(dOnly(q.created_at || new Date()))}</span></div><div class="rich"></div></div></div>`;
  const put = (k, html) => { const b = $(`[data-pr="${k}"]`, pr); if (html) renderRich($(".rich", b), html); else b.remove(); };
  put("terms", q.terms_html || textToHtml(q.notes));
  put("annex", q.annexure_html);
  return pr;
}

// ---------------------------------------------------------------------
//  REPORTS
// ---------------------------------------------------------------------
const RPD = dateState("reports", "month");
VIEWS.reports = async (el) => {
  const { from, to, label } = dateRange(RPD);
  const [{ data: calls, error }, { data: st }, { data: em }] = await Promise.all([sb.rpc("calls_report_range", { p_from: from, p_to: to }), sb.rpc("dashboard_stats"), sb.rpc("email_report_range", { p_from: from, p_to: to })]);
  if (error) throw error;
  const users = new Map();
  (calls || []).forEach((c) => { const u = users.get(c.user_id) || { calls: 0, pos: 0, days: new Set() }; u.calls += +c.calls; u.pos += +c.positive; u.days.add(c.day); users.set(c.user_id, u); });
  const rows = [...users.entries()].map(([id, u]) => ({ id, name: userName(id), ...u, avg: u.calls / Math.max(1, u.days.size), conv: u.calls ? (u.pos / u.calls) * 100 : 0 })).sort((a, b) => b.calls - a.calls);
  const series = callSeries(calls, from, to);
  const bs = st?.by_status || {}, src = st?.by_source || {};
  const total = Object.values(bs).reduce((a, b) => a + b, 0), won = bs.won || 0;
  el.innerHTML = `
    <div class="toolbar">${dateBarHtml("reports", RPD)}<span class="sp" style="flex:1"></span><button class="btn" id="rexp">${ic("download")} Export CSV</button></div>
    <div class="kpis">
      <div class="card kpi"><div class="l">Total calls · ${h(label)}</div><div class="v">${num(rows.reduce((a, r) => a + r.calls, 0))}</div></div>
      <div class="card kpi"><div class="l">Positive outcomes</div><div class="v">${num(rows.reduce((a, r) => a + r.pos, 0))}</div><div class="s">interested / quote / demo / won</div></div>
      <div class="card kpi"><div class="l">Win rate (all leads)</div><div class="v">${total ? ((won / total) * 100).toFixed(1) : 0}%</div><div class="s">${num(won)} won / ${num(total)}</div></div>
      <div class="card kpi"><div class="l">Pipeline value</div><div class="v">${inrShort(st?.pipeline_value)}</div></div>
    </div>
    <div class="card"><div class="card-h"><h3>Calls per day</h3></div><div class="card-b">${barChart(series, { height: 210, label: "Calls per day", hiLast: series.endsToday })}</div></div>
    <div class="cols sec">
      <div class="card"><div class="card-h"><h3>${isMgr() ? "Team performance" : "Meri performance"}</h3></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Naam</th><th class="num">Calls</th><th class="num">Avg / din</th><th class="num">Positive</th><th class="num">Conversion</th></tr></thead><tbody>
        ${rows.map((r) => `<tr style="cursor:default"><td class="co">${h(r.name)}</td><td class="num">${num(r.calls)}</td><td class="num">${r.avg.toFixed(1)}</td><td class="num">${num(r.pos)}</td><td class="num">${r.conv.toFixed(1)}%</td></tr>`).join("") || `<tr><td colspan="5" class="empty">Is period mein koi call nahi</td></tr>`}</tbody></table></div></div>
      <div class="stack"><div class="card"><div class="card-h"><h3>Funnel</h3></div><div class="card-b">${hbars(STATUSES.map(([k, l]) => ({ l, v: bs[k] || 0 })))}</div></div>
        <div class="card"><div class="card-h"><h3>Lead sources</h3></div><div class="card-b">${hbars(Object.entries(src).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ l: SOURCES[k] || k, v })))}</div></div></div>
    </div>
    <div class="card sec"><div class="card-h"><h3>✉️ Email performance · ${h(label)}</h3></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Naam</th><th class="num">Emails bheje</th><th class="num">Replies</th><th class="num">Companies jinhone reply kiya</th><th class="num">Reply rate</th></tr></thead><tbody>
      ${(em || []).sort((a, b) => b.sent - a.sent).map((r) => `<tr style="cursor:default"><td class="co">${h(userName(r.user_id))}</td><td class="num">${num(r.sent)}</td><td class="num">${num(r.replies)}</td><td class="num">${num(r.replied_contacts)}</td><td class="num">${r.sent ? ((r.replied_contacts / r.sent) * 100).toFixed(1) : "0.0"}%</td></tr>`).join("") || `<tr><td colspan="5" class="empty">Is period mein CRM se koi email nahi gaya</td></tr>`}
    </tbody></table></div></div>`;
  wireDateBar(el, "reports", RPD, () => VIEWS.reports(el));
  $("#rexp", el).onclick = () => download(`calls-report-${from || "start"}-to-${to || "today"}.csv`, toCSV((calls || []).map((c) => ({ ...c, name: userName(c.user_id) })), [["day", "Date"], ["name", "User"], ["calls", "Calls"], ["positive", "Positive"]]));
};

// ---------------------------------------------------------------------
//  TEAM (admin)
// ---------------------------------------------------------------------
VIEWS.team = async (el) => {
  await loadTeam();
  const [{ data: loads }, { data: subs }, { data: ob }] = await Promise.all([
    sb.from("leads").select("owner_id").in("status", OPEN_STATUSES).not("owner_id", "is", null).limit(20000),
    sb.from("push_subs").select("user_id"),
    sb.from("settings").select("value").eq("key", "obf").maybeSingle(),
  ]);
  if (ob?.value) S.settings.obf = ob.value;
  const cnt = {}; (loads || []).forEach((l) => { cnt[l.owner_id] = (cnt[l.owner_id] || 0) + 1; });
  const phones = {}; (subs || []).forEach((x) => { phones[x.user_id] = (phones[x.user_id] || 0) + 1; });
  el.innerHTML = `<div class="toolbar"><span class="mu">${S.team.filter((u) => u.active).length} active users · ${S.team.filter(online).length} online</span><span class="sp" style="flex:1"></span>
    <button class="btn" data-act="distribute">⚡ Pool auto-distribute</button><button class="btn primary" data-act="addUser">${ic("plus")} User</button></div>
  <div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Naam</th><th>Role</th><th>${L("Pages", "Pages")}</th><th>Categories</th><th class="num">Target</th><th class="num">Open leads</th><th>Last seen</th><th>Status</th><th></th></tr></thead><tbody>
  ${S.team.map((u) => `<tr style="cursor:default"><td><div class="row" style="flex-wrap:nowrap"><span class="dot ${online(u) ? "on" : ""}"></span><div><div class="co">${h(u.full_name)}</div><div class="sub">${h(u.email)}</div></div></div></td>
    <td>${h(ROLE[u.role])}${u.role !== "admin" && isApprover(u.id) ? ` <span class="badge info" title="${h(L("OBF approve kar sakta hai", "Can approve OBFs"))}">✅ Director</span>` : ""}${phones[u.id] ? ` <span title="${h(L("Phone notification ON", "Phone notifications on") + " · " + phones[u.id])}">📲</span>` : ""}</td><td class="sub" title="${h((u.role === "admin" ? PAGEABLE : u.pages || rolePages(u.role)).map((r) => TITLES[r]).join(", "))}">${u.role === "admin" ? L("Sab", "All") : u.pages ? `<span class="badge acc">${u.pages.length} ${L("chune hue", "custom")}</span>` : `${rolePages(u.role).length} · ${L("role default", "role default")}`}</td><td class="sub">${h((u.categories || []).join(", ") || "All")}</td><td class="num">${u.daily_target}</td><td class="num">${num(cnt[u.id] || 0)}</td>
    <td class="sub">${h(ago(u.last_seen))}</td><td>${u.active ? '<span class="badge good">Active</span>' : '<span class="badge bad">Disabled</span>'}</td>
    <td style="white-space:nowrap"><button class="btn sm" data-act="editUser" data-id="${u.id}">Edit</button>${u.id !== S.me.id ? ` <button class="btn sm icon" data-act="pwUser" data-id="${u.id}" title="${h(L("Password badlo", "Change password"))}" aria-label="${h(L("Password badlo", "Change password"))}">🔑</button> <button class="btn sm" data-act="handover" data-id="${u.id}" title="${h(L("Iske saare leads / RFQs / tasks kisi aur ko do", "Move all their leads / RFQs / tasks to someone else"))}">🔁 Handover</button> <button class="btn sm ${u.active ? "danger" : ""}" data-act="toggleUser" data-id="${u.id}">${u.active ? "Disable" : "Enable"}</button>` : ""}</td></tr>`).join("")}
  </tbody></table></div></div>
  <p class="mu" style="font-size:12.5px">🔒 Disable karte hi user ka login band, aur uske pending (new/contacted) leads pool mein wapas. Har change Audit log mein record hota hai.</p>`;
};
const catChecks = (sel = []) => `<div class="chips">${CATEGORIES.map((c) => `<label class="chip ${sel.includes(c) ? "on" : ""}"><input type="checkbox" class="sr" name="categories" data-multi="1" value="${h(c)}" ${sel.includes(c) ? "checked" : ""}>${h(c)}</label>`).join("")}</div><div class="mu" style="font-size:12px;margin-top:4px">Kuch select nahi = saari categories</div>`;
const pwOk = (p) => p && p.length >= 10 && /[a-z]/i.test(p) && /\d/.test(p);
// page access picker (Team → add / edit user)
function pageAccessHtml(role, pages) {
  const sel = pages || rolePages(role);
  return `<div id="paBox" ${role === "admin" ? "hidden" : ""}><label class="f">${L("Kaun se pages dikhenge", "Pages this person can open")}</label>
    <div class="row" style="gap:6px;margin-bottom:6px"><button type="button" class="btn sm" data-pa="def">${L("Role ke hisaab se", "Role default")}</button>
      <button type="button" class="btn sm" data-pa="calling">📞 ${L("Sirf calling (3 pages)", "Calling only (3 pages)")}</button><button type="button" class="btn sm" data-pa="all">${L("Sab", "All")}</button><button type="button" class="btn sm ghost" data-pa="none">${L("Koi nahi", "None")}</button></div>
    <div class="chips">${PAGEABLE.map((r) => `<label class="chip ${sel.includes(r) ? "on" : ""}"><input type="checkbox" class="sr" name="pages" data-multi="1" value="${r}" ${sel.includes(r) ? "checked" : ""}>${h(TITLES[r])}</label>`).join("")}</div>
    <div class="mu" style="font-size:12px;margin-top:4px">${L("Data ke rules role se hi chalte hain (jaise cost price sirf Manager ko). Ye sirf menu mein dikhne wale pages tay karta hai.", "Data rules still follow the role (e.g. cost price only for Managers). This only decides which menu pages show.")}</div></div>
    <div id="paAdmin" class="mu" style="font-size:12.5px;margin-top:10px" ${role === "admin" ? "" : "hidden"}>${L("Admin ko hamesha saare pages dikhte hain.", "Admins always see every page.")}</div>`;
}
function wirePageAccess(m) {
  const set = (list) => $$("[name=pages]", m).forEach((c) => { c.checked = list.includes(c.value); c.parentElement.classList.toggle("on", c.checked); });
  const role = () => $("[name=role]", m)?.value;
  $$("[data-pa]", m).forEach((b) => b.onclick = () => set(b.dataset.pa === "def" ? rolePages(role()) : b.dataset.pa === "calling" ? ["today", "leads", "tasks"] : b.dataset.pa === "all" ? PAGEABLE : []));
  $("[name=role]", m)?.addEventListener("change", () => { const a = role() === "admin"; $("#paBox", m).hidden = a; $("#paAdmin", m).hidden = !a; set(rolePages(role())); });
}
// OBF approvers (the Director): Admins always; others listed in settings obf.approvers
const isApprover = (id) => S.teamById?.get(id)?.role === "admin" || (S.settings.obf?.approvers || []).includes(id);
const approverHtml = (role, on) => `<div class="sec-t" style="margin-top:16px">${L("Khaas permission", "Special permission")}</div>
  <label class="chip ${on || role === "admin" ? "on" : ""}" id="apChip"><input type="checkbox" class="sr" id="uApprover" ${on || role === "admin" ? "checked" : ""} ${role === "admin" ? "disabled" : ""}>✅ ${L("OBF approve kar sakta hai (Director)", "Can approve OBFs (Director)")}</label>
  <div class="mu" style="font-size:12px;margin-top:4px">${L("Customer ke order (OBF) ki approval request + roz subah ki hisaab list isko jaati hai. Admin hamesha approve kar sakta hai.", "Gets the OBF approval requests and the morning money list. Admins can always approve.")}</div>`;
function wireApprover(m) {
  const box = $("#uApprover", m), chip = $("#apChip", m); if (!box) return;
  box.onchange = () => {
    chip.classList.toggle("on", box.checked);
    const pg = $('[name=pages][value="obf"]', m);      // a Director must be able to open the OBF page
    if (box.checked && pg && !pg.checked) { pg.checked = true; pg.parentElement.classList.add("on"); }
  };
  $("[name=role]", m)?.addEventListener("change", (e) => { const a = e.target.value === "admin"; box.disabled = a; if (a) box.checked = true; chip.classList.toggle("on", box.checked); });
}
async function saveApprover(uid, on) {
  const { data } = await sb.from("settings").select("value").eq("key", "obf").maybeSingle();
  const v = data?.value || {}, now = new Set(v.approvers || []);
  if (now.has(uid) === !!on) return;
  if (on) now.add(uid); else now.delete(uid);
  const nv = { ...v, approvers: [...now] };
  const { error } = await sb.from("settings").upsert({ key: "obf", value: nv, updated_by: S.me.id, updated_at: new Date().toISOString() });
  if (error) throw error;
  S.settings.obf = nv;
}
// what to store: null when it equals the role default (so later default changes still apply)
function pagesToSave(m, role) {
  if (role === "admin") return null;
  const list = $$("[name=pages]", m).filter((c) => c.checked).map((c) => c.value);
  const def = rolePages(role);
  return list.length === def.length && list.every((x) => def.includes(x)) ? null : list;
}
function genPw() { const a = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"; const r = crypto.getRandomValues(new Uint32Array(12)); return [...r].map((x) => a[x % a.length]).join("") + "7"; }
ACT.addUser = () => {
  const pw = genPw();
  const m = modal({
    title: "Naya user", body: `<form id="uf"><div class="grid2">
      <div><label class="f">Naam *</label><input class="input" name="full_name" maxlength="80" required></div>
      <div><label class="f">Email *</label><input class="input" name="email" type="email" maxlength="200" required></div>
      <div><label class="f">Role</label><select class="input" name="role">${ROLES.map(([k, l]) => `<option value="${k}" ${k === "telecaller" ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div><label class="f">Daily call target</label><input class="input" name="daily_target" type="number" min="0" max="500" value="40"></div></div>
      <label class="f">Categories</label>${catChecks()}
      ${pageAccessHtml("telecaller", null)}
      ${approverHtml("telecaller", false)}
      <label class="f">Temporary password</label><div class="row" style="flex-wrap:nowrap"><input class="input mono" name="password" value="${h(pw)}" minlength="10"><button type="button" class="btn icon" id="cpw" aria-label="Copy">${ic("copy")}</button></div>
      <div class="mu" style="font-size:12px;margin-top:4px">User ko ye password do; wo login ke baad Profile se badal sakta hai.</div></form>`,
    foot: `<button class="btn" data-close>Cancel</button><button class="btn primary" id="us">Create user</button>`,
  });
  $$(".chip input", m).forEach((c) => c.onchange = () => c.parentElement.classList.toggle("on", c.checked));
  $("#cpw", m).onclick = () => { navigator.clipboard?.writeText($("[name=password]", m).value); toast("Copied"); };
  wirePageAccess(m); wireApprover(m);
  $("#us", m).onclick = (e) => busy(e.target, async () => {
    const f = formData($("#uf", m)); f.categories ||= [];
    if (!f.full_name || !f.email) return toast("Naam aur email daalo", true);
    if (!pwOk(f.password)) return toast("Password 10+ chars, letters + number", true);
    const pages = pagesToSave(m, f.role); delete f.pages;
    if (pages && !pages.length) return toast(L("Kam se kam 1 page chuno", "Pick at least 1 page"), true);
    await callFn("admin-users", { action: "create", ...f });
    if (pages) { const { error: pe } = await sb.from("profiles").update({ pages }).eq("email", f.email.trim().toLowerCase()); if (pe) toast(L("User bana, par page access save nahi hua: ", "User created, but page access not saved: ") + friendly(pe), true); }
    if ($("#uApprover", m)?.checked && f.role !== "admin") {
      const { data: nu } = await sb.from("profiles").select("id").eq("email", f.email.trim().toLowerCase()).maybeSingle();
      if (nu?.id) await saveApprover(nu.id, true).catch((x) => toast(L("Director permission save nahi hui: ", "Director permission not saved: ") + friendly(x), true));
    }
    closeModal(); toast("User ban gaya ✔ — email + password share karo"); VIEWS.team($("#page"));
  });
};
ACT.editUser = (t) => {
  const u = S.teamById.get(t.dataset.id); if (!u) return;
  const m = modal({
    title: "Edit · " + u.full_name, body: `<form id="ef"><div class="grid2">
      <div><label class="f">Naam</label><input class="input" name="full_name" maxlength="80" value="${h(u.full_name)}"></div>
      <div><label class="f">Role</label><select class="input" name="role" ${u.id === S.me.id ? "disabled" : ""}>${ROLES.map(([k, l]) => `<option value="${k}" ${k === u.role ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div><label class="f">Daily target</label><input class="input" name="daily_target" type="number" min="0" max="500" value="${u.daily_target}"></div></div>
      <label class="f">Categories</label>${catChecks(u.categories || [])}
      ${pageAccessHtml(u.role, u.pages)}
      ${approverHtml(u.role, isApprover(u.id))}</form>`,
    foot: `${u.id !== S.me.id ? `<button class="btn danger" id="udel">${ic("trash")} Delete</button>` : ""}<span style="flex:1"></span><button class="btn" data-close>Cancel</button><button class="btn primary" id="es">Save</button>`,
  });
  $$(".chip input", m).forEach((c) => c.onchange = () => c.parentElement.classList.toggle("on", c.checked));
  $("#es", m).onclick = (e) => busy(e.target, async () => {
    const f = formData($("#ef", m)); f.categories ||= []; f.daily_target = +f.daily_target || 0;
    f.pages = pagesToSave(m, f.role || u.role);
    if (f.pages && $("#uApprover", m)?.checked && !f.pages.includes("obf")) f.pages.push("obf");
    if (f.pages && !f.pages.length) return toast(L("Kam se kam 1 page chuno", "Pick at least 1 page"), true);
    if (u.id === S.me.id) delete f.role;
    const { error } = await sb.from("profiles").update(f).eq("id", u.id); if (error) throw error;
    if ((f.role || u.role) !== "admin") await saveApprover(u.id, !!$("#uApprover", m)?.checked);
    closeModal(); toast("Saved ✔"); VIEWS.team($("#page"));
  });
  wirePageAccess(m); wireApprover(m);
  $("#udel", m)?.addEventListener("click", async () => {
    if (!(await confirmBox(`${u.full_name} ko permanently delete? Uske saare leads pool mein chale jayenge. (Disable karna behtar hai)`, "Delete"))) return;
    try { await callFn("admin-users", { action: "delete", user_id: u.id }); toast("Deleted"); VIEWS.team($("#page")); } catch (e) { fail(e); }
  });
};
ACT.pwUser = (t) => {
  const u = S.teamById.get(t.dataset.id), pw = genPw();
  const m = modal({ title: "Password reset · " + u.full_name, body: `<label class="f">Naya password</label><input class="input mono" id="np" value="${h(pw)}">`, foot: `<button class="btn" data-close>Cancel</button><button class="btn primary" id="nps">Reset</button>` });
  $("#nps", m).onclick = (e) => busy(e.target, async () => {
    const p = $("#np", m).value; if (!pwOk(p)) return toast("10+ chars, letters + number", true);
    await callFn("admin-users", { action: "reset_password", user_id: u.id, password: p });
    navigator.clipboard?.writeText(p); closeModal(); toast("Password reset ✔ (copied)");
  });
};
ACT.toggleUser = async (t) => {
  const u = S.teamById.get(t.dataset.id);
  if (u.active && !(await confirmBox(`${u.full_name} ko disable karna hai? Login turant band ho jayega.`, "Disable"))) return;
  busy(t, async () => {
    await callFn("admin-users", { action: "set_active", user_id: u.id, active: !u.active }); toast(u.active ? "Disabled" : "Enabled"); VIEWS.team($("#page"));
    if (!u.active) return;
    const { count } = await sb.from("leads").select("id", { count: "exact", head: true }).eq("owner_id", u.id).in("status", OPEN_STATUSES);
    if (count && (await confirmBox(L(`${u.full_name} ke paas ${count} open leads hain. Kisi aur ko handover karna hai?`, `${u.full_name} still holds ${count} open leads. Hand them over to someone?`), L("Haan, handover", "Yes, hand over")))) openHandover(u.id, () => VIEWS.team($("#page")));
  });
};
ACT.handover = (t) => openHandover(t.dataset.id, () => VIEWS.team($("#page")));
ACT.distribute = async (b) => {
  if (!(await confirmBox(L("Free pool ke leads team mein baant dein? (Galti ho to turant ↩ Undo kar sakte ho)", "Share the free-pool leads across the team? (You can ↩ Undo right after)"), L("Haan, baanto", "Yes, distribute")))) return;
  busy(b, async () => {
    const { data, error } = await sb.rpc("auto_distribute", { max_per_user: 250 }); if (error) throw error;
    softRefresh(); refreshBadges();
    if (!data) return toast(L("Pool mein baantne layak koi lead nahi", "No pool leads to distribute"));
    toastAction(L(`⚡ ${data} leads team mein baant diye`, `⚡ ${data} leads distributed`), "↩ Undo", () => doUndo(), 12000);
  });
};

// ---------------------------------------------------------------------
//  AUTOMATION (admin edits, manager views + runs)
// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
//  COMPANY SETTINGS (admin edits, manager views) — used on quotations,
//  the customer quote page, invoices and GST (CGST/SGST vs IGST)
// ---------------------------------------------------------------------
const CO_FIELDS = [
  ["name", "Company naam (quotation pe)", "Company name (on quotations)"], ["state", "State (GST ke liye zaroori)", "State (needed for GST)"],
  ["gstin", "GSTIN", "GSTIN"], ["pan", "PAN", "PAN"], ["address", "Address", "Address"],
  ["contact", "Contact person", "Contact person"], ["mobile", "Mobile", "Mobile"], ["email", "Email", "Email"], ["website", "Website", "Website"], ["msme", "MSME No. (quotation pe)", "MSME No. (on quotations)"],
  ["bank", "Bank", "Bank"], ["acno", "Account no.", "Account no."], ["ifsc", "IFSC", "IFSC"], ["branch", "Branch", "Branch"],
];
// ---- email banners: Admin keeps up to 5 and picks the one the whole team uses ----
const MAX_BANNERS = 5;
const bannerList = () => { const v = S.settings.email_banner || {}; return v.list?.length ? v.list : [{ id: "b1", name: "Geninfo", url: bannerUrl(), link: bannerCfg().link }]; };
// ---- mail open tracking switches (settings key "mail_track")
function trackCard(v, ro) {
  return `<div class="card sec" style="max-width:860px" id="mtCard"><div class="card-h"><h3>👁 ${L("Mail open tracking", "Mail open tracking")}</h3></div>
    <div class="card-b">
      <p class="mu" style="font-size:12.5px;margin-top:0">${L("CRM se gaye har mail mein ek chhoti invisible image aur tracked links jaate hain. Customer mail kholega toh bhejne wale ko popup aayega, lead pe 👁 line aayegi aur 10 minute mein call ka follow-up lag jayega. List: Inbox → 👁 Khole gaye.", "Every CRM mail carries a tiny invisible image and tracked links. When the customer opens it, the sender gets a popup, the lead gets a 👁 line and a call follow-up in 10 minutes. List: Inbox → 👁 Opened.")}</p>
      <label class="check"><input type="checkbox" id="mtOn" ${v.on !== false ? "checked" : ""} ${ro ? "disabled" : ""}> ${L("Mail open tracking chalu", "Mail open tracking on")}</label>
      <label class="check" style="margin-top:6px"><input type="checkbox" id="mtRc" ${v.receipt !== false ? "checked" : ""} ${ro ? "disabled" : ""}> ${L("Outlook se bheje mail mein <b>read receipt</b> bhi maango — classic Outlook images band rakhta hai, receipt se pakka pata chalta hai", "Also ask for a <b>read receipt</b> on mails sent from Outlook — classic Outlook blocks images, the receipt confirms the read")}</label>
      <p class="mu" style="font-size:12px;margin:10px 0 0">${L("Dhyan: Outlook desktop / company mail images block kar sakte hain → wahan read receipt ya link click se hi pata chalega. iPhone Mail images khud load karta hai → kabhi bina padhe bhi 'khola' dikh sakta hai.", "Note: Outlook desktop / company mail may block images → there only a read receipt or a link click tells you. iPhone Mail loads images by itself → it can show 'opened' without a real read.")}</p>
    </div></div>`;
}
function wireTrackCard(el) {
  const save = (patch, msg) => busy(null, async () => {
    const v = { on: true, receipt: true, ...(S.settings.mail_track || {}), ...patch };
    const { error } = await sb.from("settings").upsert({ key: "mail_track", value: v, updated_by: S.me.id, updated_at: new Date().toISOString() });
    if (error) throw error;
    S.settings.mail_track = v; toast(msg);
  });
  $("#mtOn", el)?.addEventListener("change", (e) => save({ on: e.target.checked }, e.target.checked ? L("✔ Mail open tracking ON", "✔ Mail open tracking ON") : L("Mail open tracking OFF", "Mail open tracking OFF")));
  $("#mtRc", el)?.addEventListener("change", (e) => save({ receipt: e.target.checked }, e.target.checked ? L("✔ Outlook read receipt ON", "✔ Outlook read receipt ON") : L("Outlook read receipt OFF", "Outlook read receipt OFF")));
}
function bannerCard(ro) {
  const v = S.settings.email_banner || {}, list = bannerList(), act = v.active || list[0]?.id;
  return `<div class="card sec" style="max-width:860px" id="ebCard"><div class="card-h"><h3>📧 ${L("Email banners", "Email banners")} <span class="mu" style="font-weight:500">(${list.length}/${MAX_BANNERS})</span></h3><span class="sp"></span>
      <label class="check"><input type="checkbox" id="ebOn" ${v.on !== false ? "checked" : ""} ${ro ? "disabled" : ""}> ${L("Har mail ke neeche lagao", "Add under every mail")}</label></div>
    <div class="card-b">
      <p class="mu" style="font-size:12.5px;margin-top:0">${L("Jo banner <b>chuna</b> hai, wahi poori team ke har CRM mail mein lagta hai — Gmail mein kholo dabao, draft template + banner ke saath khulta hai. Banner badlo, agle mail se sabke liye naya.", "The <b>selected</b> banner goes into every CRM mail of the whole team — press Open in Gmail and the draft opens with the template + banner. Change it and everyone's next mail uses the new one.")}</p>
      <div class="eb-list">${list.map((b) => `<label class="eb-item ${b.id === act ? "on" : ""}">
        <div class="eb-top"><input type="radio" name="ebAct" value="${h(b.id)}" ${b.id === act ? "checked" : ""} ${ro ? "disabled" : ""}><b>${h(b.name || L("Banner", "Banner"))}</b>${b.id === act ? `<span class="badge good">${L("Team ke liye ON", "In use by the team")}</span>` : ""}<span class="sp" style="flex:1"></span>
          ${ro ? "" : `<button type="button" class="btn sm ghost" data-ebedit="${h(b.id)}">${ic("file")} ${L("Edit", "Edit")}</button><button type="button" class="btn sm ghost danger" data-ebdel="${h(b.id)}" title="${h(L("Delete", "Delete"))}">${ic("trash")}</button>`}</div>
        <img src="${h(b.url)}" alt="${h(b.name || "")}"><div class="mu" style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">🔗 ${h(b.link || "—")}</div></label>`).join("")}</div>
      ${ro ? "" : `<div class="row" style="margin-top:12px"><button class="btn primary" id="ebAdd" ${list.length >= MAX_BANNERS ? "disabled" : ""}>${ic("plus")} ${L("Naya banner", "Add banner")}</button>
        <span class="mu" style="font-size:12px">${list.length >= MAX_BANNERS ? L("Max 5 — naya daalne ke liye ek delete karo", "Max 5 — delete one to add another") : L("PNG / JPG, ~1000 × 250 px, 1 MB tak", "PNG / JPG, ~1000 × 250 px, up to 1 MB")}</span></div>
      <div class="mu" id="ebTeam" style="font-size:12.5px;margin-top:10px"></div>`}
    </div></div>`;
}
function wireBannerCard(el) {
  const card = $("#ebCard", el); if (!card) return;
  const redraw = () => { card.outerHTML = bannerCard(false); wireBannerCard(el); };
  // every change gets a new version → each person's Gmail script re-applies the signature
  const save = async (patch, msg) => {
    const cur = S.settings.email_banner || {}, list = patch.list || bannerList(), active = patch.active || cur.active || list[0]?.id;
    const a = list.find((b) => b.id === active) || list[0];
    const v = { ...cur, list, ...patch, active: a?.id || null, url: a?.url || null, link: a?.link || null, ver: `${a?.id || "none"}-${Date.now()}` };
    const { error } = await sb.from("settings").upsert({ key: "email_banner", value: v, updated_by: S.me.id, updated_at: new Date().toISOString() });
    if (error) throw error;
    S.settings.email_banner = v; toast(msg); redraw();
  };
  const upload = async (file) => {
    const ext = (file.type.split("/")[1] || "png").replace("jpeg", "jpg"), path = `email-banner-${Date.now()}.${ext}`;
    const { error } = await sb.storage.from("brand").upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
    if (error) throw error;
    return sb.storage.from("brand").getPublicUrl(path).data.publicUrl;
  };
  const editor = (b) => {
    const isNew = !b;
    const m = modal({ title: isNew ? L("📧 Naya banner", "📧 Add banner") : L("📧 Banner edit", "📧 Edit banner"), body: `
      <label class="f">${L("Naam (sirf aapke liye)", "Name (just for you)")}</label><input class="input" id="bnName" maxlength="60" value="${h(b?.name || "")}" placeholder="${h(L("jaise Diwali offer", "e.g. Diwali offer"))}">
      <label class="f">${isNew ? L("Banner image *", "Banner image *") : L("Naya image (optional — khaali chhodo to wahi rahega)", "New image (optional — leave empty to keep it)")}</label>
      <input class="input" type="file" id="bnFile" accept="image/png,image/jpeg,image/gif,image/webp">
      <label class="f">${L("Banner pe click karne se kya khule", "Link when the banner is clicked")}</label><input class="input" id="bnLink" maxlength="300" value="${h(b?.link || S.settings.company?.website_url || "https://www.genesisinfoserve.com")}">
      <div class="sigprev" style="margin-top:12px"><img id="bnPrev" src="${h(b?.url || "")}" alt="" style="width:100%;max-width:600px;${b?.url ? "" : "display:none"}"></div>`,
      foot: `<button class="btn" data-close>Cancel</button><button class="btn primary" id="bnSave">Save</button>` });
    let picked = null;
    $("#bnFile", m).onchange = (e) => {
      const f = e.target.files?.[0]; picked = null; if (!f) return;
      if (!/^image\/(png|jpeg|gif|webp)$/.test(f.type)) return toast(L("Sirf PNG / JPG / GIF / WebP image", "Images only: PNG / JPG / GIF / WebP"), true);
      if (f.size > 1048576) return toast(L("Image 1 MB se chhoti honi chahiye", "The image must be under 1 MB"), true);
      picked = f; const i = $("#bnPrev", m); i.src = URL.createObjectURL(f); i.style.display = "";
    };
    $("#bnSave", m).onclick = (e) => busy(e.target, async () => {
      const link = $("#bnLink", m).value.trim(), name = $("#bnName", m).value.trim();
      if (link && !/^https?:\/\//i.test(link)) return toast(L("Link https:// se shuru hona chahiye", "The link must start with https://"), true);
      if (isNew && !picked) return toast(L("Banner image chuno", "Pick a banner image"), true);
      const url = picked ? await upload(picked) : b.url;
      const list = bannerList().slice();
      if (isNew) list.push({ id: "b" + Date.now().toString(36), name: name || L("Banner", "Banner") + " " + (list.length + 1), url, link });
      else Object.assign(list.find((x) => x.id === b.id), { name: name || b.name, url, link });
      closeModal();
      await save({ list }, isNew ? L("✔ Banner add ho gaya — team ke liye use karne ko use chuno", "✔ Banner added — select it to use it for the team") : L("✔ Banner update ho gaya", "✔ Banner updated"));
    });
  };
  $("#ebAdd", card)?.addEventListener("click", () => editor(null));
  $$("[data-ebedit]", card).forEach((x) => x.onclick = (e) => { e.preventDefault(); editor(bannerList().find((b) => b.id === x.dataset.ebedit)); });
  $$("[data-ebdel]", card).forEach((x) => x.onclick = async (e) => {
    e.preventDefault();
    const list = bannerList(), b = list.find((y) => y.id === x.dataset.ebdel), act = (S.settings.email_banner || {}).active || list[0]?.id;
    if (b.id === act) return toast(L("Ye banner abhi team use kar rahi hai — pehle doosra chuno, phir delete karo", "The team is using this banner — select another one first, then delete"), true);
    if (!(await confirmBox(L(`"${b.name}" banner delete karna hai?`, `Delete the "${b.name}" banner?`), "Delete"))) return;
    busy(x, () => save({ list: list.filter((y) => y.id !== b.id) }, L("🗑 Banner delete ho gaya", "🗑 Banner deleted")));
  });
  $$("input[name=ebAct]", card).forEach((r) => r.onchange = () => busy(null, () => save({ active: r.value }, L("✔ Team banner badla — agle mail se sabke liye", "✔ Team banner changed — everyone's next mail uses it"))));
  $("#ebOn", card).onchange = (e) => busy(null, () => save({ on: e.target.checked }, e.target.checked ? L("✔ Banner ON", "✔ Banner ON") : L("Banner OFF — mails bina banner ke", "Banner OFF — mails go without it")));
  // who already has it in their Gmail
  sb.rpc("banner_team_status").then(({ data }) => {
    const box = $("#ebTeam", card); if (!box || !data) return;
    const ok = data.filter((r) => r.sig_ok), todo = data.filter((r) => !r.sig_ok);
    box.innerHTML = `📬 ${L("Gmail ready (naya code)", "Gmail ready (new code)")}: <b>${ok.length}/${data.length}</b>${todo.length ? ` · ${L("baaki", "pending")}: ${todo.map((r) => h(userName(r.user_id)) + (r.connected ? "" : L(" (Gmail setup nahi)", " (no Gmail setup)"))).join(", ")}` : " ✔"}`;
  });
}

function brandCard(b, ro) {
  const cur = b.login_animation || "server", tg = b.tagline || TAGLINES[0], custom = !TAGLINES.includes(tg);
  return `<div class="card sec" style="max-width:860px"><div class="card-h"><h3>🎬 ${L("Login screen", "Login screen")}</h3></div><div class="card-b">
    <fieldset ${ro ? "disabled" : ""} style="border:0;padding:0;margin:0"><div class="grid2">
      <div><label class="f">${L("Animation", "Animation")}</label><select class="input" id="brA">${FX_MODES.map((k) => `<option value="${k}" ${k === cur ? "selected" : ""}>${h(FX_NAMES[k])}</option>`).join("")}</select></div>
      <div><label class="f">Tagline</label><select class="input" id="brT">${TAGLINES.map((t) => `<option ${t === tg ? "selected" : ""}>${h(t)}</option>`).join("")}<option value="__c" ${custom ? "selected" : ""}>${L("Apni likho…", "Write your own…")}</option></select>
        <input class="input" id="brC" maxlength="80" value="${custom ? h(tg) : ""}" ${custom ? "" : "hidden"} style="margin-top:8px" placeholder="${h(L("Apni tagline", "Your tagline"))}"></div></div>
      ${ro ? "" : `<div class="row" style="margin-top:12px"><button class="btn primary" id="brSave">Save</button><span class="mu" style="font-size:12.5px">${L("Sabke login page pe agli baar se dikhega.", "Everyone sees it on the login page from their next visit.")}</span></div>`}</fieldset></div></div>`;
}
function wireBrandCard(el) {
  $("#brT", el)?.addEventListener("change", (e) => { $("#brC", el).hidden = e.target.value !== "__c"; });
  $("#brSave", el)?.addEventListener("click", (e) => busy(e.target, async () => {
    const t = $("#brT", el).value === "__c" ? $("#brC", el).value.trim() : $("#brT", el).value;
    if (!t) return toast(L("Tagline likho", "Write a tagline"), true);
    const v = { login_animation: $("#brA", el).value, tagline: t.slice(0, 80) };
    const { error } = await sb.from("settings").upsert({ key: "branding", value: v, updated_by: S.me.id, updated_at: new Date().toISOString() });
    if (error) throw error;
    try { localStorage.setItem("crm_brand", JSON.stringify(v)); } catch { /* ignore */ }
    toast(L("Login screen saved ✔", "Login screen saved ✔"));
  }));
}
const redirectUrl = () => location.origin + location.pathname.replace(/[^/]*$/, "") + "auth-redirect.html";
function outlookCard(o, ro) {
  const ok = /^[0-9a-f-]{36}$/i.test(o.client_id || ""), cp = (v) => `<button class="btn sm" data-copy="${h(v)}">${ic("copy")} Copy</button>`;
  return `<div class="card sec" style="max-width:860px"><div class="card-h"><h3>📩 Outlook / Microsoft 365 setup</h3><span class="sp"></span>
    <span class="badge ${ok ? "good" : "warn"}">${ok ? L("Setup ho gaya", "Set up") : L("Setup baaki", "Not set up")}</span></div><div class="card-b">
    <p class="mu" style="margin-top:0">${h(L("Isse customers ke Outlook replies CRM Inbox mein aate hain. Ek baar Microsoft 365 Admin karega (~10 min, free). CRM sirf mail padhta hai — na bhejta, na delete karta.", "This brings customers' Outlook replies into the CRM Inbox. A Microsoft 365 admin does it once (~10 min, free). The CRM only reads mail — it never sends or deletes."))}</p>
    <ol class="steps">
      <li>${L("Kholo", "Open")} <a href="https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/CreateApplicationBlade" target="_blank" rel="noopener noreferrer"><b>Entra → App registrations → New registration</b></a> ${L("(office admin account se)", "(with the office admin account)")}</li>
      <li>Name: <span class="mono">Genesis CRM</span> ${cp("Genesis CRM")} · ${L("Supported accounts", "Supported accounts")}: <b>Accounts in this organizational directory only</b></li>
      <li>Redirect URI → <b>Single-page application (SPA)</b> → <span class="mono" style="word-break:break-all">${h(redirectUrl())}</span> ${cp(redirectUrl())} → <b>Register</b></li>
      <li><b>API permissions → Add a permission → Microsoft Graph → Delegated → Mail.Read + Mail.ReadWrite</b> → Add → <b>Grant admin consent</b> ${L("(isse kisi user ko alag permission nahi deni padegi)", "(so no user is asked for permission)")}</li>
      <li>${L("Overview page se dono IDs copy karke yahan paste karo aur Save:", "Copy both IDs from the Overview page, paste them here and Save:")}</li></ol>
    <fieldset ${ro ? "disabled" : ""} style="border:0;padding:0;margin:0"><div class="grid2">
      <div><label class="f">Application (client) ID</label><input class="input mono" id="olId" value="${h(o.client_id || "")}" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" maxlength="36"></div>
      <div><label class="f">Directory (tenant) ID</label><input class="input mono" id="olTen" value="${h(o.tenant_id || "")}" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" maxlength="36"></div></div>
      <div class="row" style="margin-top:12px">${ro ? "" : `<button class="btn primary" id="olSave">Save</button>`}${ok ? `<button class="btn" id="olTest">🔗 ${L("Mera Outlook connect karke test karo", "Connect my Outlook & test")}</button>` : ""}</div></fieldset>
    <p class="mu" style="font-size:12.5px;margin-bottom:0">${h(L("Save ke baad har Outlook user ko CRM ke upar “Outlook connect karo” ka 1-click button dikhega. Ek baar connect kiya toh browser band karne ke baad bhi connected rehta hai (logout karne pe hat jata hai).", "After saving, every Outlook user sees a 1-click “Connect Outlook” button at the top of the CRM. Once connected it stays connected after the browser is closed (logging out disconnects it)."))}</p>
  </div></div>`;
}
function wireOutlookCard(el, o) {
  $$("[data-copy]", el).forEach((b) => b.onclick = () => { navigator.clipboard?.writeText(b.dataset.copy).then(() => toast(L("Copied ✔", "Copied ✔")), () => prompt("Copy", b.dataset.copy)); });
  $("#olTest", el)?.addEventListener("click", (e) => busy(e.target, outlookConnect));
  $("#olSave", el)?.addEventListener("click", (e) => busy(e.target, async () => {
    const id = $("#olId", el).value.trim(), ten = $("#olTen", el).value.trim(), G = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (id && !G.test(id)) return toast(L("Client ID galat lag raha hai — 36 characters ka hota hai (xxxxxxxx-xxxx-…)", "Client ID looks wrong — it is 36 characters (xxxxxxxx-xxxx-…)"), true);
    if (ten && !G.test(ten)) return toast(L("Tenant ID galat lag raha hai", "Tenant ID looks wrong"), true);
    const v = { client_id: id, tenant_id: ten };
    const { error } = await sb.from("settings").upsert({ key: "outlook", value: v, updated_by: S.me.id, updated_at: new Date().toISOString() });
    if (error) throw error;
    S.settings.outlook = v; toast(L("Outlook setup saved ✔ — ab test button dabao", "Outlook setup saved ✔ — now press the test button")); VIEWS.company(el); startOutlookAutoSync();
  }));
}
// ---- backups (Admin): list, download, back up now ----
async function wireBackupCard(el) {
  const box = $("#bkList", el); if (!box) return;
  const { data, error } = await sb.storage.from("backups").list("", { limit: 60, sortBy: { column: "name", order: "desc" } });
  if (!$("#bkList", el)) return;
  // one row per backup: Excel (sheet per section) + full JSON copy
  const all = data || [], byBase = new Map();
  for (const f of all) { const m = f.name.match(/^(.+)\.(json\.gz|xlsx)$/); if (!m) continue; const g = byBase.get(m[1]) || {}; g[m[2] === "xlsx" ? "x" : "j"] = f; byBase.set(m[1], g); }
  const files = [...byBase.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  const kb = (f) => f ? ((f.metadata?.size || 0) / 1024).toFixed(0) + " KB" : "";
  const newest = files[0] ? Date.parse(files[0][1].j?.created_at || files[0][1].x?.created_at || 0) : 0;
  const stale = !newest || Date.now() - newest > 26 * 3600e3;
  const when = newest ? h(new Date(newest).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })) : "";
  box.innerHTML = error ? `<div class="empty">${h(friendly(error))}</div>` : !files.length ? `<div class="empty">${L("Abhi koi backup nahi — upar \"Abhi backup lo\" dabao", "No backups yet — press \"Back up now\"")}</div>`
    : `${stale ? `<div class="bk-stale">⚠️ ${L(`Aakhri backup ${when} ka hai — raat ka backup nahi bana. Upar "Abhi backup lo" dabao.`, `The last backup is from ${when} — last night's backup did not run. Press "Back up now" above.`)}</div>` : ""}
      <div class="hlist">${files.slice(0, 15).map(([base, g]) => { const [d, t, k] = base.split("_");
        return `<div class="hrow"><div class="hmain"><div class="hsum">📦 ${h(new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }))} · ${h(t.slice(0, 2) + ":" + t.slice(2))}
          ${k === "manual" ? `<span class="badge">${L("haath se", "manual")}</span>` : `<span class="badge good">auto</span>`}</div><div class="mu" style="font-size:12px">${[g.x ? "Excel " + kb(g.x) : "", g.j ? "JSON " + kb(g.j) : ""].filter(Boolean).join(" · ")}</div></div>
          ${g.x ? `<button class="btn sm primary" data-bk="${h(g.x.name)}">${ic("download")} Excel</button>` : g.j ? `<button class="btn sm primary" data-bkx="${h(g.j.name)}" title="${h(L("Is backup se Excel banake download karo", "Make an Excel file from this backup and download it"))}">${ic("download")} Excel</button>` : ""}
          ${g.j ? `<button class="btn sm" data-bk="${h(g.j.name)}" title="${h(L("Poora data (restore ke liye)", "Full data (for restore)"))}">${ic("download")} JSON</button>` : ""}
          <button class="btn sm ghost icon" data-bkdel="${h(base)}" data-bkf="${h([g.x?.name, g.j?.name].filter(Boolean).join("|"))}" title="${h(L("Ye backup delete karo", "Delete this backup"))}" aria-label="Delete backup">${ic("trash")}</button></div>`; }).join("")}</div>
      ${files.length > 15 ? `<p class="mu" style="font-size:12px">+${files.length - 15} ${L("purane backup bhi rakhe hain", "older backups kept")}</p>` : ""}`;
  $$("[data-bk]", box).forEach((b) => b.onclick = () => busy(b, async () => {
    const { data: u, error: e } = await sb.storage.from("backups").createSignedUrl(b.dataset.bk, 120, { download: b.dataset.bk });
    if (e) throw e;
    const a = document.createElement("a"); a.href = u.signedUrl; a.rel = "noopener"; document.body.append(a); a.click(); a.remove();
  }));
  // Excel made in the browser from the JSON backup (the server only writes the JSON — it has 2 s of CPU)
  $$("[data-bkx]", box).forEach((b) => b.onclick = () => busy(b, async () => {
    const { data: u, error: e } = await sb.storage.from("backups").createSignedUrl(b.dataset.bkx, 300);
    if (e) throw e;
    const res = await fetch(u.signedUrl); if (!res.ok) throw new Error("Backup download failed (" + res.status + ")");
    const blob = await res.blob();
    const { backupToExcel } = await import("./bkxl.js");
    const xl = await backupToExcel(blob);
    const a = document.createElement("a"); a.href = URL.createObjectURL(xl); a.download = b.dataset.bkx.replace(/\.json\.gz$/, ".xlsx");
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }));
  $$("[data-bkdel]", box).forEach((b) => b.onclick = async () => {
    const [d, t] = b.dataset.bkdel.split("_");
    const label = new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) + " " + t.slice(0, 2) + ":" + t.slice(2);
    const last = files.length <= 1;
    if (!(await confirmBox(L(`${label} wala backup (Excel + JSON) hamesha ke liye delete karna hai? Ye wapas nahi aayega.${last ? " ⚠️ Ye aakhri backup hai!" : ""}`,
      `Permanently delete the ${label} backup (Excel + JSON)? This cannot be undone.${last ? " ⚠️ This is the only backup!" : ""}`), "Delete"))) return;
    busy(b, async () => {
      const { data: gone, error: e } = await sb.storage.from("backups").remove(b.dataset.bkf.split("|"));
      if (e) throw e;
      if (!gone?.length) throw new Error(L("Delete nahi hua — permission nahi hai", "Not deleted — no permission"));
      toast(L("🗑 Backup delete ho gaya", "🗑 Backup deleted")); wireBackupCard(el);
    });
  });
  const now = $("#bkNow", el);
  if (now) now.onclick = () => busy(now, async () => {
    const r = await callFn("backup", {});
    toast(L(`💾 Backup ho gaya: ${num(r.rows)} records · ${num(r.tables || 0)} tables · ${num(r.kb || 0)} KB`, `💾 Backed up: ${num(r.rows)} records · ${num(r.tables || 0)} tables · ${num(r.kb || 0)} KB`));
    wireBackupCard(el);
  });
}
VIEWS.company = async (el) => {
  const { data } = await sb.from("settings").select("key, value").in("key", ["company", "payment_terms_days", "outlook", "branding", "email_banner", "mail_track", "erp_access"]);
  const m = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
  if (m.email_banner) S.settings.email_banner = m.email_banner;
  if (m.mail_track) S.settings.mail_track = m.mail_track;
  const c = m.company || {}, ro = !isAdmin();
  el.innerHTML = `<div class="card" style="max-width:860px"><div class="card-h"><h3>🏢 ${L("Company details", "Company details")}</h3><span class="sp"></span>${ro ? `<span class="badge">${L("Read-only (Admin edit karega)", "Read-only (Admin edits)")}</span>` : ""}</div>
    <div class="card-b"><fieldset ${ro ? "disabled" : ""} style="border:0;padding:0;margin:0"><div class="grid2">
      ${CO_FIELDS.map(([k, hi, en]) => `<div ${k === "address" ? 'style="grid-column:1/-1"' : ""}><label class="f">${h(L(hi, en))}</label><input class="input" data-co="${k}" value="${h(c[k] || "")}" maxlength="${k === "address" ? 300 : 120}"></div>`).join("")}
      <div><label class="f">${L("Payment terms (din) — invoice due date ke liye", "Payment terms (days) — for invoice due dates")}</label><input class="input" type="number" min="0" max="365" id="coTerms" value="${h(m.payment_terms_days ?? 30)}"></div>
    </div>${ro ? "" : `<div class="row" style="margin-top:14px"><button class="btn primary" id="coSave">Save</button></div>`}</fieldset></div></div>
    ${bannerCard(ro)}
    ${trackCard(m.mail_track || {}, ro)}
    ${isMgr() ? `<div class="card sec" style="max-width:860px"><div class="card-h"><h3>📦 ${L("Purana ERP data", "Old ERP data")}</h3></div><div class="card-b">
      <p class="mu" style="font-size:12.5px;margin-top:0">${L("Har employee ko sirf apni quotations, renewals aur OBF dikhte hain (Admin / Manager ko sab). ERP se aayi quotations aur renewals abhi sirf Admin / Manager dekh sakte hain. Chalu karoge toh sab employees inhe <b>dekh</b> sakenge — badal nahi sakenge.", "Each employee sees only their own quotations, renewals and OBFs (Admin / Manager see all). Quotations and renewals from the old ERP are for Admin / Manager only. Turn this on and every employee can <b>see</b> them — not change them.")}</p>
      <label class="check"><input type="checkbox" id="erpPub" ${m.erp_access?.public ? "checked" : ""} ${ro ? "disabled" : ""}> ${L("ERP ka purana data sab employees ko dikhao", "Show the old ERP data to every employee")}</label></div></div>` : ""}
    ${brandCard(m.branding || {}, ro)}
    ${outlookCard(m.outlook || {}, ro)}
    ${isAdmin() ? `<div class="card" style="max-width:860px" id="bkCard"><div class="card-h"><h3>💾 ${L("Backup", "Backup")}</h3><span class="sp"></span>
      <button class="btn sm primary" id="bkNow">${L("Abhi backup lo", "Back up now")}</button></div>
      <div class="card-b"><p class="mu" style="margin-top:0">${L("Har raat 3 baje poore CRM ka apne aap backup hota hai — <b>Excel</b> (har section ki alag sheet) + <b>JSON</b> (restore ke liye). Private, sirf Admin download kar sakta hai. 30 din ke roz ke backup + har mahine ki 1 tarikh wala 1 saal tak rakha jaata hai. Hafte mein ek baar latest backup download karke company laptop / OneDrive pe bhi rakh lo.", "The whole CRM is backed up automatically every night at 3 AM — <b>Excel</b> (one sheet per section) + <b>JSON</b> (for restore). Private, only Admins can download. Daily backups are kept for 30 days, the 1st-of-month one for a year. Once a week, download the latest one and keep a copy on a company laptop / OneDrive too.")}</p>
      <div id="bkList"><div class="empty">Loading…</div></div></div></div>` : ""}
    <p class="mu" style="font-size:12.5px">💡 ${h(L("Ye details quotation print, customer ke online quotation page aur invoices pe aati hain. Customer ka state aapke state se alag ho toh IGST, warna CGST+SGST apne aap lagta hai.", "These details appear on printed quotations, the customer's online quotation page and invoices. IGST applies automatically when the customer's state differs from yours, otherwise CGST+SGST."))}</p>`;
  wireOutlookCard(el, m.outlook || {});
  wireBrandCard(el, m.branding || {});
  if (!ro) { wireBannerCard(el); wireTrackCard(el); }
  $("#erpPub", el)?.addEventListener("change", (e) => busy(null, async () => {
    const on = e.target.checked;
    const { error } = await sb.from("settings").upsert({ key: "erp_access", value: { public: on }, updated_by: S.me.id, updated_at: new Date().toISOString() });
    if (error) { e.target.checked = !on; throw error; }
    toast(on ? L("✔ ERP data ab sab employees ko dikhega", "✔ ERP data is now visible to every employee") : L("ERP data ab sirf Admin / Manager ko", "ERP data is now for Admin / Manager only"));
  }));
  if (isAdmin()) wireBackupCard(el);
  $("#coSave", el)?.addEventListener("click", (e) => busy(e.target, async () => {
    const v = { ...c }; $$("[data-co]", el).forEach((i) => { v[i.dataset.co] = i.value.trim(); });
    if (!v.name || !v.state) return toast(L("Company naam aur State zaroori hai", "Company name and State are required"), true);
    if (v.gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/i.test(v.gstin)) return toast(L("GSTIN sahi format mein nahi hai", "GSTIN format looks wrong"), true);
    const now = new Date().toISOString(), terms = Math.min(365, Math.max(0, +$("#coTerms", el).value || 0));
    const { error } = await sb.from("settings").upsert([{ key: "company", value: v, updated_by: S.me.id, updated_at: now },
      { key: "payment_terms_days", value: terms, updated_by: S.me.id, updated_at: now }]);
    if (error) throw error;
    S.settings.company = v; S.settings.payment_terms_days = terms;
    toast(L("Company details saved ✔", "Company details saved ✔")); VIEWS.company(el);
  }));
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// ---- the four automations (migration 054): settings, Gmail readiness, and the log of what they did
const AU = [
  ["pay", "💰", () => L("Payment reminders", "Payment reminders"), () => L("Invoice due hone se pehle aur late hone par customer ko mail; 7 din late pe salesperson ko call ka task.", "A mail to the customer before the due date and when it's late; a call task for the salesperson at 7 days late.")],
  ["renew", "🔁", () => L("Renewal quotation", "Renewal quotations"), () => L("AMC / licence khatam hone se pehle renewal quotation ban ke online link ke saath customer ko jaati hai.", "Before an AMC / licence ends, a renewal quotation is made and mailed with the online link.")],
  ["followup", "📞", () => L("Quotation follow-up", "Quotation follow-ups"), () => L("Quotation bhejne ke baad follow-up mail; aakhri pe call task. Customer reply / accept kare toh ruk jaata hai.", "Follow-up mails after a quotation goes out; a call task at the end. Stops when the customer replies or accepts.")],
  ["vpo", "📦", () => L("Vendor PO", "Vendor POs"), () => L("OBF approve hote hi har vendor ka PO ban ke vendor ko mail; maal late ho toh yaad.", "When an OBF is approved each vendor gets a PO by mail; a reminder if the goods are late.")],
  ["digest", "📊", () => L("Director ki subah ki list", "Director's morning list"), () => L("Baaki paise, overdue invoices, OBF approval, expire hone wali quotations, late PO.", "Dues, overdue invoices, OBFs waiting, quotations expiring, late POs.")],
];
const AU_ACT = { email: ["📧", L("Mail gaya", "Mailed")], notify: ["🔔", L("Yaad dilaya", "Reminded")], made: ["📝", L("Bana", "Made")], skip: ["⏭", L("Roka", "Skipped")] };
async function autoCard(root) {
  const box = $("#auBody", root); if (!box) return;
  const [{ data: st }, { data: log }, { data: gm }] = await Promise.all([
    sb.from("settings").select("value").eq("key", "automation").limit(1),
    sb.from("automation_log").select("*").order("created_at", { ascending: false }).limit(40),
    sb.rpc("auto_gmail_status"),
  ]);
  const cfg = st?.[0]?.value || {}, ro = !isAdmin(), dis = ro ? " disabled" : "";
  const ready = (gm || []).filter((x) => x.can_send).length, total = (gm || []).length;
  const notReady = (gm || []).filter((x) => !x.can_send).map((x) => userName(x.user_id)).join(", ");
  const list = (a) => (Array.isArray(a) ? a : []).join(", ");
  const extra = (k) => {
    const c = cfg[k] || {};
    if (k === "pay") return `<label>${L("Due se pehle", "Days before due")} <input class="input" type="number" min="0" max="30" data-au="pay.before" value="${h(c.before ?? 3)}"${dis}></label><label>${L("Late hone par (din)", "Days late")} <input class="input" data-au="pay.after" value="${h(list(c.after) || "1, 7, 15, 30")}"${dis}></label>`;
    if (k === "renew") return `<label>${L("Kitne din pehle", "Days before the end")} <input class="input" type="number" min="7" max="120" data-au="renew.days" value="${h(c.days ?? 30)}"${dis}></label>`;
    if (k === "followup") return `<label>${L("Bhejne ke kitne din baad", "Days after sending")} <input class="input" data-au="followup.days" value="${h(list(c.days) || "2, 5")}"${dis}></label>`;
    return "";
  };
  box.innerHTML = `<p class="mu" style="margin:0 0 12px;font-size:12.5px">${L("Roz subah ~10 baje (Mon–Sat) CRM khud chalata hai. Mail salesperson ke <b>apne Gmail</b> se jaata hai (banner + open tracking ke saath); jiska Gmail CRM se connect nahi, usko notification + task milta hai. Har reminder ek hi baar jaata hai.", "The CRM runs this every morning ~10 am (Mon–Sat). Mails go from the salesperson's <b>own Gmail</b> (banner + open tracking); anyone without a connected Gmail gets a notification + task instead. Every reminder goes only once.")}
      <br>📧 ${L("Auto-mail ke liye Gmail ready", "Gmail ready for auto-mail")}: <b>${ready} / ${total}</b>${notReady ? ` <span title="${h(notReady)}">· ${L("baaki", "not yet")}: ${h(notReady.length > 80 ? notReady.slice(0, 80) + "…" : notReady)} (Inbox → Gmail setup)</span>` : ""}</p>
    <div class="au-list">${AU.map(([k, icn, name, desc]) => { const c = cfg[k] || {}; return `<div class="au-row">
      <label class="au-on"><input type="checkbox" data-au="${k}.on"${c.on === false ? "" : " checked"}${dis}> <b>${icn} ${h(name())}</b></label>
      <div class="au-desc mu">${h(desc())}</div>
      <div class="au-opt">${["pay", "renew", "followup", "vpo"].includes(k) ? `<select class="input" data-au="${k}.mode"${dis}><option value="auto"${c.mode !== "review" ? " selected" : ""}>${L("Mail apne aap", "Mail automatically")}</option><option value="review"${c.mode === "review" ? " selected" : ""}>${L("Sirf salesperson ko yaad", "Only remind the salesperson")}</option></select>` : ""}${extra(k)}</div></div>`; }).join("")}</div>
    ${ro ? "" : `<button class="btn primary sm" id="auSave" style="margin-top:10px">${L("Save", "Save")}</button>`}
    <h4 style="margin:18px 0 6px">${L("Automation ne kya kiya", "What the automations did")}</h4>
    ${(log || []).length ? `<div class="tbl-wrap"><table class="tbl au-log"><tbody>${log.map((r) => `<tr style="cursor:default"><td class="sub" style="width:90px">${h(ago(r.created_at))}</td><td style="width:28px">${(AU.find((a) => a[0] === r.kind) || [])[1] || "⚡"}</td>
      <td>${h(r.detail || "")}</td><td style="width:120px"><span class="badge ${r.action === "email" ? "good" : r.action === "skip" ? "" : "info"}">${(AU_ACT[r.action] || [])[0] || ""} ${h((AU_ACT[r.action] || [])[1] || r.action)}</span></td><td class="sub" style="width:120px">${h(r.user_id ? userName(r.user_id) : "")}</td></tr>`).join("")}</tbody></table></div>`
      : `<p class="mu" style="font-size:12.5px">${L("Abhi tak kuch nahi — kal subah se yahan dikhega.", "Nothing yet — it shows up here from tomorrow morning.")}</p>`}`;
  $("#auSave", box)?.addEventListener("click", (e) => busy(e.target, async () => {
    const v = structuredClone(cfg);
    $$("[data-au]", box).forEach((i) => {
      const [k, f] = i.dataset.au.split("."); v[k] ||= {};
      if (f === "on") v[k].on = i.checked;
      else if (f === "after" || f === "days" && k === "followup") v[k][f] = [...new Set(i.value.split(/[^0-9]+/).map(Number).filter((n) => n > 0 && n <= 120))].sort((a, b) => a - b);
      else if (i.type === "number") v[k][f] = Math.max(0, +i.value || 0);
      else v[k][f] = i.value;
    });
    if (!(v.pay?.after || []).length) v.pay.after = [1, 7, 15, 30];
    if (!(v.followup?.days || []).length) v.followup.days = [2, 5];
    const { error } = await sb.from("settings").upsert({ key: "automation", value: v, updated_by: S.me.id, updated_at: new Date().toISOString() });
    if (error) throw error;
    toast(L("✔ Automation settings save", "✔ Automation settings saved")); autoCard(root);
  }));
  const run = $("#auRun", root);
  if (run && !run.dataset.wired) {
    run.dataset.wired = "1";
    run.addEventListener("click", (e) => busy(e.target, async () => {
      const { data: r, error } = await sb.rpc("auto_run_now"); if (error) throw error;
      toast(`⚡ ${L("Ho gaya", "Done")}: 💰 ${r.pay} · 🔁 ${r.renew} · 📞 ${r.followup} · 📦 ${r.po_late} · 📊 ${r.digest}`); autoCard(root);
    }));
  }
}
VIEWS.automation = async (el) => {
  const [{ data: s }, { data: runs }, { data: lq }] = await Promise.all([
    sb.from("settings").select("value").eq("key", "ingest").single(),
    sb.from("ingest_runs").select("*").order("started_at", { ascending: false }).limit(20),
    sb.rpc("lead_quality"),
  ]);
  const c = s?.value || {}, ro = !isAdmin();
  const nextRun = (() => { for (let i = 0; i < 8; i++) { const d = new Date(); d.setDate(d.getDate() + i); d.setHours(9, 0, 0, 0); if (d > new Date() && (c.days || []).includes(d.getDay())) return d; } return null; })();
  el.innerHTML = `
  <div class="kpis">
    <div class="card kpi"><div class="l">Automation</div><div class="v" style="font-size:20px">${c.enabled ? '<span class="badge good">ON</span>' : '<span class="badge bad">OFF</span>'}</div><div class="s">Run days: ${(c.days || []).map((d) => DAYS[d]).join(", ") || "—"} · 9:00 AM</div></div>
    <div class="card kpi"><div class="l">Next auto-run</div><div class="v" style="font-size:20px">${nextRun && c.enabled ? h(nextRun.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })) : "—"}</div></div>
    <div class="card kpi"><div class="l">Last run</div><div class="v" style="font-size:20px">${runs?.[0] ? h(ago(runs[0].started_at)) : "—"}</div><div class="s">${runs?.[0] ? `+${runs[0].leads_added} leads · +${runs[0].rfqs_added} RFQs` : ""}</div></div>
  </div>
  <div class="card sec" id="autoCard"><div class="card-h"><h3>⚡ ${L("Auto follow-up & reminders", "Auto follow-ups & reminders")}</h3><span class="sp"></span>${isAdmin() ? `<button class="btn sm" id="auRun">▶ ${L("Abhi chalao", "Run now")}</button>` : ""}</div><div class="card-b" id="auBody"><div class="mu">…</div></div></div>
  <div class="card sec" id="rfqSrc"><div class="card-h"><h3>📨 ${L("RFQ apne aap — 4 raaste", "RFQs automatically — 4 ways")}</h3></div><div class="card-b"><div class="grid2">
    <div><b>1. IndiaMART</b> <span id="imState" class="mu">…</span>
      ${isAdmin() ? `<div class="row" style="gap:8px;margin-top:8px;flex-wrap:nowrap"><input class="input" id="imKey" type="password" autocomplete="off" placeholder="${L("IndiaMART CRM key yahan paste karo", "Paste the IndiaMART CRM key")}" style="flex:1;min-width:0"><button class="btn sm primary" id="imSave">Save</button></div>` : ""}
      <div class="row" style="gap:8px;margin-top:8px"><button class="btn sm" id="imTest">⚡ ${L("Abhi check karo", "Check now")}</button>${isAdmin() ? `<button class="btn sm ghost" id="imDel">${L("Key hatao", "Remove key")}</button>` : ""}</div>
      <p class="mu" style="font-size:12px;margin:8px 0 0">${L("Key kahan milegi: IndiaMART seller account → Lead Manager → Settings → <b>CRM Integration / Pull API</b> → Generate key (paid seller plan mein). Key daalte hi har 15 minute nayi enquiries RFQ + lead ban jaati hain.", "Where to get it: IndiaMART seller account → Lead Manager → Settings → <b>CRM Integration / Pull API</b> → Generate key (paid seller plans). Once saved, new enquiries become RFQs + leads every 15 minutes.")}</p></div>
    <div><b>2. Email</b> <span id="emState" class="mu">…</span>
      <p class="mu" style="font-size:12px;margin:6px 0 0">${L("IndiaMART / TradeIndia / JustDial ke alert mails aur customers ke “requirement / quotation” mails → apne aap RFQ. Jis mail mein phone number na ho uska RFQ nahi banta — us bande ko notification jaata hai. Har banda apna Gmail code ek baar update kare (Inbox → Gmail setup); Outlook wale bas connect karein.", "IndiaMART / TradeIndia / JustDial alert mails and customers' “requirement / quotation” mails → RFQs by themselves. A mail without a phone number doesn't make an RFQ — that person gets a notification instead. Everyone updates their Gmail code once (Inbox → Gmail setup); Outlook users just connect.")}</p>
      <button class="btn sm" id="emUpd" style="margin-top:8px">⚙️ ${L("Mera Gmail code update karo", "Update my Gmail code")}</button></div>
    <div style="grid-column:1/-1;margin-top:14px;padding-top:14px;border-top:1px solid var(--line)"><b>3 + 4. ${L("Website form + WhatsApp link", "Website form + WhatsApp link")}</b> <span class="mu" style="font-size:12.5px">${L("— customer form bharta hai → RFQ", "— the customer fills the form → RFQ")}</span>${enquiryShareHtml()}</div>
  </div></div></div>
  <div class="cols">
    <div class="card"><div class="card-h"><h3>Settings</h3><span class="sp"></span>${ro ? '<span class="badge">Read-only (Admin edit karega)</span>' : ""}</div><div class="card-b"><fieldset id="af" ${ro ? "disabled" : ""} style="border:0;padding:0;margin:0">
      <label class="check"><input type="checkbox" id="aEn" ${c.enabled ? "checked" : ""}> <b>Auto leads & RFQs ON</b></label>
      <label class="f">Run days (alternate days default: Mon / Wed / Fri)</label>
      <div class="chips">${DAYS.map((d, i) => `<label class="chip ${(c.days || []).includes(i) ? "on" : ""}"><input type="checkbox" class="sr" data-day="${i}" ${(c.days || []).includes(i) ? "checked" : ""}>${d}</label>`).join("")}</div>
      <div class="grid2"><div><label class="f">Max naye leads per run</label><input class="input" id="aMax" type="number" min="5" max="300" value="${c.max_new_leads_per_run || 60}"></div>
        <div><label class="f">Sources</label><label class="check"><input type="checkbox" id="aO" ${c.sources?.osm !== false ? "checked" : ""}> OpenStreetMap <span class="badge good">free</span></label> &nbsp; <label class="check"><input type="checkbox" id="aG" ${c.sources?.google_places !== false ? "checked" : ""}> Google Places <span class="mu">(key)</span></label> &nbsp; <label class="check"><input type="checkbox" id="aI" ${c.sources?.indiamart !== false ? "checked" : ""}> IndiaMART</label></div></div>
      <label class="check" style="margin-top:12px"><input type="checkbox" id="aAs" ${c.auto_assign !== false ? "checked" : ""}> Naye leads team mein apne aap baanto (least-loaded first, category match)</label>
      <label class="f">Cities (comma separated)</label><input class="input" id="aCity" value="${h((c.cities || []).join(", "))}">
      <label class="f">Search queries — ek line = <span class="mono">query with {city} | Category | Industry | product1; product2</span></label>
      <textarea class="input mono" id="aQ" style="min-height:200px">${h((c.queries || []).map((q) => [q.q, q.category, q.industry, (q.products || []).join("; ")].join(" | ")).join("\n"))}</textarea>
      ${ro ? "" : `<div class="row" style="margin-top:14px"><button class="btn primary" id="aSave">Save settings</button></div>`}
    </fieldset></div></div>
    <div class="stack">
      ${lq ? `<div class="card"><div class="card-h"><h3>✔ ${L("Lead quality check", "Lead quality check")}</h3></div><div class="card-b">
        <p class="mu" style="margin-top:0">${L("Auto-lead CRM mein tabhi aata hai jab: <b>phone + email + website + address</b> chaaron ho, <b>website khule</b>, <b>company ka naam website pe ho</b>, aur <b>email company ke domain ka ho ya website pe likha ho</b>. Kuch kam ho to system website (aur Contact page) se dhoondhta hai; phir bhi na mile to reject.", "An automatic lead enters the CRM only when it has <b>phone + email + website + address</b>, the <b>website opens</b>, the <b>company name is on the website</b> and the <b>email is on the company domain or written on the website</b>. Missing details are looked up on the website (and its Contact page); otherwise it is rejected.")}</p>
        <div class="lq"><div><b>${num(lq.added_7d)}</b><span>${L("poore leads add (7 din)", "complete leads added (7 days)")}</span></div><div><b>${num(lq.from_site_7d)}</b><span>${L("website se details mili", "completed from website")}</span></div>
          <div><b>${num(lq.rejected_7d)}</b><span>${L("adhure reject", "incomplete, rejected")}</span></div><div><b>${num(lq.waiting)}</b><span>${L("check ho rahe hain", "being checked")}</span></div></div>
        ${lq.recent_rejected?.length ? `<details style="margin-top:10px"><summary class="mu" style="cursor:pointer">${L("Haal ke reject (kyun)", "Recent rejections (why)")}</summary>
          <div style="margin-top:6px">${lq.recent_rejected.map((x) => `<div class="mu" style="font-size:12.5px;padding:4px 0;border-bottom:1px solid var(--line)"><b style="color:var(--tx)">${h(x.company)}</b>${x.city ? " · " + h(x.city) : ""} — ${h(x.reason || "")}</div>`).join("")}</div></details>` : ""}
      </div></div>` : ""}
      <div class="card"><div class="card-h"><h3>Abhi chalao</h3></div><div class="card-b"><p class="mu" style="margin-top:0">Schedule ka wait kiye bina abhi naye leads/RFQs lao.</p><button class="btn primary" data-act="runIngest">${ic("play")} Run now</button> <button class="btn" data-act="distribute">⚡ Pool distribute</button></div></div>
      <div class="card"><div class="card-h"><h3>Run history</h3><span class="sp"></span><button class="btn sm ghost" data-act="go" data-go="automation">${ic("refresh")}</button></div><div class="card-b" style="padding:4px 16px">
        ${(runs || []).map((r) => `<details style="padding:8px 0;border-bottom:1px solid var(--line)"><summary class="row" style="cursor:pointer;flex-wrap:nowrap"><span class="badge ${r.status === "ok" ? "good" : r.status === "running" ? "info" : "bad"}">${h(r.status)}</span><span style="flex:1">${h(dt(r.started_at))}</span><span class="mono">+${r.leads_added}L +${r.rfqs_added}R</span></summary><div class="mu" style="font-size:12px;margin-top:6px">${h(r.trigger)} · ${r.assigned} assigned</div><pre class="log">${h((r.log || []).join("\n"))}</pre></details>`).join("") || '<div class="empty">Abhi tak koi run nahi</div>'}
      </div></div>
    </div>
  </div>`;
  $$(".chip input", el).forEach((x) => x.onchange = () => x.parentElement.classList.toggle("on", x.checked));
  // ---- automations card
  autoCard(el);
  // ---- RFQ sources card
  wireEnquiryShare(el);
  const imShow = async () => {
    const { data: k } = await sb.rpc("integration_keys");
    const st = $("#imState", el); if (!st) return;
    st.innerHTML = k?.indiamart ? `<span class="badge good">✔ ${L("key saved", "key saved")} (…${h(k.indiamart_tail || "")})</span>` : `<span class="badge">${L("key nahi daali", "no key yet")}</span>`;
  };
  imShow();
  $("#imSave", el)?.addEventListener("click", (e) => busy(e.target, async () => {
    const v = $("#imKey", el).value.trim(); if (!v) return toast(L("Pehle key paste karo", "Paste the key first"), true);
    const { error } = await sb.rpc("set_integration_key", { p_name: "indiamart_crm_key", p_value: v }); if (error) throw error;
    $("#imKey", el).value = ""; toast(L("✔ IndiaMART key save — ab ⚡ Abhi check karo dabao", "✔ IndiaMART key saved — now press ⚡ Check now")); imShow();
  }));
  $("#imDel", el)?.addEventListener("click", (e) => busy(e.target, async () => {
    if (!(await confirmBox(L("IndiaMART key hata dein? Phir IndiaMART se RFQ aana band ho jayega.", "Remove the IndiaMART key? IndiaMART RFQs will stop.")))) return;
    const { error } = await sb.rpc("set_integration_key", { p_name: "indiamart_crm_key", p_value: "" }); if (error) throw error;
    toast(L("Key hata di", "Key removed")); imShow();
  }));
  $("#imTest", el)?.addEventListener("click", (e) => busy(e.target, async () => {
    const { data, error } = await sb.functions.invoke("auto-ingest", { body: { only: "indiamart" } }); if (error) throw error;
    toast((data?.log || []).join(" · ") || L("Ho gaya", "Done"), data?.status === "error");
    if (data?.rfqsAdded) softRefresh();
  }));
  $("#emUpd", el)?.addEventListener("click", () => gmailSetup(() => VIEWS.automation(el)));
  Promise.all([sb.rpc("mail_status"), sb.from("mail_enquiry_log").select("result").gte("at", new Date(Date.now() - 7 * 864e5).toISOString()).limit(2000)]).then(([{ data: ms }, { data: lg }]) => {
    const st = $("#emState", el); if (!st) return;
    const g = !ms?.connected ? `<span class="badge">Gmail: ${L("connect nahi", "not connected")}</span>`
      : (ms.script_v || 1) >= 3 ? `<span class="badge good">Gmail ✔</span>` : `<span class="badge warn">Gmail: ${L("purana code", "old code")}</span>`;
    const o = outlookReady() ? ` <span class="badge ${localStorage.getItem("crm_ol_" + S.me.id) ? "good" : ""}">Outlook${localStorage.getItem("crm_ol_" + S.me.id) ? " ✔" : ""}</span>` : "";
    const c = (k) => (lg || []).filter((x) => x.result === k).length;
    st.innerHTML = g + o + ((lg || []).length ? ` <span class="mu" style="font-size:12px">· ${L("7 din", "7 days")}: ${c("rfq")} RFQ, ${c("incomplete")} ${L("adhuri", "incomplete")}</span>` : "");
  }, () => {});

  $("#aSave", el)?.addEventListener("click", (e) => busy(e.target, async () => {
    const queries = $("#aQ", el).value.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
      const [q, category, industry, products] = l.split("|").map((x) => (x || "").trim());
      return { q: q.slice(0, 120), category: CATEGORIES.includes(category) ? category : "IT Hardware", industry: (industry || "Company").slice(0, 60), products: (products || "").split(";").map((x) => x.trim()).filter(Boolean).slice(0, 8) };
    }).filter((q) => q.q).slice(0, 60);
    const v = {
      ...c, enabled: $("#aEn", el).checked, days: $$("[data-day]", el).filter((x) => x.checked).map((x) => +x.dataset.day),
      max_new_leads_per_run: Math.min(300, Math.max(5, +$("#aMax", el).value || 60)), auto_assign: $("#aAs", el).checked,
      sources: { ...(c.sources || {}), osm: $("#aO", el).checked, google_places: $("#aG", el).checked, indiamart: $("#aI", el).checked },
      cities: $("#aCity", el).value.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 30), queries,
    };
    if (!v.days.length && v.enabled) return toast("Kam se kam ek din choose karo", true);
    const { error } = await sb.from("settings").update({ value: v, updated_by: S.me.id, updated_at: new Date().toISOString() }).eq("key", "ingest");
    if (error) throw error; toast("Automation settings saved ✔"); VIEWS.automation(el);
  }));
};
ACT.runIngest = (b) => busy(b, async () => {
  toast(L("Chal raha hai… 1-2 minute lag sakte hain", "Running… this can take 1–2 minutes"));
  const r = await callFn("auto-ingest", {});
  if (r.skipped) toast("Skip: " + r.skipped, true);
  else toast(`✔ +${r.leadsAdded} leads, +${r.rfqsAdded} RFQs, ${r.assigned} assigned`);
  if (S.route === "automation") VIEWS.automation($("#page"));
  refreshBadges();
});

// ---------------------------------------------------------------------
//  AUDIT LOG (admin)
// ---------------------------------------------------------------------
VIEWS.audit = async (el) => {
  const page = +(el.dataset.p || 0);
  const tbl = el.dataset.t || "";
  let q = sb.from("audit_log").select("*", { count: "exact" }).order("at", { ascending: false }).range(page * 100, page * 100 + 99);
  if (tbl) q = q.eq("table_name", tbl);
  const { data, count, error } = await q; if (error) throw error;
  const short = (c) => !c ? "" : Object.entries(c).slice(0, 4).map(([k, v]) => Array.isArray(v) && v.length === 2 ? `${k}: ${JSON.stringify(v[0])} → ${JSON.stringify(v[1])}` : k).join("; ");
  el.innerHTML = `<div class="toolbar"><div class="chips">${["", "leads", "rfqs", "profiles", "quotations", "settings"].map((t) => `<button class="chip ${tbl === t ? "on" : ""}" data-at="${t}">${t || "All"}</button>`).join("")}</div><span class="sp" style="flex:1"></span><span class="mu">${num(count)} entries · 180 din tak rakhe jaate hain</span></div>
  <div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Kab</th><th>Kisne</th><th>Action</th><th>Table</th><th>ID</th><th>Changes</th></tr></thead><tbody>
  ${data.map((a) => `<tr style="cursor:default"><td class="sub" style="white-space:nowrap">${h(dt(a.at))}</td><td>${a.actor ? h(userName(a.actor)) : '<span class="mu">System</span>'}</td><td><span class="badge ${a.action === "delete" ? "bad" : a.action === "insert" ? "good" : ""}">${h(a.action)}</span></td><td>${h(a.table_name)}</td><td class="mono">${h(a.row_id || "")}</td><td class="mono" style="max-width:420px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${h(JSON.stringify(a.changes || ""))}">${h(short(a.changes))}</td></tr>`).join("")}
  </tbody></table></div><div class="pager"><button class="btn sm" id="ap" ${page ? "" : "disabled"}>‹ Prev</button><span>Page ${page + 1}</span><button class="btn sm" id="an" ${(page + 1) * 100 < count ? "" : "disabled"}>Next ›</button></div></div>`;
  $$("[data-at]", el).forEach((b) => b.onclick = () => { el.dataset.t = b.dataset.at; el.dataset.p = 0; VIEWS.audit(el); });
  $("#ap", el).onclick = () => { el.dataset.p = page - 1; VIEWS.audit(el); };
  $("#an", el).onclick = () => { el.dataset.p = page + 1; VIEWS.audit(el); };
};

// ---------------------------------------------------------------------
//  PROFILE
// ---------------------------------------------------------------------
ACT.profile = () => {
  const m = modal({
    title: "Mera profile", body: `<div class="grid2"><div><label class="f">Naam (email signature mein jayega)</label><input class="input" id="pn" maxlength="80" value="${h(S.me.full_name)}"></div>
      <div><label class="f">Designation</label><input class="input" id="pd" maxlength="80" value="${h(S.me.designation || "")}" placeholder="e.g. Sales Executive"></div>
      <div><label class="f">Phone (signature)</label><input class="input" id="pph" maxlength="40" value="${h(S.me.phone || "")}" placeholder="+91 …"></div>
      <div><label class="f">Email kholne ke liye</label><select class="input" id="pmp">${[["gmail", "Gmail"], ["outlook", "Outlook (web)"], ["mailto", "Computer ka mail app"]].map(([k, l]) => `<option value="${k}" ${k === S.me.mail_provider ? "selected" : ""}>${l}</option>`).join("")}</select></div></div>
      <div><label class="f">Language / Bhasha</label><select class="input" id="plang"><option value="en" ${isEn() ? "selected" : ""}>English</option><option value="hinglish" ${isEn() ? "" : "selected"}>Hinglish</option></select></div>
      <p class="mu">${h(S.me.email)} · ${h(ROLE[S.me.role])} · Target ${S.me.daily_target}${L("/din", "/day")}</p>
      <div id="pPush" style="margin-top:14px"></div>
      <div class="sec-t" style="margin-top:18px">Password badlo</div>
      <input class="input" id="pp1" type="password" placeholder="Naya password (10+ chars)" autocomplete="new-password" style="margin-bottom:8px">
      <input class="input" id="pp2" type="password" placeholder="Confirm" autocomplete="new-password">`,
    foot: `<button class="btn" data-close>Close</button><button class="btn primary" id="ps">Save</button>`,
  });
  pushCard($("#pPush", m)).catch(() => {});
  $("#ps", m).onclick = (e) => busy(e.target, async () => {
    const n = $("#pn", m).value.trim(), p1 = $("#pp1", m).value, p2 = $("#pp2", m).value;
    const upd = { full_name: n || S.me.full_name, designation: $("#pd", m).value.trim() || null, phone: $("#pph", m).value.trim() || null, mail_provider: $("#pmp", m).value, lang: $("#plang", m).value };
    if (upd.lang !== getLang()) setLang(upd.lang);
    { const { error } = await sb.from("profiles").update(upd).eq("id", S.me.id); if (error) throw error; Object.assign(S.me, upd); }
    if (p1) {
      if (p1 !== p2) return toast("Password match nahi hua", true);
      if (!pwOk(p1)) return toast("10+ chars, letters + number", true);
      const { error } = await sb.auth.updateUser({ password: p1 }); if (error) throw error;
    }
    closeModal(); toast("Saved ✔"); await loadTeam(); renderShell(); route();
  });
};

// ---------------------------------------------------------------------
//  COMMAND PALETTE (Ctrl+K)
// ---------------------------------------------------------------------
ACT.palette = () => {
  const m = modal({ title: "Search", body: `<input class="input" id="pq" placeholder="Company, phone, RFQ… ya page ka naam" autocomplete="off"><div class="pal-list" id="pl"></div>` });
  m.classList.add("palette"); m.querySelector(".modal-h").hidden = true; m.querySelector(".modal-b").style.padding = "0";
  const inp = $("#pq", m), list = $("#pl", m); let items = [], sel = 0, t;
  const navItems = NAV.filter((n) => n.length >= 3 && typeof n[1] === "string" && (!n[3] || n[3]())).map((n) => ({ l: n[1], s: "Page", go: () => { location.hash = "#/" + n[0]; } }));
  const draw = () => { list.innerHTML = items.map((it, i) => `<div class="pal-item ${i === sel ? "on" : ""}" data-i="${i}">${h(it.l)}<small>${h(it.s)}</small></div>`).join("") || '<div class="empty">Kuch nahi mila</div>'; };
  const run = async () => {
    const s = inp.value.trim().replace(/[%,()*"\\]/g, " ");
    items = navItems.filter((n) => !s || n.l.toLowerCase().includes(s.toLowerCase()));
    if (s.length >= 2) {
      const d = s.replace(/\D/g, "");
      const [{ data: ls }, { data: rs }] = await Promise.all([
        sb.from("leads").select("id, company, city, status").or(`company.ilike.%${s}%,contact_name.ilike.%${s}%` + (d.length >= 4 ? `,phone_norm.like.%${d}%` : "")).limit(8),
        sb.from("rfqs").select("id, rfq_no, company").or(`company.ilike.%${s}%,rfq_no.ilike.%${s}%`).limit(4),
      ]);
      items = [...(ls || []).map((l) => ({ l: l.company, s: [l.city, STATUS[l.status]?.l].filter(Boolean).join(" · "), go: () => openLead(l.id) })), ...(rs || []).map((r) => ({ l: `${r.rfq_no} · ${r.company}`, s: "RFQ", go: () => ACT.rfq({ dataset: { id: r.id } }) })), ...items];
    }
    sel = 0; draw();
  };
  inp.oninput = () => { clearTimeout(t); t = setTimeout(run, 200); };
  inp.onkeydown = (e) => {
    if (e.key === "ArrowDown") { sel = Math.min(items.length - 1, sel + 1); draw(); e.preventDefault(); }
    if (e.key === "ArrowUp") { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); }
    if (e.key === "Enter" && items[sel]) { const it = items[sel]; closeModal(); it.go(); }
  };
  list.onclick = (e) => { const r = e.target.closest("[data-i]"); if (r) { const it = items[+r.dataset.i]; closeModal(); it.go(); } };
  run();
};

// ---------------------------------------------------------------------
//  Boot
// ---------------------------------------------------------------------
if (CONFIG.SUPABASE_URL.includes("YOUR-PROJECT")) {
  root.innerHTML = `<div class="auth-form" style="min-height:100vh"><div style="max-width:480px"><div class="logo">G</div><h1>${L("Setup baaki hai", "Setup needed")}</h1><p class="mu">${L('<span class="mono">config.js</span> mein apna Supabase URL aur anon key daalo. Steps <span class="mono">SETUP.md</span> mein hain.', 'Put your Supabase URL and anon key in <span class="mono">config.js</span>. The steps are in <span class="mono">SETUP.md</span>.')}</p></div></div>`;
} else {
  start();
}
