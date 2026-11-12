// =====================================================================
//  Genesis CRM — app shell, router and all screens
// =====================================================================
import {
  sb, S, STATUSES, STATUS, OPEN_STATUSES, CATEGORIES, RFQ_STATUSES, ROLES, ROLE, SOURCES, OUTCOMES, OUTCOME,
  isAdmin, isMgr, h, inr, inrShort, num, initials, ago, dt, dOnly, telHref, waHref, isMobile, statusBadge, rfqBadge,
  userName, online, followBadge, toLocalInput, ic, toast, fail, modal, closeModal, confirmBox, formData, busy,
  toCSV, download, parseCSV, callFn, loadTeam, assignable,
  HOOK, lockOf, canWork, lockBadge, claim, claimFailMsg, maskPhone, maskEmail,
} from "./core.js";
import {
  openComposer, ensureWork, viewInbox, viewTemplates, viewRequests, toggleNotifications, unreadCounts,
  requestAccess, startOutlookAutoSync, outlookForget, outlookConnect, outlookReady,
} from "./comms.js";
import { viewImport } from "./import.js";
import { startLoginFx, MODES as FX_MODES } from "./login-fx.js";
import {
  viewProducts, viewRenewals, viewOrders, viewSupport, viewDaily, viewDuplicates, leadPanel, loadProducts, productDatalist, findProduct,
  marginHtml, shareQuote, quoteTrackHtml, orderFromQuote,
} from "./biz.js";
import { CONFIG } from "./config.js";
import { SCRIPTS, SCRIPTS_EN, PRODUCTS } from "./data.js";
import { L, isEn, getLang, setLang, tr } from "./i18n.js";

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
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
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
const langSwitch = () => `<div class="langsw" role="group" aria-label="Language"><button type="button" class="${isEn() ? "" : "on"}" data-act="lang" data-v="hinglish">Hinglish</button><button type="button" class="${isEn() ? "on" : ""}" data-act="lang" data-v="en">English</button></div>`;
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
  sb.rpc("public_branding").then(({ data }) => {
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
function stopApp() {
  timers.forEach(clearInterval); timers = [];
  if (channel) { sb.removeChannel(channel); channel = null; }
  started = false; closeModal(); closeDrawer();
}

async function start() {
  fx?.stop(); fx = null;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return renderLogin();
  S.session = session;
  const { data: me, error } = await sb.from("profiles").select("id, email, full_name, role, active, daily_target, categories, phone, designation, signature, mail_provider, lang, last_seen")
    .eq("id", session.user.id).single();
  if (error || !me) return renderLogin("login", "Profile load nahi hua: " + (error?.message || ""));
  if (!me.active) return renderPending();
  S.me = me;
  // language: an explicit choice on this device wins (and is saved); otherwise follow the profile
  let chosen = null; try { chosen = localStorage.getItem("crm_lang"); } catch { /* ignore */ }
  if (chosen && chosen !== me.lang) { me.lang = getLang(); sb.from("profiles").update({ lang: me.lang }).eq("id", me.id).then(() => {}, () => {}); }
  else if (!chosen && me.lang && me.lang !== getLang()) setLang(me.lang);
  if (started) return;
  started = true;
  try { await loadTeam(); } catch (e) { fail(e); }
  const { data: st } = await sb.from("settings").select("key, value");
  S.settings = Object.fromEntries((st || []).map((r) => [r.key, r.value]));
  renderShell();
  route();
  loadAnnouncement();
  const beat = () => sb.rpc("heartbeat").then(() => {}, () => {});
  beat();
  timers.push(setInterval(() => !document.hidden && beat(), 60e3));
  timers.push(setInterval(() => !document.hidden && loadTeam().then(updateOnline).catch(() => {}), 120e3));
  timers.push(setInterval(() => !document.hidden && refreshBadges(), 90e3));
  subscribeRealtime();
  startOutlookAutoSync();
}
HOOK.openLead = (id, o) => openLead(id, o);
HOOK.softRefresh = () => softRefresh();
HOOK.refreshBadges = () => refreshBadges();
HOOK.openRfq = (r) => rfqForm(r);
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
  ["orders", "Orders & payments", "rupee"],
  ["renewals", "Renewals / AMC", "refresh"],
  ["support", "Support tickets", "tool"],
  ["products", "Products & prices", "tag"],
  ["templates", "Email / WA templates", "copy"],
  ["requests", "Lock requests", "shield"],
  ["Insights"],
  ["reports", "Reports", "chart"],
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

function renderShell() {
  root.innerHTML = `
  <div class="app">
    <aside class="side" id="side">
      <div class="brand"><div class="logo nlogo-s">${STAR}</div><div><b class="bword">GENESIS NOVA</b><small>by Genesis Infoserve</small></div></div>
      <nav class="nav" aria-label="Main">
        ${NAV.map((n) => {
          if (n.length <= 2 && typeof n[0] === "string" && !n[2]) return (n[1] && !n[1]()) ? "" : `<div class="nav-h">${h(n[0])}</div>`;
          if (n[3] && !n[3]()) return "";
          return `<a href="#/${n[0]}" data-r="${n[0]}">${ic(n[2])}<span>${h(n[1])}</span>${n[0] === "rfqs" ? '<span class="badge info" id="rfqBadge" hidden></span>' : ""}${n[0] === "today" ? '<span class="badge warn" id="dueBadge" hidden></span>' : ""}${n[0] === "inbox" ? '<span class="badge acc" id="inboxBadge" hidden></span>' : ""}${n[0] === "requests" ? '<span class="badge warn" id="reqBadge" hidden></span>' : ""}${n[0] === "support" ? '<span class="badge warn" id="tktBadge" hidden></span>' : ""}${n[0] === "renewals" ? '<span class="badge bad" id="renBadge" hidden></span>' : ""}</a>`;
        }).join("")}
      </nav>
      <div class="side-foot">
        <div class="me"><div class="avatar">${h(initials(S.me.full_name))}</div><div style="min-width:0;flex:1"><b>${h(S.me.full_name)}</b><small>${h(ROLE[S.me.role])}</small></div>
          <button class="btn ghost icon" data-act="profile" title="Profile" aria-label="Profile">${ic("users")}</button>
          <button class="btn ghost icon" data-act="logout" title="Logout" aria-label="Logout">${ic("logout")}</button></div>
      </div>
    </aside>
    <div class="main">
      <header class="top">
        <button class="btn ghost icon menu-btn" data-act="menu" aria-label="Menu">${ic("menu")}</button>
        <h1 id="title"></h1><div class="sp"></div>
        <button class="search-btn" data-act="palette">${ic("search")}<span>Search leads…</span><kbd>Ctrl K</kbd></button>
        <button class="btn ghost icon bell" id="bellBtn" data-act="bell" aria-label="Notifications">🔔<span class="badge bad" id="bellBadge" hidden></span></button>
        <button class="btn sm" id="installBtn" data-act="install" ${installEvt ? "" : "hidden"} title="${L("Phone / PC pe app install karo", "Install as an app on phone / PC")}">📲 ${L("App install", "Install app")}</button>
        ${langSwitch()}
        <button class="btn ghost icon" id="themeBtn" data-act="theme" aria-label="Toggle theme">${ic(isDark() ? "sun" : "moon")}</button>
      </header>
      <div id="banner"></div><div id="olBanner"></div>
      <main class="page" id="page" tabindex="-1"></main>
    </div>
  </div>`;
  refreshBadges();
}

function updateOnline() { if (S.route === "team" || S.route === "dashboard") softRefresh(); }

async function refreshBadges() {
  const end = new Date(); end.setHours(23, 59, 59, 999);
  if (!S.me) return;
  const in7 = new Date(Date.now() + 7 * 864e5).toLocaleDateString("en-CA");
  const [r, d, u, q, tk, rn] = await Promise.all([
    sb.from("rfqs").select("id", { count: "exact", head: true }).eq("status", "new"),
    sb.from("leads").select("id", { count: "exact", head: true }).eq("owner_id", S.me.id).lte("next_follow_up", end.toISOString()).in("status", OPEN_STATUSES),
    unreadCounts().catch(() => ({ notif: 0, replies: 0 })),
    sb.from("lock_requests").select("id", { count: "exact", head: true }).eq("holder", S.me.id).eq("status", "pending"),
    sb.from("tickets").select("id", { count: "exact", head: true }).eq("assignee_id", S.me.id).in("status", ["open", "in_progress"]),
    sb.from("renewals").select("id", { count: "exact", head: true }).eq("status", "active").lte("end_date", in7).or(`owner_id.eq.${S.me.id}${isMgr() ? ",owner_id.is.null" : ""}`),
  ]);
  const set = (id, n) => { const b = $(id); if (b) { b.hidden = !n; b.textContent = n > 99 ? "99+" : n || ""; } };
  set("#rfqBadge", r.count); set("#dueBadge", d.count); set("#inboxBadge", u.replies); set("#bellBadge", u.notif); set("#reqBadge", q.count); set("#tktBadge", tk.count); set("#renBadge", rn.count);
}

async function loadAnnouncement() {
  const { data } = await sb.from("announcements").select("body, created_at, created_by").order("created_at", { ascending: false }).limit(1);
  const a = data?.[0], el = $("#banner");
  if (!el) return;
  let dismissed = ""; try { dismissed = localStorage.getItem("crm_ann") || ""; } catch { /* ignore */ }
  if (!a || dismissed === a.created_at || Date.now() - new Date(a.created_at).getTime() > 3 * 864e5) { el.innerHTML = ""; return; }
  el.innerHTML = `<div class="banner">📢 <div><b>${h(a.created_by ? userName(a.created_by) : "System")}:</b> <span data-raw>${h(a.body)}</span></div><button class="btn ghost sm right" data-act="dismissAnn" data-v="${h(a.created_at)}">Dismiss</button></div>`;
}

// ---------------------------------------------------------------------
//  Router
// ---------------------------------------------------------------------
const VIEWS = {};
function route() {
  if (!S.me) return;
  const [r, ...rest] = (location.hash.replace(/^#\/?/, "") || "dashboard").split("/");
  S.route = VIEWS[r] ? r : "dashboard";
  S.params = { id: rest[0] };
  const navItem = NAV.find((n) => n[0] === S.route);
  if (navItem?.[3] && !navItem[3]()) { location.hash = "#/dashboard"; return; }
  $$(".nav a").forEach((a) => a.classList.toggle("on", a.dataset.r === S.route));
  $("#title").textContent = TITLES[S.route] || "";
  document.title = tr(TITLES[S.route] || APP) + " · " + APP;
  $("#side")?.classList.remove("open");
  const page = $("#page");
  page.innerHTML = `<div class="empty">Loading…</div>`;
  closeDrawer();
  page.onclick = null;
  refreshBadges();
  Promise.resolve(VIEWS[S.route](page, false, S.params)).then(() => {
    enterAnim(page);
    if (S.params.id && S.route === "leads") openLead(+S.params.id);
    if (S.params.id && S.route === "rfqs") ACT.rfq({ dataset: { id: S.params.id } });
    if (S.params.id && S.route === "quotes") ACT.quote({ dataset: { id: S.params.id } });
  }).catch(fail);
}
addEventListener("hashchange", route);
// cards fade up in sequence and whole-number KPIs count up — only when a page is opened
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
function enterAnim(page) {
  if (reduceMotion()) return;
  page.classList.remove("enter"); void page.offsetWidth; page.classList.add("enter");
  setTimeout(() => page.classList.remove("enter"), 900);
  $$(".kpi .v", page).forEach((v) => {
    const m = v.textContent.trim().match(/^(₹?)([\d,]+)$/); if (!m) return;
    const to = +m[2].replace(/,/g, ""); if (!to || to > 1e7) return;
    const t0 = performance.now(), fmt = (n) => m[1] + n.toLocaleString("en-IN");
    const step = (t) => { const p = Math.min(1, (t - t0) / 700), e = 1 - Math.pow(1 - p, 3); v.textContent = fmt(Math.round(to * e)); if (p < 1) requestAnimationFrame(step); };
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
function onLive(table, routes, p) {
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
    if (table === "leads" && ["leads", "today", "pipeline", "dashboard", "tasks"].includes(S.route)) softRefresh(450);
  }
  if (routes.includes(S.route)) softRefresh(450);
  refreshBadges();
}
function subscribeRealtime() {
  channel = sb.channel("crm")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "rfqs" }, (p) => {
      toast(`📨 Naya RFQ: ${p.new.company} — ${p.new.product || ""}`); refreshBadges();
      if (["rfqs", "dashboard"].includes(S.route)) softRefresh();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, (p) => {
      const d = document.querySelector(".drawer");
      // someone else took / released the lead that is open on my screen → refresh it
      if (p.eventType === "UPDATE" && d && +d.dataset.id === p.new.id && p.old && "owner_id" in p.old && p.old.owner_id !== p.new.owner_id
          && !document.activeElement?.matches(".drawer input, .drawer textarea") && !document.querySelector("[data-modal]")) {
        if (p.new.owner_id && p.new.owner_id !== S.me.id) toast(`🔒 ${userName(p.new.owner_id)} ne ye lead lock kar liya`);
        openLead(p.new.id, { queue: d.dataset.queue === "1" });
      }
      if (["leads", "today", "pipeline", "dashboard", "tasks"].includes(S.route)) softRefresh();
      refreshBadges();
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${S.me.id}` }, (p) => {
      toast(p.new.title + (p.new.body ? " — " + p.new.body : ""));
      refreshBadges();
      if (S.route === "requests" && p.new.kind === "lock_request") softRefresh();
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "email_messages", filter: `user_id=eq.${S.me.id}` }, () => {
      if (["inbox", "dashboard"].includes(S.route)) softRefresh();
      refreshBadges();
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "announcements" }, () => loadAnnouncement());
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
ACT.install = async (t) => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice.catch(() => {}); installEvt = null; t.hidden = true; };
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
ACT.dismissAnn = (t) => { try { localStorage.setItem("crm_ann", t.dataset.v); } catch { /* ignore */ } $("#banner").innerHTML = ""; };
ACT.lead = (t) => openLead(+t.dataset.id);
ACT.bell = (t) => toggleNotifications(t);
VIEWS.inbox = (el, soft, params) => viewInbox(el, params || { id: location.hash.split("/")[2] });
VIEWS.templates = (el) => viewTemplates(el);
VIEWS.import = (el) => viewImport(el);
VIEWS.requests = (el) => viewRequests(el);
VIEWS.products = (el) => viewProducts(el);
VIEWS.renewals = (el) => viewRenewals(el);
VIEWS.orders = (el) => viewOrders(el);
VIEWS.support = (el, soft, params) => viewSupport(el, soft, params);
VIEWS.daily = (el) => viewDaily(el);
VIEWS.duplicates = (el) => viewDuplicates(el);
ACT.go = (t) => { location.hash = "#/" + t.dataset.go; };

// ---------------------------------------------------------------------
//  Small chart helpers (single-series, hover tooltip)
// ---------------------------------------------------------------------
function barChart(data, { height = 180, fmt = num, label = "" } = {}) {
  if (!data.length) return `<div class="empty">Data nahi hai</div>`;
  const W = 640, H = height, pl = 34, pb = 22, pt = 8, max = Math.max(1, ...data.map((d) => d.v));
  const nice = (m) => { const p = Math.pow(10, Math.floor(Math.log10(m))); return Math.ceil(m / p) * p; };
  const top = nice(max), bw = (W - pl) / data.length, gap = Math.min(10, bw * 0.3);
  const y = (v) => pt + (H - pt - pb) * (1 - v / top);
  const ticks = [0, top / 2, top];
  const every = Math.ceil(data.length / 8);
  return `<div class="chart" role="img" aria-label="${h(label)}"><svg viewBox="0 0 ${W} ${H}">
    <g class="grid">${ticks.map((t) => `<line x1="${pl}" x2="${W}" y1="${y(t)}" y2="${y(t)}"/>`).join("")}</g>
    <g class="axis">${ticks.map((t) => `<text x="${pl - 6}" y="${y(t) + 4}" text-anchor="end">${h(fmt(t))}</text>`).join("")}
      ${data.map((d, i) => i % every === 0 ? `<text x="${pl + i * bw + bw / 2}" y="${H - 6}" text-anchor="middle">${h(d.l)}</text>` : "").join("")}</g>
    ${data.map((d, i) => {
      const x = pl + i * bw + gap / 2, w = bw - gap, yy = y(d.v), hh = Math.max(0, H - pb - yy), r = Math.min(4, w / 2, hh);
      const path = hh > 0 ? `M${x},${H - pb} V${yy + r} Q${x},${yy} ${x + r},${yy} H${x + w - r} Q${x + w},${yy} ${x + w},${yy + r} V${H - pb} Z` : "";
      return `<g><rect class="hit" x="${pl + i * bw}" y="${pt}" width="${bw}" height="${H - pt - pb}" data-tip="${h(d.t || d.l)}" data-tv="${h(fmt(d.v))}"/>${path ? `<path class="bar" d="${path}"/>` : ""}</g>`;
    }).join("")}
  </svg></div>`;
}
function hbars(rows, fmt = num) {
  const max = Math.max(1, ...rows.map((r) => r.v));
  return rows.map((r) => `<div class="hbar" title="${h(r.l)}: ${h(fmt(r.v))}"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h(r.l)}</span><span class="trk"><i style="width:${(r.v / max) * 100}%"></i></span><span class="n">${h(fmt(r.v))}</span></div>`).join("") || `<div class="mu">—</div>`;
}
document.addEventListener("mouseover", (e) => {
  const t = e.target.closest?.(".chart .hit"); const c = t?.closest(".chart");
  $$(".chart .tip").forEach((x) => x.remove());
  if (!t || !c) return;
  const r = t.getBoundingClientRect(), cr = c.getBoundingClientRect();
  const tip = document.createElement("div"); tip.className = "tip";
  tip.innerHTML = `<b>${h(t.dataset.tv)}</b>${h(t.dataset.tip)}`;
  tip.style.left = r.left - cr.left + r.width / 2 + "px"; tip.style.top = Math.max(0, r.top - cr.top + 30) + "px";
  c.append(tip);
});

// ---------------------------------------------------------------------
//  DASHBOARD
// ---------------------------------------------------------------------
VIEWS.dashboard = async (el) => {
  const [{ data: st }, { data: calls }, { data: fu }, { data: rf }] = await Promise.all([
    sb.rpc("dashboard_stats"),
    sb.rpc("calls_report", { days: 14 }),
    sb.from("leads").select("id, company, next_follow_up, status, owner_id").in("status", OPEN_STATUSES).not("next_follow_up", "is", null)
      .or(isMgr() ? "owner_id.not.is.null,owner_id.is.null" : `owner_id.eq.${S.me.id}`).order("next_follow_up").limit(8),
    sb.from("rfqs").select("id, rfq_no, company, product, status, due_date, created_at").order("created_at", { ascending: false }).limit(6),
  ]);
  const s = st || {}, target = S.me.daily_target || 40, mine = s.my_calls_today || 0;

  // calls per day (last 14 days)
  const days = [...Array(14)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - 13 + i); return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); });
  const perDay = days.map((d) => ({ l: new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }), t: new Date(d).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" }) + " — calls", v: (calls || []).filter((c) => c.day === d && (isMgr() || c.user_id === S.me.id)).reduce((a, c) => a + Number(c.calls), 0) }));
  const today = days[13];
  const lb = isMgr() ? S.team.filter((u) => u.active && u.role !== "admin").map((u) => ({ u, c: (calls || []).filter((c) => c.day === today && c.user_id === u.id).reduce((a, c) => a + Number(c.calls), 0) })).sort((a, b) => b.c - a.c) : [];
  const bs = s.by_status || {};

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
  <div class="cols">
    <div class="stack">
      <div class="card"><div class="card-h"><h3>${isMgr() ? "Team calls" : "Meri calls"} — last 14 din</h3></div><div class="card-b">${barChart(perDay, { label: "Calls per day" })}</div></div>
      <div class="card"><div class="card-h"><h3>Lead status</h3><span class="sp"></span><a href="#/pipeline" class="mu">Pipeline →</a></div><div class="card-b">${hbars(STATUSES.map(([k, l]) => ({ l, v: bs[k] || 0 })))}</div></div>
    </div>
    <div class="stack">
      ${isMgr() ? `<div class="card"><div class="card-h"><h3>🏆 Aaj ka leaderboard</h3></div><div class="card-b" style="padding-top:6px">
        ${lb.map(({ u, c }) => `<div class="row" style="padding:7px 0;border-bottom:1px solid var(--line);flex-wrap:nowrap"><span class="dot ${online(u) ? "on" : ""}"></span><b style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h(u.full_name)}</b><span class="meter" style="width:80px;margin:0"><i style="width:${Math.min(100, (c / Math.max(1, u.daily_target)) * 100)}%"></i></span><span class="mono" style="width:52px;text-align:right">${c}/${u.daily_target}</span></div>`).join("") || '<div class="mu">Abhi koi employee nahi</div>'}
      </div></div>` : ""}
      <div class="card"><div class="card-h"><h3>Aane wale follow-ups</h3></div><div class="card-b" style="padding:4px 16px">
        ${(fu || []).map((l) => `<div class="row" style="padding:9px 0;border-bottom:1px solid var(--line);cursor:pointer;flex-wrap:nowrap" data-act="lead" data-id="${l.id}"><b style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h(l.company)}</b>${followBadge(l.next_follow_up)}</div>`).join("") || '<div class="empty" style="padding:20px">Koi follow-up pending nahi 🎉</div>'}
      </div></div>
      <div class="card"><div class="card-h"><h3>Latest RFQs</h3><span class="sp"></span><a href="#/rfqs" class="mu">Sab →</a></div><div class="card-b" style="padding:4px 16px">
        ${(rf || []).map((r) => `<div style="padding:9px 0;border-bottom:1px solid var(--line);cursor:pointer" data-act="rfq" data-id="${r.id}"><div class="row" style="flex-wrap:nowrap"><b style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h(r.company)}</b>${rfqBadge(r.status)}</div><div class="mu" style="font-size:12.5px">${h(r.product || "")} · ${h(ago(r.created_at))}</div></div>`).join("") || '<div class="empty" style="padding:20px">Abhi koi RFQ nahi</div>'}
      </div></div>
    </div>
  </div>`;
};
ACT.announce = () => {
  const m = modal({ title: "📢 Sab ko announcement", body: `<label class="f">Message (500 chars)</label><textarea class="input" id="annT" maxlength="500"></textarea>`, foot: `<button class="btn" data-close>Cancel</button><button class="btn primary" id="annS">Send</button>` });
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
  <div class="queue">${(fresh || []).map(card).join("") || `<div class="card empty"><b>Aapke naam koi fresh lead nahi</b>Neeche free pool se lo — ya "Next lead" dabao, system apne aap agla free lead lock kar dega.</div>`}</div>
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

async function openLead(id, opt = {}) {
  const [{ data: l, error }, { data: acts }, { data: tasks }] = await Promise.all([
    sb.from("leads").select("*").eq("id", id).single(),
    sb.from("activities").select("*").eq("lead_id", id).order("created_at", { ascending: false }).limit(100),
    sb.from("tasks").select("*").eq("lead_id", id).eq("done", false).order("due_at"),
  ]);
  if (error) return fail(error);
  closeDrawer();
  const SC = isEn() ? SCRIPTS_EN : SCRIPTS, sc = SC[l.category] || SC["IT Hardware"];
  const name = S.me.full_name.split(" ")[0];
  const lk = lockOf(l), canEdit = canWork(l), see = canEdit;     // only the holder (or a manager) sees full contact
  const { data: mails } = await sb.from("email_messages").select("id, direction, counterpart, subject, snippet, intent, created_at, user_id").eq("lead_id", id).order("created_at", { ascending: false }).limit(20);
  const scrim = document.createElement("div"); scrim.className = "scrim"; scrim.onclick = closeDrawer;
  const d = document.createElement("aside"); d.className = "drawer"; d.setAttribute("role", "dialog"); d.setAttribute("aria-label", l.company);
  d.dataset.id = l.id; d.dataset.queue = opt.queue ? "1" : "";
  const actIc = { call: "📞", note: "📝", email: "✉️", whatsapp: "💬", meeting: "🤝", status: "🔁", assign: "👤", system: "⚙️" };
  d.innerHTML = `
    <div class="drawer-h">
      <div class="row" style="flex-wrap:nowrap;align-items:flex-start"><div style="min-width:0;flex:1"><h2>${h(l.company)}</h2>
        <div class="mu" style="font-size:13px">${h([l.contact_name, l.designation].filter(Boolean).join(" · "))}${l.contact_name ? " · " : ""}${h([l.area, l.city].filter(Boolean).join(", "))}</div></div>
        <button class="btn ghost icon" data-dclose aria-label="Close">${ic("x")}</button></div>
      <div class="row" style="margin-top:8px">${statusBadge(l.status)}<span class="badge">${h(l.category)}</span><span class="badge ${l.score >= 70 ? "good" : ""}">Score ${l.score}</span><span class="badge">${h(SOURCES[l.source] || l.source)}</span>${followBadge(l.next_follow_up)}</div>
      ${lk.mine ? `<div class="lockbar mine">🔒 <div><b>Aap is lead pe kaam kar rahe ho</b><small>Lock ${lk.until && new Date(lk.until).getFullYear() > 9000 ? "permanent (won)" : "till " + h(dt(lk.until))} · har call / email pe apne aap badhta hai</small></div><button class="btn sm" data-lk="release">🔓 Release</button></div>`
      : lk.other ? `<div class="lockbar other">🔒 <div><b>${h(lk.holder)} is lead pe kaam kar raha/rahi hai</b><small>${L(`Locked ${h(ago(l.locked_at))} · till ${h(dt(lk.until))}. Aap dekh sakte ho, par call / email / edit sirf ${h(lk.holder)} karega.`, `Locked ${h(ago(l.locked_at))} · until ${h(dt(lk.until))}. You can view it, but only ${h(lk.holder)} can call / email / edit.`)}</small></div>
          ${isMgr() ? `<button class="btn sm" data-lk="force">Force release</button>` : `<button class="btn sm primary" data-lk="request">🙋 Request access</button>`}</div>`
      : `<div class="lockbar free">🔓 <div><b>Free lead</b><small>Jo pehle lock karega, wahi kaam karega. Lock karte hi number dikhega.</small></div><button class="btn sm primary" data-lk="claim">🔒 Lock karke shuru karo</button></div>`}
      <div class="contact">
        ${l.phone ? (see ? `<a class="btn primary" href="${h(telHref(l.phone))}">${ic("phone")} ${h(l.phone)}</a><button class="btn icon" data-copy="${h(l.phone)}" title="Copy" aria-label="Copy number">${ic("copy")}</button>`
          : lk.free ? `<button class="btn primary" data-lk="claimcall">${ic("phone")} Lock & call</button>` : `<span class="btn" aria-disabled="true">${ic("phone")} ${h(maskPhone(l.phone))}</span>`) : ""}
        ${see || lk.free ? `<button class="btn" data-comp="email">${ic("mail")} Email</button><button class="btn" data-comp="whatsapp">${ic("wa")} WhatsApp</button>` : ""}
        ${see ? (l.alt_phones || []).map((p) => `<a class="btn sm" href="${h(telHref(p))}">${h(p)}</a>`).join("") : ""}
      </div>
    </div>
    <div class="drawer-b">
      ${canEdit ? `<div class="card" style="padding:14px">
        <div class="sec-t" style="margin:0 0 8px">Call ka result</div>
        <textarea class="input" id="callNote" placeholder="Short note (optional) — kisse baat hui, kya bola…" maxlength="1000" style="min-height:56px;margin-bottom:8px"></textarea>
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

      <div class="card sec"><div class="card-h"><h3>Activity</h3></div><div class="card-b" style="padding:4px 16px">
        <ul class="timeline">${(acts || []).map((a) => `<li><span class="ic">${actIc[a.kind] || "•"}</span><div><div>${a.outcome ? `<b>${h(OUTCOME[a.outcome]?.[1] || a.outcome)}</b> ` : ""}${h(a.body || (a.kind === "call" ? "" : a.kind))}</div><div class="t">${h(userName(a.user_id))} · ${h(dt(a.created_at))}</div></div></li>`).join("") || '<li><span></span><span class="mu">Abhi koi activity nahi</span></li>'}</ul>
      </div></div>
    </div>`;
  document.body.append(scrim, d);
  const reopen = () => openLead(id, opt);
  leadPanel($("#lpanel", d), l, reopen).catch(() => {});
  const after = () => { softRefresh(); refreshBadges(); };
  d.querySelector("[data-dclose]").onclick = closeDrawer;
  $$("[data-mail]", d).forEach((x) => x.onclick = () => { closeDrawer(); location.hash = "#/inbox/" + x.dataset.mail; });
  $$("[data-comp]", d).forEach((b) => b.onclick = async () => {
    if (!(await ensureWork("lead", l))) return;
    openComposer({ channel: b.dataset.comp, lead: l, onSent: reopen });
  });
  $$("[data-lk]", d).forEach((b) => b.onclick = () => busy(b, async () => {
    const a = b.dataset.lk;
    if (a === "claim" || a === "claimcall") {
      const r = await claim("lead", id);
      if (!r.ok) { toast(claimFailMsg(r), true); return reopen(); }
      toast("🔒 Lead aapke naam lock ho gaya"); after();
      if (a === "claimcall" && l.phone) location.href = telHref(l.phone);
      return reopen();
    }
    if (a === "release" || a === "force") {
      if (!(await confirmBox(a === "force" ? `${lk.holder} ka lock hatana hai? Unhe notification jayega.` : "Lead release karna hai? Phir koi bhi isko le sakta hai.", "Release"))) return;
      const { data, error: e1 } = await sb.rpc("release", { p_entity: "lead", p_id: id });
      if (e1) throw e1;
      toast(data?.ok ? "🔓 Lead release ho gaya — ab pool mein hai" : "Release nahi hua", !data?.ok); after();
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
    if (!(await confirmBox(`"${l.company}" ko permanently delete karna hai?`, "Delete"))) return;
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
  const prods = Object.entries(PRODUCTS).flatMap(([g, list]) => list.map((p) => p.n));
  const m = modal({
    title: isNew ? "Naya lead" : "Edit lead", wide: true,
    body: `<form id="lf"><div class="grid2">
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
    <label class="f">Products interest</label><div class="chips">${prods.map((p) => `<label class="chip ${(l.products || []).includes(p) ? "on" : ""}"><input type="checkbox" class="sr" name="products" data-multi="1" value="${h(p)}" ${(l.products || []).includes(p) ? "checked" : ""}>${h(p)}</label>`).join("")}</div>
    <label class="f">Notes</label><textarea class="input" name="notes" maxlength="5000">${h(l.notes || "")}</textarea></form>`,
    foot: `<button class="btn" data-close>Cancel</button><button class="btn primary" id="lsave">Save</button>`,
  });
  $$(".chip input", m).forEach((c) => c.onchange = () => c.parentElement.classList.toggle("on", c.checked));
  m.querySelector("#lsave").onclick = (e) => busy(e.target, async () => {
    const f = formData($("#lf", m));
    if (!f.company) return toast("Company naam zaroori hai", true);
    f.products = f.products || [];
    if (f.gstin) f.gstin = f.gstin.toUpperCase().replace(/\s/g, "");
    f.tags = f.tags ? f.tags.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 10) : [];
    f.deal_value = f.deal_value ? Number(f.deal_value) : null;
    let res;
    if (isNew) res = await sb.from("leads").insert({ ...f, source: "manual", owner_id: S.me.id, created_by: S.me.id }).select("id").single();
    else res = await sb.from("leads").update(f).eq("id", l.id).select("id").single();
    if (res.error) throw res.error;
    closeModal(); toast(isNew ? "Lead add ho gaya ✔" : "Saved ✔"); softRefresh();
    if (isNew) openLead(res.data.id); else done?.();
  });
}

// ---------------------------------------------------------------------
//  LEADS table
// ---------------------------------------------------------------------
const LF = { q: "", status: "", category: "", owner: "", source: "", page: 0, sort: "created_at", asc: false, sel: new Set() };
const PAGE = 50;
function leadQuery(sel, count) {
  let q = sb.from("leads").select(sel, count ? { count: "exact" } : undefined);
  const s = LF.q.replace(/[%,()*"\\]/g, " ").trim();
  if (s) {
    const d = s.replace(/\D/g, "");
    q = q.or([`company.ilike.%${s}%`, `contact_name.ilike.%${s}%`, `city.ilike.%${s}%`, `area.ilike.%${s}%`, `email.ilike.%${s}%`, ...(d.length >= 4 ? [`phone_norm.like.%${d}%`] : [])].join(","));
  }
  if (LF.status === "open") q = q.in("status", OPEN_STATUSES); else if (LF.status) q = q.eq("status", LF.status);
  if (LF.category) q = q.eq("category", LF.category);
  if (LF.source) q = q.eq("source", LF.source);
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
      <select class="input" id="lst" aria-label="Status"><option value="">All status</option><option value="open" ${LF.status === "open" ? "selected" : ""}>Open (active)</option>${STATUSES.map(([k, l]) => `<option value="${k}" ${LF.status === k ? "selected" : ""}>${l}</option>`).join("")}</select>
      <select class="input" id="lcat" aria-label="Category"><option value="">All categories</option>${CATEGORIES.map((c) => `<option ${LF.category === c ? "selected" : ""}>${c}</option>`).join("")}</select>
      <select class="input" id="lsrc" aria-label="Source"><option value="">All sources</option>${Object.entries(SOURCES).map(([k, v]) => `<option value="${k}" ${LF.source === k ? "selected" : ""}>${v}</option>`).join("")}</select>
      <select class="input" id="lown" aria-label="Lock"><option value="">Sab leads</option><option value="me" ${LF.owner === "me" ? "selected" : ""}>🔒 Mere (locked by me)</option><option value="none" ${LF.owner === "none" ? "selected" : ""}>🔓 Free pool</option><option value="others" ${LF.owner === "others" ? "selected" : ""}>🔒 Doosron ke paas</option>${isMgr() ? assignable().map((u) => `<option value="${u.id}" ${LF.owner === u.id ? "selected" : ""}>👤 ${h(u.full_name)}</option>`).join("") : ""}</select>
      ${isMgr() ? `<button class="btn" data-act="exportLeads">${ic("download")} Export</button>` : ""}
      <button class="btn" data-act="importLeads">${ic("upload")} Import</button>
      <button class="btn primary" data-act="newLead">${ic("plus")} Lead</button>
    </div>
    <div class="card"><div class="tbl-wrap" id="ltb"></div><div class="pager" id="lpg"></div></div>
    <div id="lbulk"></div>`;
    let t;
    $("#lq", el).oninput = (e) => { clearTimeout(t); t = setTimeout(() => { LF.q = e.target.value; LF.page = 0; drawLeads(el); }, 300); };
    [["#lst", "status"], ["#lcat", "category"], ["#lsrc", "source"], ["#lown", "owner"]].forEach(([s, k]) => { const x = $(s, el); if (x) x.onchange = () => { LF[k] = x.value; LF.page = 0; LF.sel.clear(); drawLeads(el); }; });
  }
  await drawLeads(el);
};
async function drawLeads(el) {
  const { data, count, error } = await leadQuery("id, company, contact_name, phone, email, city, area, category, status, score, owner_id, lock_until, next_follow_up, last_contacted, deal_value, source, created_at, email_count, reply_count", true)
    .order(LF.sort, { ascending: LF.asc, nullsFirst: false }).order("id", { ascending: false }).range(LF.page * PAGE, LF.page * PAGE + PAGE - 1);
  if (error) return fail(error);
  const th = (k, l, cls = "") => `<th class="${cls}" data-sort="${k}" aria-sort="${LF.sort === k ? (LF.asc ? "ascending" : "descending") : "none"}">${l}${LF.sort === k ? (LF.asc ? " ↑" : " ↓") : ""}</th>`;
  $("#ltb", el).innerHTML = !data.length ? `<div class="empty"><b>Koi lead nahi mila</b>Filters badal ke dekho</div>` : `
    <table class="tbl"><thead><tr><th style="width:34px"><input type="checkbox" id="lall" aria-label="Select all"></th>
      ${th("company", "Company")}<th>Phone</th>${th("city", "City")}${th("status", "Status")}${th("score", "Score", "num")}<th>Lock</th>${th("next_follow_up", "Follow-up")}${th("deal_value", "Value", "num")}${th("created_at", "Added")}</tr></thead>
    <tbody>${data.map((l) => `<tr data-act="lead" data-id="${l.id}">
      <td data-nolink><input type="checkbox" data-sel="${l.id}" ${LF.sel.has(l.id) ? "checked" : ""} aria-label="Select"></td>
      <td><div class="co">${h(l.company)}${l.reply_count ? ' <span title="Reply aaya">📩</span>' : l.email_count ? ' <span title="Email bheja">📤</span>' : ""}</div><div class="sub">${h(l.contact_name || l.category)}</div></td>
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
VIEWS.pipeline = async (el) => {
  const mineOnly = el.dataset.mine === "1" || !isMgr();
  let q = sb.from("leads").select("id, company, city, deal_value, status, owner_id, lock_until, next_follow_up, score").in("status", PCOLS).order("score", { ascending: false }).limit(700);
  if (mineOnly) q = q.eq("owner_id", S.me.id);
  const { data, error } = await q; if (error) throw error;
  const by = Object.fromEntries(PCOLS.map((k) => [k, []])); data.forEach((l) => by[l.status]?.push(l));
  el.innerHTML = `
    <div class="toolbar">${isMgr() ? `<div class="chips"><button class="chip ${mineOnly ? "" : "on"}" data-pm="0">Team</button><button class="chip ${mineOnly ? "on" : ""}" data-pm="1">Mine</button></div>` : ""}
      <span class="mu">Card ko drag karke status badlo · har column max 100 dikhte hain</span></div>
    <div class="board">${PCOLS.map((k) => `<div class="col" data-col="${k}">
      <div class="col-h">${statusBadge(k)} <span>${by[k].length}</span><small>${inrShort(by[k].reduce((a, l) => a + Number(l.deal_value || 0), 0))}</small></div>
      ${by[k].slice(0, 100).map((l) => `<div class="card kc" draggable="${canWork(l)}" data-id="${l.id}" data-act="lead"><b>${h(l.company)}</b><div class="sub">${h(l.city || "")}${l.deal_value ? " · " + inrShort(l.deal_value) : ""}</div><div class="row" style="margin-top:6px;gap:6px">${followBadge(l.next_follow_up)}${isMgr() ? `<span class="sub">${h(userName(l.owner_id))}</span>` : ""}</div></div>`).join("")}
    </div>`).join("")}</div>`;
  $$("[data-pm]", el).forEach((b) => b.onclick = () => { el.dataset.mine = b.dataset.pm; VIEWS.pipeline(el); });
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
      const { data: upd, error: e1 } = await sb.from("leads").update({ status: st }).eq("id", dragId).select("id");
      if (e1) return fail(e1);
      if (!upd?.length) { toast("Lock badal gaya — status update nahi hua", true); return VIEWS.pipeline(el); }
      sb.from("activities").insert({ lead_id: dragId, kind: "status", body: `Status → ${STATUS[st].l}` }).then(() => {});
      toast(`${l.company} → ${STATUS[st].l}`); VIEWS.pipeline(el);
    });
  });
};

// ---------------------------------------------------------------------
//  RFQs
// ---------------------------------------------------------------------
const RF = { st: "open", q: "" };
VIEWS.rfqs = async (el) => {
  let q = sb.from("rfqs").select("*").order("created_at", { ascending: false }).limit(300);
  if (RF.st === "open") q = q.in("status", ["new", "in_progress", "quoted", "negotiating"]); else if (RF.st !== "all") q = q.eq("status", RF.st);
  const s = RF.q.replace(/[%,()*"\\]/g, " ").trim();
  if (s) q = q.or(`company.ilike.%${s}%,product.ilike.%${s}%,rfq_no.ilike.%${s}%,city.ilike.%${s}%`);
  const { data, error } = await q; if (error) throw error;
  const today = new Date(new Date().toDateString());
  el.innerHTML = `
    <div class="toolbar"><div class="chips">${[["open", "Open"], ...RFQ_STATUSES.map(([k, l]) => [k, l]), ["all", "All"]].map(([k, l]) => `<button class="chip ${RF.st === k ? "on" : ""}" data-rs="${k}">${l}</button>`).join("")}</div>
      <input class="input grow" id="rq" placeholder="Search RFQ…" value="${h(RF.q)}" aria-label="Search RFQs">
      <button class="btn" data-act="rfqHook">🔗 Website form</button>
      <button class="btn primary" data-act="newRfq">${ic("plus")} RFQ</button></div>
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
  let t; $("#rq", el).oninput = (e) => { clearTimeout(t); t = setTimeout(() => { RF.q = e.target.value; VIEWS.rfqs(el).then(() => { const i = $("#rq", el); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 350); };
};
ACT.newRfq = () => rfqForm({});
ACT.rfq = async (t) => {
  const { data, error } = await sb.from("rfqs").select("*").eq("id", +t.dataset.id).single();
  if (error) return fail(error); rfqForm(data);
};
ACT.rfqHook = () => {
  const url = CONFIG.SUPABASE_URL + "/functions/v1/inbound-rfq";
  modal({ title: "Website / Google Form se RFQ", wide: true, body: `
    <p>Apni website ke enquiry form ko is URL pe <b>POST</b> karo. RFQ + lead apne aap ban jayega aur sabko live notification jayega.</p>
    <div class="script mono" style="word-break:break-all">${h(url)}</div>
    <p class="mu">Fields: <span class="mono">company*, product*, contact, phone, email, city, qty, details, due_date</span>. Bot se bachne ke liye ek hidden field <span class="mono">website_url</span> khaali rakho. Website ka domain <span class="mono">ALLOWED_ORIGINS</span> secret mein hona chahiye; server-to-server (Zapier / Apps Script) ke liye header <span class="mono">x-webhook-secret</span> bhejo.</p>
    <pre class="log">&lt;form method="post" action="${h(url)}"&gt;
  &lt;input name="company" required&gt; &lt;input name="contact"&gt; &lt;input name="phone"&gt;
  &lt;input name="email" type="email"&gt; &lt;input name="product" required&gt; &lt;input name="qty"&gt;
  &lt;textarea name="details"&gt;&lt;/textarea&gt;
  &lt;input name="website_url" style="display:none" tabindex="-1" autocomplete="off"&gt;
  &lt;button&gt;Send enquiry&lt;/button&gt;
&lt;/form&gt;</pre>` });
};
function rfqForm(r) {
  const isNew = !r.id;
  const lk = lockOf(r), work = isNew || canWork(r);
  const m = modal({
    title: isNew ? "Naya RFQ" : `${r.rfq_no} · ${r.company}`, wide: true,
    body: `${isNew ? "" : lk.mine ? `<div class="lockbar mine" style="margin-top:12px">🔒 <div><b>Ye RFQ aapke paas hai</b><small>Lock till ${h(dt(lk.until))}</small></div><button type="button" class="btn sm" id="rfRel">🔓 Release</button></div>`
      : lk.other ? `<div class="lockbar other" style="margin-top:12px">🔒 <div><b>${h(lk.holder)} is RFQ pe kaam kar raha/rahi hai</b><small>${L(`Aap dekh sakte ho, edit / quote / email sirf ${h(lk.holder)} karega.`, `You can view it, but only ${h(lk.holder)} can edit / quote / email.`)}</small></div>${isMgr() ? `<button type="button" class="btn sm" id="rfRel">Force release</button>` : `<button type="button" class="btn sm primary" id="rfReq">🙋 Request access</button>`}</div>`
      : `<div class="lockbar free" style="margin-top:12px">🔓 <div><b>Free RFQ</b><small>Lock karo — phir sirf aap is pe kaam karoge.</small></div><button type="button" class="btn sm primary" id="rfClaim">🔒 Lock karo</button></div>`}
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
    ${r.source && r.source !== "manual" ? `<p class="mu">Source: ${h(SOURCES[r.source] || r.source)} ${r.source_ref ? "· " + h(r.source_ref) : ""}</p>` : ""}</form>`,
    foot: `${r.lead_id ? `<button class="btn" id="rfLead">Lead kholo</button>` : ""}${!isNew && (work || lk.free) ? `<button class="btn" id="rfMail">${ic("mail")} Email</button><button class="btn" id="rfWa">${ic("wa")} WhatsApp</button><button class="btn" id="rfQ">${ic("file")} Quotation</button>` : ""}<span class="sp" style="flex:1"></span><button class="btn" data-close>Cancel</button>${work ? `<button class="btn primary" id="rfS">Save</button>` : ""}`,
  });
  const reload = async () => { const { data } = await sb.from("rfqs").select("*").eq("id", r.id).single(); if (data) rfqForm(data); };
  $("#rfClaim", m)?.addEventListener("click", (e) => busy(e.target, async () => {
    const x = await claim("rfq", r.id); if (!x.ok) toast(claimFailMsg(x), true); else toast("🔒 RFQ aapke naam lock"); refreshBadges(); reload(); if (S.route === "rfqs") softRefresh();
  }));
  $("#rfRel", m)?.addEventListener("click", (e) => busy(e.target, async () => {
    if (!(await confirmBox(lk.mine ? "RFQ release karna hai?" : `${lk.holder} ka lock hatana hai?`, "Release"))) return;
    const { error } = await sb.rpc("release", { p_entity: "rfq", p_id: r.id }); if (error) throw error;
    toast("🔓 Released"); reload(); if (S.route === "rfqs") softRefresh();
  }));
  $("#rfReq", m)?.addEventListener("click", () => requestAccess("rfq", r));
  const outreach = async (channel) => { if (!(await ensureWork("rfq", r))) return; openComposer({ channel, rfq: r, onSent: () => S.route === "rfqs" && softRefresh() }); };
  $("#rfMail", m)?.addEventListener("click", () => outreach("email"));
  $("#rfWa", m)?.addEventListener("click", () => outreach("whatsapp"));
  $("#rfLead", m)?.addEventListener("click", () => { closeModal(); openLead(r.lead_id); });
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
function qCalc(q) {
  const co = S.settings.company || {}; let sub = 0; const base = {};
  (q.items || []).forEach((it) => { const t = r2((+it.qty || 0) * (+it.price || 0)); sub += t; base[+it.tax || 0] = (base[+it.tax || 0] || 0) + t; });
  const a = String(co.state || "").trim().toLowerCase(), b = String(q.to_party?.state || "").trim().toLowerCase();
  const inter = !!(a && b && a !== b); const lines = []; let tax = 0;
  Object.keys(base).map(Number).sort((x, y) => x - y).forEach((rt) => {
    if (!rt) return; const t = r2(base[rt] * rt / 100); tax += t;
    if (inter) lines.push([`IGST ${rt}%`, t]); else { const c = r2(t / 2); lines.push([`CGST ${rt / 2}%`, c], [`SGST ${rt / 2}%`, r2(t - c)]); }
  });
  return { sub: r2(sub), tax: r2(tax), grand: r2(sub + tax), lines, inter };
}
const W1 = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"], W2 = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const w2 = (n) => n < 20 ? W1[n] : W2[Math.floor(n / 10)] + (n % 10 ? " " + W1[n % 10] : "");
const w3 = (n) => (n >= 100 ? W1[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " : "") : "") + (n % 100 ? w2(n % 100) : "");
function wInt(n) { if (!n) return "Zero"; const p = [], cr = Math.floor(n / 1e7); n %= 1e7; const la = Math.floor(n / 1e5); n %= 1e5; const th = Math.floor(n / 1e3); n %= 1e3; if (cr) p.push(wInt(cr) + " Crore"); if (la) p.push(w2(la) + " Lakh"); if (th) p.push(w2(th) + " Thousand"); if (n) p.push(w3(n)); return p.join(" "); }
const rupeesWords = (v) => { v = r2(v); const r = Math.floor(v), ps = Math.round((v - r) * 100); return wInt(r) + " Rupees" + (ps ? " and " + w2(ps) + " Paise" : "") + " Only"; };

VIEWS.quotes = async (el) => {
  const { data, error } = await sb.from("quotations").select("id, quote_no, to_party, status, grand_total, created_at, owner_id, lead_id, view_count, customer_response").order("created_at", { ascending: false }).limit(200);
  if (error) throw error;
  el.innerHTML = `<div class="toolbar"><span class="mu">GST quotations — CGST/SGST ya IGST state ke hisaab se apne aap.</span><span class="sp" style="flex:1"></span><button class="btn primary" data-act="newQuote">${ic("plus")} Quotation</button></div>
  <div class="card"><div class="tbl-wrap">${!data.length ? `<div class="empty"><b>Abhi koi quotation nahi</b>Lead ya RFQ se “Quotation banao” dabao.</div>` : `<table class="tbl"><thead><tr><th>No.</th><th>Customer</th><th>Status</th><th class="num">Total</th><th>Owner</th><th>Date</th><th></th></tr></thead><tbody>
  ${data.map((q) => `<tr data-act="quote" data-id="${q.id}"><td class="mono">${h(q.quote_no)}</td><td class="co">${h(q.to_party?.name || "")}</td><td><span class="badge ${q.status === "won" ? "good" : q.status === "lost" ? "bad" : q.status === "sent" ? "info" : ""}">${h(q.status)}</span>${q.customer_response === "accepted" ? ' <span class="badge good" title="Customer accepted online">✅</span>' : q.customer_response === "changes" ? ' <span class="badge warn" title="Customer requested changes">✏️</span>' : ""}${q.view_count ? ` <span class="badge info" title="${L("Customer ne online dekhi", "Viewed online by customer")}">👁 ${q.view_count}</span>` : ""}</td><td class="num">${inr(q.grand_total)}</td><td>${h(userName(q.owner_id))}</td><td class="sub">${h(dOnly(q.created_at))}</td><td style="width:44px">${isMgr() || q.owner_id === S.me.id ? `<button class="btn ghost icon sm danger" data-act="delQuote" data-id="${q.id}" data-no="${h(q.quote_no)}" data-co="${h(q.to_party?.name || "")}" title="${L("Delete karo", "Delete")}" aria-label="Delete">${ic("trash")}</button>` : ""}</td></tr>`).join("")}</tbody></table>`}</div></div>`;
};
ACT.newQuote = () => quoteEditor({ to_party: { state: "Maharashtra" }, items: [] });
ACT.delQuote = async (t) => {
  const no = t.dataset.no || "", co = t.dataset.co || "";
  if (!(await confirmBox(L(`Quotation ${no}${co ? " (" + co + ")" : ""} permanently delete karni hai? Ye wapas nahi aayegi.`,
    `Delete quotation ${no}${co ? " (" + co + ")" : ""} permanently? This cannot be undone.`), L("Haan, delete karo", "Yes, delete")))) return;
  const { data, error } = await sb.from("quotations").delete().eq("id", +t.dataset.id).select("id, lead_id, quote_no");
  if (error) return fail(error);
  if (!data?.length) return toast(L("Delete nahi hui — sirf banane wala ya Manager delete kar sakta hai", "Not deleted — only its creator or a Manager can delete it"), true);
  const d = data[0];
  if (d.lead_id) sb.from("activities").insert({ lead_id: d.lead_id, kind: "system", body: `🗑 Quotation ${d.quote_no} delete ki` }).then(() => {}, () => {});
  closeModal(); toast(L(`🗑 Quotation ${no} delete ho gayi`, `🗑 Quotation ${no} deleted`));
  if (S.route === "quotes") VIEWS.quotes($("#page"));
};
ACT.quote = async (t) => { const { data, error } = await sb.from("quotations").select("*").eq("id", +t.dataset.id).single(); if (error) return fail(error); quoteEditor(data); };

async function quoteEditor(q0) {
  await loadProducts().catch(() => {});
  const q = structuredClone(q0); q.items = q.items?.length ? q.items : [{ desc: "", hsn: "", qty: 1, price: 0, tax: 18 }]; q.to_party ||= {};
  const tp = q.to_party;
  const m = modal({
    title: q.id ? `Quotation ${q.quote_no}` : "Nayi quotation", wide: true,
    body: `<div class="grid3">
      <div><label class="f">Customer *</label><input class="input" data-tp="name" value="${h(tp.name || "")}" maxlength="200"></div>
      <div><label class="f">Contact</label><input class="input" data-tp="contact" value="${h(tp.contact || "")}" maxlength="120"></div>
      <div><label class="f">Email</label><input class="input" data-tp="email" value="${h(tp.email || "")}" maxlength="200"></div>
      <div><label class="f">Address</label><input class="input" data-tp="address" value="${h(tp.address || "")}" maxlength="300"></div>
      <div><label class="f">State (GST)</label><input class="input" data-tp="state" value="${h(tp.state || "")}" maxlength="60"></div>
      <div><label class="f">GSTIN</label><input class="input" data-tp="gstin" value="${h(tp.gstin || "")}" maxlength="15"></div></div>
    ${quoteTrackHtml(q)}${productDatalist()}
    <div class="sec tbl-wrap"><table class="tbl" id="qi"><thead><tr><th>Description</th><th style="width:100px">HSN/SAC</th><th style="width:80px">Qty</th><th style="width:120px">Rate ₹</th><th style="width:96px">GST %</th><th class="num" style="width:110px">Amount</th><th></th></tr></thead><tbody></tbody></table>
      <button class="btn sm" id="qadd" style="margin-top:8px">${ic("plus")} Item</button></div>
    <div class="grid2 sec"><div><label class="f">Notes / terms</label><textarea class="input" id="qn" maxlength="3000">${h(q.notes || "Payment: 100% advance\nDelivery: 7-10 working days\nPrices valid for 7 days")}</textarea>
      <label class="f">Status</label><select class="input" id="qs">${["draft", "sent", "won", "lost"].map((s) => `<option ${s === (q.status || "draft") ? "selected" : ""}>${s}</option>`).join("")}</select></div>
      <div id="qt" style="padding-top:28px"></div></div>`,
    foot: `${q.id ? `<button class="btn" id="qp">${ic("print")} Print / PDF</button><button class="btn" id="qlink" title="${L("Online link copy karo", "Copy online link")}">🔗 Link</button><button class="btn" id="qmail">${ic("mail")} Email</button><button class="btn" id="qwa">${ic("wa")} WhatsApp</button>${q.status !== "lost" ? `<button class="btn" id="qord">📦 ${L("Order banao", "Create order")}</button>` : ""}` : ""}${q.id && (isMgr() || q.owner_id === S.me.id) ? `<button class="btn danger" data-act="delQuote" data-id="${q.id}" data-no="${h(q.quote_no || "")}" data-co="${h(q.to_party?.name || "")}">${ic("trash")} Delete</button>` : ""}<span style="flex:1"></span><button class="btn" data-close>Cancel</button><button class="btn primary" id="qsave">Save</button>`,
  });
  const drawItems = () => {
    $("#qi tbody", m).innerHTML = q.items.map((it, i) => `<tr style="cursor:default">
      <td><input class="input" data-i="${i}" data-k="desc" value="${h(it.desc)}" maxlength="400" list="prodDL" placeholder="${h(L("Product list se chuno ya likho…", "Pick from product list or type…"))}"></td><td><input class="input" data-i="${i}" data-k="hsn" value="${h(it.hsn)}" maxlength="12"></td>
      <td><input class="input" type="number" min="0" data-i="${i}" data-k="qty" value="${h(it.qty)}"></td><td><input class="input" type="number" min="0" data-i="${i}" data-k="price" value="${h(it.price)}"></td>
      <td><select class="input" data-i="${i}" data-k="tax">${[0, 5, 12, 18, 28].map((t) => `<option ${+it.tax === t ? "selected" : ""}>${t}</option>`).join("")}</select></td>
      <td class="num">${inr(r2((+it.qty || 0) * (+it.price || 0)))}</td><td><button class="btn ghost icon sm" data-rm="${i}" aria-label="Remove">${ic("x")}</button></td></tr>`).join("");
    drawTotals();
  };
  const drawTotals = () => {
    const c = qCalc(q);
    $("#qt", m).innerHTML = `<dl class="kv"><dt>Subtotal</dt><dd class="num">${inr(c.sub)}</dd>${c.lines.map(([l, v]) => `<dt>${h(l)}</dt><dd>${inr(v)}</dd>`).join("")}<dt><b>Grand total</b></dt><dd><b style="font-size:18px">${inr(c.grand)}</b></dd></dl><p class="mu" style="font-size:12px">${h(rupeesWords(c.grand))} · ${c.inter ? "Inter-state (IGST)" : "Intra-state (CGST+SGST)"}</p>${marginHtml(q.items)}`;
  };
  m.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.tp) { tp[t.dataset.tp] = t.value; if (t.dataset.tp === "state") drawTotals(); }
    if (t.dataset.k) { q.items[+t.dataset.i][t.dataset.k] = t.value; if (t.dataset.k !== "desc" && t.dataset.k !== "hsn") { const row = t.closest("tr"); const it = q.items[+t.dataset.i]; row.cells[5].textContent = inr(r2((+it.qty || 0) * (+it.price || 0))); drawTotals(); } }
  });
  m.addEventListener("change", (e) => {
    if (e.target.dataset.k === "tax") { q.items[+e.target.dataset.i].tax = +e.target.value; drawTotals(); }
    if (e.target.dataset.k === "desc") {      // picked from the product list → fill HSN, GST and price
      const it = q.items[+e.target.dataset.i], p = findProduct(e.target.value);
      if (p && (it._pid !== p.id)) { it._pid = p.id; if (!it.hsn) it.hsn = p.hsn || ""; it.tax = +p.gst_rate; if (!+it.price && p.sell_price != null) it.price = +p.sell_price; setTimeout(drawItems, 0); }
      else drawTotals();
    }
  });
  m.addEventListener("click", (e) => { const r = e.target.closest("[data-rm]"); if (r) { q.items.splice(+r.dataset.rm, 1); if (!q.items.length) q.items.push({ desc: "", hsn: "", qty: 1, price: 0, tax: 18 }); drawItems(); } });
  $("#qadd", m).onclick = () => { q.items.push({ desc: "", hsn: "", qty: 1, price: 0, tax: 18 }); drawItems(); };
  drawItems();
  $("#qp", m)?.addEventListener("click", () => printQuote(q));
  const shared = async (ch) => {
    const link = await shareQuote(q, ch);
    if (link && !q.share_token) { q.share_token = link.split("#")[1]; const t = $(".qtrack", m); if (t) t.outerHTML = quoteTrackHtml(q); }
  };
  $("#qlink", m)?.addEventListener("click", (e) => busy(e.target, () => shared(null)));
  $("#qmail", m)?.addEventListener("click", (e) => busy(e.target, () => shared("email")));
  $("#qwa", m)?.addEventListener("click", (e) => busy(e.target, () => shared("whatsapp")));
  $("#qord", m)?.addEventListener("click", () => orderFromQuote(q, () => { if (S.route === "quotes") VIEWS.quotes($("#page")); }));
  $("#qsave", m).onclick = (e) => busy(e.target, async () => {
    if (!tp.name) return toast("Customer naam daalo", true);
    const c = qCalc(q);
    const row = { to_party: tp, items: q.items.map((i) => ({ desc: String(i.desc || "").slice(0, 400), hsn: String(i.hsn || "").slice(0, 12), qty: +i.qty || 0, price: +i.price || 0, tax: +i.tax || 0 })), notes: $("#qn", m).value, status: $("#qs", m).value, subtotal: c.sub, tax_total: c.tax, grand_total: c.grand, lead_id: q.lead_id || null, rfq_id: q.rfq_id || null };
    const res = q.id ? await sb.from("quotations").update(row).eq("id", q.id).select("*").single() : await sb.from("quotations").insert(row).select("*").single();
    if (res.error) throw res.error;
    if (q.rfq_id && !q.id) await sb.from("rfqs").update({ status: "quoted", quoted_value: c.grand }).eq("id", q.rfq_id);
    if (q.lead_id && !q.id) { await sb.from("activities").insert({ lead_id: q.lead_id, kind: "system", body: `Quotation ${res.data.quote_no} banayi — ${inr(c.grand)}` }); }
    toast(`Quotation ${res.data.quote_no} saved ✔`); closeModal(); quoteEditor(res.data);
    if (S.route === "quotes") VIEWS.quotes($("#page"));
  });
}
function printQuote(q) {
  const co = S.settings.company || {}, c = qCalc(q), tp = q.to_party || {};
  let pr = document.getElementById("printRoot");
  if (!pr) { pr = document.createElement("div"); pr.id = "printRoot"; pr.className = "print-root"; document.body.append(pr); }
  pr.innerHTML = `<div class="qdoc">
    <div class="hd"><div><h2>${h(co.name || CONFIG.COMPANY)}</h2><div>${h(co.address || "")}</div><div>GSTIN: ${h(co.gstin || "")} · PAN: ${h(co.pan || "")}</div></div>
      <div style="text-align:right"><h2>QUOTATION</h2><div>No: <b>${h(q.quote_no || "")}</b></div><div>Date: ${h(dOnly(q.created_at || new Date()))}</div></div></div>
    <p><b>To:</b> ${h(tp.name || "")}<br>${h(tp.address || "")}${tp.state ? ", " + h(tp.state) : ""}${tp.gstin ? "<br>GSTIN: " + h(tp.gstin) : ""}${tp.contact ? "<br>Kind Attn: " + h(tp.contact) : ""}</p>
    <table><thead><tr><th>#</th><th>Description</th><th>HSN/SAC</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">GST</th><th class="r">Amount</th></tr></thead><tbody>
    ${(q.items || []).map((it, i) => `<tr><td>${i + 1}</td><td>${h(it.desc)}</td><td>${h(it.hsn)}</td><td class="r">${h(it.qty)}</td><td class="r">${inr(it.price)}</td><td class="r">${h(it.tax)}%</td><td class="r">${inr(r2(it.qty * it.price))}</td></tr>`).join("")}
    <tr><td colspan="6" class="r">Subtotal</td><td class="r">${inr(c.sub)}</td></tr>${c.lines.map(([l, v]) => `<tr><td colspan="6" class="r">${h(l)}</td><td class="r">${inr(v)}</td></tr>`).join("")}
    <tr><th colspan="6" class="r">Grand Total</th><th class="r">${inr(c.grand)}</th></tr></tbody></table>
    <p><b>Amount in words:</b> ${h(rupeesWords(c.grand))}</p>
    <p style="white-space:pre-wrap"><b>Terms:</b>\n${h(q.notes || "")}</p>
    <p><b>Bank:</b> ${h(co.bank || "")} · A/c ${h(co.acno || "")} · ${h(co.branch || "")} · IFSC ${h(co.ifsc || "")}</p>
    <p>For <b>${h(co.name || "")}</b><br><br>Authorised Signatory<br><span style="font-size:11px">Contact: ${h(co.contact || "")} ${h(co.mobile || "")} · ${h(co.email || "")}</span></p></div>`;
  window.print();
}

// ---------------------------------------------------------------------
//  REPORTS
// ---------------------------------------------------------------------
VIEWS.reports = async (el) => {
  const days = +(el.dataset.days || 30);
  const [{ data: calls, error }, { data: st }, { data: em }] = await Promise.all([sb.rpc("calls_report", { days }), sb.rpc("dashboard_stats"), sb.rpc("email_report", { days })]);
  if (error) throw error;
  const users = new Map();
  (calls || []).forEach((c) => { const u = users.get(c.user_id) || { calls: 0, pos: 0, days: new Set() }; u.calls += +c.calls; u.pos += +c.positive; u.days.add(c.day); users.set(c.user_id, u); });
  const rows = [...users.entries()].map(([id, u]) => ({ id, name: userName(id), ...u, avg: u.calls / Math.max(1, u.days.size), conv: u.calls ? (u.pos / u.calls) * 100 : 0 })).sort((a, b) => b.calls - a.calls);
  const dmap = {}; (calls || []).forEach((c) => { dmap[c.day] = (dmap[c.day] || 0) + +c.calls; });
  const series = [...Array(days)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - days + 1 + i); const k = d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); return { l: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }), t: d.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" }), v: dmap[k] || 0 }; });
  const bs = st?.by_status || {}, src = st?.by_source || {};
  const total = Object.values(bs).reduce((a, b) => a + b, 0), won = bs.won || 0;
  el.innerHTML = `
    <div class="toolbar"><div class="chips">${[7, 30, 90].map((d) => `<button class="chip ${days === d ? "on" : ""}" data-rd="${d}">${d} ${L("din", "days")}</button>`).join("")}</div><span class="sp" style="flex:1"></span><button class="btn" id="rexp">${ic("download")} Export CSV</button></div>
    <div class="kpis">
      <div class="card kpi"><div class="l">Total calls (${days}d)</div><div class="v">${num(rows.reduce((a, r) => a + r.calls, 0))}</div></div>
      <div class="card kpi"><div class="l">Positive outcomes</div><div class="v">${num(rows.reduce((a, r) => a + r.pos, 0))}</div><div class="s">interested / quote / demo / won</div></div>
      <div class="card kpi"><div class="l">Win rate (all leads)</div><div class="v">${total ? ((won / total) * 100).toFixed(1) : 0}%</div><div class="s">${num(won)} won / ${num(total)}</div></div>
      <div class="card kpi"><div class="l">Pipeline value</div><div class="v">${inrShort(st?.pipeline_value)}</div></div>
    </div>
    <div class="card"><div class="card-h"><h3>Calls per day</h3></div><div class="card-b">${barChart(series, { height: 200, label: "Calls per day" })}</div></div>
    <div class="cols sec">
      <div class="card"><div class="card-h"><h3>${isMgr() ? "Team performance" : "Meri performance"}</h3></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Naam</th><th class="num">Calls</th><th class="num">Avg / din</th><th class="num">Positive</th><th class="num">Conversion</th></tr></thead><tbody>
        ${rows.map((r) => `<tr style="cursor:default"><td class="co">${h(r.name)}</td><td class="num">${num(r.calls)}</td><td class="num">${r.avg.toFixed(1)}</td><td class="num">${num(r.pos)}</td><td class="num">${r.conv.toFixed(1)}%</td></tr>`).join("") || `<tr><td colspan="5" class="empty">Is period mein koi call nahi</td></tr>`}</tbody></table></div></div>
      <div class="stack"><div class="card"><div class="card-h"><h3>Funnel</h3></div><div class="card-b">${hbars(STATUSES.map(([k, l]) => ({ l, v: bs[k] || 0 })))}</div></div>
        <div class="card"><div class="card-h"><h3>Lead sources</h3></div><div class="card-b">${hbars(Object.entries(src).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ l: SOURCES[k] || k, v })))}</div></div></div>
    </div>
    <div class="card sec"><div class="card-h"><h3>✉️ Email performance (${days} ${L("din", "days")})</h3></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Naam</th><th class="num">Emails bheje</th><th class="num">Replies</th><th class="num">Companies jinhone reply kiya</th><th class="num">Reply rate</th></tr></thead><tbody>
      ${(em || []).sort((a, b) => b.sent - a.sent).map((r) => `<tr style="cursor:default"><td class="co">${h(userName(r.user_id))}</td><td class="num">${num(r.sent)}</td><td class="num">${num(r.replies)}</td><td class="num">${num(r.replied_contacts)}</td><td class="num">${r.sent ? ((r.replied_contacts / r.sent) * 100).toFixed(1) : "0.0"}%</td></tr>`).join("") || `<tr><td colspan="5" class="empty">Is period mein CRM se koi email nahi gaya</td></tr>`}
    </tbody></table></div></div>`;
  $$("[data-rd]", el).forEach((b) => b.onclick = () => { el.dataset.days = b.dataset.rd; VIEWS.reports(el); });
  $("#rexp", el).onclick = () => download(`calls-report-${days}d.csv`, toCSV((calls || []).map((c) => ({ ...c, name: userName(c.user_id) })), [["day", "Date"], ["name", "User"], ["calls", "Calls"], ["positive", "Positive"]]));
};

// ---------------------------------------------------------------------
//  TEAM (admin)
// ---------------------------------------------------------------------
VIEWS.team = async (el) => {
  await loadTeam();
  const { data: loads } = await sb.from("leads").select("owner_id").in("status", OPEN_STATUSES).not("owner_id", "is", null).limit(20000);
  const cnt = {}; (loads || []).forEach((l) => { cnt[l.owner_id] = (cnt[l.owner_id] || 0) + 1; });
  el.innerHTML = `<div class="toolbar"><span class="mu">${S.team.filter((u) => u.active).length} active users · ${S.team.filter(online).length} online</span><span class="sp" style="flex:1"></span>
    <button class="btn" data-act="distribute">⚡ Pool auto-distribute</button><button class="btn primary" data-act="addUser">${ic("plus")} User</button></div>
  <div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Naam</th><th>Role</th><th>Categories</th><th class="num">Target</th><th class="num">Open leads</th><th>Last seen</th><th>Status</th><th></th></tr></thead><tbody>
  ${S.team.map((u) => `<tr style="cursor:default"><td><div class="row" style="flex-wrap:nowrap"><span class="dot ${online(u) ? "on" : ""}"></span><div><div class="co">${h(u.full_name)}</div><div class="sub">${h(u.email)}</div></div></div></td>
    <td>${h(ROLE[u.role])}</td><td class="sub">${h((u.categories || []).join(", ") || "All")}</td><td class="num">${u.daily_target}</td><td class="num">${num(cnt[u.id] || 0)}</td>
    <td class="sub">${h(ago(u.last_seen))}</td><td>${u.active ? '<span class="badge good">Active</span>' : '<span class="badge bad">Disabled</span>'}</td>
    <td style="white-space:nowrap"><button class="btn sm" data-act="editUser" data-id="${u.id}">Edit</button>${u.id !== S.me.id ? ` <button class="btn sm" data-act="pwUser" data-id="${u.id}">Password</button> <button class="btn sm ${u.active ? "danger" : ""}" data-act="toggleUser" data-id="${u.id}">${u.active ? "Disable" : "Enable"}</button>` : ""}</td></tr>`).join("")}
  </tbody></table></div></div>
  <p class="mu" style="font-size:12.5px">🔒 Disable karte hi user ka login band, aur uske pending (new/contacted) leads pool mein wapas. Har change Audit log mein record hota hai.</p>`;
};
const catChecks = (sel = []) => `<div class="chips">${CATEGORIES.map((c) => `<label class="chip ${sel.includes(c) ? "on" : ""}"><input type="checkbox" class="sr" name="categories" data-multi="1" value="${h(c)}" ${sel.includes(c) ? "checked" : ""}>${h(c)}</label>`).join("")}</div><div class="mu" style="font-size:12px;margin-top:4px">Kuch select nahi = saari categories</div>`;
const pwOk = (p) => p && p.length >= 10 && /[a-z]/i.test(p) && /\d/.test(p);
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
      <label class="f">Temporary password</label><div class="row" style="flex-wrap:nowrap"><input class="input mono" name="password" value="${h(pw)}" minlength="10"><button type="button" class="btn icon" id="cpw" aria-label="Copy">${ic("copy")}</button></div>
      <div class="mu" style="font-size:12px;margin-top:4px">User ko ye password do; wo login ke baad Profile se badal sakta hai.</div></form>`,
    foot: `<button class="btn" data-close>Cancel</button><button class="btn primary" id="us">Create user</button>`,
  });
  $$(".chip input", m).forEach((c) => c.onchange = () => c.parentElement.classList.toggle("on", c.checked));
  $("#cpw", m).onclick = () => { navigator.clipboard?.writeText($("[name=password]", m).value); toast("Copied"); };
  $("#us", m).onclick = (e) => busy(e.target, async () => {
    const f = formData($("#uf", m)); f.categories ||= [];
    if (!f.full_name || !f.email) return toast("Naam aur email daalo", true);
    if (!pwOk(f.password)) return toast("Password 10+ chars, letters + number", true);
    await callFn("admin-users", { action: "create", ...f });
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
      <label class="f">Categories</label>${catChecks(u.categories || [])}</form>`,
    foot: `${u.id !== S.me.id ? `<button class="btn danger" id="udel">${ic("trash")} Delete</button>` : ""}<span style="flex:1"></span><button class="btn" data-close>Cancel</button><button class="btn primary" id="es">Save</button>`,
  });
  $$(".chip input", m).forEach((c) => c.onchange = () => c.parentElement.classList.toggle("on", c.checked));
  $("#es", m).onclick = (e) => busy(e.target, async () => {
    const f = formData($("#ef", m)); f.categories ||= []; f.daily_target = +f.daily_target || 0;
    if (u.id === S.me.id) delete f.role;
    const { error } = await sb.from("profiles").update(f).eq("id", u.id); if (error) throw error;
    closeModal(); toast("Saved ✔"); VIEWS.team($("#page"));
  });
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
  busy(t, async () => { await callFn("admin-users", { action: "set_active", user_id: u.id, active: !u.active }); toast(u.active ? "Disabled" : "Enabled"); VIEWS.team($("#page")); });
};
ACT.distribute = (b) => busy(b, async () => {
  const { data, error } = await sb.rpc("auto_distribute", { max_per_user: 250 }); if (error) throw error;
  toast(`⚡ ${data} leads distribute hue`); softRefresh();
});

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
  ["contact", "Contact person", "Contact person"], ["mobile", "Mobile", "Mobile"], ["email", "Email", "Email"], ["website", "Website", "Website"],
  ["bank", "Bank", "Bank"], ["acno", "Account no.", "Account no."], ["ifsc", "IFSC", "IFSC"], ["branch", "Branch", "Branch"],
];
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
      <li><b>API permissions → Add a permission → Microsoft Graph → Delegated → Mail.Read</b> → Add → <b>Grant admin consent</b> ${L("(isse kisi user ko alag permission nahi deni padegi)", "(so no user is asked for permission)")}</li>
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
VIEWS.company = async (el) => {
  const { data } = await sb.from("settings").select("key, value").in("key", ["company", "payment_terms_days", "outlook", "branding"]);
  const m = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
  const c = m.company || {}, ro = !isAdmin();
  el.innerHTML = `<div class="card" style="max-width:860px"><div class="card-h"><h3>🏢 ${L("Company details", "Company details")}</h3><span class="sp"></span>${ro ? `<span class="badge">${L("Read-only (Admin edit karega)", "Read-only (Admin edits)")}</span>` : ""}</div>
    <div class="card-b"><fieldset ${ro ? "disabled" : ""} style="border:0;padding:0;margin:0"><div class="grid2">
      ${CO_FIELDS.map(([k, hi, en]) => `<div ${k === "address" ? 'style="grid-column:1/-1"' : ""}><label class="f">${h(L(hi, en))}</label><input class="input" data-co="${k}" value="${h(c[k] || "")}" maxlength="${k === "address" ? 300 : 120}"></div>`).join("")}
      <div><label class="f">${L("Payment terms (din) — invoice due date ke liye", "Payment terms (days) — for invoice due dates")}</label><input class="input" type="number" min="0" max="365" id="coTerms" value="${h(m.payment_terms_days ?? 30)}"></div>
    </div>${ro ? "" : `<div class="row" style="margin-top:14px"><button class="btn primary" id="coSave">Save</button></div>`}</fieldset></div></div>
    ${brandCard(m.branding || {}, ro)}
    ${outlookCard(m.outlook || {}, ro)}
    <p class="mu" style="font-size:12.5px">💡 ${h(L("Ye details quotation print, customer ke online quotation page aur invoices pe aati hain. Customer ka state aapke state se alag ho toh IGST, warna CGST+SGST apne aap lagta hai.", "These details appear on printed quotations, the customer's online quotation page and invoices. IGST applies automatically when the customer's state differs from yours, otherwise CGST+SGST."))}</p>`;
  wireOutlookCard(el, m.outlook || {});
  wireBrandCard(el, m.branding || {});
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
VIEWS.automation = async (el) => {
  const [{ data: s }, { data: runs }] = await Promise.all([
    sb.from("settings").select("value").eq("key", "ingest").single(),
    sb.from("ingest_runs").select("*").order("started_at", { ascending: false }).limit(20),
  ]);
  const c = s?.value || {}, ro = !isAdmin();
  const nextRun = (() => { for (let i = 0; i < 8; i++) { const d = new Date(); d.setDate(d.getDate() + i); d.setHours(9, 0, 0, 0); if (d > new Date() && (c.days || []).includes(d.getDay())) return d; } return null; })();
  el.innerHTML = `
  <div class="kpis">
    <div class="card kpi"><div class="l">Automation</div><div class="v" style="font-size:20px">${c.enabled ? '<span class="badge good">ON</span>' : '<span class="badge bad">OFF</span>'}</div><div class="s">Run days: ${(c.days || []).map((d) => DAYS[d]).join(", ") || "—"} · 9:00 AM</div></div>
    <div class="card kpi"><div class="l">Next auto-run</div><div class="v" style="font-size:20px">${nextRun && c.enabled ? h(nextRun.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })) : "—"}</div></div>
    <div class="card kpi"><div class="l">Last run</div><div class="v" style="font-size:20px">${runs?.[0] ? h(ago(runs[0].started_at)) : "—"}</div><div class="s">${runs?.[0] ? `+${runs[0].leads_added} leads · +${runs[0].rfqs_added} RFQs` : ""}</div></div>
  </div>
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
      <div class="card"><div class="card-h"><h3>Abhi chalao</h3></div><div class="card-b"><p class="mu" style="margin-top:0">Schedule ka wait kiye bina abhi naye leads/RFQs lao.</p><button class="btn primary" data-act="runIngest">${ic("play")} Run now</button> <button class="btn" data-act="distribute">⚡ Pool distribute</button></div></div>
      <div class="card"><div class="card-h"><h3>Run history</h3><span class="sp"></span><button class="btn sm ghost" data-act="go" data-go="automation">${ic("refresh")}</button></div><div class="card-b" style="padding:4px 16px">
        ${(runs || []).map((r) => `<details style="padding:8px 0;border-bottom:1px solid var(--line)"><summary class="row" style="cursor:pointer;flex-wrap:nowrap"><span class="badge ${r.status === "ok" ? "good" : r.status === "running" ? "info" : "bad"}">${h(r.status)}</span><span style="flex:1">${h(dt(r.started_at))}</span><span class="mono">+${r.leads_added}L +${r.rfqs_added}R</span></summary><div class="mu" style="font-size:12px;margin-top:6px">${h(r.trigger)} · ${r.assigned} assigned</div><pre class="log">${h((r.log || []).join("\n"))}</pre></details>`).join("") || '<div class="empty">Abhi tak koi run nahi</div>'}
      </div></div>
    </div>
  </div>`;
  $$(".chip input", el).forEach((x) => x.onchange = () => x.parentElement.classList.toggle("on", x.checked));
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
  toast("Chal raha hai… 1-2 minute lag sakte hain");
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
      <div><label class="f">Language / Bhasha</label><select class="input" id="plang"><option value="hinglish" ${isEn() ? "" : "selected"}>Hinglish</option><option value="en" ${isEn() ? "selected" : ""}>English</option></select></div>
      <p class="mu">${h(S.me.email)} · ${h(ROLE[S.me.role])} · Target ${S.me.daily_target}${L("/din", "/day")}</p>
      <div class="sec-t" style="margin-top:18px">Password badlo</div>
      <input class="input" id="pp1" type="password" placeholder="Naya password (10+ chars)" autocomplete="new-password" style="margin-bottom:8px">
      <input class="input" id="pp2" type="password" placeholder="Confirm" autocomplete="new-password">`,
    foot: `<button class="btn" data-close>Close</button><button class="btn primary" id="ps">Save</button>`,
  });
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
  root.innerHTML = `<div class="auth-form" style="min-height:100vh"><div style="max-width:480px"><div class="logo">G</div><h1>Setup baaki hai</h1><p class="mu"><span class="mono">config.js</span> mein apna Supabase URL aur anon key daalo. Steps <span class="mono">SETUP.md</span> mein hain.</p></div></div>`;
} else {
  start();
}
