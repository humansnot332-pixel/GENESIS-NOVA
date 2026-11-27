// =====================================================================
//  Teams (product lines) — Team page card + editor.
//  The data rules live in the database (migration 102): a team Manager sees
//  his team's data + the free pool of the team's categories; members see
//  their own data + that pool; Admin / Director / IT Head see everything.
// =====================================================================
import { sb, S, h, CATEGORIES, modal, closeModal, busy, toast, confirmBox, ic } from "./core.js";
import { L } from "./i18n.js";

export const teamName = (id) => (id && S.teamsById?.get(id)?.name) || "";

export const teamSelectHtml = (sel) => `<div><label class="f">Team</label><select class="input" name="team_id">
  <option value="">— ${L("Koi team nahi", "No team")}</option>${(S.teams || []).map((t) => `<option value="${t.id}" ${t.id === sel ? "selected" : ""}>${h(t.name)}</option>`).join("")}</select></div>`;

export function teamsCardHtml() {
  const teams = S.teams || [];
  const members = (id) => S.team.filter((u) => u.team_id === id && u.active);
  return `<div class="card sec teams-card"><div class="card-h"><h3>👥 ${L("Teams", "Teams")}</h3>
      <span class="mu" style="font-size:12.5px">${L("Manager ko sirf apni team ka data · Admin / Director / IT Head ko sab", "A Manager sees only his team's data · Admin / Director / IT Head see everything")}</span>
      <span class="sp" style="flex:1"></span><button class="btn sm primary" data-team="new">${ic("plus")} Team</button></div>
    <div class="card-b">${teams.length ? `<div class="teams-grid">${teams.map((t) => {
      const ms = members(t.id), mgr = S.teamById.get(t.manager_id);
      return `<div class="team-tile"><div class="tt-h"><b>${h(t.name)}</b><button class="btn sm ghost" data-team="${t.id}">${L("Badlo", "Edit")}</button></div>
        <div class="tt-cats">${(t.categories || []).map((c) => `<span class="badge acc">${h(c)}</span>`).join("") || `<span class="mu">${L("Sab categories", "All categories")}</span>`}</div>
        <div class="tt-row">👤 <b>${h(mgr?.full_name || L("Manager nahi chuna", "No manager"))}</b></div>
        <div class="tt-row mu">${ms.length} ${L("log", "people")}: ${h(ms.filter((u) => u.id !== t.manager_id).map((u) => u.full_name.split(" ")[0]).join(", ") || "—")}</div></div>`;
    }).join("")}</div>`
      : `<div class="empty" style="padding:14px"><b>${L("Abhi koi team nahi", "No teams yet")}</b>${L("“+ Team” dabao — naam, product categories, Manager aur members chuno. Jab tak team nahi, sab pehle jaisa chalta hai.", "Press “+ Team” — pick a name, product categories, a Manager and members. Until then everything works as before.")}</div>`}</div></div>`;
}

export function wireTeams(el, reload) {
  el.querySelectorAll("[data-team]").forEach((b) => b.onclick = () => {
    const id = b.dataset.team === "new" ? null : +b.dataset.team;
    teamEditor(id ? S.teamsById.get(id) : { name: "", categories: [], manager_id: null }, reload);
  });
}

function teamEditor(t, reload) {
  const people = S.team.filter((u) => u.active && u.role !== "admin");
  const managers = people.filter((u) => u.role === "manager");
  const on = (u) => (t.id ? u.team_id === t.id : false);
  const m = modal({
    title: t.id ? L(`Team · ${t.name}`, `Team · ${t.name}`) : L("Nayi team", "New team"),
    body: `<form id="tmF">
      <label class="f">${L("Team ka naam", "Team name")} *</label><input class="input" name="name" maxlength="60" value="${h(t.name || "")}" placeholder="${h(L("jaise Autodesk team", "e.g. Autodesk team"))}" required>
      <label class="f" style="margin-top:12px">${L("Product categories — inke free leads / RFQ isi team ko", "Product categories — their free leads / RFQs go to this team")}</label>
      <div class="chips">${CATEGORIES.map((c) => `<label class="chip ${(t.categories || []).includes(c) ? "on" : ""}"><input type="checkbox" class="sr" name="tcat" value="${h(c)}" ${(t.categories || []).includes(c) ? "checked" : ""}>${h(c)}</label>`).join("")}</div>
      <div class="mu" style="font-size:12px;margin-top:4px">${L("Kuch nahi chuna = team ko saare free leads dikhenge.", "None picked = the team sees every free lead.")}</div>
      <label class="f" style="margin-top:12px">Manager</label>
      <select class="input" name="manager_id"><option value="">— ${L("Chuno", "Pick")}</option>${managers.map((u) => `<option value="${u.id}" ${u.id === t.manager_id ? "selected" : ""}>${h(u.full_name)}${u.team_id && u.team_id !== t.id ? " · " + h(teamName(u.team_id)) : ""}</option>`).join("")}</select>
      ${managers.length ? "" : `<div class="mu" style="font-size:12px;margin-top:4px">${L("Pehle kisi user ka role “Manager” karo.", "First make someone a “Manager”.")}</div>`}
      <label class="f" style="margin-top:12px">${L("Members", "Members")}</label>
      <div class="chips">${people.filter((u) => u.role !== "manager").map((u) => `<label class="chip ${on(u) ? "on" : ""}"><input type="checkbox" class="sr" name="tmem" value="${u.id}" ${on(u) ? "checked" : ""}>${h(u.full_name)}${u.team_id && u.team_id !== t.id ? ` <span class="mu">(${h(teamName(u.team_id))})</span>` : ""}</label>`).join("") || `<span class="mu">${L("Koi employee nahi", "No employees")}</span>`}</div>
      <div class="mu" style="font-size:12px;margin-top:6px">${L("Ek banda ek hi team mein — dusri team se chuno toh wahan se hat jayega.", "One person, one team — picking someone from another team moves them here.")}</div></form>`,
    foot: `${t.id ? `<button class="btn danger" id="tmDel">${ic("trash")} ${L("Team hatao", "Delete team")}</button>` : ""}<span style="flex:1"></span><button class="btn" data-close>Cancel</button><button class="btn primary" id="tmSave">Save</button>`,
  });
  m.querySelectorAll(".chip input").forEach((c) => c.onchange = () => c.parentElement.classList.toggle("on", c.checked));
  m.querySelector("#tmSave").onclick = (e) => busy(e.target, async () => {
    const f = m.querySelector("#tmF"), name = f.querySelector("[name=name]").value.trim();   // (f.name is the form's own name)
    if (!name) return toast(L("Team ka naam daalo", "Enter a team name"), true);
    const row = { name, categories: [...f.querySelectorAll("[name=tcat]:checked")].map((x) => x.value), manager_id: f.querySelector("[name=manager_id]").value || null };
    const q = t.id ? sb.from("teams").update(row).eq("id", t.id).select("id").single() : sb.from("teams").insert(row).select("id").single();
    const { data, error } = await q; if (error) throw error;
    const tid = data.id;
    const ids = [...f.querySelectorAll("[name=tmem]:checked")].map((x) => x.value);
    if (row.manager_id) ids.push(row.manager_id);
    const was = S.team.filter((u) => u.team_id === tid).map((u) => u.id).filter((x) => !ids.includes(x));
    if (was.length) { const { error: e1 } = await sb.from("profiles").update({ team_id: null }).in("id", was); if (e1) throw e1; }
    if (ids.length) { const { error: e2 } = await sb.from("profiles").update({ team_id: tid }).in("id", ids); if (e2) throw e2; }
    closeModal(); toast(L(`✔ Team “${name}” save ho gayi — ${ids.length} log`, `✔ Team “${name}” saved — ${ids.length} people`)); reload();
  });
  m.querySelector("#tmDel")?.addEventListener("click", async () => {
    if (!(await confirmBox(L(`Team “${t.name}” hatani hai? Iske log bina team ke ho jayenge (data kuch nahi jayega).`, `Delete team “${t.name}”? Its people become team-less (no data is lost).`), L("Haan, hatao", "Yes, delete")))) return;
    const { error } = await sb.from("teams").delete().eq("id", t.id); if (error) return toast(error.message, true);
    closeModal(); toast(L("Team hata di", "Team deleted")); reload();
  });
}
