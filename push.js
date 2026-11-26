// =====================================================================
//  Phone notifications (Web Push)
//  The installed app (or Chrome on Android) shows a notification when a
//  support ticket is given to this person — like any other phone app, even
//  when the app is closed or the person is logged out. Only the assignee
//  gets it. One-time setup per phone: open the app, log in, "Turn on".
// =====================================================================
import { sb, S, h, toast, busy, isMgr, callFn, HOOK } from "./core.js";
import { L } from "./i18n.js";

const $ = (s, r = document) => r.querySelector(s);
export const pushOk = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isPhone = () => isIOS() || /android|mobile/i.test(navigator.userAgent);
export const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const bytes = (s) => { s = String(s).replace(/-/g, "+").replace(/_/g, "/"); s += "=".repeat((4 - (s.length % 4)) % 4); return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); };
const sameKey = (a, b) => { if (!a || !b) return false; const x = new Uint8Array(a); return x.length === b.length && x.every((v, i) => v === b[i]); };
const device = () => {
  const u = navigator.userAgent;
  const os = /android/i.test(u) ? "Android" : isIOS() ? "iPhone" : /windows/i.test(u) ? "Windows" : /mac os/i.test(u) ? "Mac" : /linux/i.test(u) ? "Linux" : "Device";
  const br = /edg\//i.test(u) ? "Edge" : /samsungbrowser/i.test(u) ? "Samsung" : /firefox|fxios/i.test(u) ? "Firefox" : /opr\//i.test(u) ? "Opera"
    : /chrome|crios/i.test(u) ? "Chrome" : /safari/i.test(u) ? "Safari" : "Browser";
  return `${os} · ${br}${standalone() ? " app" : ""}`;
};
const reg = async () => (pushOk() ? (await navigator.serviceWorker.getRegistration().catch(() => null)) || null : null);

export async function pushState() {
  const r = await reg();
  const sub = r ? await r.pushManager.getSubscription().catch(() => null) : null;
  return { ok: pushOk() && !!r, perm: pushOk() ? Notification.permission : "unsupported", sub };
}
async function save(sub) {
  const j = sub.toJSON();
  const { error } = await sb.rpc("push_subscribe", { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_device: device() });
  if (error) throw error;
}
export async function enablePush() {
  if (!pushOk()) throw new Error(L("Is browser mein phone notification nahi chalte — Android par Chrome, iPhone par Home Screen wala app use karo",
    "This browser can't show phone notifications — use Chrome on Android, or the Home Screen app on iPhone"));
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error(L("Notification ki permission nahi mili — phone Settings → Apps → Genesis Nova / Chrome → Notifications ON karo",
    "Notifications are blocked — phone Settings → Apps → Genesis Nova / Chrome → turn Notifications on"));
  const r = await navigator.serviceWorker.ready;
  const { key } = await callFn("push-send", { action: "key" });
  if (!key) throw new Error(L("Push key nahi mili", "Push key not found"));
  const k = bytes(key);
  let sub = await r.pushManager.getSubscription();
  if (sub && !sameKey(sub.options?.applicationServerKey, k)) { await sub.unsubscribe().catch(() => {}); sub = null; }
  sub ||= await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: k });
  await save(sub);
  return sub;
}
export async function disablePush() {
  const { sub } = await pushState();
  if (!sub) return;
  await sb.rpc("push_unsubscribe", { p_endpoint: sub.endpoint });
  await sub.unsubscribe().catch(() => {});
}
// after every login: this phone follows whoever is logged in now
export async function pushResync() {
  try { const { sub, perm } = await pushState(); if (sub && perm === "granted") await save(sub); } catch { /* offline etc. */ }
}

// ---------------------------------------------------------------- the card (Support page + profile)
export async function pushCard(box) {
  if (!box) return;
  const st = await pushState();
  const ios = isIOS(), inApp = standalone(), on = !!st.sub && st.perm === "granted";
  const { data: subs } = await sb.from("push_subs").select("id, user_id, device, ok_at, created_at").order("created_at", { ascending: false });
  const mine = (subs || []).filter((d) => d.user_id === S.me.id);
  let btns = "", note = "";
  if (on) btns = `<button class="btn sm" data-pa="test">🔔 ${L("Test notification", "Send a test")}</button><button class="btn sm ghost" data-pa="off">${L("Band karo", "Turn off")}</button>`;
  else if (ios && !inApp) note = `<ol><li>${L("iPhone par <b>Safari</b> mein ye CRM kholo", "On iPhone open this CRM in <b>Safari</b>")}</li>
      <li>${L("Neeche <b>Share ⬆️</b> → <b>Add to Home Screen</b> → Add", "Tap <b>Share ⬆️</b> → <b>Add to Home Screen</b> → Add")}</li>
      <li>${L("Home Screen par <b>Genesis Nova</b> app kholo → login → yahan <b>Notification ON karo</b>", "Open the <b>Genesis Nova</b> app from the Home Screen → log in → <b>Turn on notifications</b> here")}</li></ol>`;
  else if (!pushOk()) note = `<p class="mu" style="margin:6px 0 0;font-size:12.5px">${L("Is browser mein notification nahi chalte. Android par <b>Chrome</b> mein kholo.", "This browser can't show notifications. On Android, open it in <b>Chrome</b>.")}</p>`;
  else if (st.perm === "denied") note = `<p class="mu" style="margin:6px 0 0;font-size:12.5px">⛔ ${L("Is phone par notifications block hain: phone <b>Settings → Apps → Genesis Nova (ya Chrome) → Notifications → ON</b>, phir ye page dobara kholo.", "Notifications are blocked on this device: phone <b>Settings → Apps → Genesis Nova (or Chrome) → Notifications → On</b>, then reopen this page.")}</p>`;
  else if (!st.ok) note = `<p class="mu" style="margin:6px 0 0;font-size:12.5px">${L("App abhi load ho raha hai — page ek baar reload karo.", "The app is still loading — reload the page once.")}</p>`;
  else btns = `<button class="btn sm primary" data-pa="on">🔔 ${L("Notification ON karo", "Turn on notifications")}</button>`;
  if (!on && !inApp && HOOK.canInstall?.()) btns += `<button class="btn sm" data-pa="install">📲 ${L("App install karo", "Install the app")}</button>`;
  if (!on && !inApp && !ios && isPhone() && !HOOK.canInstall?.() && pushOk())
    note += `<p class="mu" style="margin:6px 0 0;font-size:12.5px">📲 ${L("App ki tarah ke liye: Chrome menu <b>⋮ → Add to Home screen / Install app</b>.", "To use it like an app: Chrome menu <b>⋮ → Add to Home screen / Install app</b>.")}</p>`;
  let team = "";
  if (isMgr()) {
    const by = new Map(); (subs || []).forEach((d) => by.set(d.user_id, (by.get(d.user_id) || 0) + 1));
    const act = (S.team || []).filter((u) => u.active);
    const yes = act.filter((u) => by.has(u.id)), no = act.filter((u) => !by.has(u.id));
    team = `<div class="devs">👥 ${L("Team", "Team")} — ✅ ${yes.length ? yes.map((u) => `${h(u.full_name)} (${by.get(u.id)})`).join(", ") : "—"}${no.length ? ` · ⛔ ${L("abhi nahi", "not yet")}: ${no.map((u) => h(u.full_name)).join(", ")}` : ""}</div>`;
  }
  box.innerHTML = `<div class="card pushcard" style="padding:12px 16px;margin-bottom:14px">
    <div class="row"><b>📲 ${L("Phone notification", "Phone notifications")}</b>
      <span class="badge ${on ? "good" : "warn"}">${on ? "✅ " + L("is phone par ON", "on for this device") : L("is phone par OFF", "off on this device")}</span>
      <span style="flex:1"></span>${btns}</div>
    <div class="mu" style="font-size:12.5px;margin-top:4px">${L("Ticket aapko assign hote hi phone par notification aata hai — app band ho ya logout ho tab bhi. Sirf jisko ticket mila, usi ko.",
      "When a ticket is assigned to you, your phone shows a notification — even with the app closed or logged out. Only the assignee gets it.")}${isMgr() ? " " + L("Admin / Manager ko roz shaam 5:50 ka din ka summary bhi isi se aata hai (Mon–Sat).", "Admins / Managers also get the 5:50 pm day summary here (Mon–Sat).") : ""}</div>
    ${note}
    ${mine.length ? `<div class="devs">${L("Aapke devices", "Your devices")}: ${mine.map((d) => `${h(d.device || "Device")}${d.ok_at ? " ✔" : ""}`).join(" · ")}</div>` : ""}
    ${team}</div>`;
  box.querySelectorAll("[data-pa]").forEach((b) => b.onclick = (e) => busy(e.target, async () => {
    const a = b.dataset.pa;
    if (a === "on") { await enablePush(); toast(L("🔔 Notification ON — ek test bhej rahe hain…", "🔔 Notifications on — sending a test…")); await test(); }
    if (a === "test") await test();
    if (a === "off") { await disablePush(); toast(L("Is phone par notification band", "Notifications off on this device")); }
    if (a === "install") { await HOOK.install?.(); }
    pushCard(box);
  }));
}
async function test() {
  const r = await callFn("push-send", { action: "test" });
  if (r?.sent > 0) toast(L(`🔔 Test bheja (${r.sent} device) — 2-3 second mein phone par aayega`, `🔔 Test sent (${r.sent} device${r.sent > 1 ? "s" : ""}) — it should show in 2-3 seconds`));
  else toast(L("Test nahi gaya — Notification dobara ON karo", "The test didn't go out — turn notifications on again") + (r?.error ? ` (${r.error})` : ""), true);
}
