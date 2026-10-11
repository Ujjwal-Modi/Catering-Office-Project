import { requireAuth } from "../auth.js";
import { renderShell } from "../layout.js";
import { watchMyProjects } from "../data.js";
import {
  $, esc, emptyState, errorText, debounce, projectStatus, STATUS_BADGE, FREEZE, rangeLabel, fmtNum, toast, accessFor,
} from "../ui.js";

const profile = await requireAuth();
if (profile.isAdmin) location.replace("projects.html");
renderShell(profile, { active: "projects", title: "My Projects" });

let projects = [];
let ready = false;
$("#hello").textContent = `Hello, ${profile.name.split(" ")[0]} 👋`;
$("#search").oninput = debounce(render);
$("#status-filter").onchange = render;
// Live list: appears once the server answers; access changes by admin show instantly.
watchMyProjects(profile.uid, (list, isReady) => {
  projects = list;
  ready ||= isReady;
  render();
}, (err) => ($("#list").innerHTML = emptyState(errorText(err), "⚠️")));

$("#list").addEventListener("click", (e) => {
  const card = e.target.closest("[data-id]");
  if (!card) return;
  if (card.dataset.locked) return toast("This project is locked by admin.", "warn");
  location.href = `project.html?id=${card.dataset.id}`;
});

function render() {
  if (!ready) return;
  const term = $("#search").value.trim().toLowerCase();
  const status = $("#status-filter").value;
  // Ongoing first, then upcoming (soonest first), then completed.
  const rank = { ongoing: 0, upcoming: 1, completed: 2 };
  const list = projects
    .filter((p) => (!status || projectStatus(p) === status) &&
      (!term || [p.name, p.venue, p.eventType].join(" ").toLowerCase().includes(term)))
    .sort((a, b) => rank[projectStatus(a)] - rank[projectStatus(b)] ||
      (projectStatus(a) === "completed" ? b.startDate.localeCompare(a.startDate) : a.startDate.localeCompare(b.startDate)));

  if (!list.length) {
    $("#list").innerHTML = emptyState(projects.length ? "No projects match." : "No projects assigned to you yet.", "🗂");
    return;
  }
  $("#list").innerHTML = list.map((p) => {
    const st = projectStatus(p);
    const fz = accessFor(p, profile.uid);
    return `
      <article class="card project-card ${fz === "locked" ? "is-locked" : ""}" data-id="${p.id}" ${fz === "locked" ? 'data-locked="1"' : ""}>
        <div class="gap">
          <span class="badge ${STATUS_BADGE[st]}">${st}</span>
          ${fz !== "none" ? `<span class="badge ${FREEZE[fz].badge}">${fz === "locked" ? "🔒 " : "👁 "}${FREEZE[fz].label}</span>` : ""}
        </div>
        <h3 class="mt">${esc(p.name)}</h3>
        <div class="meta">
          <span>📅 ${rangeLabel(p)}</span>
          ${p.venue ? `<span>📍 ${esc(p.venue)}</span>` : ""}
          ${p.eventType ? `<span>🎉 ${esc(p.eventType)}</span>` : ""}
          ${p.pax ? `<span>👥 ${fmtNum(p.pax)} pax</span>` : ""}
        </div>
      </article>`;
  }).join("");
}
