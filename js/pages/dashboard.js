import { requireAuth } from "../auth.js";
import { renderShell } from "../layout.js";
import { listProjects, listVendors, listUsers, loadProjectData } from "../data.js";
import { entryStatus, shortfall, STATUS_INFO } from "../metrics.js";
import {
  $, esc, emptyState, errorText, projectStatus, STATUS_BADGE, accessBadges, rangeLabel, todayISO, fmtDate, fmtNum, SLOTS, toISO,
} from "../ui.js";

const profile = await requireAuth({ admin: true });
renderShell(profile, { active: "dashboard", title: "Dashboard" });

try {
  const [projects, vendors, users] = await Promise.all([listProjects(), listVendors(), listUsers()]);
  const today = todayISO();
  const in14 = new Date(); in14.setDate(in14.getDate() + 14);
  const horizon = toISO(in14);

  const ongoing = projects.filter((p) => projectStatus(p) === "ongoing");
  const upcoming = projects.filter((p) => projectStatus(p) === "upcoming");
  const soon = upcoming.filter((p) => p.startDate <= horizon);

  $("#stats").innerHTML = [
    ["Ongoing projects", ongoing.length, "running today"],
    ["Upcoming", upcoming.length, `${soon.length} in next 14 days`],
    ["Active vendors", vendors.filter((v) => v.active !== false).length, `${vendors.length} total`],
    ["Staff users", users.filter((u) => u.role === "user" && u.active).length, `${users.filter((u) => u.role !== "user").length} admins`],
  ].map(([label, value, sub]) => `
    <div class="card stat"><div class="stat-label">${label}</div><div class="stat-value">${value}</div><div class="stat-sub">${sub}</div></div>`).join("");

  // Items for active + near-future projects drive the attention list.
  const active = [...ongoing, ...soon];
  const { entries } = await loadProjectData(active, { photos: false });
  const byId = Object.fromEntries(projects.map((p) => [p.id, p]));

  renderProjects(ongoing, soon, entries);
  renderToday(entries.filter((e) => e.date === today), byId);
  renderAttention(entries, byId, today);
} catch (err) {
  $("#stats").innerHTML = emptyState(errorText(err), "⚠️");
}

function renderProjects(ongoing, soon, entries) {
  const list = [...ongoing, ...soon];
  if (!list.length) {
    $("#active-projects").innerHTML = emptyState("No ongoing or upcoming projects.", "🗓");
    return;
  }
  $("#active-projects").innerHTML = `<div class="grid-2">${list.map((p) => {
    const mine = entries.filter((e) => e.projectId === p.id);
    const pending = mine.filter((e) => entryStatus(e) === "pending").length;
    const st = projectStatus(p);
    return `
      <a class="card project-card" href="project.html?id=${p.id}">
        <div class="gap"><span class="badge ${STATUS_BADGE[st]}">${st}</span>${(p.assignedUsers || []).length ? accessBadges(p) : ""}</div>
        <h3 class="mt">${esc(p.name)}</h3>
        <div class="meta"><span>📅 ${rangeLabel(p)}</span>${p.venue ? `<span>📍 ${esc(p.venue)}</span>` : ""}${p.pax ? `<span>👥 ${fmtNum(p.pax)}</span>` : ""}</div>
        <p class="small mt">${mine.length} items · ${pending ? `<span class="badge badge-amber">${pending} not ordered</span>` : '<span class="muted">all ordered</span>'}</p>
      </a>`;
  }).join("")}</div>`;
}

function renderToday(entries, byId) {
  if (!entries.length) {
    $("#today").innerHTML = emptyState("Nothing scheduled for today.", "☀️");
    return;
  }
  $("#today").innerHTML = SLOTS.map((slot) => {
    const rows = entries.filter((e) => e.slot === slot);
    if (!rows.length) return "";
    return `<div class="slot-head">${slot}</div>
      <div class="table-wrap"><table class="table responsive"><tbody>
        ${rows.map((e) => row(e, byId)).join("")}
      </tbody></table></div>`;
  }).join("");
}

function renderAttention(entries, byId, today) {
  const flagged = entries.filter((e) => {
    const s = entryStatus(e);
    return s === "short" || (s === "pending" && e.date <= today) || (s === "ordered" && e.date < today);
  });
  const notOrdered = entries.filter((e) => entryStatus(e) === "pending").length;
  $("#attention-count").textContent = flagged.length;
  $("#attention-sub").textContent = `${notOrdered} item(s) in active projects are not ordered yet.`;
  $("#attention").innerHTML = flagged.length
    ? `<div class="table-wrap"><table class="table responsive"><tbody>${flagged.slice(0, 50).map((e) => row(e, byId, true)).join("")}</tbody></table></div>`
    : emptyState("All good — nothing overdue or short.", "✅");
}

function row(e, byId, withDate = false) {
  const s = entryStatus(e);
  const short = shortfall(e);
  return `<tr>
    <td data-label="Project"><a href="project.html?id=${e.projectId}">${esc(byId[e.projectId]?.name)}</a>${withDate ? `<div class="xs muted">${fmtDate(e.date)} · ${e.slot}</div>` : ""}</td>
    <td data-label="Vendor">${esc(e.vendorName)} <span class="xs muted">${esc(e.vendorType)}</span></td>
    <td data-label="Qty" class="num">${fmtNum(e.orderedQty)} ${esc(e.unit)}${s === "short" ? ` <span class="xs" style="color:var(--warn)">(−${fmtNum(short)})</span>` : ""}</td>
    <td data-label="Status"><span class="badge ${STATUS_INFO[s].badge}">${STATUS_INFO[s].label}</span></td>
  </tr>`;
}
