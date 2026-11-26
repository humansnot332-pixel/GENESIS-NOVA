// =====================================================================
//  daysum.js — the 5:50 day summary (Admin / Manager).
//  • summaryHtml(s)   → the full block on the Daily report page
//  • popupSummary()   → after 5:50 pm (Mon–Sat), once a day per device, a card pops up in the CRM
//  Data: day_summary(day) (migration 092). The bell + phone notification come from the server at 17:50.
// =====================================================================
import { sb, S, h, num, inrShort, modal, closeModal, isMgr } from "./core.js";
import { L } from "./i18n.js";

const istNow = () => new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
const istDay = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const pct = (a, b) => (b > 0 ? Math.round((100 * a) / b) : null);
const first = (n) => String(n || "").split(" ")[0];

/** three plain lines: how the day went, what was won, what slipped */
export function storyLines(s) {
  const t = s.totals || {}, p = (s.people || []).filter((x) => x.role !== "admin" || +x.target > 0 || +x.calls > 0);
  const out = [];
  const pc = pct(+t.calls, +t.target);
  let line = L(`Team ne <b>${num(t.calls)} calls</b> kiye`, `The team made <b>${num(t.calls)} calls</b>`) + (pc != null ? L(` — target ${num(t.target)} ka ${pc}%`, ` — ${pc}% of the ${num(t.target)} target`) : "") + ".";
  const ranked = p.filter((x) => +x.target > 0).sort((a, b) => +b.calls - +a.calls);
  if (ranked.length > 1 && +ranked[0].calls > +ranked.at(-1).calls) line += " " + L(`${h(first(ranked[0].full_name))} sabse aage (${num(ranked[0].calls)}), ${h(first(ranked.at(-1).full_name))} sabse peeche (${num(ranked.at(-1).calls)}).`,
    `${h(first(ranked[0].full_name))} led (${num(ranked[0].calls)}), ${h(first(ranked.at(-1).full_name))} was last (${num(ranked.at(-1).calls)}).`);
  out.push(line);
  const won = (s.won_list || []).slice(0, 3).map((w) => `${h(w.company)}${+w.value ? " " + inrShort(+w.value) : ""}`).join(", ");
  out.push(L(`<b>${num(t.quotes)} quotations</b> gayi (${inrShort(+t.quote_value)})`, `<b>${num(t.quotes)} quotations</b> sent (${inrShort(+t.quote_value)})`)
    + (+t.won ? L(`, <b>${num(t.won)} deal won</b> — ${won}.`, `, <b>${num(t.won)} won</b> — ${won}.`) : L(", aaj koi deal won nahi.", ", no deal won today.")));
  const miss = [];
  if (+t.overdue) {
    const worst = (s.people || []).filter((x) => +x.overdue > 0).sort((a, b) => +b.overdue - +a.overdue)[0];
    miss.push(L(`<b>${num(t.overdue)} follow-ups baaki</b>`, `<b>${num(t.overdue)} follow-ups pending</b>`) + (worst ? L(` (sabse zyada ${h(first(worst.full_name))} ke ${num(worst.overdue)})`, ` (most: ${h(first(worst.full_name))}, ${num(worst.overdue)})`) : ""));
  }
  const rep = (s.alerts?.replies || []).length;
  if (rep) miss.push(L(`${rep} customer replies 24 ghante se bina jawab`, `${rep} customer replies unanswered for 24 h+`));
  if ((t.absent || []).length) miss.push(L(`absent: ${t.absent.map((n) => h(first(n))).join(", ")}`, `absent: ${t.absent.map((n) => h(first(n))).join(", ")}`));
  out.push(miss.length ? miss.join(" · ") + "." : L("Kuch nahi chhoota — badhiya din 👏", "Nothing slipped — a good day 👏"));
  return out;
}

const verdict = (x) => {
  const p = pct(+x.calls, +x.target);
  if (+x.target > 0 && p != null && p < 50) return ["bad", L("Dhyaan do", "Needs attention")];
  if (+x.overdue > 5 || +x.stale > 3) return ["warn", L("Kaam baaki", "Work pending")];
  if (+x.target > 0 && p != null && p < 80) return ["warn", L("Thoda kam", "A bit low")];
  return ["good", L("Badhiya", "Good")];
};
const tm = (t) => (t ? new Date(t).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }) : "—");

/** the KPI row + story (popup and page share it) */
function headHtml(s) {
  const t = s.totals || {};
  return `<div class="ds-story">${storyLines(s).map((x) => `<p>${x}</p>`).join("")}</div>
    <div class="ds-kpis">
      <div class="ds-k"><span>${L("Calls", "Calls")}</span><b>${num(t.calls)}</b><small>/ ${num(t.target)} target</small></div>
      <div class="ds-k"><span>${L("Quotations", "Quotations")}</span><b>${num(t.quotes)}</b><small>${inrShort(+t.quote_value)}</small></div>
      <div class="ds-k"><span>Won</span><b>${num(t.won)}</b><small>${inrShort(+t.won_value)}</small></div>
      <div class="ds-k"><span>${L("Payment aaya", "Collected")}</span><b>${inrShort(+t.paid)}</b><small>${num(t.paid_n)} ${L("entries", "entries")}</small></div>
      <div class="ds-k ${+t.overdue ? "bad" : ""}"><span>${L("Follow-ups baaki", "Follow-ups pending")}</span><b>${num(t.overdue)}</b><small>${L("abhi tak", "as of now")}</small></div>
    </div>`;
}

export function summaryHtml(s) {
  const a = s.alerts || {}, tw = s.tomorrow || {}, hot = s.hot || {};
  const people = (s.people || []).filter((x) => +x.target > 0 || +x.calls > 0 || +x.quotes > 0 || +x.overdue > 0);
  const al = [
    +s.totals?.overdue && ["bad", L(`<b>${num(s.totals.overdue)} follow-ups baaki</b> — ${people.filter((x) => +x.overdue).sort((x, y) => +y.overdue - +x.overdue).slice(0, 4).map((x) => `${h(first(x.full_name))} ${num(x.overdue)}`).join(", ")}`,
      `<b>${num(s.totals.overdue)} follow-ups pending</b> — ${people.filter((x) => +x.overdue).sort((x, y) => +y.overdue - +x.overdue).slice(0, 4).map((x) => `${h(first(x.full_name))} ${num(x.overdue)}`).join(", ")}`), "#/tasks"],
    (a.replies || []).length && ["bad", L(`<b>${a.replies.length} customer replies</b> 24 ghante se bina jawab (${a.replies.slice(0, 3).map((r) => h(r.who)).join(", ")})`, `<b>${a.replies.length} customer replies</b> unanswered for 24 h+ (${a.replies.slice(0, 3).map((r) => h(r.who)).join(", ")})`), "#/inbox"],
    +a.rfqs_untouched && ["warn", L(`<b>${num(a.rfqs_untouched)} naye RFQ</b> kisi ne chhue nahi`, `<b>${num(a.rfqs_untouched)} new RFQs</b> nobody has touched`), "#/rfqs"],
    +a.stale && ["warn", L(`<b>${num(a.stale)} ${+a.stale === 1 ? "lead" : "leads"}</b> 3+ din se locked, koi call nahi`, `<b>${num(a.stale)} ${+a.stale === 1 ? "lead" : "leads"}</b> locked 3+ days without a call`), "#/leads"],
    +a.inv_overdue_n && ["warn", L(`<b>${inrShort(+a.inv_overdue)}</b> ke ${num(a.inv_overdue_n)} invoices ki due date nikal gayi`, `<b>${inrShort(+a.inv_overdue)}</b> in ${num(a.inv_overdue_n)} overdue invoices`), "#/orders"],
  ].filter(Boolean);
  return `<div class="card ds">
    <div class="card-h"><h3>📊 ${L("Din ka summary", "Day summary")} · ${h(new Date(s.day + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }))}</h3><span class="sp"></span>
      <span class="badge ${al.length ? "warn" : "good"}">${al.length ? L(`${al.length} cheezein dhyaan do`, `${al.length} things need attention`) : L("Sab theek", "All good")}</span></div>
    <div class="card-b ds-b">
      ${headHtml(s)}
      <div class="tbl-wrap ds-tbl"><table class="tbl"><thead><tr><th>${L("Naam", "Name")}</th><th>Login</th><th>${L("Calls vs target", "Calls vs target")}</th><th class="num">${L("Follow-ups baaki", "Follow-ups pending")}</th><th class="num">Quotes</th><th class="num">Won</th><th class="num">${L("Active", "Active")}</th><th>${L("Din", "Day")}</th></tr></thead><tbody>
        ${people.map((x) => { const p = pct(+x.calls, +x.target), [k, v] = verdict(x);
          return `<tr style="cursor:default"><td><b>${h(x.full_name)}</b><div class="mu" style="font-size:12px">${h(x.role)}</div></td><td class="num">${tm(x.first_seen)}</td>
            <td><div class="ds-m"><span class="ds-trk"><i class="${p != null && p < 50 ? "low" : p != null && p < 80 ? "mid" : ""}" style="width:${Math.min(100, p ?? (+x.calls ? 100 : 0))}%"></i></span><span class="num">${num(x.calls)}${+x.target ? "/" + num(x.target) : ""}</span></div></td>
            <td class="num">${+x.overdue ? `<b style="color:var(--bad)">${num(x.overdue)}</b>` : "0"}${+x.stale ? `<div class="mu" style="font-size:11.5px">${num(x.stale)} ${L("daba ke", "idle locks")}</div>` : ""}</td>
            <td class="num">${num(x.quotes)}</td><td class="num">${num(x.won)}</td><td class="num">${+x.active_min ? Math.floor(x.active_min / 60) + "h " + (x.active_min % 60) + "m" : "—"}</td>
            <td><span class="badge ${k}">${v}</span></td></tr>`; }).join("") || `<tr><td colspan="8" class="empty">—</td></tr>`}
      </tbody></table></div>
      <div class="ds-two">
        <div class="ds-box"><h4>⚠️ ${L("Kya chhoot gaya", "What slipped")}</h4>
          ${al.length ? al.map(([sv, t, go]) => `<a class="ds-al" href="${go}"><span class="ds-sv ${sv}"></span><span>${t}</span><span class="ds-go">→</span></a>`).join("") : `<p class="mu">${L("Kuch nahi 👏", "Nothing 👏")}</p>`}</div>
        <div class="ds-box"><h4>📅 ${L("Kal ke liye", "For tomorrow")} · ${h(new Date(s.next_day + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }))}</h4>
          <div class="ds-row"><span>${L("Follow-ups", "Follow-ups")}</span><b>${num(tw.followups)}</b></div>
          <div class="ds-row"><span>${L("Renewals (7 din)", "Renewals (7 days)")}</span><b>${num(tw.renewals_n)}${+tw.renewals_amt ? " · " + inrShort(+tw.renewals_amt) : ""}</b></div>
          <div class="ds-row"><span>${L("Quotation validity khatam (3 din)", "Quotes expiring (3 days)")}</span><b>${num(tw.quotes_expiring)}</b></div>
          <div class="ds-row"><span>${L("Payment due", "Payment due")}</span><b>${inrShort(+tw.pay_due)}</b></div>
          ${(hot.quotes || []).length || (hot.mails || []).length ? `<h4 style="margin-top:10px">🔥 ${L("Aaj customers ne dekha", "Seen by customers today")}</h4>
            ${(hot.quotes || []).map((q) => `<a class="ds-hot" href="#/quotes/${q.id}">${h(q.who || q.quote_no)} — ${L("quotation", "quotation")} <b>${num(q.views)}×</b> ${L("kholi", "opened")}</a>`).join("")}
            ${(hot.mails || []).map((m) => `<div class="ds-hot">${h(m.who || "")} — ${L("mail padha", "read the mail")}${+m.opens > 1 ? ` <b>${num(m.opens)}×</b>` : ""}</div>`).join("")}` : ""}
        </div>
      </div>
    </div></div>`;
}

/** after 5:50 pm (Mon–Sat): pop the summary once a day on this device (Admin / Manager) */
let busyPop = false;
export async function popupSummary(force = false) {
  if (!S.me || !isMgr() || busyPop) return;
  const n = istNow(), day = istDay(), key = "crm_dsum_" + day;
  if (!force) {
    if (n.getDay() === 0 || n.getHours() * 60 + n.getMinutes() < 17 * 60 + 50) return;
    try { if (localStorage.getItem(key)) return; } catch { /* storage blocked: show it */ }
    if (document.querySelector("[data-modal]")) return;          // never on top of someone's open form
  }
  busyPop = true;
  try {
    const { data: s, error } = await sb.rpc("day_summary", { p_day: day });
    if (error || !s) return;
    try { localStorage.setItem(key, "1"); } catch { /* ignore */ }
    const t = s.totals || {}, issues = (+t.overdue ? 1 : 0) + ((s.alerts?.replies || []).length ? 1 : 0) + (+s.alerts?.rfqs_untouched ? 1 : 0);
    const m = modal({ title: `📊 ${L("Aaj ka din", "Today")} · ${new Date(day + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}`, wide: true,
      body: `<div class="ds-pop">${issues ? `<span class="badge warn" style="justify-self:start">${L(`${issues} cheezein dhyaan do`, `${issues} things need attention`)}</span>` : ""}${headHtml(s)}</div>`,
      foot: `<button class="btn" data-close>${L("Baad mein", "Later")}</button><button class="btn primary" id="dsGo">${L("Poora report dekho", "Open the full report")}</button>` });
    m.querySelector("#dsGo").onclick = () => { closeModal(); location.hash = "#/daily"; };
  } finally { busyPop = false; }
}
